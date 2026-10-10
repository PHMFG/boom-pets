# Boom Pets: how it plays, and why

Read this before changing a rule, a number in `tuning.ts`, the controls, a power or the bots. It is the style of the game. A change that makes a number better and breaks one of these is the wrong change.

`docs/DESIGN.md` covers how things look and sound. This file covers what they do.

## What the game is

A room of friends, one screen, a phone each. Thirty seconds after scanning a code someone is being thrown off a platform and everyone is laughing, including the one who fell. Rounds are short, luck is loud, and nobody sits out.

## The pillars

### 1. The laugh comes first

The best moment is the one the whole room reacts to: a chain of barrels, a throw off the edge, a curse landing on the leader. When choosing between fair-but-flat and funny-but-swingy, choose funny and then add a safety net (pillar 7). Losing must be funny for the loser too.

### 2. Anyone plays in ten seconds

A joystick and two buttons. A third button exists only while it has something to do. Nothing needs reading beyond one line, and everything can be learned by watching someone else do it. If a rule needs a paragraph to explain, it does not belong.

### 3. Every press is a decision

If mashing a button is the best way to play, that is a bug. Every action costs something and can be read by the others.

| Button | What it does | What it costs |
| --- | --- | --- |
| A, tapped | A shove: nudges one pet. It does not stop a charge or a grab | A rest before A works again, longer if it missed |
| A, held and released | A dash that sends pets flying, bigger with the charge | Slow while charging, the same rest after, and held too long the pet detonates |
| B | Lunges at a rival or barrel in reach and picks it up. B again throws | A miss rests B. Carrying is slower, cannot dash, and a real hit makes the carrier drop |
| Power button | Starts the power the pet is holding | The power is spent. A good moment is the skill |

Mashing is the point in exactly two places, because there it is the joke: wriggling out of a grab, and ZICA during a gacha.

### 4. Three moves that beat each other

- **A grab beats a charge.** A pet standing still to charge is there to be picked up.
- **A dash let go in time beats a grab.** A pet in mid-dash slips through the hands and hits the grabber.
- **A shove beats nothing by itself.** It is quick and safe, and it moves a rival toward an edge or off their line.

A new move or power has to fit here: say what it beats and what beats it.

### 5. The edge is the only enemy

Nothing has hit points. Every hit, throw, blast and falling tile matters only because of where it leaves a pet. So position is the whole game:

- Knockback takes the stick away for a moment, or it would be cancelled before it mattered.
- A thrown pet cannot steer in the air and lands with a splat, so where it was thrown from decides whether it goes off.
- The platform shrinks from the outside in, so the end of a round is always at an edge.
- Anything that would knock a pet out without an edge being involved (other than its own overcharge) is out of style.

### 6. Danger is always announced

Nothing knocks a pet out without a warning the player could have read: a barrel swells, tiles shake for a second, a meteor's shadow grows, an overcharge warns on the phone and on the floor. Chaos is fine. Unfair is not. And the network is never the cause: a charge pauses while a phone's input stalls.

### 7. Luck is loud, and has a safety net

- A Mystery Cube is a gamble everyone can see: the reels spin over the pet's head.
- **Good powers wait** on the power button until the player wants them. **Curses start at once.** That is what makes a cube a gamble.
- Every power is explained the moment someone gets it: its picture, its name, one line. On the TV for the room, on the phone for its owner.
- A SUPER is rare and belongs to the room: everyone else mashes ZICA to curse it.
- The safety nets are part of the design, not patches: a SUPER is guaranteed after six rolls without one, the player in last place gets a bigger blast, the leader carries a bounty, the final round counts double. Whoever is ahead should feel hunted.

### 8. Nobody sits out

A knocked-out player becomes a ghost who drops meteors, and a meteor that knocks someone out swaps the two. A phone that drops gets its pet back. A phone that joins late plays from the next match.

### 9. Bots are stand-ins, not opponents

They fill the room to four, react a quarter of a second late, aim a little off, and make the same mistakes people do. They use every move a player has, so watching them teaches the game. A bot must never be better at something than a person can be.

### 10. The simulation is the referee, and the numbers are in one place

`packages/game` decides everything, the same way every time for the same seed. Every number that shapes how the game feels is in `tuning.ts` with a comment saying what it does. Nothing about feel is hidden in a view or a stylesheet.

## How a change is judged

Changes come from watching people play, and are checked by measuring.

1. Name the problem as it was seen at the table ("players mash A and it works").
2. Find which pillar it breaks.
3. Change the rule or the number. Prefer one new cost or one clearer signal over a new mechanic.
4. Run `pnpm balance 30`. With bots only, a round should last about 25 to 35 seconds, the first knockout should come around 10 seconds in, and no single cause should be more than 60% of knockouts.
5. Play it, then read `pnpm report` after the next session with people. It flags idle players, a first dash that came late, taps outnumbering charged dashes, grabs that mostly miss, one cause dominating, and the leader collecting the SUPERs.
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

This breaks pillar 3 (mashing B is the best way to play) and pillar 4 (in practice nothing beats a grab). The network side held: joins of 0.4 to 10 s, median latency of 7 to 14 ms, and every drop back within half a second.

## Checklist for anything that changes how the game plays

1. It answers something seen in play, and you can say which pillar it serves.
2. Mashing any button is still not the best way to play.
3. The new or changed move says what it beats and what beats it.
4. It can only knock a pet out by way of an edge, and it is announced before it lands.
5. It can be learned by watching, and explained in one line that is on screen.
6. Luck added has a safety net, and does not help whoever is already ahead.
7. Bots use it, no better than a person could.
8. Every number is in `tuning.ts` with a comment. Nothing in the simulation calls `Math.random`.
9. `pnpm test` passes with a test for the new rule, and `pnpm balance 30` is inside the ranges above.
10. `CHANGELOG.md` says what changed and why.
