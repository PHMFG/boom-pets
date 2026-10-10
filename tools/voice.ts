// Records the announcer's lines with this Mac's own Portuguese voice, trims the silence around each
// and brings them all to the same level. The game adds the drama (reverb, echo, grit) when it plays them.
// Usage: node tools/voice.ts [voice]   (needs macOS `say` and ffmpeg)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strings } from '../apps/web/src/shared/strings.pt-BR.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'apps/web/public/voice');
/** A deep male voice. `say -v '?'` lists the others this Mac has for pt_BR. */
const voice = process.argv[2] ?? 'Rocko (Português (Brasil))';
/** Words a minute. Slower than talking: an announcer takes his time. */
const RATE = 150;
/** Every line peaks here, so none is quieter than another before the game's effects. */
const PEAK_DB = -1;

mkdirSync(target, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'boom-voice-'));
try {
  for (const [key, line] of Object.entries(strings.announcer)) {
    const raw = join(scratch, `${key}.wav`);
    const trimmed = join(scratch, `${key}-trimmed.wav`);
    execFileSync('say', ['-v', voice, '-r', String(RATE), '-o', raw, '--data-format=LEI16@44100', line]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB:stop_duration=0.25', trimmed]);
    // ffmpeg reports the loudest sample on stderr; the second pass lifts the line to the common peak.
    const probe = spawnSync('ffmpeg', ['-i', trimmed, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(probe.stderr)?.[1] ?? 0);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', trimmed, '-af', `volume=${(PEAK_DB - peak).toFixed(1)}dB`, '-c:a', 'aac', '-b:a', '128k', join(target, `${key}.m4a`)]);
    console.log(`${key.padEnd(11)} "${line}"`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\nRecorded ${Object.keys(strings.announcer).length} lines with ${voice} into ${target}`);
