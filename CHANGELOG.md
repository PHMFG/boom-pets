# Changelog

What changed in Boom Pets, newest first, and why. A version is a build handed over to be played, so feedback can name the build it is about. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); what counts as a bigger or smaller version is in `AGENTS.md`.

## [Unreleased]

Nothing yet.

## [1.3.1] - 2026-10-13

Two things from the list of rough edges that went out with 1.3.0. Nothing here was reported by a player.

### Changed

- **In O Chão é Lava the furniture that is about to go under says so.** From above you cannot tell which layer of the pile is the low one. While the alarm sounds, every piece of the layer the lava is about to take is outlined in red, beating with the alarm, and trembles: get off this one.
- **FIM! no longer lies across the winner.** The word that ends a round is smaller and sits between the winner's banner and the winner's own name tag.

## [1.3.0] - 2026-10-12

Asked how the session with five people on 1.2.0 went, the owner said: fun, on the right track. Asked what to change, they chose one rule (O Chão é Lava should be a climb) and better animation everywhere: more impact, livelier pets, smoother transitions.

### Changed

- **O Chão é Lava is a climb.** The lava no longer comes and goes: it rises and never stops. Furniture still falls from the sky, but now it piles up: each layer lands on the one before, a step higher, and the lava takes the layers from the bottom. Stand under a gold outline and the piece carries you up as it lands, or step up onto it after; a pet climbs one step and no more. Whoever is still on the layer below the newest when the alarm ends is out, and so is anyone who falls into the lava at any time, which makes a shove off the edge of a sofa the whole game. The first three layers have room for everyone; after that there is a place too few. On the furniture everyone walks a little slower, because a table is small. Every piece has a flat, pale top now, and a leg to stand on. A round with four bots lasts about 36 seconds; with two, 22.

### Added

- **Pets react to the round.** A pet turns its head toward what matters: a rival at its elbow, whoever holds the bomb, a cube or a sofa coming down, the cat while it looks. It jumps when something goes off beside it, at the lava's alarm and when the floor drops next to it. Thrown, swept, bitten or blown off its feet, it gets up swaying with stars circling its head. It hops twice when it scores, crosses the line or kicks a bucket over, and hangs its head, red in the face, when the cat sends it back.
- **Hits have more weight.** A hit that lands throws the picture the way the blow went, and its stars with it. The hardest ones (a full charge, a pet thrown onto another) hold the pose a moment longer. A hard landing stamps a ring into the floor. A pet going over the edge kicks dust off it, and its pieces fountain back up over the edge, leaving a ring in its colour so the room sees where it went. Being swept by a bar or bitten is now a blow like any other: a flash, a spin, a held pose.

- **What happens between rounds is told with more care.** The roulette slows like a wheel, drifts past its pointers and drops back with a clunk; the picture it stopped on is carried onto the game's card instead of popping in twice. As a round ends, the list of places builds a row at a time, each row's points fly to that player's card and the score counts up when they land (before, the scores had already jumped). The count before a round is pinned to the middle of the screen in gold, where it can be seen in every game (in the race, 2, 1 and JÁ! used to be off the screen), and the pets bounce on their toes with it. FIM! stays under the winner's banner instead of sliding off the side. On the podium each place lands with weight, and the winner's landing throws the others into the air. The camera starts its moves gently and no longer jumps when a panel arrives. On the last round, VALE DOBRADO! is stamped onto the card.
- **The phone's screen moves like the game does.** Nothing on the pad is cut away any more: the card between games, the word in the middle of a round, the power button, the results, all squish out, and what changes pops. When the roulette stops, the card lands again with the game's name, a button that game does not use shrinks away and A gets its new face. A power lands on its button with confetti in its colour; being knocked out jolts the whole pad in red; winning turns its border gold. The background drifts slowly, so the pad never sits dead still. No button moved or changed size.

### Fixed

- The game's card and the list of a round's places sat still and then vanished; they squish out now, like everything else. Free seats in the lobby open and close, so the players' cards slide together when a match starts.
- On the phone, A sometimes drew its "resting" ring when it was not resting, after a pet was let go of or came back.
- When a shove or a bite reached two pets at once, it always hit the one who had joined the game first. It hits the nearest now. (Found while measuring the new lava game: seat 1 was being pushed off more than anyone.)

## [1.2.2] - 2026-10-11

From the match logs of the owner's own sessions, read late: two people had played 1.0.0 without bots, and five people had played 1.2.0.

