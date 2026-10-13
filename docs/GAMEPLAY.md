# Boom Pets: how it plays, and why

Read this before changing a rule, a number in `tuning.ts`, the controls, a power or the bots. It is the style of the game. A change that makes a number better and breaks one of these is the wrong change.

`docs/DESIGN.md` covers how things look and sound. This file covers what they do.

## What the game is

A room of friends, one screen, a phone each. Thirty seconds after scanning a code someone is being thrown off a platform and everyone is laughing, including the one who fell. A match is a handful of short rounds, and **each round is a different game**, drawn by a roulette: the brawl the game started as, and a set of simpler games that need the joystick and at most one button. Rounds are short, luck is loud, and nobody sits out for long.

## The pillars

### 1. The laugh comes first

The best moment is the one the whole room reacts to: a chain of barrels, a throw off the edge, a curse landing on the leader, a bucket of paint kicked over someone's whole corner. When choosing between fair-but-flat and funny-but-swingy, choose funny and then add a safety net (pillar 7). Losing must be funny for the loser too.

### 2. Anyone plays in ten seconds

A joystick, and outside the brawl at most one button. A button is on the phone only while it does something, and says what it does in a word. Every game is explained by one line, shown on its card before the round and again on the phone as it starts. If a game needs a second line, it does not belong.

### 3. Every press is a decision

If mashing a button is the best way to play, that is a bug. Every action costs something and can be read by the others.

The brawl has three buttons:

| Button | What it does | What it costs |
| --- | --- | --- |
| A, tapped | A shove: nudges one pet. It does not stop a charge or a grab | A rest before A works again, longer if it missed |
| A, held and released | A dash that sends pets flying, bigger with the charge | Slow while charging, the same rest after, and held too long the pet detonates |
| B | Lunges at a rival or barrel in reach and picks it up. B again throws | A miss rests B. Carrying is slower, cannot dash, and a real hit makes the carrier drop |
| Power button | Starts the power the pet is holding | The power is spent. A good moment is the skill |

Every other game has the joystick and, at most, A, and A always rests after it is used. What A is in each game, and what it costs, is in the table of games below.

Mashing is the point in exactly two places, because there it is the joke: wriggling out of a grab, and ZICA during a gacha.

### 4. In the brawl, three moves beat each other

- **A grab beats a charge.** A pet standing still to charge is there to be picked up.
- **A dash let go in time beats a grab.** A pet in mid-dash slips through the hands and hits the grabber.
- **A shove beats nothing by itself.** It is quick and safe, and it moves a rival toward an edge or off their line.

A new move or power in the brawl has to fit here: say what it beats and what beats it. A simple game has one verb, so there is nothing to beat: what it needs instead is a cost.

### 5. Every game has one enemy, and everyone can see it

Nothing has hit points, in any game. A pet is in until its game's one enemy gets it, and that enemy is on screen the whole time: an edge, a tide of lava, a bomb, the clock. A game with two enemies is two games.

In the brawl the enemy is the edge. Every hit, throw, blast and falling tile matters only because of where it leaves a pet. So position is the whole game:

- Knockback takes the stick away for a moment, or it would be cancelled before it mattered.
- A thrown pet cannot steer in the air and lands with a splat, so where it was thrown from decides whether it goes off.
- The platform shrinks from the outside in, so the end of a round is always at an edge.
- Anything in the brawl that would knock a pet out without an edge being involved (other than its own overcharge) is out of style.

### 6. Danger is always announced

Nothing takes a pet out without a warning the player could have read: a barrel swells, tiles shake for a second, a meteor's shadow grows, an overcharge warns on the phone and on the floor. The warning is on the floor where the danger will be, or on the dangerous thing itself where everyone can watch it. Chaos is fine. Unfair is not. And the network is never the cause: a charge pauses while a phone's input stalls, and a game that judges stillness judges the joystick, with a moment's grace.

### 7. Luck is loud, and has a safety net

