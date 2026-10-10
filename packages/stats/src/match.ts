// One match, written out so a person can read it: who won and how, how each player used the buttons,
// who knocked out whom, how each round went, and what the cubes gave. The relay saves this beside the log.
import { CAUSES, readLog, type CauseName, type PlayerStats, type ReadLog } from './log.ts';

export const share = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
export const seconds = (value: number): string => `${value.toFixed(1)} s`;
export const total = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);
const minutes = (value: number): string => `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;
const count = (by: Partial<Record<CauseName, number>>): number => total(Object.values(by));

/** A Markdown table. Cells are padded so the file also reads well as plain text. */
export function table(head: string[], rows: (string | number)[][]): string {
  const cells = [head, ...rows.map(row => row.map(String))];
  const widths = head.map((_, column) => Math.max(...cells.map(row => (row[column] ?? '').length)));
  const line = (row: string[]) => `| ${row.map((cell, column) => cell.padEnd(widths[column]!)).join(' | ')} |`;
  return [line(head), `| ${widths.map(width => '-'.repeat(width)).join(' | ')} |`, ...cells.slice(1).map(line)].join('\n');
}

const causes = (by: Partial<Record<CauseName, number>>): string =>
  CAUSES.filter(cause => (by[cause] ?? 0) > 0)
    .map(cause => `${cause} ${by[cause]}`)
    .join(', ') || '—';

/** The readable summary of one match. Takes a log of any age; older ones leave the columns they never counted blank. */
export function summariseMatch(raw: unknown): string {
  const log: ReadLog = readLog(raw);
  const name = (seat: number | null): string => (seat === null ? '—' : (log.players.find(player => player.seat === seat)?.name ?? `seat ${seat + 1}`));
  const people = log.players.filter(player => !player.bot);
  const ranked = [...log.players].sort((a, b) => a.place - b.place || a.seat - b.seat);
  const tag = (player: PlayerStats) => (player.bot ? `${player.name} (bot)` : player.name);
  const full = log.detail === 'full';
  const out: string[] = [];

  out.push(`# Match of ${log.startedAt.replace('T', ' ').slice(0, 16)} UTC, build ${log.version}`, '');
  out.push(
    `${log.rounds} rounds, ${people.length} ${people.length === 1 ? 'person' : 'people'} and ${log.players.length - people.length} bots` +
      (log.seconds > 0 ? `, ${minutes(log.seconds)} of play` : '') +
      `. Seed ${log.seed}.`,
  );
  if (!full) out.push('', `Saved by an older build: only ${log.detail === 'moves' ? 'the basic counts of moves' : 'scores, knockouts and latency'} were recorded.`);

  out.push('', '## Result', '');
  out.push(
    table(
      ['Place', 'Player', 'Score', 'From knockouts', 'From placing', 'Other', 'Rounds won', 'Award'],
      ranked.map(player => [
        `${player.place}`,
        tag(player),
        player.score,
        full ? player.points.kill : '',
        full ? player.points.place : '',
        full ? player.points.swap + player.points.bounty : '',
        player.roundsWon,
        player.award ?? '',
      ]),
    ),
  );

  if (log.detail !== 'basic') {
    out.push('', '## How each player used the buttons', '');
    out.push(
      table(
        ['Player', 'Taps', 'Charged', 'Avg charge', 'Dashes that hit', 'A while resting', 'Grabs landed / tried', 'Throws', 'Throws that hit a rival', 'Got free / was grabbed', 'Powers used / waiting', 'Avg wait', 'Idle', 'Alive'],
        ranked.map(player => {
          const dashes = player.a.taps + player.a.charged;
          return [
            tag(player),
            player.a.taps,
            player.a.charged,
            full && dashes > 0 ? share(player.a.chargeTotal, dashes) : '',
            full ? `${player.a.hits} of ${player.a.hits + player.a.misses} (${share(player.a.hits, player.a.hits + player.a.misses)})` : '',
            player.a.whileResting,
            `${player.b.grabs} / ${player.b.grabs + player.b.misses} (${share(player.b.grabs, player.b.grabs + player.b.misses)})`,
            player.b.throws,
            full ? player.b.throwHits : '',
            full ? `${player.b.escapes} / ${player.b.grabbed}` : '',
            full ? `${player.powers.used} / ${player.powers.ready}` : `${player.powers.used}`,
            full && player.powers.used > 0 ? seconds(player.powers.heldSeconds / player.powers.used) : '',
            player.idleShare === null ? '' : share(player.idleShare, 1),
            full && log.seconds > 0 ? share(player.aliveSeconds, log.seconds) : '',
          ];
        }),
      ),
    );
  }

  out.push('', '## Knockouts', '');
  const knockouts = total(Object.values(log.eliminationsByCause));
  out.push(
    `${knockouts} in all: ` +
      (Object.entries(log.eliminationsByCause)
        .sort((a, b) => b[1] - a[1])
        .map(([cause, times]) => `${cause} ${times} (${share(times, knockouts)})`)
        .join(', ') || 'none') +
      '.',
    '',
  );
  out.push(
    table(
      ['Player', 'Knocked out', 'How', 'Was knocked out', 'How'],
      ranked.map(player => [tag(player), count(player.knockouts), causes(player.knockouts), count(player.deaths), causes(player.deaths)]),
    ),
  );
  const pairs = new Map<string, number>();
  for (const out_ of log.eliminations) if (out_.killer !== null) pairs.set(`${name(out_.killer)} → ${name(out_.seat)}`, (pairs.get(`${name(out_.killer)} → ${name(out_.seat)}`) ?? 0) + 1);
  if (pairs.size > 0) {
    out.push('', 'Who knocked out whom: ' + [...pairs].sort((a, b) => b[1] - a[1]).map(([pair, times]) => `${pair} ×${times}`).join(', ') + '.');
  }

  if (log.roundStats.length > 0) {
    out.push('', '## Rounds', '');
    out.push(
      table(
        ['Round', 'Game', 'Length', 'First knockout', 'Ended by', 'Won by', 'Knockouts'],
        log.roundStats.map(round => [
          round.round,
          round.mode,
          seconds(round.seconds),
          round.firstKnockoutAt === null ? '—' : seconds(round.firstKnockoutAt),
          round.endedBy === 'time' ? 'the clock' : 'the last knockout',
          round.winners.map(name).join(', ') || '—',
          round.knockouts,
        ]),
      ),
    );
  }

  out.push('', '## Cubes and powers', '');
  const tiers = new Map<string, number>();
  for (const roll of log.rolls) tiers.set(roll.tier, (tiers.get(roll.tier) ?? 0) + 1);
  out.push(`${log.rolls.length} rolls` + (tiers.size > 0 ? `: ${[...tiers].map(([tier, times]) => `${tier} ${times}`).join(', ')}` : '') + '.');
  if (Object.keys(log.powers).length > 0) {
    out.push('', table(['Power', 'Rolled', 'Ran', 'Knockouts'], Object.entries(log.powers).sort((a, b) => b[1].rolled - a[1].rolled).map(([power, uses]) => [power, uses.rolled, uses.used, log.format >= 3 ? uses.knockouts : ''])));
  }
  for (const gacha of log.gachas) out.push('', `SUPER gacha in round ${gacha.round} for ${name(gacha.seat)}: ${gacha.jinx}% curse chance from ZICA, ${gacha.cursed ? 'and it was cursed' : 'and it held'}.`);

  if (log.phones && log.phones.length > 0) {
    out.push('', '## Phones', '');
    out.push(
      table(
        ['Player', 'Phone', 'Joined in', 'Latency median / 95th', 'Came back', 'Slowest return', 'Left early'],
        log.phones.map(phone => {
          const player = log.players.find(candidate => candidate.seat === phone.seat && candidate.name === phone.name) ?? log.players.find(candidate => candidate.seat === phone.seat);
          return [
            phone.name,
            phone.device,
            phone.joinMs === null ? '—' : seconds(phone.joinMs / 1000),
            player && player.latencyMedianMs !== null ? `${Math.round(player.latencyMedianMs)} / ${Math.round(player.latency95Ms ?? 0)} ms` : '—',
            phone.rejoins,
            phone.worstRejoinMs === null ? '—' : seconds(phone.worstRejoinMs / 1000),
            phone.left ? 'yes' : '',
          ];
        }),
      ),
    );
  }
  return `${out.join('\n')}\n`;
}