### Changed

- **Batata Quente with two or three players lasts longer.** A round has one bomb fewer than it has players, so with two it was a single fuse: over in about ten seconds, which is how it went all three times two people played it. With fewer than four players every fuse is now 5 seconds longer for each player short of four. Two players get one fuse of 19.5 seconds, time for the bomb to change hands several times; three get a round of about 32 seconds, like four. Four to six are as before.

### Fixed

- The notes for 1.2.0 said a race has eleven to thirteen obstacles. It has eleven to seventeen: the race five people ran had sixteen.

### For whoever is balancing

- `pnpm balance 20 --players=2` (2 to 6) plays with that many players instead of four. Every number so far had been tuned with four bots, and people play in twos and in fives: a game where pets are out is a different length for each. With bots, by number of players from two to six: O Chão é Lava 27, 35, 45, 44, 49 s; Batata Quente 21, 32, 32, 42, 51 s; Cor Certa 40 to 45 s; the race about 49 s whatever the number.

## [1.2.1] - 2026-10-11

What a review of pictures of every screen found in 1.2.0, by someone who had not built it. Nothing here was reported by a player.

### Changed

- **Name tags get out of the way.** When pets stand one behind another, a tag over one pet's head used to lie right across the pet behind it: in a lane of Batatinha Frita you could see four tags and hardly a pet. A tag now moves to the side of its own pet when it would cover somebody, and goes back when there is room. In a tight crowd it shrinks to its colour and shape.
- **Cor Certa shows the whole floor.** On the bigger floor some patches were under the clock, under the players' cards or off the screen, and you cannot run to a colour you cannot see. The camera now keeps every patch in the picture.
- **In O Chão é Lava you can see who is up.** Furniture was so low that a pouf vanished under the pet standing on it. Every piece is taller now, on a base, so its side shows under whoever is on it, and pets hop up onto it. The lava comes up deeper round it. The table's pale runner, which looked like a gap in the table, is teal.
- **Corrida Maluca starts on a grid.** Six pets used to start in a block where you could not find your own. They start two abreast in three rows, with room to see each one, and who starts where is drawn again each race.

### Fixed

- A flag at some corners of a drawn track stood with its cloth across the track.
- "VALE DOBRADO!" covered the end of the line that says which round it is, on the narrower game cards.
- The winner's box showed "venceu!" for a moment before the name. The name now arrives with the box and the verb after it.
- The hint in the lobby's network field was cut off at its last letter.

### For whoever is checking

- `pnpm look <game> --at=… --video --for=3` films seconds of a round in real time, drawn on the graphics card, and tiles them ten frames a second: a still does not show whether something moves well. `pnpm look <game> --six` now shows the six pets' name tags.

## [1.2.0] - 2026-10-11

From the owner, after playing (the copy open on their computer was still 1.0.0): make the maps bigger, the race could be bigger too, and O Chão é Lava is very short and could have furniture falling from the sky to climb on before the lava comes.

### Changed

- **O Chão é Lava is a new game: furniture falls from the sky.** Instead of rocks rising out of the floor, each wave drops furniture onto it, one piece after another, each marked in gold where it will land: a pouf and an armchair hold one pet, a low table two, a sofa three, a bed four. Get up on a piece before the lava covers the floor; a piece that lands on you lifts you. There is never one piece for everybody, so the room always splits. The first two waves have room for everyone, then there is one place too few and the shove matters, and from the fifth wave two too few. When the lava goes, the furniture tips and sinks, and new pieces fall somewhere else. The floor is 20 by 16 (it was 14 by 12) and a round with four bots lasts about 40 seconds, twice what it did in the build the owner called short. Each piece whistles down and lands with a thud, heavier for a sofa than for a pouf.
- **Corrida Maluca draws a new track every round, and it is twice as long.** No two races are run on the same track any more: each round the game draws one from thousands, 150 to 174 metres of it (it was 76), winding from one side of the floor to the far back corner. Some have long straights, some are all corners. (Asked for by the owner: "each round the map changes layout and challenges".) The obstacles change too: eleven to seventeen of them, in a different order and in different places each time, and a beam may now be any of the track's three rows, not only the middle one. Every obstacle has a run-up before it, and there is a flag to come back at outside every corner. With bots a race takes about 49 seconds. The card between rounds shows the track you are about to run.
- **Every other floor is about a quarter bigger each way**, so there is room to run and to get away: Pinta o Chão's paper is 18 by 15, Come e Cresce's blanket 20 by 15, Cor Certa's floor 16 by 16 (each patch four tiles a side), Batata Quente's pan 7.5 metres to the rim, Batatinha Frita's lane 32 by 11. What depends on distance moved with them: more food at once, buckets a little more often and splashing wider, a longer count before a colour drops, a bomb holder a touch faster. The picnic, the desk, the stage, the park and the kitchen were scaled to their new floors; spectators kept their size. Bate-Bate keeps its 16 by 16, because its size is what its knockouts are paced by.