- **The roulette is the loudest luck of all:** which game comes next. Its net is the bag: every game comes up once before any comes round again, and never the same game twice running. The game is drawn as the reel starts to turn, so the reel can stop on it; nobody can act on it before the round starts, and phones only learn it when the reel stops.
- Every round pays from the same table, whatever the game: 6, 4, 3, 2 and 1 for the first five places. No game is worth more than another. In the brawl a knockout, a ghost's swap back in and knocking out the leader add a point each.
- A Mystery Cube is a gamble everyone can see: the reels spin over the pet's head.
- **Good powers wait** on the power button until the player wants them. **Curses start at once.** That is what makes a cube a gamble.
- Every power is explained the moment someone gets it: its picture, its name, one line. On the TV for the room, on the phone for its owner.
- A SUPER is rare and belongs to the room: everyone else mashes ZICA to curse it.
- **Because it is rare, a SUPER has to be the event of its round.** One that holds lands with a strike on its owner's spot, warned on the floor, that throws back everyone else in reach. Then:
  - **Kaiju**: a monster as fast as a pet on foot, immune to knocks, whose every step blasts the pets near its feet and whose charged dash is half as big again. It beats anyone it can corner. What beats it: staying away from it and from the edges for nine seconds, a Rocket, or a curse at the gacha.
  - **Meteor Shower**: eight seconds of meteors, two in three aimed at a rival (each in turn, a little ahead of where it is running), each leaving a hole in the floor. It beats standing still, charging and being carried. What beats it: turning, or standing right beside the pet that called it, where no meteor lands.
  - SUPERs, taken together, should make about one knockout each time one runs: between 0.4 and 2. Under that it is not worth getting, over that one lucky roll decides the round. `pnpm balance` prints the number for bots and `pnpm report` for people.
- The safety nets are part of the design, not patches: a SUPER is guaranteed after six rolls without one, the player in last place gets a bigger blast, the leader carries a bounty, the final round counts double. Whoever is ahead should feel hunted.

### 8. Nobody sits out for longer than one short game

Where a game can bring a pet back, it does: a fall is a few seconds lost, not the round. Where being out is the game (last one standing), the round is capped under a minute and the player who is out floats over the floor as a ghost that moves with the joystick. In the brawl the ghost drops meteors, and a meteor that knocks someone out swaps the two. A phone that drops gets its pet back. A phone that joins late plays from the next match.

### 9. Bots are stand-ins, not opponents

They fill the room to four, react a quarter of a second late, aim a little off, and make the same mistakes people do. They play every game, and in each they use what a player has, so watching them teaches it. A bot must never be better at something than a person can be. Everything a bot does is worked out from the round as it stands: it may take over a seat halfway through one.

### 10. The simulation is the referee, and the numbers are in one place

`packages/game` decides everything, the same way every time for the same seed: the game drawn, the map, the roll. Every number that shapes how the game feels is in `tuning.ts` with a comment saying what it does, each game's in its own block. Nothing about feel is hidden in a view or a stylesheet.

## The games

