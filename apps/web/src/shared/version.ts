// Which build this is. Shown on the title screen and on the phone's join page, so a browser still
// showing an old copy can be told apart at a glance. Vite puts the root package.json's version here.
declare const __BOOM_VERSION__: string;

export const VERSION = __BOOM_VERSION__;