### Fixed

- Bots in Cor Certa walked to where a patch of the old size would have been, and fell with the floor.
- On the wider floors of Batatinha Frita and Corrida Maluca, pets near the ends had no shadow under them: the sun only cast shadows over the middle. Shadows now cover the whole of whichever floor is up.
- After a blast in Batata Quente the salt shaker and the pepper mill were left hanging in the air until the next one.
- A sofa sinking into the lava vanished with its back still showing. Furniture now goes all the way under.
- The scenery of the bigger maps was outlined more thickly than the pets and props standing in it.

### For whoever is balancing

- The match log writes down the track each race was run on (its metres, turns and obstacles) beside its falls, and furniture landed in each round of O Chão é Lava; the report's row for each game shows them. `pnpm balance` should never show a race at its cap: one that gets there with bots is a track that cannot be run.

## [1.1.0] - 2026-10-11

From the owner, after looking at 1.0.0: the new games were a bit too short and their worlds not alive enough. So every simple game lasts longer, and every world now has someone in it who cares what happens, scenery that answers the round, and things going somewhere on their own.

### Added

- **Spectators.** Every world now has someone in it who cares what happens: small pets that nobody is playing stand round the map, on whatever it gives them to stand on. They watch what matters, start at a blast, clap at a good move and cheer the winner, each a moment after its neighbour. They are smaller than a player's pet, edged in white, with no ring and no name, and never stand on the floor.
- **The winner has an audience.** The stage now has a back: an arch of lights with a velvet curtain drawn back at each side, and twelve spectators on tiers under the curtains, none of them a pet anyone played. They follow the lamps through the drum roll, clap for third and second, and cheer the winner in waves while the cup lifts off its stand and balloons are let go.
- **Bate-Bate has a land below it and a sky with traffic.** Through the gaps in the clouds there are fields, a river, a sea and a small town, whose windows are lit at night. A toy biplane tows a string of pennants round the sky, a kite flies from the windmill's island, and far birds cross in a V. Watchers on the islands and in the balloons' baskets follow the fight, start at a blast and cheer a knockout; a blast rocks the nearest balloon, scatters the gulls and races the windmill. At night there are fireflies, and a star falls now and then.
- **O Chão é Lava's crater builds with the alarm.** The volcano trembles, swells and smokes harder, the boulders shake and the cracks in the wall glow brighter, all the way to the flood, when its fountain stands up. When a pet is burnt the dinosaur's skull clatters. Three lava creatures with bright eyes surface to watch and duck under at the alarm. The volcano and the skeleton now stand where an ordinary frame keeps them in the picture, and nine spectators watch from the columns.
- **Corrida Maluca has a crowd and a sky with traffic.** A grandstand behind the last lane and a marshals' tower cheer the start, clap the first pet past each flag and flinch at a fall. Flags whip as pets pass, a bar's post jolts when it sweeps someone, and at a finish a light runs along the arch and the grandstand throws confetti. Under and round the track: a balloon race, a biplane towing a banner, gulls, and fields and a river far below.
- **Batatinha Frita's whole park plays the game.** When the cat turns to look, everything in the park stops dead with you: swings in mid-air, the merry-go-round, a dog chasing its ball, birds, ducks, butterflies, an ice-cream van in the street, and the ten spectators. It all starts again with the song. The park now has a street with houses beyond its fence, a pond, and a horse on a spring.
- **Cor Certa's stage answers every call.** When a colour is called, every light on the stage takes it and confetti of that colour goes up; at the drop the speakers kick and a rocket fires; each wave the stage plays a little faster and rests a little dimmer. There are dancers on two pods, a DJ, a flying saucer, comets, a giant planet, and a rail round the floor.
- **Come e Cresce's picnic gets eaten.** Over the round the cake loses its slices and the cookie is nibbled away by ants, who scatter when someone is bitten. The jelly shakes when food lands near it and the teapot whistles when someone grows a size. Eight guests watch whoever is biggest. Beyond the table's edge there is a garden far below.
- **Pinta o Chão's desk joins in.** Guests sit on the ruler like a bench. The lamp's head follows whoever leads (and stops when the count is hidden). Kick a bucket over and your tin of paint hops and spills, the tube squirts your colour, a wind-up robot jumps, the paper plane is thrown, and two splats stay on the mat. The drinking bird dips faster as time runs out. Behind the desk there is now a wall with a window.
- **Batata Quente's kitchen is alive.** Spectators on tins round the pan and on its handle follow the bomb with their eyes; a kitchen timer behind the pan has the fuse for its hand; a kettle comes to the boil; the pot's lid rattles; fat spits at the pan's edge, faster as the fuse runs out; and when the bomb goes off, everything standing on the stove hops.
- **The round's list says why.** In the games that count something, each row of the list of places now carries what the game counted for that player (tiles painted, food eaten, how far along the way), counting up as the row arrives, between the name and the points. A share of the way is shown as a percentage, on the list and on the players' cards.
- For developers: `pnpm listen` measures how loud every sound is; `pnpm look --soak` plays three long matches and counts what is held after every change of world; `pnpm rehearse` runs a whole evening with simulated phones in real time.

