# Changelog

What changed in Boom Pets, newest first, and why. A version is a build handed over to be played, so feedback can name the build it is about. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); what counts as a bigger or smaller version is in `AGENTS.md`.

## [Unreleased]

### Changed

- **One points table for every game.** Where a player finishes pays 6, 4, 3, 2 and 1 (it was 5, 3, 1), and in the brawl a knockout, a ghost's swap back in and knocking out the leader add 1 each (they were 3, 2 and 2, with 1 more for a throw). Rounds are about to become different games, and no game should weigh more than another.

## [0.5.0] - 2026-10-10

Two complaints from the players of the second playtest: it was too easy to lose your own pet, and getting a SUPER did not pay.

### Changed

- **You can find your pet.** The platform is now a clean white instead of cream, which was the colour family most pets are made of, and the clouds under it are tinted toward the sky so the platform's edge shows. Every pet's outline has an ink line around its seat colour, the ring under it is wider with an ink edge, and the name tag over it is filled with the player's colour and points down at the pet. Pets are drawn 16% bigger.
- **The camera stays close and moves with the fight.** It frames the pets instead of the platform, looks a moment ahead of a pet that is flying, pulls back at once when someone is about to leave the picture and closes in gently. In a four-bot match pets are about a third taller on screen than before (95 to 124 pixels at 1080p), and more when the fight is in one place. The fit is exact, so the farthest pet's name tag stays below the round counter and the nearest pet's ring above the players' cards. It also frames the pets during the countdown, so each player sees where theirs lands.
- **A SUPER is the event of its round.** One that is not cursed lands with a strike on its owner's spot: the floor warns for 0.8 s, then everyone else within 4 m is thrown back. Until now a SUPER started with nothing.
- **Kaiju** is as fast as a pet on foot (it was slower, and caught nobody: both Kaijus rolled in real matches knocked out no one), its steps reach farther and push harder, its charged dash is half as big again, and it lasts 9 s instead of 7.
- **Meteor Shower** aims two of every three meteors at a rival, each rival in turn, a little ahead of where it is running. Every meteor leaves a hole in the floor. It lasts 8 s instead of 6. Standing right beside the pet that called it is the safe place.
- **The ring under a pet keeps its player's colour, always.** It used to turn grey while A rested and orange before an overcharge, which hid whose pet it was. What A is doing is now shown by an arc around the ring: white, filling while A is held, orange and throbbing at the overcharge warning, and grey, draining while A rests. No arc means A is ready.
- A long line on the card that explains a power now wraps instead of covering the round counter.

### Added

- The match log, the readable summary and `pnpm report` now count the knockouts each power makes, and the report warns when a SUPER makes fewer than 0.4 or more than 2 per run. `pnpm balance` prints the same for bots: about 0.6 per Kaiju and 0.3 per Meteor Shower, where both were close to nothing.
- Bots walk a Kaiju at the nearest rival, as a person would.

## [0.4.3] - 2026-10-10

### Fixed

- **A dash that hit was treated as a miss afterwards.** The dash was ended twice, the second time as a miss, so after every hit A rested for 0.9 s instead of 0.5 s. Dashing has been worth less than designed since 0.2.0, which is part of why throws took over in the second playtest. Found by the tests for the new match logs.
- Starting the game no longer prints a warning about the web server's configuration.

### Added

- **Every match is logged in full.** Beside what was already counted, a log now has each dash's charge and whether it hit, grabs that led to throws and throws that landed on a rival, how often a grabbed pet got free, how long powers waited to be used, where every point came from, time alive, each round's length and how it ended, every SUPER gacha, and the build that played it.
- **A readable file for every match.** Beside each log in `playtests/` the game now writes the match out for a person: result, buttons, who knocked out whom, rounds, cubes, phones. `pnpm report` writes the same for older matches.
- **A report built around balance.** `pnpm report` sets the builds side by side, and for the newest says what each move pays in knockouts per use, how pets were knocked out, how the buttons were used, how rounds and scores went and what the cubes gave, with a warning wherever a number crosses its limit. It is saved as `playtests/REPORT.md`.

### Recorded

