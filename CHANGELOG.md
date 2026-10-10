# Changelog

What changed in Boom Pets, newest first, and why. A version is a build that was played. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); what counts as a bigger or smaller version is in `AGENTS.md`.

## [Unreleased]

Nothing yet.

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