### Changed

- **The simple games last longer.** Each was over a bit too soon. With four bots a round now lasts about a third to a half longer than before, each game in its own way and without a new rule to learn:
  - **Pinta o Chão** and **Come e Cresce** run 55 seconds instead of 40. In Come e Cresce a size takes 7 points instead of 5, so pets are still growing at the end.
  - **O Chão é Lava:** the first wave has a rock for every pet, a wave to learn on, and the calms are a second longer. About 33 seconds instead of 20.
  - **Batata Quente:** fuses start at 9.5 seconds instead of 7 and never drop under 5.5. About 32 seconds with four players instead of 23, and about 50 with six.
  - **Batatinha Frita:** the pets tiptoe slower, so the lane takes more songs. About 30 seconds with bots, who are rarely caught.
  - **Cor Certa:** the count shortens more gently and the safe patches thin out over seven waves instead of five. About 46 seconds instead of 30.
  - **Corrida Maluca:** the track is a quarter longer, with the same nine obstacles. About 40 seconds instead of 34.
- **Cor Certa's floor has a rim.** A pet could walk off the edge of the dance floor and be out before any colour had been called: an enemy the game never announced. Now the only way out is a patch dropping from under you. Found by a rehearsal with phones that wander at random, where a round ended in 4.4 seconds.
- **Three sounds nobody could hear.** Measured, the tap of a dash, a missed grab and the "tired" blip were 6 to 15 dB under every other sound in the game. They are raised to sit with the rest: a press with no sound feels like a press that did not count. The lava's siren is a little louder too.

### Fixed

- The game kept a shadow map on the graphics card for every different pet whose portrait it had drawn, up to 24 of them, for as long as the page stayed open.

## [1.0.0] - 2026-10-10

The finish. No rule of any game changed: this version is about how the game looks, how it moves from one moment to the next, and how a match is told to the people playing it. Every world is now modelled in Blender instead of being stacked from boxes in code, the camera comes down from its perch for the moments that deserve it, and nothing on screen snaps from one thing to another.

### Added

