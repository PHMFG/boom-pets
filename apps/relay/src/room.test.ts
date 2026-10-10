import { MAX_SEATS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, SEAT_HOLD_MS } from '@boom/protocol';
import { describe, expect, it } from 'vitest';
import { cleanName, deviceOf, makeRoomCode, Room } from './room';

function makeRoom() {
  let next = 0;
  return new Room('ABCD', () => `token-${next++}`);
}

describe('room', () => {
  it('gives each new phone the lowest free seat', () => {
    const room = makeRoom();
    expect(room.join('Ana', '')).toMatchObject({ ok: true, seat: 0, rejoined: false });
    expect(room.join('Bia', '')).toMatchObject({ ok: true, seat: 1, rejoined: false });
  });

  it('gives a returning token its own seat back', () => {
    const room = makeRoom();
    const first = room.join('Ana', '');
    room.join('Bia', '');
    if (!first.ok) throw new Error('join failed');
    room.disconnect(first.seat, 1000);
    expect(room.snapshot(1000)[0]).toMatchObject({ connected: false, holdMsLeft: SEAT_HOLD_MS });
    expect(room.join('Ana', first.token)).toMatchObject({ ok: true, seat: 0, rejoined: true });
    expect(room.snapshot(2000)[0]).toMatchObject({ connected: true, holdMsLeft: null });
  });

  it('treats an unknown token as a new phone', () => {
    const room = makeRoom();
    room.join('Ana', '');
    expect(room.join('Caio', 'not-a-real-token')).toMatchObject({ ok: true, seat: 1, rejoined: false });
  });

  it('refuses a seventh phone', () => {
    const room = makeRoom();
    for (let index = 0; index < MAX_SEATS; index++) expect(room.join(`P${index}`, '').ok).toBe(true);
    expect(room.join('Extra', '')).toEqual({ ok: false, reason: 'full' });
  });

  it('frees a seat only after its hold runs out, and reuses it', () => {
    const room = makeRoom();
    room.join('Ana', '');
    room.join('Bia', '');
    room.disconnect(0, 1000);
    expect(room.expire(1000 + SEAT_HOLD_MS - 1)).toEqual([]);
    expect(room.expire(1000 + SEAT_HOLD_MS)).toEqual([0]);
    expect(room.snapshot(0).map(seat => seat.seat)).toEqual([1]);
    expect(room.join('Caio', '')).toMatchObject({ ok: true, seat: 0 });
  });

  it('remembers how each phone joined and came back, and hands the returns over once', () => {
    const room = makeRoom();
    const ana = room.join('Ana', '', { device: 'iphone', sinceMs: 8200 });
    room.join('Bia', '', { device: 'android', sinceMs: 12000 });
    if (!ana.ok) throw new Error('join failed');
    room.disconnect(ana.seat, 1000);
    room.join('Ana', ana.token, { device: 'iphone', sinceMs: 900 });
    // Back again before the old link was seen to be dead: still a return.
    room.join('Ana', ana.token, { device: 'iphone', sinceMs: 2400 });

    expect(room.takeConnections()).toEqual([
      { seat: 0, name: 'Ana', device: 'iphone', joinMs: 8200, rejoins: 2, worstRejoinMs: 2400 },
      { seat: 1, name: 'Bia', device: 'android', joinMs: 12000, rejoins: 0, worstRejoinMs: null },
    ]);
    expect(room.takeConnections()[0]).toMatchObject({ joinMs: 8200, rejoins: 0, worstRejoinMs: null });
  });

  it('still reports a phone that left during the match being logged, once, but not one that left before it', () => {
    const room = makeRoom();
    room.join('Ana', '', { device: 'iphone', sinceMs: 5000 });
    room.join('Bia', '', { device: 'android', sinceMs: 6000 });
    room.join('Caio', '', { device: 'android', sinceMs: 7000 });
    // Caio's seat runs out before the match begins at 100 000; Bia's during it.
    room.disconnect(2, 0);
    room.expire(SEAT_HOLD_MS);
    room.disconnect(1, 100_000);
    room.expire(100_000 + SEAT_HOLD_MS);
    expect(room.takeConnections(100_000)).toEqual([
      { seat: 0, name: 'Ana', device: 'iphone', joinMs: 5000, rejoins: 0, worstRejoinMs: null },
      { seat: 1, name: 'Bia', device: 'android', joinMs: 6000, rejoins: 0, worstRejoinMs: null, left: true },
    ]);
    expect(room.takeConnections(100_000)).toHaveLength(1);
  });

  it('tells phones apart by their browser name', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('iphone');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe('android');
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe('other');
    expect(deviceOf(undefined)).toBe('other');
  });

  it('cleans names', () => {
    expect(cleanName('  Ana   Clara  ', 0)).toBe('Ana Clara');
    expect(cleanName('', 2)).toBe('Jogador 3');
    expect(cleanName('\u0007\n', 0)).toBe('Jogador 1');
    expect(cleanName('Maximiliano Augusto', 0)).toBe('Maximiliano');
    expect(Array.from(cleanName('🐼🐼🐼🐼🐼🐼🐼🐼🐼🐼🐼🐼🐼🐼', 0))).toHaveLength(12);
  });

  it('makes room codes from the unambiguous alphabet', () => {
    for (let index = 0; index < 200; index++) {
      const code = makeRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect([...code].every(letter => ROOM_CODE_ALPHABET.includes(letter))).toBe(true);
    }
  });
});
