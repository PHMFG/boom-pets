# Boom Pets — project plan (fully 3D, React + Vite + Three.js)

## Context

The source doc (`~/Downloads/Boom Pets MVP Implementation Plan.md`) fixes the MVP scope: one mode (Bumper Brawl), 1 to 6 phones as controllers over the LAN, Mystery Cubes, the SUPER gacha, bots, a 5-round match and playtest logging. It leaves the look, the UI, the motion and four gameplay questions open. This plan keeps the doc's scope and rules and adds one visual and UI system, the gameplay decisions, an animation spec, and a technical design checked against current library versions.

**Starting state.** `Animals/` is empty. None of the five Kenney packs are on this Mac, so pet file names, animation clips and sprite formats are unknown until the first build step. The folder sits inside a parent git repo with no commits, so the project gets its own `git init`.

**Your decisions.** 3D world with a flat HUD on top; all on-screen text in PT-BR (code and comments in English); plain Three.js engine with React only for the HUD; I download the Kenney packs.

**Size.** About 44 focused days (50 with contingency) against the doc's 29. The difference is the live 3D screens, the 3D spectacle, and effects, sound and phone feedback for every power. A cut list is in the build order.

## How it works

- **The computer is the game screen.** It runs the whole game (3D, physics, rules, sound) in a browser window, shown on the monitor or TV. Nobody plays on it.
- **Each phone is a joystick.** It shows only the controls and sends stick and button presses. Nothing is installed.
- **Joining.** The computer runs a small local server. The game screen shows a QR code; a player points their phone camera at it, the controller page opens from that local server, and their pet appears on screen.
- **Same Wi-Fi is required.** The phone and the computer must be on the same Wi-Fi network. Nothing goes over the internet, so the game works with no internet access as long as the Wi-Fi itself is up.

What the game does about the Wi-Fi requirement:

- The lobby says it next to the QR code: "Conecte no mesmo Wi-Fi deste computador", with the network name when macOS will give it (unverified; otherwise a field to type it once).
- The QR code always points at the computer's current Wi-Fi address and updates if the network changes.
- A phone that opens the page but cannot reach the game sees "Não consegui conectar. Você está no mesmo Wi-Fi?" with a retry button, instead of a blank page.
- If the phones are on the right network and still cannot connect, the router is blocking devices from talking to each other (common on guest networks). The lobby shows this as a hint after 20 seconds with no phone joined.

## Changes from the source doc

| Doc says | Plan does | Why |
| --- | --- | --- |
| Three apps: server, host, controller | One Vite project with two pages (`/` host, `/c/` controller) plus a small relay process | One LAN port and no custom static server. A build test keeps Three.js out of the phone bundle |
| Howler with sound sprites, WebM + MP3 | A small Web Audio engine, plain `.m4a` files | Howler has no mixing buses, which ducking and the slow-motion filter need. The host browser is Safari, and sprites gain nothing on a LAN |
| Kenney Mobile Controls sprites on the phone | Controls drawn as inline SVG in the game's style; the pack is reference only | Images trigger the long-press menu on phones. SVG can animate (charge gauge), and host tutorial prompts reuse the same SVG |
| `gltf-transform optimize` | No optimising; a small script that lists each model's clips and parts | Merging can break multi-part animation, and the models are tiny |
| Server only relays | Relay also keeps the roster (seat, name, pet, token) and runs ping and seat timers | A host reload keeps the phones; browser timers stall when the tab is hidden |
| Input at a fixed 30 Hz | Input on change, up to 60 Hz, plus a 100 ms heartbeat | Lower latency, and a stall never replays old stick positions |
| Room code in the path (`/c/ROOM`) | Room code in the query (`/c/?r=ABCD`) | A multi-page Vite build cannot serve arbitrary sub-paths |
| Pet is a box; physics resolves hits | Pet is a capsule; dash and knockback are scripted velocities | Boxes snag on tile seams, and solver knockback cannot be tuned |
| 80 ms global hit-stop; slow motion on every elimination | Hit-stop per pet (pose hold); slow motion at most once per 2.5 s | With six players, global freezes turn into constant stutter |
| `lever` message has no payload | `lever` carries swipe progress 0 to 1 | The 3D lever follows the winner's thumb live |
| English text | PT-BR text from one string file | Your decision |
| Lobby shows seats filling | Lobby is playable: pets move and dash as soon as they join | Teaches the controls and answers "which one am I?" with no tutorial text |

