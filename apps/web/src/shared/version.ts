// Which build this is. Shown on the title screen and on the phone's join page, so a browser still
// showing an old copy can be told apart at a glance. Vite puts the root package.json's version here,
// and stamps the same number into each page's HTML.
declare const __BOOM_VERSION__: string;

export const VERSION = __BOOM_VERSION__;

const TRIED_KEY = 'boom.reloadedFor';

/** The version in a page's HTML, or null if it carries none. */
export function stampedVersion(html: string): string | null {
  return /<meta name="boom-version" content="([^"]+)"/.exec(html)?.[1] ?? null;
}

/**
 * Reloads this page if the server now serves a different build from the one that is running, which is
 * what a browser holding on to old files, or a tab left open across an update, looks like. It tries
 * once per served version, so a browser that insists on its cache cannot loop. Resolves to true when
 * the running code is known to be stale and a reload did not cure it.
 */
export async function reloadIfStale(): Promise<boolean> {
  try {
    const served = stampedVersion(await (await fetch(location.pathname, { cache: 'no-store' })).text());
    if (served === null || served === VERSION) {
      sessionStorage.removeItem(TRIED_KEY);
      return false;
    }
    if (sessionStorage.getItem(TRIED_KEY) === served) return true;
    sessionStorage.setItem(TRIED_KEY, served);
    location.reload();
    return false;
  } catch {
    // Offline, or storage refused: nothing to compare with, so the page carries on as it is.
    return false;
  }
}
