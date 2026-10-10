# Boom Pets: how it looks, moves and sounds

Read this before changing anything a player sees or hears: the TV, the phone, the 3D world, effects, words or sound. It says what the style is and where each value lives. The checklist at the end is what a change is held to.

`docs/GAMEPLAY.md` covers the rules of play. This file covers how they are shown.

## The idea: a toy box

Everything looks like a chunky plastic toy or a sticker stuck on top of the game: thick dark outlines, flat bright colours, hard shadows with no blur, round corners. Nothing is thin, grey, glossy or subtle. If a new element would look at home in a banking app, it is wrong here.

Three things follow from that and never bend:

1. **Nothing appears, moves or leaves without animation.** Things pop in with an overshoot and squish out. Particles shrink to nothing; they never fade.
2. **A player is a colour and a shape, together, everywhere.** Never colour alone.
3. **The size of an effect matches the size of what happened.** A weak action must look weak. (The first playtest had players mashing A partly because a tap looked like a hit.)

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
| `white` | Highlights, and the inside of a button that is not lit |
| `gold` | "Press this", rewards, SUPER, the leader's crown |
| `danger` | Anything about to hurt: overcharge, a throw, warnings on the floor |
| `tierCommon`, `tierRare` | The colour a common or rare power wears on its badge, button and card |
| `tierCursed` with `tierCursedAccent` | Curses and ZICA, always the pair: purple ground, lime words |
| `smoke`, `steel` | Neutral things: smoke, and anything resting or switched off |
| Seat colours | That player, and only that player |

### Players: colour plus shape

Seats are red circle, blue triangle, yellow square, green star, purple diamond, pink cross. Wherever a player is shown, both are shown: the ring under the pet, the name tag, the card in the bottom strip, a line in the feed, and the whole background of that player's phone (colour, with the shape as a faint pattern). `seatShapeSvg` in `shared/glyphs.ts` draws the shape.

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
| Top centre | Round pips and the timer, and nothing else: anything more there hides the far edge of the platform |
| Top left | One explanation at a time, over the sky: a first-play hint, or the card explaining a power |
| Top right | The feed: who knocked out whom, and how |
| Middle | The banner for who took the round |
| Bottom | One card per player: shape, portrait, name, score, luck pips, the power running (with its time left) and the power waiting |
| Over each pet | Its name tag, with a badge for a power it is holding and a hand when a player could grab it |

- One explanation at a time in the top-left slot. A power card outranks a hint.
- The HUD stays off the platform. A panel goes over the sky or along an edge, never over where pets can be.
- A power is always shown as its picture, its name and one line on what it does.
- The 3D scene carries the action. The HUD says who and how much; it does not replay what the scene already showed.

## The phone

It is held without being looked at, so it must work by feel and explain itself in a glance.

- The pad is always landscape. A phone held upright turns the pad itself.
- The left half is the joystick, which appears under the thumb wherever it lands. The right half is A and B, and a touch presses whichever is nearer.
- **A thumb that is down stays down.** When the pet is grabbed, let go or knocked out, the joystick stays where it is. It goes dim while nothing listens to it.
- **A control is on screen only while it does something, and says what it will do.** B turns gold with a hand when something is in reach and shows a throw while carrying. The power button exists only while a power waits, with a card naming the power and what it does. A shows a ring while it rests after a dash.
- Each mode owns the whole screen: alive in the seat colour, ghost pale, carried shaking with one instruction, lever gold, ZICA purple and lime.
- iPhones cannot vibrate from a web page, so every vibration also pulses the pad's border.
- No two controls may overlap on any phone shape. The browser tests check this on the phone shapes they emulate; add new controls to those checks.
- The phone bundle stays small and has no framework: plain TypeScript and DOM.

## The 3D world

- **Shading.** Flat toon shading in three steps, plus a thick outline drawn as an inflated back-facing copy (`render/materials.ts`). A pet's outline is its seat colour. No realistic lighting, no textures beyond the models' own colour map.
- **Pets.** The model plays its own clips. Everything else (squash, stretch, lean, shake, hit spin) is code on wrapper groups above it, driven by springs so it overshoots (`pets/PetView.ts`).
- **The ring under a pet** is that player's exact phone colour. It swells with the charge, turns to the danger colour at the warning, and shrinks grey while A rests.
- **Particles** (`fx/Particles.ts`) are cubes, sparks, round puffs and glows. They pop in, live and shrink. Nothing fades.
- **The floor speaks first** (`fx/Decals.ts`). A danger is always drawn on the floor before it lands: barrels, falling tiles, meteors, the cube. Shock rings on the floor show how far a blast reached.
- **Words in 3D** (`render/Text3D.ts`) are for the few big moments: one or two capitals and an exclamation mark. New words go in `strings.words3d`, then `pnpm font`.
- **Feelings are emoji in a bubble** over the pet. What a pet feels is shown this way, not in the HUD.
- **Camera.** Tilted 52° down through a narrow lens, keeping every living pet in frame. It shakes with impacts in proportion to them and punches in on big moments.

### How big should an effect be?

| What happened | Pet | World | Camera |
| --- | --- | --- | --- |
| A shove (a tap of A) | Small nudge | A puff of dust | Nothing |
| A charged hit | Squash, spin, both hold the pose 80 ms | Stars and a ring sized by the charge | Shake scaled by the charge |
| A grab | Both hold the pose 100 ms, the caught pet looks scared | Stars, the word PEGOU! | Small shake |
| A thrown pet landing on someone | Both squash | Ring, stars | Medium shake |
| An explosion | Thrown, tumbling | Bright sphere, smoke, sparks, debris, scorch | Shake, colour fringe, extra glow |
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

- Impacts are samples; everything else is synthesised (`audio/AudioEngine.ts`).
- Sound follows size: a bigger charge whooshes longer and louder, a bigger blast booms longer, and each link of a chain reaction thumps higher.
- Every event that matters is heard as well as seen. S mutes.

## Checklist for anything seen or heard

1. Every colour, size token and duration comes from `tokens.ts` or `motion.ts`. The stylesheets contain no raw colour and no raw milliseconds: `grep -rnE "(^|[^a-zA-Z0-9_-])[0-9.]+m?s\b|#[0-9A-Fa-f]{3,8}\b" apps/web/src --include="*.css"` finds nothing.
2. Every word is in `strings.pt-BR.ts`, in Portuguese.
3. It pops in and squishes out. Nothing appears, moves or leaves without animation, and no particle fades.
4. A player is shown as colour and shape together.
5. The effect is as big as what happened, and no bigger than its neighbours on the ladder above.
6. Anything that can hurt is drawn on the floor before it lands.
7. No full-screen flash, and nothing pulses faster than `alarm`.
8. On the phone: it works without looking, a held thumb is not dropped, the control says what it will do, and nothing overlaps on any phone shape in the browser tests.
9. It was opened and looked at, on the TV and on a phone-sized screen. Passing tests do not show that it looks right.