## Design pillars

1. **Readable first, then loud.** Seat identity, floor telegraphs and pickups must be clear from 3 metres before any effect is added.
2. **Nothing appears, moves or leaves without animation.** Every element pops in, squishes out or flies somewhere. No hard cuts and no linear fades.
3. **Every event answers on five channels:** the pet's body, particles, the camera, the HUD and phone, and sound.
4. **Eyes on the TV.** The phone is used by feel. It mirrors state with colour and vibration, never with text to read.
5. **One style everywhere.** Host HUD, phone and 3D world share the same colours, shapes, font and motion timings.

## Visual and UI system: "Caixa de Brinquedos" (toy box)

Chunky toy look: toon-shaded cube pets with thick outlines on a cream platform floating in a bright sky. The flat UI looks like stickers and plastic buttons.

**Colour**

| Role | Colour | Rule |
| --- | --- | --- |
| Ink (all outlines, text) | `#1B1035` | Never pure black |
| Cream (panels, platform tiles) | `#FFF4DC`, checker `#EBDDBF` | Neutral floor so every seat colour stands out |
| Seat 1 to 6 | red `#F2364A` ●, blue `#2F8CFF` ▲, yellow `#FFC928` ■, green `#2BD576` ★, purple `#A463FF` ◆, pink `#FF7AD9` ✚ | Each seat pairs a colour with a shape. Both appear on the pet's ground ring, its nameplate, its scoreboard card and the phone |
| Danger | orange-red `#FF5A1F` with hazard stripes | Only for floor telegraphs and explosions |
| Tiers | Comum `#DCE6F5`, Raro `#29C4FF`, Zicado `#8B2BFF` with acid green `#B6FF3B`, SUPER gold `#FFC400` to rainbow | Each tier also has its own icon, pattern and sound, so hue is never the only cue |

Seat colours are drawn unlit and outside tone mapping so the pet's ring matches the phone background exactly. The six colours get a colour-blind simulation check in S3.

**Type.** Lilita One for every headline, number and 3D word; Nunito 800 for nicknames and small labels. Both are open-licence and self-hosted, because a party may have no internet. Smallest host text is 28 px at 1080p.

**Shape.** 5 px ink outline, 20 px corner radius, hard drop shadow (`0 8px 0` ink, no blur), panels tilted 1 to 2 degrees. No glass, no blur, no gradients except the SUPER rainbow.

**UI motion tokens** (one file, used by host and phone)

| Token | Value | Used for |
| --- | --- | --- |
| Pop in | 280 ms, overshoot to 1.15 | Anything entering |
| Squish out | 160 ms, swell to 1.08 then 0 | Anything leaving |
| Move | 420 ms, fast start, soft stop | Cards, crown, flying points |
| Stagger | 40 ms per item | Lists and rows |
| Punch | 90 ms, scale 1.2 | Number change, button press |
| Breathe | 2.4 s loop, ±2% scale | Anything idle |

**Host HUD layout**

- Top centre: five round pips (round 5 marked "×2") and the round timer as a ring.
- Bottom strip: six seat cards with shape and colour, pet portrait, nickname, score, six pity pips, power icon with a radial timer, and the bounty crown.
- Over each pet: nickname and seat shape, positioned every frame without React re-renders.
- Lobby: a large cream QR card, with the room code also built from 3D letter blocks in the scene.
- The HUD slides away during spectacle (gacha, final blow) and pops back after.
- Backtick toggles the debug overlay (frame time, per-phone latency, seed).

**Phone controller**

- One landscape layout. If the phone is held upright, the page rotates itself 90 degrees.
- Background is the seat colour with a faint pattern of the seat shape.
- Left half: floating joystick. Right half: large A low right, smaller B above left. Top strip: power icon, pity pips, crown. Emote button in the top corner.
- A is always "act" and B is always "hands", in every state:

| State | A | B | Screen |
| --- | --- | --- | --- |
| Alive | Hold to charge, release to dash | Grab, then throw | Seat colour; A fills as a gauge with a face that panics |
| Carried | Mash to escape | Mash to escape | Shakes; "mash" pulse |
| Ghost | Drop meteor (cooldown ring) | — | Desaturated, ghostly |
| Gacha winner | — | — | One giant lever to swipe down |
| Gacha others | Whole screen is the ZICA button | same | Purple, pulsing |

- Every vibration also has a visual cue (border pulse), because iPhones cannot vibrate from a web page.