- The second playtest (10 October 2026, six phones, build 0.4.2): `docs/PLAN.md` now shows the definition of done met on its own items, and `docs/GAMEPLAY.md` records what the logs showed about how people played, which is that throwing had become the one thing that works.

## [0.4.2] - 2026-10-10

### Fixed

- **A browser showing an old copy of the game now fixes itself.** Each page checks which version the server is serving, and if it is not the one the page is running, it reloads, once. If the browser still shows the old copy after that, the game screen says so and how to force a reload. The game screen only does this on the title screen or in the lobby, never over a match.
- A solo run (`?solo`) no longer saves a playtest log. It is the mode for testing beside a real session, and four bot-only matches from tests had ended up among the real playtests; they are now in `playtests/dev-runs/`.

## [0.4.1] - 2026-10-10

### Added

- **`pnpm play` builds the game and runs the built copy**, and `pnpm start` runs the copy already built. A built copy does not reload or change while people play, which `pnpm dev` does every time a file is saved.
- **The version is on screen**: on the title screen beside the credits, and on the phone's join page. A browser showing an older number than `package.json` is showing a stale page.

### Measured

- Frame pacing at 1920 by 1080 with every screen-filling power on at once, on a 2x screen, and with the processor slowed four and six times: the median stays at 8.3 ms in every case. The figures are in `docs/PLAN.md`.
- The announcer at his final level: 7 to 10 dB hotter than the hardest impact, with a tail that rings about two seconds.

## [0.4.0] - 2026-10-10

### Added

- **A soundtrack.** Five recorded tracks replace the synthesised tune: one for the main menu, one for the lobby and the results, two battle themes that take turns from one match to the next, and Rio Rumble for the last round, the one that counts double. Tracks fade into each other, the lobby theme picks up where it left off, and the music still ducks under big moments and goes muffled in slow motion. The synthesised tune stays as a stand-in if a file is missing.
- **A dramatic announcer.** His lines used to be read flat by the browser's own voice, which cannot take effects. They are now recorded and played through a chain of them: deeper than recorded, doubled, saturated, compressed, thrown into a three-second hall with an echo bouncing after it, about 10 dB louder than an impact, with a low boom under the big lines and the music ducking out of the way. He also says more: "Boom Pets!" when the game starts, the countdown "Três! Dois! Um! Já!", "Rodada final! Vale dobrado!", "Fim de jogo!" and the full "Troca da vingança!". `pnpm voice` re-records the lines.

## [0.3.0] - 2026-10-10

### Added

- **A main menu.** The title screen used to say only "press any key". It now has three buttons over the brawl: Jogar, Como jogar and Bichos. The arrow keys choose and Enter confirms, or use the mouse. The chosen button lifts and turns gold, and one of the bots brawling behind looks up when the choice moves.
- **Como jogar**: one panel that shows each control the way the phone draws it, with one line beside it: the stick, A (hold, release, and what a tap does), B, the power button, and what happens when you fall.
- **Bichos** opens the pets studio, and Esc there comes back to the game.

### Fixed

- Holding Enter on the title screen could go straight through the lobby and start a match. A held key no longer repeats.

### Measured

- Frame pacing in a bot match at 1600 by 900 on the graphics card, over 600 frames: median 8.3 ms, 95th percentile 9.2 ms, worst 14.6 ms, none over 33 ms.

## [0.2.2] - 2026-10-10

A polish pass over the game screen, made by photographing the title, lobby, a match, a round end and the results.

### Changed

- The first-match hints and the card that explains a power moved from under the timer to the top-left corner, over the sky. In the middle they hid the pets at the far edge of the platform.
- The leader's crown sits on the corner of their card instead of in front of their name, which it used to squeeze down to a letter.

### Fixed

