# Boom Pets: project guidance

A local party game. The computer is the game screen; each phone is a joystick that joins by QR code over the same Wi-Fi. A match is a handful of short rounds, and each round is a different game drawn by a roulette: the brawl the project started as (Bate-Bate), and simpler games that need the joystick and at most one button. The approved plan is in `docs/PLAN.md`; its last section lists what was built differently.

## Read first: the two style documents

The game has a style, and these two files are where it is written down. They outrank a clever idea.

- **`docs/DESIGN.md`**: how the game looks, moves and sounds. Read it before changing anything a player sees or hears: the TV, the phone, the 3D world, effects, words, sound.
- **`docs/GAMEPLAY.md`**: how the game plays and why. Read it before changing a rule, a number in `tuning.ts`, the controls, a power or the bots.

Each ends in a checklist. Before calling a change finished, go through the checklist of every document the change touches, and say in your summary which items you checked and how. If a change cannot meet an item, stop and ask instead of bending the item. If a decision changes the style itself, update the document in the same commit, so it never describes a game that no longer exists.

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
- Every player must be able to find their own pet at a glance. The floor has its own two colours (`floor`, `floorDark`), every pet's outline and ring carries an ink edge, and the camera frames the pets, not the platform. `docs/DESIGN.md`, "Finding your pet", says why and what to check.
- The brawl has three buttons: A dashes, B grabs and throws, and the power button (`c` in the protocol) uses a held power. Every other game has the joystick and at most A, and the game screen tells each phone what A is there. If mashing any button becomes the best way to play, that is a bug.
- Whatever pets walk on is pale, in every game. A map's character is in what surrounds its floor, and its colours are its own block of `maps` in `tokens.ts`.
- When a message between phone and game changes in a way an old phone page could not follow, raise `PROTOCOL_VERSION`.

## Where things live

Simulation (`packages/game/src/`)

- `game.ts`: lobby, match flow (intro, countdown, play, round end, finale), which game each round is, scoring, slow motion, the gacha. `tick()` is one sixtieth of a real second.
- `round.ts`: one round of the brawl: movement, dash, grab and throw, barrels, tiles, cube, powers, meteors, ghosts. The lobby is one too.
- `minis/field.ts`: the floor every other game is played on: a grid of tiles, pets that move with the brawl's numbers, and what a game may ask of it (a jump, a lunge, a knock, a respawn, a pet taken out). `minis/<game>.ts` is one game's rules; `minis/bots.ts` is how bots play them; `minis/index.ts` lists them.
- `types.ts` has `RoundCore`, what every kind of round offers. Anything only the brawl has is reached after checking `round.gameMode === 'brawl'`.
- `physics.ts`: thin layer over Rapier. Rapier resolves bodies bumping into each other; the floor is the tile grid in `round.ts`.
- `bots.ts`, `odds.ts`, `scoring.ts`, `input.ts`, `rng.ts`, `types.ts` (state and events the host reads).

Host (`apps/web/src/host/`)

