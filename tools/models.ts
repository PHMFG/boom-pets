// Builds the game's own 3D models in Blender, through the socket bridge of Blender's MCP add-on
// (the "MCP" extension from Blender Lab: Preferences > Get Extensions). Each map has a script in
// tools/blender/maps/; this runs it in Blender, exports apps/web/public/models/maps/<map>.glb and
// renders a picture of it into test-results/models/ to look at.
//
// Usage:
//   pnpm models                 build every map
//   pnpm models potato frita    build these
//   pnpm models potato --port=9877
//       use a Blender that is already serving the bridge on that port, instead of starting one
//       (start it with: Blender --background --online-mode --command blender_mcp --port 9877)
//   pnpm models --run=some.py --port=9877
//       send one Python file to a running bridge and print what it answers: for trying things out
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(root, 'tools/blender');
const out = join(root, 'apps/web/public/models/maps');
const pictures = join(root, 'test-results/models');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';

type Answer = { status?: 'ok' | 'error'; result?: Record<string, unknown>; message?: string; stdout?: string; stderr?: string };

/** Runs Python in Blender and returns what it left in `result`. The bridge takes one request per connection. */
function run(port: number, code: string): Promise<Answer> {
  return new Promise((done, fail) => {
    const socket = connect(port, '127.0.0.1');
    let text = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ type: 'execute', code, strict_json: false })}\0`));
    socket.on('data', chunk => {
      text += chunk;
      if (!text.includes('\0')) return;
      socket.end();
      done(JSON.parse(text.slice(0, text.indexOf('\0'))) as Answer);
    });
    socket.on('error', fail);
  });
}

/** A port nobody is using, so several builds can run at once, each with a Blender of its own. */
const freePort = () =>
  new Promise<number>(done => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });

const canConnect = (port: number) =>
  new Promise<boolean>(done => {
    const socket = connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), done(true)));
    socket.on('error', () => done(false));
  });

/** Starts a Blender with no window that serves the add-on's bridge, and waits for it to answer. */
async function startBlender(port: number): Promise<ChildProcess> {
  if (!existsSync(BLENDER)) throw new Error(`Blender was not found at ${BLENDER}. Set BLENDER to its executable.`);
  const child = spawn(BLENDER, ['--background', '--online-mode', '--command', 'blender_mcp', '--port', String(port)], { stdio: 'ignore' });
  for (let tries = 0; tries < 80; tries++) {
    if (await canConnect(port)) return child;
    await new Promise(wait => setTimeout(wait, 250));
  }
  child.kill();
  throw new Error('Blender did not start its MCP bridge. Is the MCP extension installed and enabled in Blender?');
}

/**
 * One of the plain objects of colours in tokens.ts. The file is read as text, since it imports its
 * neighbours the way the web build does and cannot be loaded here.
 */
function tokens<Shape>(name: string): Shape {
  const text = readFileSync(join(root, 'apps/web/src/shared/tokens.ts'), 'utf8');
  const start = text.indexOf(`export const ${name} = {`);
  const end = text.indexOf('} as const', start);
  if (start < 0 || end < 0) throw new Error(`tokens.ts has no "${name}"`);
  return new Function(`return (${text.slice(text.indexOf('{', start), end + 1)})`)() as Shape;
}

/** Every colour a model may name: the game's shared colours, and over them the map's own palette. */
const paletteOf = (map: string): Record<string, string> => ({ ...tokens<Record<string, string>>('colors'), ...(tokens<Record<string, Record<string, string>>>('maps')[map] ?? {}) });

function show(answer: Answer): void {
  if (answer.stdout) process.stdout.write(answer.stdout);
  if (answer.stderr) process.stderr.write(answer.stderr);
  if (answer.status === 'error') throw new Error(answer.message ?? 'Blender reported an error');
}

async function build(port: number, map: string): Promise<void> {
  const script = join(scripts, 'maps', `${map}.py`);
  if (!existsSync(script)) throw new Error(`There is no ${script}`);
  mkdirSync(out, { recursive: true });
  mkdirSync(pictures, { recursive: true });
  const answer = await run(
    port,
    [
      'import sys, importlib, runpy',
      `sys.path.insert(0, ${JSON.stringify(scripts)}) if ${JSON.stringify(scripts)} not in sys.path else None`,
      'import kit',
      'importlib.reload(kit)',
      `kit.begin(${JSON.stringify(map)}, ${JSON.stringify(paletteOf(map))})`,
      `runpy.run_path(${JSON.stringify(script)})`,
      `result = kit.finish(${JSON.stringify(join(out, `${map}.glb`))}, ${JSON.stringify(join(pictures, `${map}.png`))})`,
    ].join('\n'),
  );
  show(answer);
  const made = answer.result as { objects: number; triangles: number; bytes: number; materials: string[]; clips: string[] };
  console.log(`${map}: ${made.objects} objects, ${made.triangles} triangles, ${Math.round(made.bytes / 1024)} KB, colours ${made.materials.join(' ')}${made.clips.length > 0 ? `, clips ${made.clips.join(' ')}` : ''}`);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const names = args.filter(arg => !arg.startsWith('--'));
const given = flag('port');
const port = given ? Number(given) : await freePort();
const child = given ? null : await startBlender(port);
try {
  const file = flag('run');
  if (file) {
    const answer = await run(port, readFileSync(resolve(file), 'utf8'));
    show(answer);
    console.log(JSON.stringify(answer.result ?? {}, null, 2));
  } else {
    const all = readdirSync(join(scripts, 'maps')).filter(name => name.endsWith('.py')).map(name => name.slice(0, -3));
    for (const map of names.length > 0 ? names : all) await build(port, map);
    console.log(`Pictures to look at are in ${pictures}`);
  }
} finally {
  child?.kill();
}
