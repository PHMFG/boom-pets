// Reads the playtest logs the game saves (one JSON per match) and prints the measures the playtest
// plan asks for, flagging the warning signs. Bots are left out of the per-player measures.
// It ends with the plan's definition of done, each item marked from matches played on real phones.
// Usage: pnpm report [folder=playtests]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PhoneConnection } from '../packages/protocol/src/index.ts';

type Log = {
  startedAt: string;
  rounds: number;
  players: { seat: number; name: string; bot: boolean; idleShare: number | null; firstDashAt: number | null; latencyMedianMs: number | null; latency95Ms: number | null }[];
  eliminationsByCause: Record<string, number>;
  rolls: { seat: number; tier: string; rank: string }[];
  roundWinners: number[][];
  standings: { seat: number; score: number; place: number }[];
  /** Added by the relay. Logs saved before it did so have none. */
  phones?: PhoneConnection[];
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(root, process.argv[2] ?? 'playtests');
const logs = existsSync(folder)
  ? readdirSync(folder)
      .filter(name => name.endsWith('.json'))
      .sort()
      .map(name => JSON.parse(readFileSync(join(folder, name), 'utf8')) as Log)
  : [];
if (logs.length === 0) {
  console.log(`No matches logged in ${folder} yet. The game saves one file each time a match ends.\n`);
  printDefinitionOfDone();
  process.exit(0);
}

const warnings: string[] = [];
const percent = (share: number) => `${Math.round(share * 100)}%`;
const withPeople = logs.filter(log => log.players.some(player => !player.bot));
console.log(`${logs.length} matches in ${folder} (${withPeople.length} with people, ${logs.length - withPeople.length} bots only)\n`);

// Idle time, time to first dash and latency, per person across all their matches.
const people = new Map<string, { idle: number[]; firstDash: number[]; median: number[]; p95: number[]; wins: number; matches: number }>();
for (const log of logs) {
  const winner = log.standings.find(entry => entry.place === 1)?.seat;
  for (const player of log.players) {
    if (player.bot) continue;
    const person = people.get(player.name) ?? { idle: [], firstDash: [], median: [], p95: [], wins: 0, matches: 0 };
    person.matches++;
    if (player.seat === winner) person.wins++;
    if (player.idleShare !== null) person.idle.push(player.idleShare);
    if (player.firstDashAt !== null) person.firstDash.push(player.firstDashAt);
    if (player.latencyMedianMs !== null) person.median.push(player.latencyMedianMs);
    if (player.latency95Ms !== null) person.p95.push(player.latency95Ms);
    people.set(player.name, person);
  }
}
const mean = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
if (people.size > 0) {
  console.log('Player          matches  wins  idle   first dash  latency (median / 95th)');
  for (const [name, person] of people) {
    const idle = mean(person.idle);
    const firstDash = mean(person.firstDash);
    const p95 = person.p95.length > 0 ? Math.max(...person.p95) : null;
    const median = mean(person.median);
    console.log(
      `${name.padEnd(15)} ${String(person.matches).padStart(7)}  ${String(person.wins).padStart(4)}  ${(idle === null ? '—' : percent(idle)).padStart(4)}   ${(firstDash === null ? 'never' : `${firstDash.toFixed(1)} s`).padStart(10)}  ${median === null ? '—' : `${Math.round(median)} ms`} / ${p95 === null ? '—' : `${Math.round(p95)} ms`}`,
    );
    if (idle !== null && idle > 0.2) warnings.push(`${name} was idle ${percent(idle)} of the time (over 20%): they had nothing to do, or did not know what to do.`);
    if (firstDash === null) warnings.push(`${name} never dashed in a first round: the controls may not be clear.`);
    else if (firstDash > 10) warnings.push(`${name} took ${firstDash.toFixed(1)} s to dash for the first time (over 10 s): the controls may not be clear.`);
    if (p95 !== null && p95 > 120) warnings.push(`${name}'s phone had a 95th-percentile latency of ${Math.round(p95)} ms (over 120 ms).`);
  }
  if (withPeople.length >= 3) {
    for (const [name, person] of people) {
      if (person.wins === person.matches && people.size > 1) warnings.push(`${name} won every match they played (${person.matches}).`);
    }
  }
  console.log('');
}

// Knockouts by cause, over every match.
const causes: Record<string, number> = {};
for (const log of logs) for (const [cause, count] of Object.entries(log.eliminationsByCause)) causes[cause] = (causes[cause] ?? 0) + count;
const knockouts = Object.values(causes).reduce((sum, count) => sum + count, 0);
console.log(`Knockouts by cause (${knockouts} in all)`);
for (const [cause, count] of Object.entries(causes).sort((a, b) => b[1] - a[1])) {
  const share = knockouts > 0 ? count / knockouts : 0;
  console.log(`  ${cause.padEnd(11)} ${String(count).padStart(4)}  ${percent(share)}`);
  if (share > 0.6 && knockouts >= 10) warnings.push(`"${cause}" causes ${percent(share)} of knockouts (over 60%): the other ways of knocking pets out are not being used.`);
}

// Who gets the SUPER rolls.
const rolls = logs.flatMap(log => log.rolls);
const supers = rolls.filter(roll => roll.tier === 'super');
const leaderSupers = supers.filter(roll => roll.rank === 'leader').length;
console.log(`\nMystery Cube rolls: ${rolls.length}, of which SUPER ${supers.length} (leader ${leaderSupers}, last place ${supers.filter(roll => roll.rank === 'last').length})`);
if (supers.length >= 5 && leaderSupers / supers.length > 0.4) warnings.push(`The leader got ${percent(leaderSupers / supers.length)} of the SUPER rolls: luck is helping whoever is already ahead.`);

console.log(warnings.length === 0 ? '\nNo warning signs.' : `\nWarning signs\n${warnings.map(warning => `  - ${warning}`).join('\n')}`);
console.log('');
printDefinitionOfDone();

/**
 * The plan's definition of done, judged only from matches played on real phones: a player counts when
 * the relay saw an iPhone or an Android phone in that seat. Simulated phones and desktop tabs do not.
 */
function printDefinitionOfDone(): void {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const matches = logs
    .map(log => {
      const people = log.players.filter(player => !player.bot);
      const phones = (log.phones ?? []).filter(phone => phone.device !== 'other' && people.some(player => player.seat === phone.seat));
      const players = people.filter(player => phones.some(phone => phone.seat === player.seat));
      return { log, phones, players, bots: log.players.length - people.length };
    })
    .filter(match => match.players.length > 0);
  const phones = matches.flatMap(match => match.phones);

  const mostPhones = Math.max(0, ...matches.map(match => match.players.length));
  const joins = phones.flatMap(phone => (phone.joinMs === null ? [] : [phone.joinMs]));
  const slowestJoin = joins.length > 0 ? Math.max(...joins) : null;
  const fullMatches = matches.filter(match => match.log.rounds === 5 && match.log.standings.length > 0).length;
  const medians = matches.flatMap(match => match.players.flatMap(player => (player.latencyMedianMs === null ? [] : [player.latencyMedianMs])));
  const worstMedian = medians.length > 0 ? Math.max(...medians) : null;
  const solo = matches.some(match => match.players.length === 1 && match.bots > 0);
  const duo = matches.some(match => match.players.length === 2 && match.bots > 0);
  const returns = phones.reduce((sum, phone) => sum + phone.rejoins, 0);
  const rejoins = phones.flatMap(phone => (phone.worstRejoinMs === null ? [] : [phone.worstRejoinMs]));
  const worstRejoin = rejoins.length > 0 ? Math.max(...rejoins) : null;
  const kinds = [phones.some(phone => phone.device === 'iphone') ? 'iPhone' : '', phones.some(phone => phone.device === 'android') ? 'Android' : ''].filter(Boolean);

  const items: [met: boolean, item: string, evidence: string][] = [
    [
      mostPhones >= 6 && slowestJoin !== null && slowestJoin < 30_000,
      '1  Six phones join in under 30 s each',
      mostPhones === 0 ? 'no real phone yet' : `${mostPhones} in one match, slowest join ${slowestJoin === null ? 'not measured' : seconds(slowestJoin)}`,
    ],
    [fullMatches > 0, '2  A full 5-round match, lobby to results', `${fullMatches} finished`],
    [
      worstMedian !== null && worstMedian < 80,
      '3  Input under 80 ms on home Wi-Fi',
      worstMedian === null ? 'no reading yet' : `worst phone's median ${Math.round(worstMedian)} ms over ${medians.length} readings`,
    ],
    [solo && duo, '4  Solo and duo playable with bots', `solo ${solo ? 'played' : 'not played'}, duo ${duo ? 'played' : 'not played'}`],
    [
      returns > 0 && worstRejoin !== null && worstRejoin <= 10_000,
      '5  A dropped phone is back within 10 s',
      returns === 0 ? 'no phone has dropped and come back: lock one mid-match, then unlock it' : `${returns} ${returns === 1 ? 'return' : 'returns'}, slowest ${worstRejoin === null ? 'not measured' : seconds(worstRejoin)}`,
    ],
    [mostPhones >= 4, '6  A playtest with 4 or more people', mostPhones === 0 ? 'none yet' : `most people in one match: ${mostPhones}`],
    [mostPhones >= 2, '   Gate: two people play together', mostPhones >= 2 ? 'played. Whether they laughed is yours to say' : 'not played'],
    [kinds.length === 2, '   Seen on both iPhone and Android', kinds.length === 0 ? 'neither yet' : kinds.length === 2 ? 'both' : `${kinds[0]} only`],
  ];
  console.log(`Definition of done, from matches played on real phones (${matches.length} so far)`);
  for (const [met, item, evidence] of items) console.log(`  ${met ? 'met    ' : 'not yet'}  ${item.padEnd(42)} ${evidence}`);
  if (matches.length === 0) console.log('\n  Start the game with `pnpm dev`, join from phones on the same Wi-Fi, finish a match, and run this again.');
}
