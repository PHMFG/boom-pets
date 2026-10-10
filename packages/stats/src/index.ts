// What the game records about a match, and what can be read out of it. Three users: the game screen
// builds a MatchLog, the relay saves it with a readable summary beside it, and `pnpm report` reads
// every saved log back to judge the balance of the game.
export * from './log.ts';
export { summariseMatch } from './match.ts';
export { analyse, formatReport, type Report } from './report.ts';