**PT-BR names** (all in `strings.pt-BR.ts`, easy to change)

| English in the doc | On screen |
| --- | --- |
| Bumper Brawl | Bate-Bate |
| Mystery Cube | Cubo Misterioso |
| Common, Rare, Cursed, SUPER CURSE | Comum, Raro, Zicado, SUPER ZICA |
| SUPER PULL, KABOOM, JINX | SUPER SORTE!, KABUM!, ZICA! |
| Underdog luck, Bounty, Revenge swap | Sorte de Azarão, Procurado, Troca da Vingança |
| Rocket Boots, Mega Dash, Jelly Body | Botas Foguete, Mega Investida, Corpo de Gelatina |
| Giant Mode, Decoy Clones | Modo Gigante, Clones Isca |
| Reversed Controls, Pebble, Honk Mode | Controles Invertidos, Pedrinha, Modo Buzina |
| Kaiju Mode, Meteor Shower, Piñata | Modo Kaiju, Chuva de Meteoros, Pinhata |
| Awards | Rei da Autodestruição, Sobreviveu Sem Querer, Arremessador de Amigos, Pé-Frio, Terror dos Meteoros, Maior Reação em Cadeia, Caidor Profissional, Buzina Sem Fim |

## Gameplay design

All numbers in the doc stay as starting values in `tuning.ts`. These are the decisions on top.

**The doc's open questions**

| Question | Decision |
| --- | --- |
| Camera | Tilted 3/4 view (about 52° down, narrow 32° lens for a diorama look), auto-framing every living pet. A debug key switches to top-down for comparison at the gate |
| Wind-up for grabbing a pet | Yes: 0.25 s with a visible reach and a ground ring. Barrels and cubes grab instantly. A released pet cannot be grabbed again for 1 s |
| Match length | 5 rounds by default, with a "Partida rápida" (3 rounds) toggle in the lobby. Both are logged |
| Cube Pets clips | Unknown until S0. The animation system does not depend on them (see below) |

**Rules added for feel and fairness**

- **Telegraph rule.** Nothing knocks or eliminates without a floor warning of at least 0.15 s: barrels swell, tiles shake for 1 s, meteors show a shadow for 1 s, overcharge warns 0.4 s ahead.
- **Knockback you can feel.** After a hit or during a dash, the stick has almost no control for 0.4 to 0.8 s, then control returns. Without this, movement smoothing cancels a knockback in a tenth of a second.
- **Kill credit is recorded, not guessed.** Every source of knockback (dash, barrel owner, thrower, meteor, power) stamps the victim with who did it. A fall within 3 seconds credits that stamp.
- **A Wi-Fi stall never detonates you.** Charging pauses when a phone's input goes stale.
- **Carrying.** The carrier moves at 80% speed. A carried pet is dropped if the carrier is hit or eliminated.
- **Slow motion never blocks play.** Charge, powers and cooldowns run on game time, so nobody overcharges while a gacha plays.
- **Match start.** When everyone is ready, the pets hop into a cannon in the lobby and are fired to the arena. Later rounds rebuild the platform in a ripple and drop the pets in.
- **First-round demo.** Before the pets land, a demo pet charges and knocks a dummy off the edge while a pulsing A button shows on the host and on every phone.

## Animation spec

**How a pet moves.** Each pet is a stack of nested pivots: physics position, facing, lean, squash, jitter, then the model. The model's own clips play at the bottom; code-driven motion is applied to the pivots above, so the two never conflict and the pets look alive even if the pack ships only an idle clip.

Code-driven layers: squash and stretch that keeps volume (on a spring, so it overshoots); lean into acceleration; charge swell with a vibration that speeds up; dash stretch; hit spin; edge teeter; carried flail; fall flail; idle fidgets every 3 to 6 s; sleepy slump when the phone disconnects.

**Event by channel**

