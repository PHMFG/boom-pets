// Every saved match read back together, to judge the balance of the game. Rules change from build to
// build, so the balance section looks at one build at a time (the newest by default) and a table sets
// the builds side by side. Bots are left out of everything that is about how people play.
import { readLog, type CauseName, type PlayerStats, type ReadLog } from './log.ts';
import { seconds, share, table, total } from './match.ts';

export type Report = {
  matches: number;
  /** The build the balance section is about. */
  build: string | null;
  /** What looks wrong, most telling first. Empty when nothing crossed a line. */
  warnings: string[];
  /** The whole report, ready to print or save. */
  text: string;
};

/** The lines a number has to cross to be called a warning. Kept in one place so they can be argued with. */
export const LIMITS = {
  /** One way of being knocked out, as a share of all knockouts. */
  causeShare: 0.6,
  /** How many times better one move may pay than the next best, in knockouts per use. */
  payoffRatio: 3,
  /** Share of a player's dashes that may be taps. */
  tapShare: 0.6,
  /** Share of everyone's dashes that should be charged. */
  chargedShare: 0.25,
  /** Presses of A while it rests, for each dash made. */
  restingPerDash: 2,
  /** Missed grabs for each one landed. */
  missesPerGrab: 2,
  /** Share of throws that may end in a knockout before a grab is as good as a win. */
  throwKnockouts: 0.5,
  /** Share of grabbed pets that should wriggle free. */
  escapes: 0.15,
  /** Share of waiting powers that should get used, and how long one should wait at most. */
  powersUsed: 0.6,
  powerWait: 8,
  /** Share of knockouts that may be a player's own doing (falls and overcharges). */
  selfShare: 0.4,
  /** Share of matches one person may win, and how far ahead the winner may finish. */
  winShare: 0.6,
  winnerLead: 2,
  /** Share of SUPER rolls that may go to whoever is leading. */
  leaderSupers: 0.4,
  /** Knockouts a SUPER should make each time it runs: under the low end it is not worth getting, over the high end it decides the round alone. */
  superKnockouts: { low: 0.4, high: 2 },
  roundSeconds: { low: 12, high: 60 },
  /** Share of rounds that may run out the clock. */
  clockShare: 0.3,
  idleShare: 0.2,
  firstDash: 10,
  latency95: 120,
} as const;

type Person = { name: string; matches: number; wins: number; stats: PlayerStats[]; detail: ReadLog['detail'][] };
const mean = (values: number[]): number | null => (values.length === 0 ? null : total(values) / values.length);
const sum = (players: PlayerStats[], pick: (player: PlayerStats) => number): number => total(players.map(pick));
/** The powers a SUPER roll can give. This package does not read the game's own list, so a new SUPER is added here too. */
const SUPER_POWERS = ['kaiju', 'meteorShower'];
const kos = (by: Partial<Record<CauseName, number>>, cause?: CauseName): number => (cause ? (by[cause] ?? 0) : total(Object.values(by)));
const percent = (value: number | null): string => (value === null ? '—' : `${Math.round(value * 100)}%`);
const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);
const per100 = (part: number, whole: number): string => (whole > 0 ? ((part / whole) * 100).toFixed(1) : '—');

/** Players of a match that were people on real phones, if the relay said what they joined with. */
function phonePlayers(log: ReadLog): PlayerStats[] {
  const people = log.players.filter(player => !player.bot);
  const phones = (log.phones ?? []).filter(phone => phone.device !== 'other');
  return people.filter(player => phones.some(phone => phone.seat === player.seat));
}

