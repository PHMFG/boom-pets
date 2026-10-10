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

- **The roulette is the loudest luck of all:** which game comes next. Its net is the bag: every game comes up once before any comes round again, and never the same game twice running.
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
| **Pinta o Chão** (`paint`) | Pinte mais que todo mundo! | Stick only | The clock, and everyone else's feet | 40 s; most tiles. The count is hidden for the last 8 s | Never |

A game is added to this table in the commit that adds it to the match.

**What a new game has to be:**

1. One line says what to do, and it is true for the whole round.
2. The joystick and at most A. A has a cost, and rests after use.
3. One enemy, on screen the whole time, announced before it gets anyone.
4. Either nobody is ever out, or the round is capped under a minute.
5. Its floor is pale and its map is its own (see `docs/DESIGN.md`).
6. A bot can play it to the end, no better than a person.
7. It returns a ranking for everyone, with ties, including those who never finished.

## How a change is judged

Changes come from watching people play, and are checked by measuring.

1. Name the problem as it was seen at the table ("players mash A and it works").
2. Find which pillar it breaks.
3. Change the rule or the number. Prefer one new cost or one clearer signal over a new mechanic.
4. Run `pnpm balance 30` (or `pnpm balance 30 --mode=paint` for one game). With bots only, a round of the brawl should last about 25 to 35 seconds, its first knockout should come around 10 seconds in, no single cause should be more than 60% of its knockouts, and a SUPER should make between 0.4 and 2 knockouts per run (run 100 or more matches to judge that one: a SUPER is rare). Any other game should end inside its time cap unless its clock is the point, and no seat should win it much more often than the others: bots take the seats in a fixed order of styles, so a lopsided column is a rule that favours one way of playing.
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