| Moment | Pet | Particles and world | Camera and screen | HUD and phone | Sound |
| --- | --- | --- | --- | --- | --- |
| Move, stop | Lean up to 15°, hop cycle, skid squash | Dust puffs on start, turn, stop | — | — | Soft steps |
| Charge | Swells to 1.25×, shakes faster and faster | Steam puffs, orbiting sparks, ground ring fills | Slight push-in above 80% | A gauge fills, face panics | Rising whine |
| Overcharge warning | Throbs, outline turns danger colour | Hazard ring at full blast radius | — | Border pulses, vibration | Faster beeps |
| Dash | Stretches 1.6× along the path | Dust ring, speed streaks, three afterimages | — | Vibration tick | Whoosh pitched by charge |
| Hit | Squash on impact axis, 1 to 3 spins, both pets hold pose 80 ms | Star burst, ring sized by charge, shock emote | Shake scaled by force | Victim's phone pulses | Impact, pitch 0.9 to 1.15× |
| Grab, carry, throw | Reach, lift, wind back, fling; carried pet flails | Grab ring, throw trail | — | "Mash" pulse on carried phone | Grunt, whoosh |
| Edge teeter | Windmill wobble | Sweat emote | — | — | Squeak |
| Fall | Flails and shrinks | Puff through the cloud layer | — | — | Falling whistle |
| Elimination | Shatters into about 20 cubes in its colours; a ghost pops out and floats up | Cubes bounce, confetti in the scorer's colour, a 3D "+3" flies to their card | Slow motion 0.3× for 0.6 s, zoom punch | Scorer's card bounces; victim's phone turns ghost | Pop, crowd "ooh" |
| Barrel | Bobs; swells and blinks 0.15 s before the blast | Flash, toon smoke, sparks, debris, scorch mark, shockwave | Shake, colour-fringe pulse, glow spike | — | Boom, pitch rises along a chain |
| Tiles | Ripple in at round start; shake and blink 1 s; tumble away | Crumbs | — | — | Rumble, crack |
| Cubo Misterioso | Parachutes in, bobs, spins, "?" pulses | Light beam, sparkles | — | — | Chime |
| Slot roll | Three 3D reels pop over the pet and stop left to right at 0.5, 0.75 and 1.0 s; the icon dives into the pet | Aura burst in the tier colour | — | Power icon with timer; pity pip fills | Reel ticks, tier sting |
| Meteor | Ghost bobs with a wisp trail | Shadow with three closing rings, fire trail, crater | Shake | Cooldown ring | Whistle, thud |
| Troca da Vingança | Ghost dives into a new body; the victim's ghost is thrown out | Beam between the two | 0.3× for 0.3 s | Both phones flip state | Sting |
| Round end | Winner jumps and spins; others slump | Confetti cannons, 3D points fly to cards | Orbit the winner | Scores count up; crown hops to the leader | Fanfare |
| Disconnected | Slumps, slow breathing | "zzz" bubble with a timer ring | — | Card dims | Snore |

**SUPER gacha, 3.2 s at 0.1× game speed**

| Time | Scene | Camera and screen | Phones |
| --- | --- | --- | --- |
| 0.0 s | The slot reels explode; "SUPER SORTE!" slams in letter by letter | World loses colour except the winner; HUD slides out; music ducks | Winner vibrates |
| 0.3 s | A capsule machine falls from the sky and squashes on landing | Fast push-in on winner and machine | Winner gets the lever; others get ZICA |
| 0.8 to 1.6 s | The 3D lever follows the winner's swipe. Each ZICA tap throws a small curse sticker from that pet into the machine, and a curse meter fills | Slow orbit | Lever and ZICA mashing |
| 1.6 to 2.4 s | Fake-out: grey capsule, sad trombone, shake, cracks to gold, then rainbow | Shake, glow rises | Winner vibrates in rhythm |
| 2.4 s | Capsule bursts; the power name slams in; other pets show shocked emotes | Flash of colour back into the world, shockwave | All phones show the power icon |
| 3.2 s | Speed returns and the power starts | Camera pulls back; HUD pops in | Back to play |

The lever window, ZICA count and curse roll run inside the simulation on fixed ticks, so the sequence can be tested without a screen.

**Screens and transitions.** There are two 3D places. The diorama holds the title, lobby, pet select and podium as different camera poses over one set. The arena is the second place. The camera flies between them (the cannon shot out, a swoop back); a full-screen seat-colour wipe is the fallback for any flight that is not ready.

**Safety and comfort.** No full-screen flashes, and no element blinks faster than 3 times a second. A lobby toggle, "Menos tremor e brilho", cuts camera shake by 70% and replaces flashes with a vignette.

## Technical design

**Workspace** (pnpm, TypeScript strict, no build step for packages)

