# Boom Pets: how it looks, moves and sounds

Read this before changing anything a player sees or hears: the TV, the phone, the 3D world, effects, words or sound. It says what the style is and where each value lives. The checklist at the end is what a change is held to.

`docs/GAMEPLAY.md` covers the rules of play. This file covers how they are shown.

## The idea: a toy box

Everything looks like a chunky plastic toy or a sticker stuck on top of the game: thick dark outlines, flat bright colours, hard shadows with no blur, round corners. Nothing is thin, grey, glossy or subtle. If a new element would look at home in a banking app, it is wrong here.

Four things follow from that and never bend:

1. **Nothing appears, moves or leaves without animation.** Things pop in with an overshoot and squish out. Particles shrink to nothing; they never fade.
2. **A player is a colour and a shape, together, everywhere.** Never colour alone.
3. **The size of an effect matches the size of what happened.** A weak action must look weak. (The first playtest had players mashing A partly because a tap looked like a hit.)
4. **Every player can find their own pet at a glance.** Six people share one screen and each watches one pet. (After the second playtest players said they kept losing theirs: pale pets on a pale floor, thin outlines, and a camera that sat far back.) See "Finding your pet" below.

## Where every value lives

No stylesheet, scene or component writes a raw colour, size token or duration. They come from two files, which also publish them as CSS variables.

| What | File | CSS variables |
| --- | --- | --- |
| Colours, seat colours and shapes, fonts, outline, radius, shadow | `apps/web/src/shared/tokens.ts` | `--ink`, `--cream`, `--gold`, `--danger`, `--tier-*`, `--seat-1` to `--seat-6`, `--font-display`, `--font-text`, `--outline`, `--radius`, `--shadow` |
| Every UI duration and easing | `apps/web/src/shared/motion.ts` | `--pop-in`, `--squish-out`, `--move`, `--punch`, `--stagger`, `--breathe`, `--nudge`, `--prompt`, `--alarm`, `--wobble`, `--buzz`, `--feed` |
| Every word on screen | `apps/web/src/shared/strings.pt-BR.ts` | — |
| Power, award and cause pictures; tier colours | `apps/web/src/shared/powers.ts` | — |

If a value you need is not there, add it there with a comment saying what it is for, then use it. Do not add a one-off.

### Colours and what they mean

| Token | Meaning. Use it for nothing else |
| --- | --- |
| `ink` | Every outline, every hard shadow, body text |
| `cream` | The paper every sticker is cut from |
| `floor`, `floorDark` | The brawl's platform, and nothing else. A clean, cool white on purpose: see "Finding your pet" |
| `cloud` | The clouds below the platform, tinted toward the sky so the white platform's edge reads against them |
| `maps.<game>` | What one game's map is made of: its floor, rim and props. Each game has its own block, used nowhere else |
| `go` | "Run", "safe": the opposite of danger, on the phone |
| `white` | Highlights, and the inside of a button that is not lit |
| `gold` | "Press this", rewards, SUPER, the leader's crown |
| `danger` | Anything about to hurt: overcharge, a throw, warnings on the floor |
| `tierCommon`, `tierRare` | The colour a common or rare power wears on its badge, button and card |
| `tierCursed` with `tierCursedAccent` | Curses and ZICA, always the pair: purple ground, lime words |
| `smoke`, `steel` | Neutral things: smoke, and anything resting or switched off |
| Seat colours | That player, and only that player |

### Players: colour plus shape

Seats are red circle, blue triangle, yellow square, green star, purple diamond, pink cross. Wherever a player is shown, both are shown: the ring under the pet, the name tag, the card in the bottom strip, a line in the feed, and the whole background of that player's phone (colour, with the shape as a faint pattern). `seatShapeSvg` in `shared/glyphs.ts` draws the shape.

### Finding your pet

A pet on the platform wears its player's colour three times, each with an ink edge so it holds against any background:

- **The outline** is a thick band in the seat colour with an ink line around it, like the edge of a sticker (`render/assets.ts`). The ink line is what separates a pale pet from a pale thing behind it.
- **The ring** on the floor under it, wide, in the seat colour with an ink edge. It stays that colour whatever the pet is doing; anything else to say goes on the gauge around it.
- **The name tag** over it is filled with the seat colour and points down at the pet. From a sofa it is a flag, not a label.

And the stage is built so those read:

- **Whatever pets walk on is pale, in every game.** The brawl's platform is a clean, cool white (`floor`, `floorDark`), with no colour of its own to compete with a pet's or a seat's. Every pet and all six seat colours stand out on it, and a white pet is held by its ink line and its ring. The old floor was cream, which is the colour family most pets are made of. A darker green-blue floor was tried and turned down: white reads better. The clouds below are tinted toward the sky (`cloud`), so the platform's edge is the brightest line in the picture. A game's map gets its character from what surrounds the floor (rim, props, sky, light), not from the floor: a themed floor would undo this. Where the floor itself takes colour as part of the game, the colour is lightened until a ring of that same colour still shows on it.
- **Pets are drawn a little bigger than the body the simulation pushes around** (`MODEL_SCALE` in `pets/PetView.ts`), so they read from across a room.
- **The camera stays as close as the fight allows** (see Camera below).