- **Worlds modelled in Blender.** Every map's scenery used to be built in code from boxes, cones and cylinders. It is now modelled in Blender by a script per map (`pnpm models`), as chunky toys with rounded edges, painted by the game from its own colours, and much of it moves:
  - **Bate-Bate**, which is also the title screen and the lobby: floating islands with a windmill and a cottage, hot-air balloons, gulls and three layers of sculpted cloud; at night, lit windows and paper lanterns rising. The barrel is a toy keg with a fuse and a bang on its lid, the Mystery Cube is gold with a question mark and comes down under a parachute, the meteor has glowing craters and a tail of fire, and the capsule machine has a glass globe full of capsules.
  - **The winner's stage:** a velvet rug, a podium with 1, 2 and 3 on its steps, lamp towers whose beams search the stage and then chase round the winner, bunting, a trophy, balloons and two confetti cannons that kick back as they fire.
  - **Batata Quente:** the pan has a rolled rim and a riveted handle and sits on a cast-iron grate over teardrop flames, on a stove with knobs, a pot, a wooden spoon and a salt shaker.
  - **Come e Cresce:** a picnic on a table of planks, giant beside the pets: a wicker basket, half a watermelon, a cake with a slice out, juice, a teapot that steams, a jelly that wobbles, a bee round the jam and ants marching. The food itself is modelled, and each kind is held up to the camera the way that shows its shape.
  - **Pinta o Chão:** the paper is taped to a cutting mat on an artist's desk, among a ruler, a lamp, crayons, a palette and brushes in a glass. Each player's tin of paint jumps and spills when they kick a bucket over. A drinking bird dips into the glass.
  - **O Chão é Lava:** a crater with a tiered volcano running with lava, basalt columns with lava falls, obsidian crystals and a dinosaur's skeleton half sunk. Bubbles and spouts get busier with the alarm, and the stones to stand on are sculpted, flat-topped and the same size as before.
  - **Corrida Maluca:** the track stands on striped stilts in puffs of cloud, with drifting cloud layers, hot-air balloons, a blimp and an island with a windmill. The start and finish arches now stand past the ends of the track instead of over it, and the flags stand beside it and point the way.
  - **Cor Certa:** a stage floating in space with footlights that take the called colour, speakers that thump on hover pods, a DJ desk with spinning records, a mirror ball, a ringed planet and a toy rocket. A patch that drops now leaves only space under it: before, the base showed through in the called colour and hid the patches still standing.
  - **Batatinha Frita:** a playground in a park: trees, bushes in flower, a swing set, a slide, a merry-go-round, a seesaw, and the cat in a sandbox with a sandcastle.
- **The places of a round.** As a round ends a list comes up on the right: who came first, second and so on, and what the round paid each of them, with the winner's row in gold. Before, only a "+6" flying to a card said so.
- **A curtain between worlds.** One map used to snap into the next. A curtain of ink now closes to a point as the roulette stops and opens on the new world, which grows out from the middle: floor first, then everything round it. The same curtain covers the change to the podium, a rematch and the way back to the lobby.
- **Where the thumb goes.** Until the joystick has been used once, the phone draws a dashed ring with a knob low on the left: the left half of the pad is the joystick, and nothing said so.
- **Your place, on your phone.** As a round ends each phone shows its own player's place in it and what it paid.
- **The last five seconds** of any round are counted aloud, each tick higher than the last, and the timer turns urgent for the last ten in every game (it only did in the brawl).
- **The lava's alarm and flood** are shown on the same card, in the same corner, that names the colour called in Cor Certa, what the cat is doing and who has the bomb.
- **A first look at each world.** While a game's card is up the camera shows its world from low and far, drifting round it, and rises to where the game is played from during the countdown.

### Changed

- **The roulette stops on the game that is played.** The reel used to stop on the same picture every time and a different game's card would then appear. It is wider now, shows the pictures passing under two gold pointers, slows, and stops on the game to come a moment before its card. Phones still learn the game only when the reel stops.
- **The round's winner gets the camera.** As a round ends the camera comes down to the winner's eye level, close, and stays with it; it used to circle a spot the winner had already walked away from. The winner dances, the others shake their heads, and every pet's bubble says how it feels. The podium is seen from the front, like an audience, instead of from above, and the winner's moment has two beats: the word VITÓRIA! over the crown, then the banner with the winner's name. Those who missed the podium stand beside it, in the picture.
- The line over a game's card says which round of the match it is ("Rodada 2 de 5") once the game is known.
- The reel's last tick is a bright note, the curtain closes with a rush of air, and each row of a round's places arrives with a rising tick.

- The open capsule of a SUPER glides through the player colours instead of switching twelve times a second.
- With "less shake" on (M), the camera's new shots hold still instead of swinging; with the system's reduced motion on, the curtain shuts and opens at once.
- For developers: `pnpm models` builds the maps in Blender, and `pnpm look` photographs or films any game, screen or moment between rounds and measures what a map costs to draw (about 2 ms a frame for every game on the computer it was measured on; 6 ms for the heaviest with the processor slowed four times).

### Fixed

- As a brawl round ended, the camera could miss the winner and show the whole platform, when the winner was a ghost that had swapped back in at that very moment.
- An announcer line asked for before its recording had loaded was said by the computer's own voice. It is skipped instead: the announcer has one voice.
- A player knocked out of a simple game floats over it as a ghost. The target ring of the brawl's meteor was drawn under that ghost too, where it meant nothing; it is only drawn in the brawl now.
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
