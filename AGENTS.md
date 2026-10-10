# Boom Pets: project guidance

A local party brawler. The computer is the game screen; each phone is a joystick that joins by QR code over the same Wi-Fi. The approved plan is in `docs/PLAN.md`; its last section lists what was built differently.

## Conventions

- Every word shown on screen is Brazilian Portuguese and lives in `apps/web/src/shared/strings.pt-BR.ts`. Code, comments and commits are in English.
- Colours, shapes, fonts and UI timings come from `apps/web/src/shared/tokens.ts` and `motion.ts`. Do not write a raw colour or duration in a stylesheet or a scene.
- Nothing appears, moves or leaves without animation. Entrances pop in, exits squish out; particles shrink away instead of fading.
- `packages/game` is the simulation. It must not import Three.js or use DOM types; its tsconfig enforces this. The host reads simulation state and events and never changes them.
- Randomness in the simulation goes through `createRng(seed, stream)`. Never call `Math.random` there. Effects on the host may.
- Every number that shapes how the game feels is in `packages/game/src/tuning.ts`.
- TypeScript is strict with `erasableSyntaxOnly`: no enums and no constructor parameter properties.
- The phone controller is vanilla TypeScript and DOM. It must not import React, Three.js, Zod or `@boom/game` at runtime (types are fine).
- No full-screen flashes, and nothing blinks faster than 3 times a second.
- A danger is always drawn on the floor before it lands (`Decals.warning`).

## Where things live

Simulation (`packages/game/src/`)

- `game.ts`: lobby, match flow, rounds, scoring, slow motion, the gacha. `tick()` is one sixtieth of a real second.
- `round.ts`: one round on the platform: movement, dash, grab and throw, barrels, tiles, cube, powers, meteors, ghosts.
- `physics.ts`: thin layer over Rapier. Rapier resolves bodies bumping into each other; the floor is the tile grid in `round.ts`.
- `bots.ts`, `odds.ts`, `scoring.ts`, `input.ts`, `rng.ts`, `types.ts` (state and events the host reads).

Host (`apps/web/src/host/`)

- `app/Session.ts`: the loop, seats, match start and end, phone status, event feed, playtest log. Bots brawl behind the title screen and in an empty lobby. `?solo` runs it without the relay; `?autostart` starts a bot match at once.
- `hud/Presence.tsx`: wrap anything that can leave the screen in it, so it squishes out instead of vanishing.
- `stages/GameStage.ts`: draws the simulation and turns its events into motion, particles, camera moves and words.
- `stages/Props.ts` (barrels, cube, meteors, ghosts, slot reels, capsule machine, pop-up words, podium), `stages/TileField.ts`.
- `pets/PetView.ts`: one pet. The model plays its clips; code-driven motion goes on wrapper groups above it.
- `render/`: `Renderer.ts` (post-processing), `CameraRig.ts`, `materials.ts` (toon and outline), `assets.ts`, `Text3D.ts`, `emoji.ts`.
- `fx/Particles.ts`, `fx/Decals.ts`, `audio/AudioEngine.ts` (samples for impacts, everything else synthesised).
- `hud/GameScreen.tsx` and `game.css`: the flat HUD for every phase. `Nameplates.ts` is written to the DOM each frame.
- `studio/`: test bench at `/?studio` for pets, clips and the 3D font.

Phone (`apps/web/src/controller/`): `main.ts` (join), `net.ts` (connection), `pad.ts` (joystick, buttons, and the screen for each state).

Relay (`apps/relay/src/`): `relay.ts` passes messages, keeps the roster (`room.ts`) and saves playtest logs, adding what only it knows about each phone (iPhone or Android, how long it took to join, how often it dropped and how fast it came back); `network.ts` finds the Wi-Fi address.

Shared: `apps/web/src/shared/` (tokens, motion, strings, pets, power icons, SVG glyphs) and `packages/protocol/src/` (`index.ts` messages, `schemas.ts` validation for the relay).

Other: `tools/` (scripts below), `assets-raw/` (unzipped Kenney packs, not committed; see its README), `playtests/` (one JSON per finished match, not committed).

## Commands

- `pnpm dev`: start the relay and the web server. Open http://localhost:5173 on this computer; phones join from the QR code.
- `pnpm fake 4`: connect 4 simulated phones that ready up and play. Add `--seconds=30` to stop on its own.
- `pnpm test`, `pnpm typecheck`, `pnpm build` (the build also checks the phone bundle: 150 KB budget, no Three.js).
- `pnpm test:e2e`: the browser tests in `e2e/`, about 8 minutes. They start their own copy of the game on other ports and never touch a session on the usual ones. Phones run on WebKit with iPhone settings and on Chromium with Android settings. They cover: a four-phone session with a gacha and a rematch; six phones joining with timing (and no two controls of the lobby pad overlapping on any of the six phone shapes), a seventh turned away, and a dropped phone getting its pet back in the lobby and mid-match; solo and duo with bots; and a full five-round match in real time. `pnpm test:e2e -g "four phones"` runs one of them.
- `pnpm report`: reads the playtest logs in `playtests/` and prints idle time, time to first dash, latency, knockouts by cause and who got the SUPER rolls, with the warning signs flagged. It ends with the plan's definition of done, each item marked `met` or `not yet` from matches played on real phones, so it is the way to tell whether S6 is reached. Logs from development runs are kept apart in `playtests/dev-runs/`.
- `pnpm balance 20`: play 20 bot-only matches without a screen and print pacing numbers. Run it after changing `tuning.ts` or `bots.ts`.
- `pnpm font`: rebuild the 3D font after changing `words3d` or the power names. It fails if a character has no glyph.
- `pnpm assets`, `pnpm sounds`: copy models and skyboxes, and convert impact sounds, from `assets-raw` into `apps/web/public`.
- `pnpm inspect:pets`: list parts and clips of every pet model.

## Host keys

Enter starts a match (or a rematch); Esc returns to the lobby from the results. In the lobby: R rounds (5 or 3), B bots. Anywhere: M less shake and glow, S sound, backtick debug overlay, 1 to 6 buzz that seat's phone.

## Network

- The web server listens on the Wi-Fi (port 5173) and proxies `/ws` and `/api` to the relay, which listens on `127.0.0.1:47821` only. Set `BOOM_RELAY_PORT` if that port is taken.
- Only a page opened at `localhost` may be the game screen. The first one keeps the room; a second waits its turn. For testing beside a real session, open `http://localhost:5173/?solo&autostart`.
- The roster (seat, name, token) lives in the relay, so reloading the game screen keeps the phones seated. Restarting the relay makes a new room code.

## Verification

Run `pnpm typecheck` and `pnpm test` before finishing a change, and `pnpm test:e2e` after touching the phone page, the protocol or the lobby. For anything visual, open the game and look; passing tests do not establish that it looks right. In development the page exposes `window.__BOOM__` (`game`, `session`, and `skip(seconds)` to fast-forward).
