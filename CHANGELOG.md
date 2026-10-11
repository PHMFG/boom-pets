# Changelog

What changed in Boom Pets, newest first, and why. A version is a build handed over to be played, so feedback can name the build it is about. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); what counts as a bigger or smaller version is in `AGENTS.md`.

## [Unreleased]

### Added

- **Worlds modelled in Blender.** Every map's scenery used to be built in code from boxes, cones and cylinders. It is now modelled in Blender by a script per map (`pnpm models`), as chunky toys with rounded edges, painted by the game from its own colours, and much of it moves:
  - **Batata Quente:** the pan has a rolled rim and a riveted handle and sits on a cast-iron grate over teardrop flames, on a stove with knobs, a pot, a wooden spoon and a salt shaker.
  - **Come e Cresce:** a picnic on a table of planks, giant beside the pets: a wicker basket, half a watermelon, a cake with a slice out, juice, a teapot that steams, a jelly that wobbles, a bee round the jam and ants marching. The food itself is modelled, and each kind is held up to the camera the way that shows its shape.
  - **Pinta o Chão:** the paper is taped to a cutting mat on an artist's desk, among a ruler, a lamp, crayons, a palette and brushes in a glass. Each player's tin of paint jumps and spills when they kick a bucket over. A drinking bird dips into the glass.
  - **O Chão é Lava:** a crater with a tiered volcano running with lava, basalt columns with lava falls, obsidian crystals and a dinosaur's skeleton half sunk. Bubbles and spouts get busier with the alarm, and the stones to stand on are sculpted, flat-topped and the same size as before.
  - **Corrida Maluca:** the track stands on striped stilts in puffs of cloud, with drifting cloud layers, hot-air balloons, a blimp and an island with a windmill. The start and finish arches now stand past the ends of the track instead of over it, and the flags stand beside it and point the way.
  - **Cor Certa:** a stage floating in space with footlights that take the called colour, speakers that thump on hover pods, a DJ desk with spinning records, a mirror ball, a ringed planet and a toy rocket. A patch that drops now leaves only space under it: before, the base showed through in the called colour and hid the patches still standing.
  - **Batatinha Frita:** a playground in a park: trees, bushes in flower, a swing set, a slide, a merry-go-round, a seesaw, and the cat in a sandbox with a sandcastle.
- **The places of a round.** As a round ends a list comes up on the right: who came first, second and so on, and what the round paid each of them, with the winner's row in gold. Before, only a "+6" flying to a card said so.
- **A curtain between worlds.** One map used to snap into the next. A curtain of ink now closes to a point as the roulette stops and opens on the new world, which grows out from the middle: floor first, then everything round it. The same curtain covers the change to the podium, a rematch and the way back to the lobby.
- **A first look at each world.** While a game's card is up the camera shows its world from low and far, drifting round it, and rises to where the game is played from during the countdown.

### Changed

- **The roulette stops on the game that is played.** The reel used to stop on the same picture every time and a different game's card would then appear. It is wider now, shows the pictures passing under two gold pointers, slows, and stops on the game to come a moment before its card. Phones still learn the game only when the reel stops.
- **The round's winner gets the camera.** As a round ends the camera comes down to the winner's eye level, close, and stays with it; it used to circle a spot the winner had already walked away from. The winner dances, the others shake their heads, and every pet's bubble says how it feels. The podium is seen from the front, like an audience, instead of from above.
- The line over a game's card says which round of the match it is ("Rodada 2 de 5") once the game is known.
- The reel's last tick is a bright note, the curtain closes with a rush of air, and each row of a round's places arrives with a rising tick.

### Fixed

- On the phone, the word under the A button that says what it does in the game being played ("Pula", "Empurra", "Morde") was cut off by the button's own circle.

## [0.6.0] - 2026-10-10

Boom Pets becomes a party of games. Every round is a different game, drawn by a roulette, each in a world of its own, and most of them need only the joystick: the brawl asked a lot of thumbs that had never held this pad before.

### Added