```
Animals/
  apps/web/              one Vite project
    index.html           host page
    c/index.html         controller page
    src/host/            engine, render, stages, pets, fx, audio, hud, studio, net
    src/controller/      vanilla TS and DOM: join, pet select, pad, gacha, results
    src/shared/          tokens.ts, glyphs.ts (SVG), strings.pt-BR.ts, motion.ts
    public/              models, fonts, sounds, emotes, skyboxes
  apps/relay/            Node + ws: rooms, roster, ping, playtest log endpoint
  packages/protocol/     message types and constants; Zod schemas in a separate entry
  packages/game/         the simulation; may not import Three.js or DOM types
  assets-raw/            unzipped Kenney packs (not shipped)
  tools/                 inspect-glb.ts, font.ts, portraits.ts, fake-phones.ts
  AGENTS.md              conventions and a map of where things live
```

**Three clocks.** This is the core of the design.

- Frame time (real): camera, shake, HUD, GSAP, audio.
- Control ticks (fixed 60 per second): input sampling, match state, gacha steps.
- World time: each control tick adds the current speed factor to a counter, and physics steps when it reaches 1. The physics step is always 1/60 s, so slow motion means fewer steps, and the simulation stays a pure function of seed and inputs.

The renderer interpolates between the last two physics states. Events are stamped with their world step and released when the picture reaches that step, so effects stay in sync at 0.1×. GSAP runs on one root driven by the engine's frame time.

**Simulation contract.** `packages/game` exposes a read-only view for continuous values (positions, charge level, power timers) and a typed event list for one-shot moments (hit, eliminated, barrelExplode, rollResult, and so on). Each event carries its position, seats and strength, because the entity may be gone when it is shown. The host never changes simulation state. Random numbers use named seeded streams (`rolls`, `spawns`, `bots`); effects use their own.

**Physics** (Rapier)

- Pets: capsule, rotation locked, no friction, continuous collision detection on.
- Dash hits: a shape query each tick with a generous hitbox, not contact events.
- Carrying: the carried body becomes kinematic with collisions off and follows the carrier; throwing makes it dynamic again with the thrower excluded for a quarter second.
- Tiles: 256 individual fixed colliders mirrored from a boolean grid. Edge distance, teeter and bot avoidance come from the grid.
- A fresh physics world per round, freed at round end.

**Rendering**

- `three` pinned to `~0.186.1`, because `postprocessing` 6.39 only accepts three below 0.187.
- Toon material with a 3-step ramp. Outlines are an inverted hull in the seat colour, using smoothed normals baked once per model so cube edges do not split. Fallback if the pets' structure defeats that: a silhouette mask pass.
- One near-vertical shadow map, which doubles as the height cue for thrown pets and meteors.
- Post-processing in three passes: shockwave; glow, saturation, vignette, tone mapping; colour fringe. All effects stay mounted and animate to zero, so nothing compiles mid-match.
- All particles are pooled instanced meshes: debris cubes, sparks, smoke puffs, confetti, rings, afterimages.
- Pixel ratio capped at 1.5. Target 60 fps with 6 pets, 6 barrels exploding and a SUPER active.

**3D words.** A build script converts Lilita One to typeface JSON, limited to the characters in `strings.pt-BR.ts`, and fails on any missing glyph. Three's `TTFLoader` is not used because it loads a library from a CDN. Each letter is its own mesh so words slam in letter by letter.

**Audio.** Web Audio engine with music, effects and announcer buses, ducking, random pitch per impact and a low-pass filter on music during slow motion. Audio starts on the first key or click, with a visible "clique para ativar o som" badge until it does.

**Network**

- Everything is local: one server on the computer, reachable only from the same Wi-Fi. Vite serves both pages and proxies `/ws` to the relay on `127.0.0.1`. The game screen is opened at `http://localhost:5173`; phones open `http://<wifi-address>:5173/c/?r=ABCD` from the QR code.
- The QR address uses the Wi-Fi interface that carries the default route, re-checked every 2 seconds, with a manual override. This Mac has a second virtual interface that a naive pick would choose, which would give phones an address they cannot reach.
- Phone: skips input frames while the socket is backed up; always sends button edges; treats `pointercancel`, lost capture and page hide as a release.
- Relay: 4 KB message cap, 60 messages a second per phone, protocol version check that tells a stale phone page to reload.
- Host tab hidden: the simulation pauses and phones are told.
- Controller bundle: vanilla TS, no Zod, no Three.js, budget 150 KB enforced by a build test.

## Build order

Each slice ends in something runnable. S1 and the gate need you and real phones.