| Game | The one line | Controls, and what A costs | The enemy | How it ends | Out? |
| --- | --- | --- | --- | --- | --- |
| **Bate-Bate** (`brawl`) | Jogue todo mundo pra fora! | Stick, A, B, power (pillars 3 and 4) | The edge | Last pet standing, or 75 s | Ghost with meteors |
| **Batata Quente** (`potato`) | Passe a batata! | Stick only. Holding the bomb is its own cost and its own help: the holder runs 12% faster, or nobody would ever be caught | The bomb: one pet carries it, everyone sees who, and its fuse shows on it | A bump hands the bomb over, but not straight back for 0.8 s. When the fuse runs out the holder is out and those within 3 m are thrown back; the next bomb goes to someone at random with a shorter fuse (9.5 s down to 5.5 s). A round has one bomb fewer than it has players, so with fewer than four every fuse is 5 s longer for each player short of four: two players get one fuse of 19.5 s, not one of 9.5. The pan has a wall: nobody falls. Last pet standing, or 80 s | Ghost that drifts |
| **Batatinha Frita 1, 2, 3** (`frita`) | Parou, parou! Não se mexa | Stick only. Everyone tiptoes (a little under half speed), so the lane takes many songs | The giant cat: while it sings its back is turned; it counts one, two, three and turns round | A song lasts 1.2 to 2.8 s, never the same twice, and the look 1.4 to 2.4 s. Whoever still pushes the joystick 0.45 s after the cat has turned goes back to the start: what is judged is the joystick, not a pet still sliding, and the grace is longer than a slow phone's lag. First over the line wins; 10 s later the round is called, or at 80 s. The rest are ranked by how far they got | Never |
| **Come e Cresce** (`grow`) | Coma tudo! O maior vence | Stick; A is a bite (a short lunge), then A rests, longer after a miss. Growing is its own cost: every size is slower | The clock, and any pet two sizes bigger | 55 s; most eaten. Food grows a pet a size for every 7 points, up to 8 sizes. A bite on a pet two sizes smaller shakes a quarter of its food out as crumbs, and it cannot be bitten again for 3 s. A purple pepper shrinks. A feast lands beside the smallest every 6 s | Never |
| **Cor Certa** (`color`) | Corra pra cor certa! | Stick only | The floor: sixteen patches in four colours, each with its fruit | A colour is called by name and fruit; after a count (3.2 s, shorter each time, down to 1.2 s) every patch of another colour drops, and anyone on one falls. Then a new floor is dealt, with fewer patches of the colour to come (4, 4, 3, 3, 2, 2, then 1). The stage has a rim: nobody leaves it by its edge, only by a patch dropping. Last pet standing, or 75 s. Pets lost at the same drop tie | Ghost that drifts |
| **Corrida Maluca** (`race`) | Chegue primeiro! | Stick; A is a jump (about 0.9 m high and 3 m long at a run, never twice in the air), then a short rest | The drop on either side of a track three tiles wide that is **drawn afresh every round**: 150 to 174 m from one side of the floor to the far back corner of the other, turning at the points of a grid, never crossing or touching itself, sometimes long straights and sometimes all corners. On every straight long enough stand its obstacles, eleven to seventeen (twelve is usual), the four kinds in an order the roll decides: gaps of two tiles, tiles that shake and blink away, beams one tile wide (any of the track's three rows), bars that sweep a pet off its feet unless it jumps them. None stands nearer a corner than a run-up. Pets start on a grid two abreast, the front row first, and who stands where is drawn afresh each race | First over the line wins; 10 s later the round is called, or at 105 s. A fall puts a pet back at the last flag it passed: there is one at every corner and one just past every obstacle that has another after it, so nobody comes back with less than a run-up to the next. The rest are ranked by how far they got | Never |
| **O Chão é Lava** (`lava`) | A lava não para de subir: suba nos móveis! | Stick; A is a shove (a short lunge that pushes whoever it touches), then A rests, longer after a miss. Up on the furniture everyone treads at 62% of their pace: a table is a metre and a bit across | The lava. It rises all the time and never goes back down | Furniture falls from the sky in layers, each piece outlined in gold where it will land: a pouf and an armchair seat one pet, a low table two, a sofa three, a bed four. The first layer lands on the floor; every layer after lands on the one before, a step (0.7 m) higher, its pieces side by side so that they are one floor, and reaching over the layer below, which is the way up. A pet walks up one step and no more (two layers up is a wall), and a piece that lands on a pet carries it up. The lava takes the layers from the bottom: an alarm sounds for 2.2 s, and then whoever is still on the layer below the newest is out. So is anyone who falls into it, at any time: a shove off the edge of a piece is a fall to the layer below if there is one there, and into the lava if there is not. The first three layers have a seat for every pet; after that one too few, and from the sixth two too few. Each layer has less time than the last. Last pet standing, or 75 s. Pets lost while the same layer was being climbed tie | Ghost that drifts |
| **Pinta o Chão** (`paint`) | Pinte mais que todo mundo! | Stick only | The clock, and everyone else's feet | 55 s; most tiles. The count is hidden for the last 10 s | Never |

A game is added to this table in the commit that adds it to the match.

**What a new game has to be:**

1. One line says what to do, and it is true for the whole round.
2. The joystick and at most A. A has a cost, and rests after use.
3. One enemy, on screen the whole time, announced before it gets anyone.
4. Either nobody is ever out, or the round is capped at 80 seconds and lasts well under a minute with bots: whoever is out early is never left watching for long. (It read "capped under a minute" until the owner asked for longer rounds in 1.1.0; the caps went to 75 and 80 then, and this line should have gone with them.)
5. Its floor is pale and its map is its own (see `docs/DESIGN.md`).
6. A bot can play it to the end, no better than a person.
7. It returns a ranking for everyone, with ties, including those who never finished.

## How a change is judged

Changes come from watching people play, and are checked by measuring.

1. Name the problem as it was seen at the table ("players mash A and it works").
2. Find which pillar it breaks.
3. Change the rule or the number. Prefer one new cost or one clearer signal over a new mechanic.
4. Run `pnpm balance 30` (or `pnpm balance 30 --mode=paint` for one game). With bots only, a round of the brawl should last about 25 to 35 seconds, its first knockout should come around 10 seconds in, no single cause should be more than 60% of its knockouts, and a SUPER should make between 0.4 and 2 knockouts per run (run 100 or more matches to judge that one: a SUPER is rare). Any other game should end inside its time cap unless its clock is the point (with four bots: Batata Quente about 32 s, Batatinha Frita 25 to 50 s, Cor Certa 35 to 70 s, Corrida Maluca 37 to 65 s and none at its cap (a round that reaches the cap with bots is a track that cannot be run: find it), O Chão é Lava 30 to 45 s; the games on a clock run their 55 s), and no seat should win it much more often than the others: bots take the seats in a fixed order of styles, so a lopsided column is a rule that favours one way of playing. Those numbers are for four, which is what `pnpm balance` plays unless told otherwise, and people play in twos and in sixes: run `pnpm balance 20 --players=2` and `--players=6` after changing any game where pets are out, since its rounds are as long as its players are many. No round should be under 20 s at two players (the brawl apart, whose length is its knockouts) or reach its cap at six. As of 1.3.0, with bots from two players to six: O Chão é Lava 22, 30, 36, 38, 42 s; Batata Quente 21, 32, 32, 42, 51 s.
5. Play it, then read `pnpm report` after the next session with people. It sets the builds side by side and, for the newest, says what each move pays, how pets were knocked out, how the buttons were used, how rounds and scores went, and what the cubes gave, with a warning wherever a number crosses its limit. How to read it is in `AGENTS.md`.
6. Write the change and its reason in `CHANGELOG.md`.

## What playtests have taught

**First playtest, 9 October 2026 (two to four people, iPhone and Android).** The game was liked. Three problems:

| Seen at the table | Why | What changed |
| --- | --- | --- |
| Everyone mashed A the whole time | A tap was free, aimed itself, popped the victim up and stopped whatever they were doing | A tap is now only a shove, every dash is followed by a rest (longer after a miss), and the phone and the ring under the pet show the rest |
| Grabbing was hard and did not pay | The grabber slowed down while the target walked away, and six taps freed the victim in under a second | A grab is a lunge with a longer reach, the phone's B and a hand over the target show when it will land, the victim's taps count only after half a second, a thrown pet cannot steer in the air, and a knockout by throwing pays a point more |
| Nobody knew what a power did or when it was on | Powers started by themselves, with only an icon | Good powers wait on their own button, and every power is introduced by name with one line on what it does |

Also from that session: a grabbed player's joystick was dropped, so they had to lift the thumb and press again once free. A held thumb is now never dropped.

**Second playtest, 10 October 2026 (six phones, then five; build 0.4.2).** Three matches. The first playtest's fixes moved the problem instead of ending it. What the logs show, with nothing changed yet:

| Seen in the logs | The numbers |
| --- | --- |
| Throwing is now nearly the only way anyone is knocked out | 44 of 65 knockouts were throws (68%), and 2 were dashes. With bots alone the split had been even |
| B is the button that pays for mashing | One player grabbed 90 times, missed 218 and threw 83, and won two of the three matches with 78 points each time, against 36 and 24 for second place. A missed grab rests B for 0.4 s, which did not slow this down |
| Almost nobody charges a dash | Of the dashes players made, 75% to 99% were taps. Four of six players charged fewer than seven dashes in three matches |
| A is still mashed, now to no effect | Two players pressed A 512 and 340 times while it was resting. The ring on the phone and under the pet is not being read as "wait" |
| Powers are used about half the time | Five uses in three matches, from about nine powers that waited on the button |

This breaks pillar 3 (mashing B is the best way to play) and pillar 4 (in practice nothing beats a grab).

One cause was found afterwards, by the tests written for the new match logs: every dash that hit was ended a second time as a miss, so a hit rested A for as long as a miss did. Dashing was worth less than designed in builds 0.2.0 to 0.4.2, which is part of why throwing took over. Build 0.4.3 fixes it; with bots, dashes went from a third of knockouts to nearly half and throws from 29% to 8%. Judge the throw against the dash again on a session played on 0.4.3 or later before changing either. The network side held: joins of 0.4 to 10 s, median latency of 7 to 14 ms, and every drop back within half a second.

**After the second playtest (10 October 2026, same session).** Two complaints from the players, beside what the logs showed:

| Said at the table | Why | What changed (build 0.5.0) |
| --- | --- | --- |
| It is very easy to lose your own pet | Pale pets on a pale floor, an outline in the seat colour only, and a camera that showed the whole platform: with six spread out, a pet was about 56 pixels tall on a 1080p screen | This is a matter of how the game is shown, so the rule and the fixes are in `docs/DESIGN.md` under "Finding your pet": a clean white floor, an ink line around every outline and ring, a ring that keeps its player's colour whatever the pet is doing, name tags in the player's colour, pets drawn bigger, and a camera that stays as close as the fight allows |
| The SUPER is not rewarding | Both SUPERs rolled in the five real matches were Kaiju, and neither knocked anyone out: it was slower than the pets it chased, for seven seconds. The Meteor Shower fell at random and was easy to walk around | A SUPER lands with a strike. Kaiju keeps pace, hits harder and wider, and lasts nine seconds. The shower is aimed, lasts eight seconds and punches holes in the floor. With bots a Kaiju now makes about 0.6 knockouts per run and a shower about 0.3 (plus the falls into its holes, which count as falls), 0.45 for the two together, where all powers together used to make 14 knockouts in 60 matches. Bots do not dodge and do not hunt, so the number that matters is the one from people. The match log now counts the knockouts each power makes |

**The party of games (10 October 2026, build 0.6.0).** Not from a playtest: the owner's decision. The game had one kind of round, and the first thing a new player has to learn in it is three buttons. A round is now one of several games, most of them joystick-only, drawn at random, each on its own map, with a screen between games that names and explains the next one and a proper moment for the winner. Scoring became one table for every game, so the brawl's knockouts went from 3 points to 1. Whether the simple games are fun, and whether the brawl still holds its place among them, is for the next session's report to say: it now has a row per game.

**The finish for 1.0 (10 October 2026, build 1.0.0).** Not from a playtest: the owner's decision, to make the game feel finished. No rule of any game changed. What changed is how a match is told: as a round ends the room is shown who came where and what it paid (a list on the TV, and each player's own place on their phone), which a "+6" flying to a card did not do; the roulette is drawn as it starts to turn, so it can stop on the game that is played; the last five seconds of any round are counted aloud; and every game whose state the whole room must know (a colour called, the lava coming, who has the bomb, whether the cat is looking) says it on the same card, in the same corner. Whether the list of places makes the scoring easier to follow is for people to say; nothing in the logs measures it.

