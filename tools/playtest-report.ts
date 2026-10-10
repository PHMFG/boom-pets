// Reads every match log the game has saved and prints the playtest report: how the latest build
// plays (what each move pays, how pets are knocked out, the buttons, rounds, powers, scores), the
// builds side by side, each player, the warning signs, and the plan's definition of done.
// It also saves the report as REPORT.md in the same folder. The analysis lives in packages/stats.
// Usage: pnpm report [folder=playtests] [--build=0.4.3]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, summariseMatch } from '../packages/stats/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const folder = resolve(root, args.find(arg => !arg.startsWith('--')) ?? 'playtests');
const build = args.find(arg => arg.startsWith('--build='))?.slice('--build='.length);

const names = existsSync(folder) ? readdirSync(folder).filter(name => name.endsWith('.json')).sort() : [];
const logs = names.map(name => JSON.parse(readFileSync(join(folder, name), 'utf8')) as unknown);
// The relay writes a readable summary beside each log as it saves it. Logs from before it did get theirs here.
names.forEach((name, index) => {
  const summary = join(folder, name.replace(/\.json$/, '.md'));
  if (!existsSync(summary)) writeFileSync(summary, summariseMatch(logs[index]));
});
const report = analyse(logs, { folder, build });
console.log(report.text);
if (logs.length > 0) {
  writeFileSync(join(folder, 'REPORT.md'), report.text);
  console.log(`Saved as ${join(folder, 'REPORT.md')}`);
}