function byBuild(logs: ReadLog[]): Map<string, ReadLog[]> {
  const builds = new Map<string, ReadLog[]>();
  for (const log of [...logs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) builds.set(log.version, [...(builds.get(log.version) ?? []), log]);
  return builds;
}

/** The numbers that describe how one set of matches played, people only. */
function measure(logs: ReadLog[]) {
  const people = logs.flatMap(log => log.players.filter(player => !player.bot));
  const detailed = logs.filter(log => log.detail === 'full').flatMap(log => log.players.filter(player => !player.bot));
  const counted = logs.filter(log => log.detail !== 'basic').flatMap(log => log.players.filter(player => !player.bot));
  const causes: Record<string, number> = {};
  for (const log of logs) for (const [cause, times] of Object.entries(log.eliminationsByCause)) causes[cause] = (causes[cause] ?? 0) + times;
  const rounds = logs.flatMap(log => log.roundStats);
  const dashes = sum(counted, player => player.a.taps + player.a.charged);
  return {
    people,
    detailed,
    counted,
    causes,
    knockouts: total(Object.values(causes)),
    rounds,
    roundSeconds: mean(rounds.map(round => round.seconds)),
    firstKnockout: mean(rounds.flatMap(round => (round.firstKnockoutAt === null ? [] : [round.firstKnockoutAt]))),
    dashes,
    taps: sum(counted, player => player.a.taps),
    charged: sum(counted, player => player.a.charged),
    grabs: sum(counted, player => player.b.grabs),
    grabMisses: sum(counted, player => player.b.misses),
    throws: sum(counted, player => player.b.throws),
    powersReady: sum(detailed, player => player.powers.ready),
    powersUsed: sum(detailed, player => player.powers.used),
  };
}

function definitionOfDone(logs: ReadLog[]): string[] {
  const matches = logs.map(log => ({ log, players: phonePlayers(log), bots: log.players.filter(player => player.bot).length })).filter(match => match.players.length > 0);
  const phones = matches.flatMap(match => (match.log.phones ?? []).filter(phone => phone.device !== 'other' && match.players.some(player => player.seat === phone.seat)));
  const mostPhones = Math.max(0, ...matches.map(match => match.players.length));
  const joins = phones.flatMap(phone => (phone.joinMs === null ? [] : [phone.joinMs]));
  const slowestJoin = joins.length > 0 ? Math.max(...joins) : null;
  const fullMatches = matches.filter(match => match.log.rounds === 5 && match.log.standings.length > 0).length;
  const medians = matches.flatMap(match => match.players.flatMap(player => (player.latencyMedianMs === null ? [] : [player.latencyMedianMs])));
  const worstMedian = medians.length > 0 ? Math.max(...medians) : null;
  const solo = matches.some(match => match.players.length === 1 && match.bots > 0);
  const duo = matches.some(match => match.players.length === 2 && match.bots > 0);
  const returns = total(phones.map(phone => phone.rejoins));
  const rejoins = phones.flatMap(phone => (phone.worstRejoinMs === null ? [] : [phone.worstRejoinMs]));
  const worstRejoin = rejoins.length > 0 ? Math.max(...rejoins) : null;
  const kinds = [phones.some(phone => phone.device === 'iphone') ? 'iPhone' : '', phones.some(phone => phone.device === 'android') ? 'Android' : ''].filter(Boolean);
  const wait = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

  const items: [met: boolean, item: string, evidence: string][] = [
    [mostPhones >= 6 && slowestJoin !== null && slowestJoin < 30_000, '1  Six phones join in under 30 s each', mostPhones === 0 ? 'no real phone yet' : `${mostPhones} in one match, slowest join ${slowestJoin === null ? 'not measured' : wait(slowestJoin)}`],
    [fullMatches > 0, '2  A full 5-round match, lobby to results', `${fullMatches} finished`],
    [worstMedian !== null && worstMedian < 80, '3  Input under 80 ms on home Wi-Fi', worstMedian === null ? 'no reading yet' : `worst phone's median ${Math.round(worstMedian)} ms over ${medians.length} readings`],
    [solo && duo, '4  Solo and duo playable with bots', `solo ${solo ? 'played' : 'not played'}, duo ${duo ? 'played' : 'not played'}`],
    [returns > 0 && worstRejoin !== null && worstRejoin <= 10_000, '5  A dropped phone is back within 10 s', returns === 0 ? 'no phone has dropped and come back: lock one mid-match, then unlock it' : `${returns} ${returns === 1 ? 'return' : 'returns'}, slowest ${worstRejoin === null ? 'not measured' : wait(worstRejoin)}`],
    [mostPhones >= 4, '6  A playtest with 4 or more people', mostPhones === 0 ? 'none yet' : `most people in one match: ${mostPhones}`],
    [mostPhones >= 2, '   Gate: two people play together', mostPhones >= 2 ? 'played. Whether they laughed is yours to say' : 'not played'],
    [kinds.length === 2, '   Seen on both iPhone and Android', kinds.length === 0 ? 'neither yet' : kinds.length === 2 ? 'both' : `${kinds[0]} only`],
  ];
  const lines = [`Definition of done, from matches played on real phones (${matches.length} so far)`];
  for (const [met, item, evidence] of items) lines.push(`  ${met ? 'met    ' : 'not yet'}  ${item.padEnd(42)} ${evidence}`);
  if (matches.length === 0) lines.push('', '  Start the game with `pnpm play`, join from phones on the same Wi-Fi, finish a match, and run this again.');
  return lines;
}

/**
 * Reads every log and works out the report. `build` picks which build the balance section is about;
 * left out, it is the newest build that has a match with people in it.
 */
export function analyse(raws: unknown[], options: { build?: string; folder?: string } = {}): Report {
  const all = raws.map(readLog).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const withPeople = all.filter(log => log.players.some(player => !player.bot));
  const builds = byBuild(withPeople);
  const build = options.build ?? [...builds.keys()].at(-1) ?? null;
  const focus = build === null ? [] : (builds.get(build) ?? []);
  const warnings: string[] = [];
  const out: string[] = [];

  out.push('# Boom Pets playtest report', '');
  out.push(`${all.length} matches${options.folder ? ` in ${options.folder}` : ''}: ${withPeople.length} with people, ${all.length - withPeople.length} with bots only.`);
  if (all.length === 0) out.push('', 'No matches logged yet. The game saves one log, and one readable summary beside it, each time a match ends.');

  // ── Build by build: the trend ──
  if (builds.size > 0) {
    out.push('', '## Build by build', '', 'Rules change between builds, so this is where to see whether a change did what it was meant to.', '');
    out.push(
      table(
        ['Build', 'Matches', 'People a match', 'Round length', 'First knockout', 'Knockouts: dash', 'throw', 'own doing', 'other', 'Dashes charged', 'Grabs landed', 'Powers used'],
        [...builds].map(([version, logs]) => {
          const m = measure(logs);
          const own = (m.causes.fall ?? 0) + (m.causes.overcharge ?? 0);
          return [
            version,
            logs.length,
            (m.people.length / logs.length).toFixed(1),
            m.roundSeconds === null ? '—' : seconds(m.roundSeconds),
            m.firstKnockout === null ? '—' : seconds(m.firstKnockout),
            share(m.causes.dash ?? 0, m.knockouts),
            share(m.causes.throw ?? 0, m.knockouts),
            share(own, m.knockouts),
            share(m.knockouts - (m.causes.dash ?? 0) - (m.causes.throw ?? 0) - own, m.knockouts),
            m.counted.length > 0 ? share(m.charged, m.dashes) : '—',
            m.counted.length > 0 ? share(m.grabs, m.grabs + m.grabMisses) : '—',
            m.detailed.length > 0 ? share(m.powersUsed, m.powersReady) : '—',
          ];
        }),
      ),
    );
  }

  // ── Balance of one build ──
  if (focus.length > 0 && build !== null) {
    const m = measure(focus);
    out.push('', `## Balance of build ${build}`, '', `${focus.length} ${focus.length === 1 ? 'match' : 'matches'}, ${m.knockouts} knockouts, ${m.rounds.length} rounds with timing.`);

    // What each move pays.
    const made = (cause: CauseName) => m.causes[cause] ?? 0;
    const moves = [
      { move: 'Dash (taps and charged)', uses: m.dashes, knockouts: made('dash') },
      { move: 'Throw a rival', uses: m.throws, knockouts: made('throw') },
      { move: 'Meteor, as a ghost', uses: sum(m.detailed, player => player.meteors), knockouts: made('meteor') },
    ];
    if (m.counted.length > 0) {
      out.push('', '### What each move pays', '');
      out.push(table(['Move', 'Times used', 'Knockouts', 'Knockouts per 100 uses'], moves.map(row => [row.move, row.uses, row.knockouts, per100(row.knockouts, row.uses)])));
      const paying = moves.filter(row => row.uses >= 20).map(row => ({ ...row, rate: row.knockouts / row.uses })).sort((a, b) => b.rate - a.rate);
      const [best, next] = paying;
      if (best && next && best.rate > 0 && best.rate >= next.rate * LIMITS.payoffRatio) {
        warnings.push(`"${best.move}" pays ${next.rate > 0 ? `${(best.rate / next.rate).toFixed(1)} times` : 'far'} more than "${next.move}" (${per100(best.knockouts, best.uses)} against ${per100(next.knockouts, next.uses)} knockouts per 100 uses): one move is the answer to everything.`);
      }
    }

    // Knockouts by cause.
    out.push('', '### How pets were knocked out', '');
    out.push(table(['Cause', 'Knockouts', 'Share'], Object.entries(m.causes).sort((a, b) => b[1] - a[1]).map(([cause, times]) => [cause, times, share(times, m.knockouts)])));
    for (const [cause, times] of Object.entries(m.causes)) {
      if (m.knockouts >= 10 && times / m.knockouts > LIMITS.causeShare) warnings.push(`"${cause}" is ${percent(times / m.knockouts)} of knockouts (over ${percent(LIMITS.causeShare)}): the other ways of knocking pets out are not being used.`);
    }
    const own = made('fall') + made('overcharge');
    if (m.knockouts >= 10 && own / m.knockouts > LIMITS.selfShare) warnings.push(`${percent(own / m.knockouts)} of knockouts were a player's own doing (falls and overcharges): players are beating themselves more than each other.`);

    // The buttons.
    if (m.counted.length > 0) {
      const full = m.detailed.length > 0;
      const hits = sum(m.detailed, player => player.a.hits);
      const tries = hits + sum(m.detailed, player => player.a.misses);
      const resting = sum(m.counted, player => player.a.whileResting);
      const grabbed = sum(m.detailed, player => player.b.grabbed);
      const escapes = sum(m.detailed, player => player.b.escapes);
      const throwRate = ratio(made('throw'), m.throws);
      out.push('', '### The buttons', '');
      out.push(
        table(
          ['Measure', 'Value', 'What it tells'],
          [
            ['Dashes that were charged', share(m.charged, m.dashes), 'Low means holding A is not worth the risk'],
            ['Average charge of a dash', full ? percent(ratio(sum(m.detailed, player => player.a.chargeTotal), sum(m.detailed, player => player.a.taps + player.a.charged))) : '—', '100% is a full charge'],
            ['Dashes that hit something', full ? share(hits, tries) : '—', 'Low means dashes are thrown away'],
            ['A pressed while resting, per dash', m.dashes > 0 ? (resting / m.dashes).toFixed(1) : '—', 'High means A is being mashed and the rest is not read'],
            ['Grabs that landed', share(m.grabs, m.grabs + m.grabMisses), 'Low means B is mashed or reach is hard to judge'],
            ['Landed grabs that became throws', share(m.throws, m.grabs), 'The rest got free or were dropped'],
            ['Throws that ended in a knockout', percent(throwRate), 'High means a landed grab is as good as a knockout'],
            ['Grabbed pets that wriggled free', full ? share(escapes, grabbed) : '—', 'Low means being grabbed leaves nothing to do'],
          ],
        ),
      );
      if (m.dashes >= 20 && m.charged / m.dashes < LIMITS.chargedShare) warnings.push(`Only ${share(m.charged, m.dashes)} of dashes were charged (under ${percent(LIMITS.chargedShare)}): holding A is not worth it to players.`);
      if (m.dashes >= 20 && resting / m.dashes > LIMITS.restingPerDash) warnings.push(`A was pressed ${(resting / m.dashes).toFixed(1)} times while resting for every dash made: A is being mashed, and the rest after a dash is not being read.`);
      if (m.grabs + m.grabMisses >= 20 && m.grabMisses > m.grabs * LIMITS.missesPerGrab) warnings.push(`${share(m.grabMisses, m.grabs + m.grabMisses)} of grabs missed: B is being mashed, or reach is hard to judge.`);
      if (m.throws >= 10 && throwRate !== null && throwRate > LIMITS.throwKnockouts) warnings.push(`${percent(throwRate)} of throws ended in a knockout (over ${percent(LIMITS.throwKnockouts)}): landing a grab is as good as a knockout.`);
      if (grabbed >= 10 && escapes / grabbed < LIMITS.escapes) warnings.push(`Only ${share(escapes, grabbed)} of grabbed pets got free: being grabbed leaves the victim nothing to do.`);
    }

    // Rounds.
    if (m.rounds.length > 0) {
      const byClock = m.rounds.filter(round => round.endedBy === 'time').length;
      out.push('', '### Rounds', '');
      out.push(`Average length ${seconds(m.roundSeconds ?? 0)}, shortest ${seconds(Math.min(...m.rounds.map(round => round.seconds)))}, longest ${seconds(Math.max(...m.rounds.map(round => round.seconds)))}. First knockout after ${m.firstKnockout === null ? '—' : seconds(m.firstKnockout)} on average. ${byClock} of ${m.rounds.length} ran out the clock.`);
      if (m.roundSeconds !== null && m.roundSeconds < LIMITS.roundSeconds.low) warnings.push(`Rounds last ${seconds(m.roundSeconds)} on average (under ${LIMITS.roundSeconds.low} s): they are over before anything develops.`);
      if (m.roundSeconds !== null && m.roundSeconds > LIMITS.roundSeconds.high) warnings.push(`Rounds last ${seconds(m.roundSeconds)} on average (over ${LIMITS.roundSeconds.high} s): they drag.`);
      if (byClock / m.rounds.length > LIMITS.clockShare) warnings.push(`${share(byClock, m.rounds.length)} of rounds ran out the clock: pets are not being knocked out fast enough.`);
    }

    // Powers and luck.
    const rolls = focus.flatMap(log => log.rolls);
    const supers = rolls.filter(roll => roll.tier === 'super');
    const leaderSupers = supers.filter(roll => roll.rank === 'leader').length;
    const wait = ratio(sum(m.detailed, player => player.powers.heldSeconds), m.powersUsed);
    out.push('', '### Cubes, powers and luck', '');
    out.push(`${rolls.length} rolls: ${['common', 'rare', 'cursed', 'super'].map(tier => `${tier} ${rolls.filter(roll => roll.tier === tier).length}`).join(', ')}. SUPER rolls to the leader ${leaderSupers}, to last place ${supers.filter(roll => roll.rank === 'last').length}.`);
    if (m.detailed.length > 0) out.push(`Powers that waited on the button: ${m.powersReady}, of which ${m.powersUsed} were used (${share(m.powersUsed, m.powersReady)})${wait === null ? '' : `, after waiting ${seconds(wait)} on average`}.`);
    // Knockouts by each power are counted from log format 3 on; older logs leave that column blank.
    const counted = focus.filter(log => log.format >= 3);
    const powers = new Map<string, { rolled: number; used: number; ran: number; knockouts: number }>();
    for (const log of focus) {
      for (const [power, uses] of Object.entries(log.powers)) {
        const sofar = powers.get(power) ?? { rolled: 0, used: 0, ran: 0, knockouts: 0 };
        const judged = counted.includes(log);
        powers.set(power, { rolled: sofar.rolled + uses.rolled, used: sofar.used + uses.used, ran: sofar.ran + (judged ? uses.used : 0), knockouts: sofar.knockouts + (judged ? uses.knockouts : 0) });
      }
    }
    if (powers.size > 0) {
      out.push(
        '',
        table(
          ['Power', 'Rolled', 'Ran', 'Knockouts', 'Per run'],
          [...powers].sort((a, b) => b[1].rolled - a[1].rolled).map(([power, uses]) => [power, uses.rolled, uses.used, counted.length > 0 ? uses.knockouts : '', uses.ran > 0 ? (uses.knockouts / uses.ran).toFixed(2) : '—']),
        ),
      );
    }
    const superRuns = total(SUPER_POWERS.map(power => powers.get(power)?.ran ?? 0));
    const superKnockouts = total(SUPER_POWERS.map(power => powers.get(power)?.knockouts ?? 0));
    if (superRuns > 0) out.push('', `A SUPER ran ${superRuns} ${superRuns === 1 ? 'time' : 'times'} and made ${superKnockouts} ${superKnockouts === 1 ? 'knockout' : 'knockouts'} (${(superKnockouts / superRuns).toFixed(2)} per run).`);
    if (superRuns >= 4 && superKnockouts / superRuns < LIMITS.superKnockouts.low) warnings.push(`A SUPER made ${(superKnockouts / superRuns).toFixed(2)} knockouts per run (under ${LIMITS.superKnockouts.low}): the rarest roll in the game is not worth getting.`);
    if (superRuns >= 4 && superKnockouts / superRuns > LIMITS.superKnockouts.high) warnings.push(`A SUPER made ${(superKnockouts / superRuns).toFixed(2)} knockouts per run (over ${LIMITS.superKnockouts.high}): one lucky roll decides the round by itself.`);
    if (m.powersReady >= 5 && m.powersUsed / m.powersReady < LIMITS.powersUsed) warnings.push(`Only ${share(m.powersUsed, m.powersReady)} of waiting powers were used (under ${percent(LIMITS.powersUsed)}): the power button is being missed.`);
    if (wait !== null && wait > LIMITS.powerWait) warnings.push(`A power waited ${seconds(wait)} on average before being used (over ${LIMITS.powerWait} s): players do not notice it, or do not know when to use it.`);
    if (supers.length >= 5 && leaderSupers / supers.length > LIMITS.leaderSupers) warnings.push(`The leader got ${share(leaderSupers, supers.length)} of the SUPER rolls: luck is helping whoever is already ahead.`);

    // Scores.
    const points = { kill: sum(m.detailed, player => player.points.kill), place: sum(m.detailed, player => player.points.place), other: sum(m.detailed, player => player.points.swap + player.points.bounty) };
    const leads = focus.flatMap(log => {
      const scores = log.standings.map(entry => entry.score).sort((a, b) => b - a);
      return scores.length >= 2 && scores[1]! > 0 ? [scores[0]! / scores[1]!] : [];
    });
    const firstRoundWinners = focus.filter(log => {
      const winner = log.standings.find(entry => entry.place === 1)?.seat;
      return winner !== undefined && (log.roundWinners[0] ?? []).includes(winner);
    }).length;
    out.push('', '### Scores', '');
    if (m.detailed.length > 0) out.push(`Points came from knockouts ${share(points.kill, points.kill + points.place + points.other)}, from placing ${share(points.place, points.kill + points.place + points.other)}, from swaps and bounties ${share(points.other, points.kill + points.place + points.other)}.`);
    out.push(`The winner finished with ${mean(leads) === null ? '—' : `${mean(leads)!.toFixed(1)} times`} the runner-up's score on average. Whoever won the first round went on to win the match in ${firstRoundWinners} of ${focus.length}.`);
    const lead = mean(leads);
    if (focus.length >= 2 && lead !== null && lead >= LIMITS.winnerLead) warnings.push(`The winner finished with ${lead.toFixed(1)} times the runner-up's score on average: matches are runaways, not contests.`);
  }

  // ── People, over every build ──
  const persons = new Map<string, Person>();
  for (const log of withPeople) {
    const winner = log.standings.find(entry => entry.place === 1)?.seat;
    for (const player of log.players) {
      if (player.bot) continue;
      const person = persons.get(player.name) ?? { name: player.name, matches: 0, wins: 0, stats: [], detail: [] };
      person.matches++;
      if (player.seat === winner) person.wins++;
      person.stats.push(player);
      person.detail.push(log.detail);
      persons.set(player.name, person);
    }
  }
  if (persons.size > 0) {
    out.push('', '## Players, over every build', '');
    out.push(
      table(
        ['Player', 'Matches', 'Wins', 'Idle', 'First dash', 'Latency median / 95th', 'Taps', 'Charged', 'A while resting', 'Grabs (missed)', 'Throws', 'Knockouts', 'Knocked out', 'Powers used'],
        [...persons.values()].map(person => {
          const idle = mean(person.stats.flatMap(player => (player.idleShare === null ? [] : [player.idleShare])));
          const firstDash = mean(person.stats.flatMap(player => (player.firstDashAt === null ? [] : [player.firstDashAt])));
          const median = mean(person.stats.flatMap(player => (player.latencyMedianMs === null ? [] : [player.latencyMedianMs])));
          const p95s = person.stats.flatMap(player => (player.latency95Ms === null ? [] : [player.latency95Ms]));
          const p95 = p95s.length > 0 ? Math.max(...p95s) : null;
          const counted = person.stats.filter((_, index) => person.detail[index] !== 'basic');
          const taps = sum(counted, player => player.a.taps);
          const charged = sum(counted, player => player.a.charged);
          const resting = sum(counted, player => player.a.whileResting);
          const grabs = sum(counted, player => player.b.grabs);
          const misses = sum(counted, player => player.b.misses);
          if (idle !== null && idle > LIMITS.idleShare) warnings.push(`${person.name} was idle ${percent(idle)} of the time (over ${percent(LIMITS.idleShare)}): they had nothing to do, did not know what to do, or had left.`);
          if (firstDash === null) warnings.push(`${person.name} never dashed in a first round: the controls may not be clear.`);
          else if (firstDash > LIMITS.firstDash) warnings.push(`${person.name} took ${firstDash.toFixed(1)} s to dash for the first time (over ${LIMITS.firstDash} s): the controls may not be clear.`);
          if (p95 !== null && p95 > LIMITS.latency95) warnings.push(`${person.name}'s phone had a 95th-percentile latency of ${Math.round(p95)} ms (over ${LIMITS.latency95} ms).`);
          if (taps + charged >= 10 && taps / (taps + charged) > LIMITS.tapShare) warnings.push(`${person.name} tapped A instead of charging ${percent(taps / (taps + charged))} of the time (over ${percent(LIMITS.tapShare)}).`);
          if (resting >= 20 && resting > (taps + charged) * LIMITS.restingPerDash) warnings.push(`${person.name} pressed A ${resting} times while it was resting: mashing, and not reading the rest.`);
          if (grabs + misses >= 6 && misses > grabs * LIMITS.missesPerGrab) warnings.push(`${person.name} missed ${misses} of ${grabs + misses} grabs: mashing B, or reach is hard to judge.`);
          return [
            person.name,
            person.matches,
            person.wins,
            percent(idle),
            firstDash === null ? 'never' : seconds(firstDash),
            median === null ? '—' : `${Math.round(median)} / ${p95 === null ? '—' : Math.round(p95)} ms`,
            taps,
            charged,
            resting,
            `${grabs} (${misses})`,
            sum(counted, player => player.b.throws),
            sum(person.stats, player => kos(player.knockouts)),
            sum(person.stats, player => kos(player.deaths)),
            sum(counted, player => player.powers.used),
          ];
        }),
      ),
    );
    if (withPeople.length >= 3) {
      for (const person of persons.values()) {
        if (persons.size > 1 && person.matches >= 3 && person.wins / person.matches > LIMITS.winShare) warnings.push(`${person.name} won ${person.wins} of the ${person.matches} matches they played: check whether it is skill or one trick.`);
      }
    }
    const left = withPeople.flatMap(log => (log.phones ?? []).filter(phone => phone.left).map(phone => phone.name));
    if (left.length > 0) out.push('', `Left before a match ended: ${[...new Set(left)].join(', ')}.`);
  }

  out.push('', '## Warning signs', '');
  out.push(warnings.length === 0 ? 'None.' : warnings.map(warning => `- ${warning}`).join('\n'));
  out.push('', `Limits used: ${Object.entries(LIMITS).map(([name, value]) => `${name} ${typeof value === 'object' ? `${value.low}-${value.high}` : value}`).join(', ')}. They are in packages/stats/src/report.ts.`);
  out.push('', '## Definition of done', '', '```', ...definitionOfDone(all), '```');

  return { matches: all.length, build, warnings, text: `${out.join('\n')}\n` };
}

export const formatReport = (report: Report): string => report.text;