**A rim for Cor Certa (11 October 2026, build 1.1.0).** Not from a playtest with people: from a rehearsal with five simulated phones that wander at random (`pnpm rehearse`). In it a round of Cor Certa was over in 4.4 seconds, before the first colour had dropped: four of the five had walked off the edge of the floor. Bots never do that, so `pnpm balance` had never shown it. The edge was a second enemy that the game never announces, which the checklist below forbids (item 4), so the floor now has a rim, like every game but the brawl and the race, whose edges are their enemies. The same rehearsal had a round of O Chão é Lava end in 7 seconds with all five lost to the first wave and sharing first place; that is the rule working as written, and whether a first wave is too soon for people who have never seen the game is for a session with people to say.

**Longer rounds (11 October 2026, build 1.1.0).** From the owner, after looking at 1.0.0: the new games are "just a bit too short". With four bots a round of O Chão é Lava lasted 20 seconds, Batata Quente 23, Batatinha Frita 25, Cor Certa 30 and the race 34, and the two games on a clock ran 40. Each is now about a third to a half longer, and each in its own way, without a new rule to learn: the two on a clock run 55 seconds; the lava's first wave has a rock for every pet and its calms are longer (33 seconds); fuses are longer (32 seconds with four, about 50 with six); the pets tiptoe slower past the cat (30 seconds, and people are caught far more often than bots); Cor Certa's counts shorten more gently and its safe patches thin out over seven waves instead of five (46 seconds); the race's track is a quarter longer with the same nine obstacles (40 seconds). The time caps went up to match, to 75 or 80 seconds. What the bots cannot say is whether that is long enough, or now too long for whoever is out and watching: the report's row for each game will.

