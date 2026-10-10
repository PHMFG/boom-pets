# Boom Pets

A party brawler for 1 to 6 players on one screen. The computer shows the game; every phone is a joystick. Nothing is installed on the phones: they scan a QR code and play in the browser, over the same Wi-Fi.

One mode, Bate-Bate: knock the other pets off a platform that keeps shrinking. Charge and dash, grab and throw barrels (and each other), grab Mystery Cubes for powers, and come back as a meteor-dropping ghost when you fall.

## Run it

```bash
pnpm install
pnpm play
```

`pnpm play` builds the game and runs the built copy. Open http://localhost:5173 on this computer, choose Jogar, and scan the QR code with each phone. Phones and computer must be on the same Wi-Fi.

The title screen and the phone's join page both show the version (for example `versão 0.4.2`). A page that is older than what the server serves reloads itself once; if a browser still shows an older number than `package.json` after that, force a reload with Cmd+Shift+R.

To work on the game, use `pnpm dev` instead: it serves the source and reloads the pages whenever a file is saved, which is what you want while developing and not while playing.

With nobody on a phone, press Enter to watch or test a match of bots.

## Controls

Phone

| Control | In a match | As a ghost |
| --- | --- | --- |
| Stick (left thumb, anywhere) | Move | Move the meteor target |
| A | Hold to charge, release to dash. Hold too long and you explode. A tap is only a shove, and A rests a moment after every dash | Drop a meteor |
| B | Lunge at a barrel or a pet in reach and pick it up; press again to throw. The button shows a hand when something is in reach | |
| Power button | Appears when you get a power from a Mystery Cube, with a card saying what it does. Tap to use it. Curses do not wait | |

In the lobby the arrows change your pet and the button says you are ready. When everyone is ready the match starts by itself.

Computer

| Key | Does |
| --- | --- |
| Enter | Start a match, or a rematch |
| Esc | Back to the lobby from the results |
| R, B | Lobby: 5 or 3 rounds; bots on or off |
| M, S | Less shake and glow; sound on or off |
| ` | Debug overlay: frame rate and each phone's latency |
| 1 to 6 | Buzz that seat's phone |

## Develop

- `pnpm test`, `pnpm typecheck`, `pnpm build`
- `pnpm test:e2e` plays a whole session in real browsers: the game screen and four phones.
- Every match leaves a log and a readable summary in `playtests/`. `pnpm report` reads them all and writes the playtest report: how the latest build plays, what each move pays, and what looks out of balance.
- `pnpm fake 4` connects four simulated phones that play by themselves.
- `pnpm balance 20` plays twenty bot matches without a screen and prints pacing numbers.
- http://localhost:5173/?studio shows every pet and animation clip. `?solo&autostart` runs a bot match without touching connected phones.

`AGENTS.md` maps the code and lists the conventions. `docs/DESIGN.md` is how the game looks, moves and sounds, and `docs/GAMEPLAY.md` is how it plays and why; a change is held to the checklist at the end of each. `CHANGELOG.md` says what changed in each version. `docs/PLAN.md` is the original plan.

## Credits

Music: the five tracks in `apps/web/public/music`, added by the project's owner.

Pet models, impact sounds and skyboxes by [Kenney](https://kenney.nl) (CC0). Fonts: Lilita One and Nunito (SIL Open Font License).