| Slice | Contents | Done when | Days |
| --- | --- | --- | --- |
| S0 Foundations | `git init`, workspace, download and unzip the five packs, model inspector, `pets.json`, font JSON, studio page as an asset viewer, `AGENTS.md` | The studio lists all 24 pets and plays every clip they ship with | 2 |
| S1 Network spine | Relay, protocol, QR lobby with the same-Wi-Fi notice and connection hints, controller pad, fake phones, latency overlay, reconnect | 2 real phones on the same Wi-Fi scan the QR and move capsules alongside 4 fake ones; a phone on another network sees the "mesmo Wi-Fi?" message; a locked phone rejoins; a host reload keeps the roster | 4 |
| S2 Grey-box brawl | Movement, charge, dash, overcharge, aim assist, grab and throw, tiles, barrels, kill credit, clocks | A plain-shapes brawl plays; headless tests pass, including same seed twice gives the same result | 6 |
| S3 Look and motion | Toon, outline and post pipeline, pet animation layers, particle pools, camera, slow motion, audio engine with about 15 sounds, studio fires every event | Every row of the event table for core verbs can be triggered in the studio and in play | 6 |
| Gate | Two-person session, tune `tuning.ts` | Two people laugh with no powers. If not, stay here | 2 |
| S4 Full match | Diorama and flights, pet select, 5 rounds, scoring, bounty, ghosts and meteors, revenge swap, bots, bot takeover, awards, podium, logging | Solo, duo and 4-player matches run start to finish with no manual steps | 9 |
| S5 Cubes and gacha | Odds, pity, 3D slot reels, 6 powers first, SUPER sequence with lever and ZICA, 3D words, then the other 5 powers | 1,000 simulated rolls match the odds within 2%; a SUPER plays end to end on real phones | 10 |
| S6 Polish and playtest | Music, announcer lines in PT-BR, tutorial prompts, iPhone and Android checks, playtest with 4 or more people | Every item in the doc's definition of done is met | 5 |

**Cut first if time runs short** (in order): Clones Isca, Modo Buzina and Corpo de Gelatina; bespoke camera flights (use the wipe); shockwave and colour fringe; capsule machine detail; the third bot personality; awards beyond four; the night sky; the first-round demo. Never cut: core-verb animation, reconnect, bots, logging.

## Risks, cheapest test first

| # | Assumption | Test | When |
| --- | --- | --- | --- |
| 1 | Phones reach the Mac and input feels instant | A tiny echo page with a joystick and one button on 2 iPhones and 1 Android, on the hotspot and on home Wi-Fi; read the latency histogram, lock and unlock | Start of S1, about 3 hours |
| 2 | Cube Pets models are usable as they ship | Inspect every GLB for clips, parts, skeletons and texture files | S0, 30 minutes |
| 3 | Pushing pets off is fun without powers | The gate session | After S3 |
| 4 | Slow motion stays in sync with effects | One bouncing body with a hit effect at 1×, 0.3×, 0.1× and paused | S2, half a day |
| 5 | The "everything extra" scope fits | Build Modo Gigante completely, time it, multiply by 11, then apply the cut list if needed | Start of S5 |

Unverified until tested: whether an iPhone hotspot lets phones reach the Mac (the Mac is on one now), a silent looping video to keep phone screens awake, and accent triangulation (Ã, Õ, Ç) in the 3D font.

## Verification

- **Unit (Vitest):** odds and pity, rank modifiers, scoring, kill credit, awards, protocol schemas, each power's apply and remove.
- **Headless match:** 5 rounds with 6 bots on a fixed seed in Node; run twice and compare a state hash; assert valid scores.
- **Smoke (Playwright):** start relay and Vite, open the host and 6 fake controllers, play 60 seconds, assert no disconnects and no console errors.
- **Leak check:** the host exposes frame time, draw calls, and geometry, texture and program counts; a test asserts they stay flat over 20 rounds.
- **Bundle check:** the build fails if the controller page exceeds 150 KB or imports Three.js.
- **Visual:** I open the studio and a bot match (`?autostart`) in the browser preview and check each event-table row by eye, at 1280×720 and 1920×1080, with "Menos tremor e brilho" on and off.
- **Real devices (you):** QR join on iPhone Safari and Android Chrome; joystick and A held together; lock and unlock mid-round; the observer sheet and playtest log from the doc.

## First steps after approval