- **Every round is a different game.** A roulette draws the game for each round from a bag, so every game comes up once before any comes round again. The brawl (Bate-Bate) is one of them. There is no brawl-only match any more.
- **A screen between games.** Before every round a roulette of game pictures spins, stops, and the game that came up is shown on a card: its picture, its name, the one line that says what to do, and what each control does. The announcer names it. On the last round the card wears a "VALE DOBRADO!" tag.
- **Pinta o Chão**, the first of the simple games: the tile under your pet turns your colour, others paint over it, buckets of paint drop and splash a whole patch for whoever kicks them over, and after 40 seconds the most tiles wins. The count is hidden for the last 8. Joystick only; nobody is knocked out. It is played on a sheet of paper taped to a desk, among giant pencils.
- **O Chão é Lava.** Rocks rise out of the floor, one fewer than there are pets, and a rock holds one. An alarm sounds while the lava climbs, then it covers everything else: whoever is not on a rock is out. The rocks sink, fewer rise somewhere else, and each calm is shorter. A is a shove, for when two pets want the same rock. The phone buzzes and says "Suba numa pedra!" at the alarm.
- **Come e Cresce.** Food rains on a picnic blanket: apples, doughnuts, slices of watermelon. Eating makes a pet bigger and a little slower, and the biggest after 40 seconds wins. A is a lunging bite: on a pet two sizes smaller it shakes a quarter of its food out as crumbs. A purple pepper shrinks whoever eats it, and every few seconds a feast lands beside the smallest pet. Nobody is knocked out.
- **Corrida Maluca**, the parkour race. A track three tiles wide winds in an S over the clouds: gaps to jump, tiles that shake and blink away, beams one tile wide, bars that sweep across. A is a jump. A fall puts you back at the last flag you passed. First over the line wins, and eight seconds later the round is called, with everyone else ranked by how far they got. The camera keeps the track ahead of every pet in view.
- **Cor Certa.** A dance floor of sixteen patches in four colours, each marked with a fruit. A colour is called (the announcer says it, a card on the TV and every phone show it with its fruit), and after a count every other patch drops away. Then a new floor is dealt with fewer safe patches and a shorter count. Joystick only; last pet standing.
- **Batata Quente.** In a frying pan on a stove, one pet carries a lit bomb on its head and bumping into anyone hands it over, but not straight back. It swells, reddens and ticks faster, and when the fuse runs out its holder is out and everyone close is thrown back. Each fuse is shorter than the last. Whoever holds it is a little faster, feels a buzz, and reads "PASSE A BATATA!" on the phone; the TV names them on a card. Joystick only; nobody falls off.
- **Batatinha Frita 1, 2, 3.** A lane across a playground with a giant cat behind it. While it sings, tiptoe toward the line: the strips beside the lane are green and the phone says "CORRA!". It counts one, two, three, turns round, everything goes red and the phone says "PARADO!": anyone still pushing the joystick half a second later goes back to the start. The song is never the same length twice. Joystick only; nobody is knocked out.
- **A winner's moment.** After the last round the colour drains, the drums roll under "E o campeão é…", third place and then second step onto a podium whose steps stay plain until then, and then the winner drops in under a spotlight with a crown, bigger than the rest, to confetti from both sides, fireworks, the game's theme and "Temos um campeão!". The winner's name fills a banner in their colour and their phone buzzes. Everyone who missed the podium watches from the sides. Only then does the table appear.
- **A loading screen.** While the pets load at start-up there is a bar that fills, the six player shapes hopping in turn and a tip that changes, instead of the word "Carregando…".
- **The phone is the game being played.** It shows only the buttons that game uses, with a word under A for what it does there. Between games the next game's card sits over the pad, and as a simple game starts its one line stays on the pad for a few seconds. The winner's phone turns gold.
- Each player's card on the TV shows the game's own number where it has one (tiles painted), and "?" while it is kept secret.
- **Awards for the new games.** Barriga Sem Fundo for whoever ate the most, Picasso do Chão for the most tiles painted, Pé na Tábua for crossing finish lines and Ímã de Batata for whoever the bomb kept finding, so a match with no brawl in it still hands everyone a title.
- The match log says which game each round was and each player's number in it. `pnpm report` has a row for each game (how long it lasts, how it ends, how many different winners) and warns when one drags, is over too soon, or is always won by the same person. `pnpm balance` prints the same for bots, and `--mode=` plays one game only. `?modes=paint,brawl` in the address bar plays those games in that order. Each round also carries a tally of its game's own events (bombs passed on, times caught by the cat, falls in the race, bites, buckets kicked), and the report warns when the cat catches a person on more than half of its looks or almost never, and when a bomb hardly changes hands.

### Changed

- **One points table for every game.** Where a player finishes pays 6, 4, 3, 2 and 1 (it was 5, 3, 1), and in the brawl a knockout, a ghost's swap back in and knocking out the leader add 1 each (they were 3, 2 and 2, with 1 more for a throw). Rounds are about to become different games, and no game should weigh more than another.
- **"Como jogar" lists the games.** It shows all eight with their picture, their one line and the buttons each uses, instead of explaining the brawl's buttons one by one; each game's card explains it again right before it is played. The tag under the logo reads "Festa de Minijogos".
- A press made while waiting for GO is forgotten. Before, every button pressed during the countdown fired the moment the round began.
- Phones that still have an older copy of the pad reload themselves once: the pad and the game screen now talk about which game is being played.
- A round in which standing still is the game (the cat is looking) no longer counts as idle time in the match log.

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
