// Finds the address phones should use to reach this computer.
import type { NetworkInfo } from '@boom/protocol';
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function run(command: string, args: string[]): Promise<string> {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 1500 }, (error, stdout) => resolve(error ? '' : stdout));
  });
}

function ipv4Of(name: string): string | null {
  const found = networkInterfaces()[name]?.find(entry => entry.family === 'IPv4' && !entry.internal);
  return found?.address ?? null;
}

/**
 * The interface that carries the default route is the one on the real network.
 * Picking "the first non-internal address" can return a VPN or virtual interface that phones cannot reach.
 */
async function defaultInterface(): Promise<string | null> {
  if (process.platform === 'darwin') {
    return /interface:\s*(\S+)/.exec(await run('/sbin/route', ['-n', 'get', 'default']))?.[1] ?? null;
  }
  if (process.platform === 'linux') {
    return /\bdev\s+(\S+)/.exec(await run('ip', ['route', 'show', 'default']))?.[1] ?? null;
  }
  return null;
}

/** Recent macOS hides the network name from command-line tools, so this is often null. */
async function wifiName(device: string): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  const name = /Current Wi-Fi Network:\s*(.+)/.exec(await run('/usr/sbin/networksetup', ['-getairportnetwork', device]))?.[1]?.trim();
  return name || null;
}

export async function readNetwork(): Promise<NetworkInfo> {
  const device = await defaultInterface();
  if (device) {
    const address = ipv4Of(device);
    if (address) return { address, ssid: await wifiName(device) };
  }
  // No default route found (or an unknown platform): fall back to the first address on a physical-looking interface.
  for (const name of Object.keys(networkInterfaces()).filter(candidate => /^(en|eth|wl)/.test(candidate))) {
    const address = ipv4Of(name);
    if (address) return { address, ssid: null };
  }
  return { address: null, ssid: null };
}