A new pet, floor, effect or seat colour is checked against this: a pale pet, a charcoal pet and all six seat colours, in a six-player round with everyone spread out.

### Type

- **Lilita One** (`--font-display`) for anything short: names, numbers, buttons, titles, power names.
- **Nunito 800** (`--font-text`) only for a line that explains something, such as what a power does.
- Sizes on the TV are multiples of `--u`, which is one pixel at 1080p and scales with the window. Sizes on the phone are in `vmin`, so the pad is the same in either orientation.
- Big words carry an ink stroke (`-webkit-text-stroke` with `paint-order: stroke fill`).

### The sticker

The `.sticker` class is the base of every panel: cream fill, `--outline` ink border, `--radius` corners, a hard `--shadow` straight down with no blur, and a pop-in on arrival. A button is a sticker that sits on its shadow and sinks into it when pressed. Panels on the TV are tilted a degree or two so the HUD looks placed by hand.

## Motion

| Token | Use |
| --- | --- |
| `popIn` (280 ms, overshoots) | Anything arriving |
| `squishOut` (160 ms, swells then shrinks) | Anything leaving |
| `move` (420 ms) | Cards, the crown, points flying to a card |
| `staggerMs` (40 ms) | Delay between items of a row or list |
| `punch` (90 ms) | A button going down, a small number changing |
| `count` (260 ms), `tick` (320 ms) | A score going up; a number the whole room watches, such as the timer |
| `breathe` (2.4 s) | Anything idle |
| `nudge` (500 ms) | Anything asking to be pressed |
| `prompt` (1.1 s), `swell` (900 ms) | A button drawn in a hint, pressing itself; a line waiting for a key |
| `alarm` (380 ms) | Danger. This is the fastest anything may pulse |
| `wobble` (180 ms) | "Do something!": the buttons of a carried player |
| `buzz` (320 ms) | The border pulse on a phone that stands in for vibration |
| `title`, `results`, `feed` | The few timed sequences: the title's letters, the rows of the results, how long a feed line stays |

Rules:

- On the TV, wrap anything that can leave in `Presence` (`host/hud/Presence.tsx`) so it squishes out instead of vanishing.
- Something that appears only when it matters (the power button, a hand over a pet in reach) is itself the message. Do not also leave a greyed-out copy on screen the rest of the time.
- `prefers-reduced-motion` turns CSS animation off. The M key on the game screen reduces camera shake and glow. New effects must respect both.

## The TV

It is read from a sofa, by people who are mostly looking at their own pet.

| Zone | What lives there |
| --- | --- |
| The title screen | The logo at the top, the main menu along the bottom, and bots brawling in between: the menu is the game showing itself off, so nothing may cover the middle except the panel that explains the game |
| Top centre | Round pips and the timer, and nothing else: anything more there hides the far edge of the platform |
| Top left | One explanation at a time, over the sky: a first-play hint, or the card explaining a power |
| Top right | The feed: who knocked out whom, and how |
| Middle | The banner for who took the round. Between games, the roulette and then the next game's card: the one time something large may cover the middle, because nothing is being played |
| Top centre, at the end | "E o campeão é…" and then the winner's name in the winner's colour, over the podium. The camera frames the podium in what the banner leaves free |
| Bottom | One card per player: shape, portrait, name, score, and under the name what the game being played counts: luck pips in the brawl, tiles or food in a game that has a number of its own ("?" while it is kept secret) |
| Over each pet | Its name tag in the player's colour, pointing down at the pet, with a badge for a power it is holding and a hand when a player could grab it |

- One explanation at a time in the top-left slot. A power card outranks a hint.
- In the main menu the chosen button lifts, grows, straightens and turns gold, and a bot in the brawl looks up when the choice moves. A menu is driven by the arrow keys and Enter first, the mouse second: the screen is across the room.
- The HUD stays off the platform. A panel goes over the sky or along an edge, never over where pets can be.
- A power is always shown as its picture, its name and one line on what it does.
- The 3D scene carries the action. The HUD says who and how much; it does not replay what the scene already showed.

## The phone

It is held without being looked at, so it must work by feel and explain itself in a glance.