**Bigger floors, a longer race and furniture in the lava (11 October 2026, build 1.2.0).** From the owner, after playing: make the maps bigger, the race could be bigger too, and O Chão é Lava "is very short" and could have furniture that falls from the sky to climb on before the lava comes. (The copy of the game the owner had open was still 1.0.0, whose lava rounds lasted 20 seconds with bots; 1.1.0's 33 had not been seen. The folder it is served from had been left on that build's branch.) Every floor but the brawl's is about a quarter bigger each way (Pinta o Chão 18 by 15, Come e Cresce 20 by 15, Cor Certa 16 by 16 with patches of four tiles, Batata Quente's pan 7.5 m, Batatinha Frita's lane 32 by 11), and the numbers that are distances went with them: more food and a bucket more often on the bigger floors, a longer count before a colour drops (3.8 s down to 1.3 s, since the right patch can be farther away), a holder a little faster in the bigger pan. The brawl keeps its 16 by 16: its size is what its knockouts are paced by, and that pacing is the one thing here that people have judged. The race is longer and is no longer one track: see the next entry. The lava game changed its rule, not only its length. Rocks that rose where they stood asked one thing, reach a rock; furniture that falls asks three: see where it will land, choose which piece, and share it or shove for it, since a sofa seats three. It keeps the one enemy (the lava) and the one verb besides walking (the shove). Two waves seat everyone instead of one, because the pieces are new each time and there is more to read. With four bots a round is about 40 seconds (it was 20 in the build the owner called short). Bots take a seat each and never squeeze up; people will, and a room that agrees to share could sit out every wave to the time cap. So from the fifth wave there are two seats too few, which no squeeze covers for long, and the shove is cheap enough to break any truce. What bots cannot say: whether people read where a piece will land in time, whether sharing a sofa is fun or a scrum, and whether rounds between people end by shoving or by the clock. The report's row for the game has its length and its waves; the first is for the owner's next session to say.