- Several timings were still written in the stylesheets (the title's letters, the prompts, the results rows, the score). They are motion tokens now, and `docs/DESIGN.md` gives the command that proves none are left.

### Decided

- S6 of the plan is reached, by the owner's decision: joining by QR code, latency, coming back after a drop and whole matches were proven on real phones in the first session, and the two items never done as written (six phones at once, a session where four or more all play) are waived. `docs/PLAN.md` records it.

## [0.2.1] - 2026-10-10

Found by photographing every new screen on phone-sized browsers after 0.2.0, before anyone played it.

### Fixed

- On the phone, the card that explains a power sat on top of the name strip when the name or the explanation was long. The card now has its own row under the strip, and the strip no longer repeats the power's name. The browser test checks the layout with the longest name and explanation there are.
- On the TV, the first-match hints were long enough to cover pets at the top of the platform. They are shorter.
- The card for a curse showed its picture purple on purple. The picture now sits on the lime of the curse colours, and the card says "pegou uma zica", which fits any name.

### Changed

- `docs/PLAN.md` records what the first playtest measured against the definition of done, and what is still open.

## [0.2.0] - 2026-10-10

The fixes from the first playtest with real phones. Why each rule changed is in `docs/GAMEPLAY.md`.

### Changed

- **A no longer rewards mashing.** A tap is only a shove: it nudges one pet, without lifting it, stopping its charge or making it drop what it carries. Every dash is followed by a rest before A works again, 0.5 s after a hit and 0.9 s after a miss. The ring under the pet shrinks grey while it rests, and the phone's A button shows the rest as a ring.
- **Grabbing is easier to land.** B makes the pet lunge at the target instead of slowing down, reach is longer (1.7 m, was 1.2 m) and favours what the pet is heading toward. The phone's B turns gold with a hand when something is in reach, and a hand in the grabber's colour appears over the target on the TV. A grab at thin air is shown as a swipe and rests B for 0.4 s.
- **Grabbing pays.** A grabbed pet's taps count only after half a second and it needs 8 of them (was 6 from the first instant), though its wriggling slows the carrier. A thrown pet cannot steer in the air and splats where it lands. A knockout by throwing scores 4 instead of 3. Catching and throwing a rival get their own moment on screen: a held pose, a word, a shake.
- **A pet in mid-dash cannot be grabbed**, so a dash let go in time beats a grab, and a grab beats a charge.
- **Good powers wait for their own button.** A common or rare power from a Mystery Cube is held until the player taps the new power button on the phone, which appears only while a power is waiting. Curses still start at once, and a SUPER still starts from the lever. Mega Investida is now a full dash fired from the power button.
- **Every power is explained when it is gained.** The TV shows whose it is, its picture, its name and one line on what it does. The phone shows the same on a card, and keeps it up while the power runs. Name tags and player cards show who is holding a power.
- Bots grab rivals, carry them toward an edge and throw them, use the power button, and wait out the rest after a dash.
- The first-match hints are three, covering the dash, the grab and the power button, and are shown once more to everyone.

### Fixed

- A grabbed player's joystick was dropped, so once free they had to lift the thumb and press again. The joystick now stays under the thumb, dimmed while the pet is carried, and steers again the moment it is free. The same holds when a pet is knocked out.
- The knockout that ended a round was missing from the playtest log and from the feed on the TV.
- A phone that left before the end of a match was missing from that match's log, so a four-player match could be counted as two.

### Added

- `docs/DESIGN.md` and `docs/GAMEPLAY.md`: the style of the game, each ending in a checklist that a change is held to.
- This changelog, and version numbers.
- The playtest log records how each player used the buttons, and `pnpm report` shows taps against charged dashes, grabs landed and missed, throws and powers used, with warnings when taps dominate or grabs mostly miss.
- Timings that were written in the stylesheets are now motion tokens.

## [0.1.0] - 2026-10-09

The first playable build, and the one played in the first session with real phones.

### Added

- The game screen on a computer and phones as joysticks, joined by QR code over the same Wi-Fi through a local relay. A phone that drops gets its seat back.
- One mode, Bate-Bate: charge and dash, grab and throw, explosive barrels, a platform that shrinks, ghosts that drop meteors, and the revenge swap.
- Mystery Cubes with common, rare and cursed powers, and the SUPER gacha with its lever and ZICA.
- Matches of five or three rounds with scoring, a bounty on the leader, a double final round and awards.
- Bots that fill the match to four players.
- A title screen with bots brawling behind it, a lobby with a pet picker, the HUD, music, sound and an announcer voice.
- Playtest logging with `pnpm report`, which also marks each item of the plan's definition of done from matches played on real phones.
- Unit tests, browser tests on iPhone and Android engines, and a bot-only balance run.