- The pad is always landscape. A phone held upright turns the pad itself.
- **The pad is the game being played.** The game screen tells each phone what A is (its picture and a word under it), whether B exists, and nothing else: a button a game does not use is not drawn, and its half of the screen does nothing. With only A, the whole right half is A. Only the brawl's dash charges; any other A is just a press, with no gauge and no warning.
- Between games the next game's card (picture, name, its one line) sits over the middle of the pad. It is not another screen: the thumbs stay where they are. As a simple game starts, its line stays on the pad for a few seconds, because there may be no button to read.
- A game may put one word across the pad for a moment that matters ("stop", the colour to run to). It is the only text a player should ever have to read mid-round.
- The left half is the joystick, which appears under the thumb wherever it lands. The right half is A and B, and a touch presses whichever is nearer.
- **A thumb that is down stays down.** When the pet is grabbed, let go or knocked out, the joystick stays where it is. It goes dim while nothing listens to it.
- **A control is on screen only while it does something, and says what it will do.** B turns gold with a hand when something is in reach and shows a throw while carrying. The power button exists only while a power waits, with a card naming the power and what it does. A shows a ring while it rests after a dash.
- Each mode owns the whole screen: alive in the seat colour, ghost pale, carried shaking with one instruction, lever gold, ZICA purple and lime.
- iPhones cannot vibrate from a web page, so every vibration also pulses the pad's border.
- No two controls may overlap on any phone shape. The browser tests check this on the phone shapes they emulate; add new controls to those checks.
- The phone bundle stays small and has no framework: plain TypeScript and DOM.

## The 3D world

- **Shading.** Flat toon shading in three steps, plus a thick outline drawn as an inflated back-facing copy (`render/materials.ts`). A pet's outline is a band in its seat colour with an ink line around it, and stays about the same width when a power makes the pet huge. No realistic lighting, no textures beyond the models' own colour map.
- **Pets.** The model plays its own clips. Everything else (squash, stretch, lean, shake, hit spin) is code on wrapper groups above it, driven by springs so it overshoots (`pets/PetView.ts`).
- **The ring under a pet** is that player's exact phone colour, with an ink edge, and it never changes colour or size: it is how a player finds their pet, so it carries no other message.
- **The gauge around the ring** says what A is doing. A white arc fills while A is held, is a full circle at full charge, and turns to the danger colour and throbs at the overcharge warning. A grey arc drains while A rests after a dash, like the one on the phone's A. No arc means A is ready. (White, not gold: gold is too close to the yellow seat.)
- **Particles** (`fx/Particles.ts`) are cubes, sparks, round puffs and glows. They pop in, live and shrink. Nothing fades.
- **The floor speaks first** (`fx/Decals.ts`). A danger is always drawn on the floor before it lands: barrels, falling tiles, meteors, the cube. Shock rings on the floor show how far a blast reached.
- **Words in 3D** (`render/Text3D.ts`) are for the few big moments: one or two capitals and an exclamation mark. New words go in `strings.words3d`, then `pnpm font`.
- **Feelings are emoji in a bubble** over the pet. What a pet feels is shown this way, not in the HUD.
- **Maps.** Each game has its own world (`stages/maps/`): its floor, what surrounds it, its sky and light, and its props. Every prop is built from plain shapes, toon shaded with an ink outline (`maps/toys.ts`), like the barrel and the gacha machine: nothing in a map is a downloaded model. What is on screen now:

  | Game | Floor | Around it | Sky |
  | --- | --- | --- | --- |
  | Bate-Bate | White checker | Lavender clouds far below | Day; night when it is the last round |
  | O Chão é Lava | Pale stone. The rocks to stand on are dark and drawn a little wider than they are: on a pale floor they must be the first thing anyone sees | A sea of lava, brighter than white so it glows, with dark boulders standing in it and two cones at the back | Night |
  | Pinta o Chão | White paper; a painted tile is its player's colour, lightened | A desk, masking tape round the paper, giant pencils, a pot of paint for each player colour | Morning |