**A track drawn every round (11 October 2026, build 1.2.0).** From the owner, the same day: Corrida Maluca "could have a procedural map", its layout and its challenges changing every round. Until now only the order of the obstacles changed; the track was always the same S, and a room that has run it twice knows it. Now the roll draws the track: a line across a grid of six points by five, six metres apart, from any point of one side to the back corner of the other, that passes no point twice. There are about four thousand that are long enough (150 m) and have room for enough obstacles (11), and as many again mirrored; a turn count is drawn first and then a track with that many, so a track of long straights comes up as often as one that is all corners, though there are far more of the second. The floor is 33 by 27 to hold them. It serves the pillar that a round is learned by watching: the rule is the same every time (follow the track, jump what is in the way) and only the reading changes. Two things had to be made true of every track, not of one. First, an obstacle always has a run-up: none within 4.5 m of a corner or 7.5 m of the start, where the front row of the grid stands. Second, and found by measuring, not by thinking: a flag half way between two obstacles left 2.5 m to a gap, which cannot be jumped from standing, so in one track in three hundred every bot fell at the same gap until the clock ran out. A person would have been stuck there too. Flags between obstacles now stand just past the one behind them, and 900 tracks were run by bots without one reaching the cap (the longest took 67 s). With four bots a race is about 49 seconds (37 to 61), against 40 in 1.1.0 and 34 in the build the owner had played. What bots cannot say: whether a track that is all corners is fun or only fiddly for people, and whether six pets entering the first corner together is a scramble worth having. Each race's round in the log carries its track's length, turns and obstacles beside its falls, so the report's row for the race can be read against the kind of track: if all-corner tracks turn out to be the ones nobody finishes, it will show there.