1. `git init` in `Animals`, scaffold the workspace, write `AGENTS.md`.
2. Download the five Kenney packs from kenney.nl into `assets-raw/`, naming each file and its size as I go.
3. Run the model inspector and report what the pets actually contain before any game code depends on it.
4. Continue through S0 and S1, then ask you to run the phone test.

## As built (2026-10-09)

Everything in the build order through S5 is implemented, plus the S6 items that do not need people (music, announcer voice, hints, title screen, logging). What differs from the plan above:

| Plan | Built | Why |
| --- | --- | --- |
| Two 3D places with a cannon flight between them | One place: the platform is the lobby, the arena and the podium, with camera moves between phases | First item on the cut list; the lobby being playable does the same job |
| GSAP timelines | No GSAP. The gacha machine and every timed sequence are functions of the simulation's clock | They can never drift out of step with the game, and it is one dependency fewer |
| Tiles as physics colliders | The floor is the tile grid itself; Rapier only resolves bodies bumping into each other | The plan's stated fallback: avoids snagging on tile seams |
| Emotes Pack icons | System emoji drawn to textures, for emotes, power icons and awards | The pack's icons are 32 pixels; emoji are sharp and need no assets |
| `lever` and `jinx` messages | The lever is the winner's stick pulled down; ZICA is everyone else's A | No new message types, and bots can do both |
| Pet portraits rendered by a tool for the phone | The phone shows the pet's name and the pet changes on the TV; the TV renders portraits itself for its HUD | Keeps eyes on the TV and needs no generated files |
| First-round dash demo | Two hint cards on the first ever match, and the playable lobby | On the cut list |
| Shockwave post effect | Shock rings drawn on the floor | On the cut list; glow and colour fringe were kept |
| Events held back in slow motion until the picture catches up | Events show at once | At the speeds used, the gap is under a twentieth of a second |
| Recorded announcer lines | The computer's Portuguese voice | Recording needs you; the calls are in `AudioEngine.say` |
| Playwright smoke test with 6 fake controllers | `pnpm test:e2e`: the game screen and four phones in real browser engines (WebKit as an iPhone, Chromium as Androids), through a whole session | Real engines test the touch pad, rotation, lever and ZICA, which fake sockets cannot |
| Automated leak test | Checked by hand over four matches (render programs stayed flat) | Not written yet |

### Definition of done, as checked

Updated after the first session with people, on 9 October 2026: two five-round matches on an iPhone and an Android phone over home Wi-Fi, the first with four players seated. The figures come from that session's logs, as `pnpm report` prints them.

| # | Item | Checked by | Still needs |
| --- | --- | --- | --- |
| 1 | Six phones join from the QR code in under 30 seconds each, no install | Real phones scanned the QR code and joined with nothing installed: 12.7 s on the iPhone and 14.6 s on the Android phone from opening the page to being seated, typing the name included. Four phones joined the first match. Browser test: six emulated phones join, each timed | Six real phones at once |
| 2 | A full 5-round match runs from lobby to results without a crash or desync | Two five-round matches played to their results on real phones. Browser test in real time, and the headless match that replays identically from a seed | — |
| 3 | Input feels instant on home Wi-Fi (under 80 ms) | Read on the real phones during play: median round trips of 7 to 14 ms, worst 95th percentile 95 ms | — |
| 4 | Solo and duo matches are playable with bots | Browser tests for one and for two players. With people, a two-player match was played with bots switched off | A person playing one match alone with bots, if evidence from people is wanted |
| 5 | A phone that drops can rejoin the same pet within 10 seconds | Both real phones dropped and came back during play: 0.1 s and 0.5 s, as the phones measured it. The log cannot say whether they were locked or reloaded. Browser test: reload in the lobby, and closed and reopened mid-match | — |
| 6 | One playtest with 4 or more people run and logged | Run and logged with four players seated, three of whom played; one phone never sent a touch. The log of that match names only two phones, because the relay then forgot phones that left before the end. That is fixed | A session where four or more all play |

The gate (two people play with no powers and laugh) was the second match: two players, five rounds, and the report from the table was that the game was liked. What that session found wrong, and what changed, is under "After the first playtest" below.

**S6 is reached, by the owner's decision on 10 October 2026.** Two things in the table were never done as written: six real phones at once, and a session where four or more all play. The owner waived both on the strength of the first session, which proved on real phones what those items were there to prove: joining from the QR code, latency, coming back after a drop, and whole matches. They stay listed here as not done, and `pnpm report` will still mark them from the logs when such a session happens.