- **Camera.** Tilted 52° down through a narrow lens. In a round it frames the living pets and nothing more (a ghost's cursor and a falling cube pull it a little), so it is as close as the fight allows and moves in and out with it: the platform's empty corners are not worth the pixels. The fit is exact: the farthest pet's name tag stays below the round counter and the nearest pet's ring above the players' cards (the HUD reports what it covers as insets). It looks a moment ahead along each pet's path, pulls back at once when someone is about to leave the picture and closes in gently, and never comes so close that a fight in the middle has no edge in view. It shakes with impacts in proportion to them and punches in on big moments. The numbers are at the top of `render/CameraRig.ts`.

### How big should an effect be?

| What happened | Pet | World | Camera |
| --- | --- | --- | --- |
| A shove (a tap of A) | Small nudge | A puff of dust | Nothing |
| A charged hit | Squash, spin, both hold the pose 80 ms | Stars and a ring sized by the charge | Shake scaled by the charge |
| A grab | Both hold the pose 100 ms, the caught pet looks scared | Stars, the word PEGOU! | Small shake |
| A thrown pet landing on someone | Both squash | Ring, stars | Medium shake |
| An explosion | Thrown, tumbling | Bright sphere, smoke, sparks, debris, scorch | Shake, colour fringe, extra glow |
| A SUPER arriving | Its owner changes on the spot; everyone else looks scared | A wide warning on the floor, then a strike and its blast | Close on the owner for the gacha, then shake |
| The lava's alarm, and the lava | Nothing; those left out burst into sparks | The sea climbs through the alarm, then jumps over the floor. The words SOBE! and LAVA! | Small shake, then a bigger one with a little glow |
| A bucket of paint kicked over | Nothing | A ring and a burst of cubes in the kicker's colour, as wide as the patch painted | Small shake |
| A place revealed in the finale | Pops onto its step, which takes its colour | Dust and a ring in its colour | Small shake |
| The winner | Drops in, bigger than the rest, crowned, dancing | Spotlight, confetti from both sides, fireworks, the word VITÓRIA! | Colour returns, closes in and circles |
| A knockout | Shatters into cubes in its colours | Confetti, points fly to the scorer | Slow motion for the deciding ones |

A new effect goes on this ladder next to something of the same weight, and is no louder than it.

## Safety

- No full-screen flashes.
- Nothing blinks faster than three times a second.
- Never rely on colour alone to tell players or states apart.
- A danger is always shown before it lands.

## Words

- Brazilian Portuguese, informal, addressed to "você". Code, comments, commits and these documents are in English.
- Short and playful. An instruction starts with what to do: "Segure para carregar", "Aperte rápido!", "Toque para usar".
- A power has a name and one line on what it does (`strings.powers` and `strings.powerHints`). Both are shown together whenever the power is introduced.
- Every word is in `strings.pt-BR.ts`. Emoji used as pictures are in `shared/powers.ts`.

## Sound

- Impacts are samples, the music is recorded tracks, and everything else is synthesised (`audio/AudioEngine.ts`).
- The soundtrack follows where the players are:

  | Where | Track (`apps/web/public/music/`) |
  | --- | --- |
  | Main menu | `title` |
  | Lobby, and the results | `lobby`, which picks up where it left off |
  | A match | `battle-a` and `battle-b`, taking turns one match each, from the top |
  | The last round, which counts double | `rio-rumble`, from that round's roulette |
  | The winner, and the table after | `title`, from the top: the game's own theme is the victory lap |

- One track fades into the next; nothing cuts. Music sits under the effects, ducks for big moments (a gacha, an explosion) and goes muffled in slow motion.
- If a track's file is missing, a synthesised tune stands in, so the game is never silent.
- **The announcer is a stadium voice, and the loudest thing in the game.** His lines are recorded (`strings.announcer`, `pnpm voice`) and played deeper than recorded, doubled, pushed into grit, squashed flat and thrown into a big hall with an echo after it; the big lines land with a low boom, and the music gets out of the way. He speaks only at the moments the whole room should look up: the next game and its name, the countdown, the lava's alarm, the final round, the end of a round and of the match, the winner, a SUPER and its curse, the revenge swap, a chain of explosions. A new line has to be one of those moments, or he becomes noise.
- Sound follows size: a bigger charge whooshes longer and louder, a bigger blast booms longer, and each link of a chain reaction thumps higher.
- Every event that matters is heard as well as seen. S mutes.

## Checklist for anything seen or heard

1. Every colour, size token and duration comes from `tokens.ts` or `motion.ts`. The stylesheets contain no raw colour and no raw milliseconds: `grep -rnE "(^|[^a-zA-Z0-9_-])[0-9.]+m?s\b|#[0-9A-Fa-f]{3,8}\b" apps/web/src --include="*.css"` finds nothing.
2. Every word is in `strings.pt-BR.ts`, in Portuguese.
3. It pops in and squishes out. Nothing appears, moves or leaves without animation, and no particle fades.
4. A player is shown as colour and shape together.
5. The effect is as big as what happened, and no bigger than its neighbours on the ladder above.
6. Anything that can hurt is announced before it lands: on the floor where it will be, or on the thing itself where everyone can watch it.
7. No full-screen flash, and nothing pulses faster than `alarm`.
8. On the phone: it works without looking, a held thumb is not dropped (not by a new game, not by its card), a button is drawn only in a game that uses it and says what it does there, and nothing overlaps on any phone shape in the browser tests.
9. It was opened and looked at, on the TV and on a phone-sized screen. Passing tests do not show that it looks right.
10. Every pet can still be found at a glance: checked with a pale pet, a charcoal pet and all six seat colours, in a six-player round with everyone spread out, and nothing in the HUD covers a pet's name tag. Nothing recolours a pet's ring or name tag.
11. A new map: its floor is pale, its palette is its own block in `tokens.ts`, its props are plain shapes in the toy look, and it has a row in the table of maps.