**What a second pair of eyes found (11 October 2026, build 1.2.1).** Not from people playing: from a review of pictures of every screen by an agent that had not seen the work, checked against `docs/DESIGN.md`. Three of what it found were about how the games play, not only how they look, and all three came from the bigger floors of 1.2.0. In Cor Certa the camera framed the pets, as it does everywhere, and a floor of 16 by 16 no longer fitted the picture: patches lay under the clock and the players' cards or off the bottom, and a colour that cannot be seen cannot be run to (pillar: learned by watching). The camera now keeps the whole floor in view there. In O Chão é Lava a pouf 0.3 m high vanished under the pet standing on it and its ring, so the one thing a player has to know before the lava comes, whether they are up, could not be read; furniture is 0.7 m high now and its side shows. In Corrida Maluca six pets started in a block where one ring hid another; they start on a grid two abreast and three rows deep, drawn afresh each race so that no seat is always at the back, and the first obstacle is a metre farther off to keep the front row its run-up. Bots do not care about any of this, and their numbers did not move (race 48.6 s over 300 rounds, lava 42 s, none at a cap). Whether people do is for the owner's next session.

**Five people on 1.2.0, and what two people had seen on 1.0.0 (11 October 2026, build 1.2.2).** From the match logs, which were read late: the owner played two matches of 1.2.0 with four other people on five phones the same afternoon it was tagged, and four matches of 1.0.0 as two people with no bots the night before. Nobody has said in words how either felt. What the logs say is this. On 1.0.0, in a duo, O Chão é Lava lasted 7.0 seconds both times and Batata Quente 8.5 seconds all three times: with two players each was over at its first flood or its first fuse. That is what "very short" was, and every number tuned for it since had been tuned with four bots, which is why `pnpm balance` never showed it. On 1.2.0 with five people the lava lasted 44.6 s over five waves and 26.5 s over three, the potato 42 s, Cor Certa 37 s, Batatinha Frita 39.5 s with 8 pets caught in 45 chances (18%, inside the limits), and the one race 65.4 s on a drawn track of 162 m with sixteen obstacles, which four of the five finished and the fifth was 4% short of. People fell or were swept 13.8 times a minute each on that track; on the old fixed track two people had fallen 10.9 and 13.7 times a minute, and bots fall 12.7: the drawn track is no harder a minute than the one it replaced, and here bots and people agree. Measured now at every number of players (`pnpm balance --players=`): the lava in a duo is 27 s since 1.1.0 gave its first waves a seat for everyone, but the potato in a duo was still one fuse, 11 seconds. So with fewer than four players every fuse is 5 s longer for each player short of four: 21 s for two, 32 s for three, and four to six as before (32, 42, 51 s). It is the same rule with a number that depends on the room; a duo's single fuse is now long enough for several passes instead of two. What the logs cannot say is whether any of it was fun, and whether a 19.5 s fuse between two is tense or slack: both are the owner's to say.

