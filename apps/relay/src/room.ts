// Who sits where. Pure logic with no sockets, so it can be tested directly.
import { MAX_SEATS, NAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, SEAT_HOLD_MS, type PhoneConnection, type PhoneDevice, type SeatInfo } from '@boom/protocol';

type Seat = {
  seat: number;
  name: string;
  token: string;
  connected: boolean;
  rtt: number | null;
  releaseAt: number | null;
  device: PhoneDevice;
  joinMs: number | null;
  rejoins: number;
  worstRejoinMs: number | null;
};

/** What a phone says about itself when it connects: its kind, and how long it has been trying to get in. */
export type JoinFacts = { device: PhoneDevice; sinceMs: number | null };
const NO_FACTS: JoinFacts = { device: 'other', sinceMs: null };

export function deviceOf(userAgent: string | undefined): PhoneDevice {
  if (!userAgent) return 'other';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iphone';
  return /Android/.test(userAgent) ? 'android' : 'other';
}

export type JoinResult = { ok: true; seat: number; token: string; rejoined: boolean } | { ok: false; reason: 'full' };

export function makeRoomCode(random: () => number = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]).join('');
}

/** Trims, removes control characters and cuts to length by whole characters (so an emoji is never split). */
export function cleanName(raw: string, seat: number): string {
  const tidy = Array.from(raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim());
  return tidy.slice(0, NAME_MAX_LENGTH).join('').trim() || `Jogador ${seat + 1}`;
}

export class Room {
  readonly code: string;
  private readonly seats = new Map<number, Seat>();
  /** Phones whose seat ran out since the last playtest log, and when, kept so that log still knows they played. */
  private departed: { phone: PhoneConnection; at: number }[] = [];
  private readonly makeToken: () => string;

  constructor(code: string, makeToken: () => string) {
    this.code = code;
    this.makeToken = makeToken;
  }

  /** A known token gets its seat back; anyone else gets the lowest free seat. */
  join(name: string, token: string, facts: JoinFacts = NO_FACTS): JoinResult {
    const known = token ? [...this.seats.values()].find(seat => seat.token === token) : undefined;
    if (known) {
      known.connected = true;
      known.releaseAt = null;
      known.name = cleanName(name, known.seat);
      // Counted even if the old socket still looked alive: an unlocked phone often returns before its dead link is noticed.
      known.rejoins++;
      if (facts.sinceMs !== null) known.worstRejoinMs = Math.max(known.worstRejoinMs ?? 0, facts.sinceMs);
      return { ok: true, seat: known.seat, token: known.token, rejoined: true };
    }
    for (let index = 0; index < MAX_SEATS; index++) {
      if (this.seats.has(index)) continue;
      const seat: Seat = {
        seat: index,
        name: cleanName(name, index),
        token: this.makeToken(),
        connected: true,
        rtt: null,
        releaseAt: null,
        device: facts.device,
        joinMs: facts.sinceMs,
        rejoins: 0,
        worstRejoinMs: null,
      };
      this.seats.set(index, seat);
      return { ok: true, seat: index, token: seat.token, rejoined: false };
    }
    return { ok: false, reason: 'full' };
  }

  /** The phone dropped. Its seat is held so a locked phone can come back to the same pet. */
  disconnect(seat: number, now: number): void {
    const found = this.seats.get(seat);
    if (!found) return;
    found.connected = false;
    found.rtt = null;
    found.releaseAt = now + SEAT_HOLD_MS;
  }

  /** Frees seats whose hold ran out. Returns the seats that were freed. */
  expire(now: number): number[] {
    const freed: number[] = [];
    for (const seat of this.seats.values()) {
      if (seat.releaseAt !== null && now >= seat.releaseAt) freed.push(seat.seat);
    }
    for (const index of freed) {
      const seat = this.seats.get(index)!;
      this.departed.push({ at: now, phone: { seat: seat.seat, name: seat.name, device: seat.device, joinMs: seat.joinMs, rejoins: seat.rejoins, worstRejoinMs: seat.worstRejoinMs, left: true } });
      this.seats.delete(index);
    }
    return freed;
  }

  setRtt(seat: number, rtt: number | null): void {
    const found = this.seats.get(seat);
    if (found) found.rtt = rtt;
  }

  /**
   * Each phone's kind, how long it took to join, and its returns since the last call. Phones whose seat
   * ran out at or after `since` (when the match being logged began) come last; earlier leavers were not in it.
   */
  takeConnections(since = 0): PhoneConnection[] {
    const seated = [...this.seats.values()]
      .sort((a, b) => a.seat - b.seat)
      .map((seat): PhoneConnection => {
        const taken = { seat: seat.seat, name: seat.name, device: seat.device, joinMs: seat.joinMs, rejoins: seat.rejoins, worstRejoinMs: seat.worstRejoinMs };
        seat.rejoins = 0;
        seat.worstRejoinMs = null;
        return taken;
      });
    const all = [...seated, ...this.departed.filter(entry => entry.at >= since).map(entry => entry.phone)];
    this.departed = [];
    return all;
  }

  snapshot(now: number): SeatInfo[] {
    return [...this.seats.values()]
      .sort((a, b) => a.seat - b.seat)
      .map(seat => ({
        seat: seat.seat,
        name: seat.name,
        connected: seat.connected,
        rtt: seat.rtt,
        holdMsLeft: seat.releaseAt === null ? null : Math.max(0, seat.releaseAt - now),
      }));
  }
}