### The session that closes S6

Nothing has to be written down during it. The relay adds to every playtest log what kind of phone sat in each seat, how long it took from opening the page to being seated, and each time it dropped and how fast it was back; the game screen adds each phone's latency. `pnpm report` then prints the definition of done with every item marked `met` or `not yet`, counting only matches played on phones.

1. `pnpm dev`, and open http://localhost:5173 on the computer.
2. Two people join from the QR code, on an iPhone and an Android phone if both are at hand, and play a 5-round match with bots on. This is the gate session, the duo match, the full match and the latency reading.
3. During it, one of them locks the phone for a few seconds and unlocks it. This is the rejoin reading.
4. One person plays a match alone with bots. This is the solo match.
5. Four or more people play a match; six closes the join item.
6. `pnpm report`.

The browser tests run this same path with emulated phones and check that the report marks the join, rejoin and playtest items met from their logs, so the measuring is known to work. What the report cannot tell is whether anyone laughed.

### iOS Simulator check (iPhone 17, Mobile Safari)

Played by hand through the Simulator against a game screen on the same computer: join form, pet arrows, stick, stick with A held by a second finger (the pet charged for 1.3 s and dashed on release), ready, a match with three bots, the ghost screen, results, "Jogar de novo", the emote tray, the ZICA screen, and a page reload that returned to its seat. It found two faults, both fixed:

- With Safari's bars showing, the upright pad is short enough that the ready button sat under B. The lobby panel now slides left of B when centre would collide, and the browser test fails if any two lobby controls overlap on any of its six phone shapes.
- A tap on an emote still popping in missed it and pressed A. The open tray now swallows those taps.

Not seen there: the lever (the Simulator's pet never rolled a SUPER) and the carried screen. The Simulator shares the computer's network, so it says nothing about Wi-Fi latency, and it cannot vibrate.

### After the first playtest (2026-10-09)

Two matches were played on an iPhone and an Android phone, one of them with four people. The measures and the definition of done as that session left it are printed by `pnpm report`. The three problems it found (mashing A, grabs that did not pay, powers nobody understood) and what changed are in `CHANGELOG.md` under 0.2.0, and the reasoning is in `docs/GAMEPLAY.md`. From here on those two files and `docs/DESIGN.md` describe the game; this plan stays as the record of how it began.

Rules in this plan that no longer hold: a power no longer starts by itself (good ones wait on the power button), grabbing a pet is a 0.2 s lunge rather than a 0.25 s reach, the carrier moves at 85% speed, and the phone has a third button.

### Polish after S6 was reached (10 October 2026)

- **A main menu.** The title screen was a single "press any key". It is now a menu of three buttons over the brawl: Jogar, Como jogar (one panel with each control drawn as the phone draws it and one line beside it) and Bichos (the pets studio, with Esc to come back). Arrow keys and Enter, or the mouse.
- **The HUD came off the platform.** Hints and the card that explains a power moved to the top-left corner over the sky; the leader's crown moved to the corner of their card.
- **Smoothness, measured.** A bot match at 1600 by 900 on this computer's graphics card, over 600 frames: median frame 8.3 ms (120 a second), 95th percentile 9.2 ms, worst 14.6 ms, none over 33 ms.
- **Every new screen was photographed** on phone-sized Safari and Chrome engines and on the game screen, which is how the overlapping power card, the over-long hints and the squeezed name were found.

### Polish pass after S6

- **Main menu.** Bots brawl on the platform behind the title while the camera circles them; the logo's letters drop in, wave, and fly apart when a key is pressed. Two bots stay in the lobby until the first player joins.
- **Nothing vanishes.** Every HUD panel squishes out through `Presence` instead of disappearing.
- **Event feed and round banner.** Who knocked out whom and how, top right; who took the round, in the middle.
- **More feedback.** The seat ring swells with the charge and turns to the danger colour at the warning; pets sweat at an edge, wave when they join and cheer when ready; lit barrels spit sparks; thrown things trail smoke; fireworks over the podium; drums in the music; the phone's A button grows a face that panics as the charge builds.
- **Smoothness.** A pet glides out of a hit-stop instead of snapping. Measured at 120 Hz in a bot match: median frame 8.3 ms, worst 9.4 ms over 480 frames.
- **Two game screens no longer fight.** The first keeps the room; a second waits. `?solo` runs without the relay for testing beside a real session.