- `app/Session.ts`: the loop, seats, match start and end, phone status, event feed, playtest log. Bots brawl behind the title screen and in an empty lobby. `?solo` runs it without the relay; `?autostart` starts a bot match at once.
- `hud/Presence.tsx`: wrap anything that can leave the screen in it, so it squishes out instead of vanishing.
- `stages/GameStage.ts`: draws the pets and turns the simulation's events into motion, particles, camera moves and words. The world itself is a map it swaps when the game changes.
- `stages/maps/`: one `MapView` per game (`kit.ts` says what that is): its floor, surroundings, sky, light and props. The scenery is a model made in Blender (`render/models.ts` loads it, paints it from `maps.<map>` in the tokens and outlines it; `tools/blender/` builds it); `maps/toys.ts` builds the few props still made from plain shapes in code. A floor that has grown since its scenery was modelled is not modelled again: the map scales the model to it (`fitScenery` in `stages/kit.ts`, `Model.drawnAt` for its outlines). Corrida Maluca's track is drawn afresh each round (`Track.draw` in `minis/race.ts`), so its map places everything from the round's own track.
- `stages/Props.ts` (barrels, cube, meteors, ghosts, slot reels, capsule machine, pop-up words, podium), `stages/TileField.ts`.
- `pets/PetView.ts`: one pet. The model plays its clips; code-driven motion goes on wrapper groups above it.
- `render/`: `Renderer.ts` (post-processing), `CameraRig.ts` (how close the camera stays, how fast it moves, and the low shots of one thing it takes outside a round: `look` and `cut`), `materials.ts` (toon and outline), `assets.ts` (pet models and their double outline), `models.ts` (the maps' models made in Blender), `Text3D.ts`, `emoji.ts`. What the camera frames in a round is `focusPoints` in `stages/GameStage.ts`.
- `fx/Particles.ts`, `fx/Decals.ts`, `audio/AudioEngine.ts` (samples for impacts, recorded tracks for music, everything else synthesised). `app/Session.ts` chooses the track.
- `hud/GameScreen.tsx` and `game.css`: the main menu on the title screen, and the flat HUD for every phase. `Nameplates.ts` is written to the DOM each frame. Where each tag stands by its pet (over its head, or beside it when that would cover another pet) is chosen in `GameStage.placeNames`.
- `hud/Interludes.tsx`: what is on screen when no round is: loading at start-up, the list of a round's places as it ends, the roulette and game card between rounds, the curtain that hides one world changing into another (`Session.syncCurtain` shuts and opens it), the winner's banner.
- `studio/`: test bench at `/?studio` for pets, clips and the 3D font.

Phone (`apps/web/src/controller/`): `main.ts` (join), `net.ts` (connection), `pad.ts` (joystick, A and B, the power button with its card, the next game's card, and the screen for each state). What A is in each game is `GAME_A` in `shared/games.ts`, sent by the game screen.

Relay (`apps/relay/src/`): `relay.ts` passes messages, keeps the roster (`room.ts`) and saves playtest logs, adding what only it knows about each phone (iPhone or Android, how long it took to join, how often it dropped and how fast it came back); `network.ts` finds the Wi-Fi address.

Shared: `apps/web/src/shared/` (tokens, motion, strings, pets, power icons, `games.ts` with each game's picture and controls, SVG glyphs) and `packages/protocol/src/` (`index.ts` messages, `schemas.ts` validation for the relay; the relay drops any field of a phone's status that is not in the schema).

Statistics (`packages/stats/src/`): `log.ts` is what a match log holds and reads logs of every older build; `match.ts` writes one match out for a person to read; `report.ts` reads every match together and judges the balance. The game screen fills a log in `host/app/PlaytestLog.ts`.

Announcer: one recording per line in `apps/web/public/voice/`, made by `pnpm voice`. The drama (depth, doubling, grit, hall, echo, level) is the `ANNOUNCER` block at the top of `audio/AudioEngine.ts`.

Music: five tracks in `apps/web/public/music/` (`title`, `lobby`, `battle-a`, `battle-b`, `rio-rumble`). Which plays when is in `docs/DESIGN.md` under Sound. To change a track, replace its file and keep the name.

Documents: `docs/DESIGN.md` and `docs/GAMEPLAY.md` (the style, above), `docs/PLAN.md` (the original plan and what was built), `CHANGELOG.md` (what changed in each version, and why).

Other: `tools/` (scripts below; `tools/blender/` holds the modelling kit and one script per map), `assets-raw/` (unzipped Kenney packs, not committed; see its README), `playtests/` (one JSON per finished match, not committed).

## Commands

- `pnpm dev`: start the relay and the web server from source, for developing. Open http://localhost:5173 on this computer; phones join from the QR code. Pages reload when a file is saved.
- `pnpm play`: build the game and run the built copy on the same ports, for playing. Nothing reloads under the players. `pnpm start` runs the copy already built. Only one of `dev` and `start` can hold the ports at a time.
- The version in the root `package.json` is shown on the title screen and on the phone's join page, and stamped into each page's HTML. It is read when the server starts or the game is built. A page that finds the server serving a different version from the one it is running reloads itself once (`shared/version.ts`); the game screen does this only on the title screen or in the lobby, never over a match.
- `pnpm fake 4`: connect 4 simulated phones that ready up and play. Add `--seconds=30` to stop on its own.
- `pnpm test`, `pnpm typecheck`, `pnpm build` (the build also checks the phone bundle: 150 KB budget, no Three.js).
- `pnpm test:e2e`: the browser tests in `e2e/`, about 8 minutes. They start their own copy of the game on other ports and never touch a session on the usual ones. Phones run on WebKit with iPhone settings and on Chromium with Android settings. The first four are pinned to the brawl. They cover: a four-phone session with a gacha and a rematch; six phones joining with timing (and no two controls of the lobby pad overlapping on any of the six phone shapes), a seventh turned away, and a dropped phone getting its pet back in the lobby and mid-match; solo and duo with bots; a full five-round match of mixed games in real time; and two phones playing a round of every game, checking that each pad shows that game's buttons and nothing else. `pnpm test:e2e -g "four phones"` runs one of them.
- `pnpm report`: reads every match log in `playtests/`, prints the playtest report and saves it there as `REPORT.md`. `pnpm report --build=0.4.3` judges another build than the newest; `pnpm report some/folder` reads another folder. See "Playtest logs and the report" below.
- `pnpm balance 30`: play 30 bot-only matches without a screen and print, for each game, how long its rounds last and who wins them, and for the brawl its pacing numbers and how many knockouts each power makes per run. `pnpm balance 30 --mode=paint` plays one game only. Run it after changing `tuning.ts`, `round.ts` or `bots.ts`. The ranges to stay inside are in `docs/GAMEPLAY.md`.
- `pnpm models`: build the maps' 3D models in Blender (5.1 or later, with Blender Lab's "MCP" extension, whose socket bridge the build drives). `pnpm models potato` builds one. Each map's script is `tools/blender/maps/<map>.py`; the build writes `apps/web/public/models/maps/<map>.glb` (committed, so nobody else needs Blender) and two pictures of it in `test-results/models/`. `tools/blender/README.md` says how to work on one.
- `pnpm look <game>`: play a game with bots in a browser of its own, on a port of its own, and save pictures of the real screen in `test-results/look/`. `--six` stands six pets on the map, `--card` adds the card between rounds, `--frames=6` takes a burst, `pnpm look title|how|lobby|finale` shoots those screens, and `pnpm look brawl,lava --flow --video` films a match and tiles the moments between rounds frame by frame. `pnpm look lava --at=0.9,9.5 --video --for=3` films three seconds of a round from each of those moments, in real time, and tiles them ten frames a second: a still cannot show whether something that moves moves well. Use it for anything visual instead of a temporary test.
- `pnpm look --soak`: three matches of every game twice over, fast-forwarded, counting what is held after each change of world (shapes, textures, things in the scene, memory). Run it after adding anything that is built per round or per match: the numbers must hold steady from the second match to the third.
- `pnpm listen`: plays every event's sound through the game's own audio engine, with no window, and prints how loud each is, how hard it peaks and how long it lasts, with the outliers marked. `pnpm listen --voice` does the same for the announcer. Run it after adding or changing a sound: a new one belongs within a few decibels of its neighbours.
- `pnpm rehearse 5 --minutes=10`: a dress rehearsal with nobody in the room. Its own relay and web server on free ports, a real game screen drawn on the graphics card, and five simulated phones that join by the relay and play match after match in real time. It reports matches finished, errors, frames that hitched, and what `pnpm report` makes of the logs (written to `test-results/rehearsal/`, never to `playtests/`). The simulated phones wander and mash: it shows that the game holds together, not that it is fun.
- `pnpm font`: rebuild the 3D font after changing `words3d` or the power names. It fails if a character has no glyph.
- `pnpm assets`, `pnpm sounds`: copy models and skyboxes, and convert impact sounds, from `assets-raw` into `apps/web/public`.
- `pnpm voice`: record the announcer's lines (`strings.announcer`) into `apps/web/public/voice` with this Mac's Portuguese voice. Run it after changing a line. It needs macOS and ffmpeg; the recordings are committed, so nobody else has to run it.
- `pnpm inspect:pets`: list parts and clips of every pet model.

## Host keys

On the title screen, the main menu: left and right arrows choose between Jogar, Como jogar and Bichos, Enter confirms, Esc closes Como jogar and leaves the pets studio. The mouse works too.

Enter starts a match (or a rematch); Esc returns to the lobby from the results. In the lobby: R rounds (5 or 3), B bots. Anywhere: M less shake and glow, S sound, backtick debug overlay, 1 to 6 buzz that seat's phone.

## Network

- The web server listens on the Wi-Fi (port 5173) and proxies `/ws` and `/api` to the relay, which listens on `127.0.0.1:47821` only. Set `BOOM_RELAY_PORT` if that port is taken.
- Only a page opened at `localhost` may be the game screen. The first one keeps the room; a second waits its turn. For testing beside a real session, open `http://localhost:5173/?solo&autostart`: a solo run never touches the relay and saves no playtest log. Add `&modes=paint,brawl` to play those games, in that order, instead of drawing them.
- The roster (seat, name, token) lives in the relay, so reloading the game screen keeps the phones seated. Restarting the relay makes a new room code.
- While `pnpm dev` runs, saving a file acts on whoever is playing: most edits reload the game screen (a match in progress is lost), and an edit to the relay or to `packages/protocol` restarts the relay, which unseats every phone. Do not edit while people are playing. To try a change beside a running session, start a second copy on other ports: `BOOM_WEB_PORT=5193 BOOM_RELAY_PORT=47841 BOOM_PLAYTEST_DIR=test-results/dev-playtests pnpm dev`.

## Playtest logs and the report

Every match played through the relay leaves two files in `playtests/`, named by the time it ended: a `.json` with everything counted, and a `.md` with the same match written out for a person (result, how each player used the buttons, who knocked out whom, each round, cubes and powers, phones). `pnpm report` reads all the `.json` files and writes `REPORT.md` beside them. `playtests/dev-runs/` holds logs from development that must not count. None of this is committed: the logs carry players' nicknames.

What a log counts, per player: taps and charged dashes, their average charge, how many hit, presses of A while it rested, overcharges; grabs landed and missed, throws, throws that landed on a rival, times grabbed and times it got free; powers rolled, waiting, used, and how long they waited; knockouts and deaths by cause; points by where they came from; rounds won, seconds alive, idle share, first dash, latency. Per match: each round's game, length, first knockout, whether the clock ended it, the game's own number for each player (tiles painted, food eaten), and a tally of the game's own events by player (bombs passed on, times caught by the cat, falls in the race, bites, buckets kicked); every knockout with who did it; rolls by tier and rank; each power rolled and run, and the knockouts it made; each SUPER gacha; the build's version.

The report has, in order: the builds side by side; the balance of one build (what each move pays in knockouts per 100 uses, how pets were knocked out, the buttons, rounds, a row for each game, cubes and luck with what each power and each SUPER made, scores). How the buttons were used and how rounds went are counted from brawl rounds only: in another game A is a different move; each player over every build; the warning signs; the definition of done. A warning is a number crossing a limit in `LIMITS` at the top of `packages/stats/src/report.ts`. Rules change between builds, so balance is always read one build at a time.

How to work with it:

- **Before changing a rule or a number**, run `pnpm report` and read the warnings and the balance of the current build. Say in your summary which warning or which number the change is aimed at.
- **After a change that players will feel**, raise the version before the next session, so its matches form a new row in "Build by build". That row is how the change is judged.
- **When you add a move, a power, a rule or an event**, count it: add the field in `log.ts` (and raise `LOG_FORMAT`), fill it in `PlaytestLog.ts`, show it in `match.ts` and `report.ts`, give it a limit if it can go out of balance, and extend `PlaytestLog.test.ts` (the log must still add up over a whole bot match) and `stats.test.ts`. Older logs must keep reading: `readLog` fills what they lack.
- **Bots and people disagree.** `pnpm balance` says how bots play a rule; the report says how people do. In the second playtest bots split their knockouts evenly between dashes and throws while people made 68% of theirs by throwing. When the two disagree, people are right.
- **Keep test matches out.** A `?solo` run saves nothing, the browser tests write to `test-results/`, and a second copy of the game takes `BOOM_PLAYTEST_DIR`. If a bot-only log lands in `playtests/` anyway, move it to `dev-runs/`.

## Adding a game

1. Read "What a new game has to be" in `docs/GAMEPLAY.md` and the rule about pale floors in `docs/DESIGN.md`.
2. Simulation: its numbers as a block in `tuning.ts`; its rules in `minis/<game>.ts`; a line in `minis/index.ts` and in `PLAYABLE_MODES` (`game.ts`); how a bot plays it in `minis/bots.ts`; its events in `types.ts`; an award in `scoring.ts` if it has something to stand out for; tests in `minis/minis.test.ts`, including bots playing it to the end. Tally its events in `PlaytestLog.ts`, and give `report.ts` a limit for whatever in it can go wrong.
3. Screen: its map in `stages/maps/`, chosen in `GameStage.makeMap`; its scenery modelled in `tools/blender/maps/<game>.py` (`pnpm models <game>`, then its id in `MODEL_IDS`); its palette in `tokens.ts`; its sounds in `AudioEngine.handle`; anything it shows on the HUD. Give it spectators (`maps/crowd.ts`) and scenery that answers the round's events: `docs/DESIGN.md` says what makes a world alive. Look at it with `pnpm look <game>`, with `--six` too.
4. Words: its name and line in `strings.games`, its controls in `shared/games.ts` (`GAME_CONTROLS`, `GAME_A`), its announcer line (then `pnpm voice`), any 3D word (then `pnpm font`). "Como jogar" lists it by itself.
5. Phone: only data. If it needs a word on the pad mid-round, send an `alert` from `Session.padAlert`.
6. Add it to `GAMES` in `e2e/smoke.spec.ts`, to the tables in both style documents, and to the changelog. Run `pnpm balance 30 --mode=<game>`.

## Version control and changelog

- `main` always holds a build that passes the checks. Work on a short branch named for the change (for example `playtest-1-fixes`). When it is finished and verified, merge it with `git switch main && git merge --ff-only <branch>`.
- One commit per finished change, made when the change is done and the checks pass, not before. The subject says what changed, in plain English, in the imperative, in under 72 characters. The body says why. Never commit a state that fails `pnpm typecheck` or `pnpm test`.
- Every change a player or a developer would notice adds a line to `CHANGELOG.md` under `Unreleased`, in the same commit: what changed and why, in words a player would use.
- A version is a build handed over to be played, so that feedback can name the build it is about. Before a session with people: move `Unreleased` under a new heading with the version and date, set `"version"` in the root `package.json`, and tag the commit on `main` (`git tag -a v0.3.0 -m "..."`). Before 1.0, the middle number goes up when rules, controls or the look change, and the last number when it is only fixes.
- There is no remote. Do not push, and do not rewrite or delete commits, branches or tags that already exist, unless asked.
- Not committed: `playtests/`, the unzipped packs in `assets-raw/`, `dist/`, `test-results/`. The models built in Blender (`apps/web/public/models/maps/*.glb`) are committed, like the announcer's recordings.

## Verification

Go through the checklist at the end of `docs/DESIGN.md`, `docs/GAMEPLAY.md` or both, whichever the change touches.


Run `pnpm typecheck` and `pnpm test` before finishing a change, and `pnpm test:e2e` after touching the phone page, the protocol or the lobby. For anything visual, look: `pnpm look` saves pictures of the real screen (and films the moments between rounds with `--flow --video`), and `BOOM_SHOTS=1 pnpm test:e2e` saves pictures of the phone's screens into `test-results/shots/`. Passing tests do not establish that it looks right. `pnpm look <games> --perf` says what a map costs to draw. In development the page exposes `window.__BOOM__` (`game`, `session`, and `skip(seconds)` to fast-forward).
