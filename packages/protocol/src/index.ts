// Messages and constants shared by the phone, the relay and the host.
// No dependencies: the phone bundle imports this file. Validation lives in ./schemas.

export const PROTOCOL_VERSION = 2;
export const MAX_SEATS = 6;
/** Default relay port. Override with the BOOM_RELAY_PORT environment variable if another program uses it. */
export const RELAY_PORT = 47821;
export const WS_PATH = '/ws';

export const ROOM_CODE_LENGTH = 4;
/** No I or O, so a code read aloud or typed by hand is never ambiguous. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const NAME_MAX_LENGTH = 12;

export const BUTTON_BITS = { a: 1, b: 2 } as const;
export type ButtonName = keyof typeof BUTTON_BITS;

/** The phone sends input when it changes, at most this often… */
export const INPUT_MAX_HZ = 60;
/** …and at least this often, so the host can tell a quiet thumb from a dead connection. */
export const INPUT_HEARTBEAT_MS = 100;
/** Input older than this counts as "stick released". */
export const INPUT_STALE_MS = 250;
export const PING_INTERVAL_MS = 2000;
/** How long a seat waits for its phone to come back. */
export const SEAT_HOLD_MS = 30_000;

export const MAX_MESSAGE_BYTES = 4096;
/** Input frames beyond this rate are dropped by the relay. Button presses and pings are not. */
export const MAX_MESSAGES_PER_SECOND = 120;

/** WebSocket close codes. A phone must not auto-reconnect after `replaced` or `refused`. */
export const CLOSE = { replaced: 4001, refused: 4002 } as const;

export type HapticPattern = 'tap' | 'hit' | 'warn' | 'boom' | 'win';

// ── Phone to relay ───────────────────────────────────────────────────────────

/**
 * `sinceMs` is how long this phone has been trying to get in: since the page opened on a first join, or
 * since the link dropped or the phone was unlocked on a return. The relay keeps it for the playtest log.
 */
export type PhoneHello = { t: 'hello'; role: 'phone'; v: number; room: string; name: string; token: string; sinceMs?: number };
/** What kind of phone it is, read from its browser's name. Anything that is not a phone is `other`. */
export type PhoneDevice = 'iphone' | 'android' | 'other';
/** What the relay knows about one phone's connection. It adds these to every playtest log. */
export type PhoneConnection = { seat: number; name: string; device: PhoneDevice; joinMs: number | null; rejoins: number; worstRejoinMs: number | null };
/** Stick position (-1 to 1, two decimals) and the buttons currently held, as BUTTON_BITS. */
export type PhoneInput = { t: 'input'; seq: number; x: number; y: number; held: number };
/** Sent the instant a button changes, so a quick tap is never lost between input frames. */
export type PhoneButton = { t: 'button'; button: ButtonName; down: boolean };
/** `rtt` is the round trip the phone measured on its previous ping. */
export type PhonePing = { t: 'ping'; id: number; rtt: number | null };
/** Lobby: step to the previous or next free pet. */
export type PhonePet = { t: 'pet'; dir: -1 | 1 };
export type PhoneReady = { t: 'ready'; ready: boolean };
/** Index into the four emotes. */
export type PhoneEmote = { t: 'emote'; id: number };
export type PhoneMessage = PhoneInput | PhoneButton | PhonePing | PhonePet | PhoneReady | PhoneEmote;

// ── Host to phone (forwarded by the relay) ───────────────────────────────────

/** What a phone is being used for right now. It decides what A does and how the pad looks. */
export type PhoneMode = 'alive' | 'ghost' | 'carried' | 'lever' | 'jinx';
/** Everything a phone shows. Sent only when something in it changes. */
export type PhoneStatus = {
  t: 'status';
  /** `wait` is a phone that joined mid-match: it plays from the next one. */
  screen: 'lobby' | 'play' | 'results' | 'wait';
  mode: PhoneMode;
  /** Display name of the player's pet. */
  pet: string;
  ready: boolean;
  /** Icon and name of the active power, or null. */
  power: { icon: string; name: string; color: string } | null;
  /** Rolls since the last SUPER, 0 to 6. */
  pity: number;
  bounty: boolean;
  score: number;
  /** Ghost: milliseconds until the next meteor is ready. */
  cooldownMs: number;
  /** Results: final place and award. */
  place: number | null;
  award: { icon: string; name: string } | null;
};
export type HostToPhone = { t: 'haptic'; pattern: HapticPattern } | PhoneStatus;

// ── Relay to phone ───────────────────────────────────────────────────────────

export type RefusalReason = 'version' | 'room' | 'full';
export type ToPhone =
  | { t: 'welcome'; seat: number; token: string; hostPresent: boolean }
  | { t: 'refused'; reason: RefusalReason }
  | { t: 'pong'; id: number }
  | { t: 'host'; present: boolean }
  | HostToPhone;

// ── Host to relay ────────────────────────────────────────────────────────────

export type HostHello = { t: 'hello'; role: 'host'; v: number };
export type HostSend = { t: 'send'; seat: number | 'all'; msg: HostToPhone };
export type HostMessage = HostSend;

// ── Relay to host ────────────────────────────────────────────────────────────

export type SeatInfo = {
  /** 0-based. */
  seat: number;
  name: string;
  connected: boolean;
  /** Phone-to-relay round trip in milliseconds. */
  rtt: number | null;
  /** While disconnected: milliseconds until the seat is given up. */
  holdMsLeft: number | null;
};
/** The computer's address on the Wi-Fi, for the QR code. Null when it is on no network. */
export type NetworkInfo = { address: string | null; ssid: string | null };
export type ToHost =
  | { t: 'hosted'; room: string; seats: SeatInfo[]; network: NetworkInfo }
  /** `busy`: another game screen on this computer already hosts the room. */
  | { t: 'refused'; reason: 'version' | 'notLocal' | 'busy' }
  | { t: 'roster'; seats: SeatInfo[] }
  | { t: 'network'; network: NetworkInfo }
  | ({ t: 'input'; seat: number } & Omit<PhoneInput, 't'>)
  | ({ t: 'button'; seat: number } & Omit<PhoneButton, 't'>)
  | ({ seat: number } & PhonePet)
  | ({ seat: number } & PhoneReady)
  | ({ seat: number } & PhoneEmote);
