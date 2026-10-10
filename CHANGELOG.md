# Changelog

What changed in Boom Pets, newest first, and why. A version is a build handed over to be played, so feedback can name the build it is about. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); what counts as a bigger or smaller version is in `AGENTS.md`.

## [Unreleased]

Nothing yet.

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