**O Chão é Lava becomes a climb (12 October 2026, build 1.3.0).** From the owner, asked directly after five people had played 1.2.0: the session was "fun, on the right track"; of everything, the one rule to change was this game's, and of four ways to change it they chose "climb higher and higher: the furniture piles up and the lava rises without stopping, a game of continuous climbing in place of waves where the lava comes and goes". (When the furniture was first asked for, the request had read either way, and waves were built; the doubt was put to the owner three times in reports and answered only when it was asked as a question with options.) What stayed: the one enemy, the one verb, the furniture, the seats, the alarm before the lava takes anyone, the ties. What changed is that height is kept. A layer of furniture lands on the layer before it, a step higher; the lava's level is a number that only goes up; and a fall is no longer a walk on the floor until the next flood but, most of the time, the end. That makes the shove the whole game on a crowded piece, which is what it was meant to be and never was while being shoved off cost nothing. Four things had to be built for it. The floor of a round may now have several heights at one spot, and what is two steps up is a wall (`floorY` with the pet's own height, `walls`, `lift` in `minis/field.ts`). Every piece's top is flat and exactly the rectangle the game counts, or one could not stand on another. Pets walk at 62% of their pace on furniture: at the brawl's 4 m/s a pet is off the far edge of a table before a thumb, or a bot a quarter second late, can stop it, and the first bots fell off on their own twice as often as they were pushed. And bots had to learn what a person does without thinking: find the way across pieces that touch, and brake before an edge. Measuring them found a fault older than this game: when a lunge reached two pets it always hit the one who had joined first (the first in the list), so seat 1 was shoved off, and in Come e Cresce bitten, more than anyone; it hits the nearest now. With bots, from two players to six, a round lasts 22, 30, 36, 38 and 42 seconds, no seat favoured, none at the cap. Of every hundred bots that go out about sixty are shoved, thirty fall on their own (mostly jostled at a crowded edge) and ten are left behind by the lava. What bots cannot say is the whole point: whether climbing feels like climbing from a camera that looks down, whether a fall that ends the round for someone is funny or bitter, and whether the room reads which layer is the one to be on. Those are the owner's next session's to say.

## Checklist for anything that changes how the game plays

1. It answers something seen in play or decided by the owner, and you can say which pillar it serves.
2. Mashing any button is still not the best way to play.
3. In the brawl, a new or changed move says what it beats and what beats it. In any other game, the one verb has a cost.
4. A pet is only ever taken out by its game's one enemy, and that is announced before it lands.
5. It can be learned by watching, and explained in one line that is on screen.
6. Luck added has a safety net, and does not help whoever is already ahead.
7. Bots use it, no better than a person could.
8. Every number is in `tuning.ts` with a comment. Nothing in the simulation calls `Math.random`.
9. `pnpm test` passes with a test for the new rule, and `pnpm balance 30` is inside the ranges above.
10. The match log counts it and the report can warn about it (see "Playtest logs and the report" in `AGENTS.md`).
11. A new game meets "What a new game has to be" above, and is in the table of games.
12. `CHANGELOG.md` says what changed and why.
