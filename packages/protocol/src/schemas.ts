// Runtime validation for everything the relay receives. Relay and host only: the phone never imports this.
import { z } from 'zod';
import { MAX_SEATS, type HostHello, type HostMessage, type PhoneHello, type PhoneMessage } from './index';

const axis = z.number().min(-1).max(1);
const haptic = z.object({ t: z.literal('haptic'), pattern: z.enum(['tap', 'hit', 'warn', 'boom', 'win']) });
const label = z.string().max(40);
const powerCard = z.object({ icon: label, name: label, hint: z.string().max(80), color: label });
const status = z.object({
  t: z.literal('status'),
  screen: z.enum(['lobby', 'play', 'results', 'wait']),
  mode: z.enum(['alive', 'ghost', 'carried', 'lever', 'jinx']),
  pet: label,
  ready: z.boolean(),
  power: powerCard.nullable(),
  held: powerCard.nullable(),
  b: z.enum(['idle', 'grab', 'throw']),
  pity: z.number().int().min(0).max(99),
  bounty: z.boolean(),
  score: z.number().int(),
  cooldownMs: z.number().min(0).max(60_000),
  place: z.number().int().nullable(),
  award: z.object({ icon: label, name: label }).nullable(),
  a: z.object({ icon: label, label: label, charge: z.boolean() }).nullable(),
  bOn: z.boolean(),
  card: z.object({ icon: label, name: label, line: z.string().max(80) }).nullable(),
  alert: z.object({ text: label, tone: z.enum(['go', 'stop', 'danger', 'info']), color: label.nullable() }).nullable(),
  won: z.boolean(),
});

export const phoneHelloSchema: z.ZodType<PhoneHello> = z.object({
  t: z.literal('hello'),
  role: z.literal('phone'),
  v: z.number().int(),
  room: z.string().max(8),
  name: z.string().max(64),
  token: z.string().max(64),
  sinceMs: z.number().int().min(0).max(86_400_000).optional(),
});

export const hostHelloSchema: z.ZodType<HostHello> = z.object({
  t: z.literal('hello'),
  role: z.literal('host'),
  v: z.number().int(),
});

export const phoneMessageSchema: z.ZodType<PhoneMessage> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('input'), seq: z.number().int().nonnegative(), x: axis, y: axis, held: z.number().int().min(0).max(7) }),
  z.object({ t: z.literal('button'), button: z.enum(['a', 'b', 'c']), down: z.boolean() }),
  z.object({ t: z.literal('ping'), id: z.number().int().nonnegative(), rtt: z.number().min(0).max(60_000).nullable() }),
  z.object({ t: z.literal('pet'), dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('emote'), id: z.number().int().min(0).max(3) }),
]);

export const hostMessageSchema: z.ZodType<HostMessage> = z.object({
  t: z.literal('send'),
  seat: z.union([z.literal('all'), z.number().int().min(0).max(MAX_SEATS - 1)]),
  msg: z.union([haptic, status]),
});
