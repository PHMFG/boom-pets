# Boom Pets

A party brawler for 1 to 6 players on one screen. The computer shows the game; every phone is a joystick. Nothing is installed on the phones: they scan a QR code and play in the browser, over the same Wi-Fi.

One mode, Bate-Bate: knock the other pets off a platform that keeps shrinking. Charge and dash, grab and throw barrels (and each other), grab Mystery Cubes for powers, and come back as a meteor-dropping ghost when you fall.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 on this computer, press any key, and scan the QR code with each phone. Phones and computer must be on the same Wi-Fi.

With nobody on a phone, press Enter to watch or test a match of bots.

## Controls

Phone

| Control | In a match | As a ghost |
| --- | --- | --- |
| Stick (left thumb, anywhere) | Move | Move the meteor target |
| A | Hold to charge, release to dash. Hold too long and you explode | Drop a meteor |
| B | Grab a barrel or a pet, press again to throw | |

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
- `pnpm report` summarises the playtest logs the game saves after each match, and marks each item of the definition of done as met or not yet from matches played on real phones.
- `pnpm fake 4` connects four simulated phones that play by themselves.
- `pnpm balance 20` plays twenty bot matches without a screen and prints pacing numbers.
- http://localhost:5173/?studio shows every pet and animation clip. `?solo&autostart` runs a bot match without touching connected phones.

`AGENTS.md` maps the code and lists the conventions. `docs/PLAN.md` is the design, with a last section on what was built differently.

## Credits

Pet models, impact sounds and skyboxes by [Kenney](https://kenney.nl) (CC0). Fonts: Lilita One and Nunito (SIL Open Font License).
