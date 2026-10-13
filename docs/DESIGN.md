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
- **The name tag** over it is filled with the seat colour and points down at the pet. From a sofa it is a flag, not a label. A tag never stays over another pet: when the camera is far and pets stand one behind another (a lane of Batatinha Frita, the grid of a race), a tag over one head would lie across the pet behind it, so after a quarter of a second it moves to one side of its own pet, level with its middle, and points across at it; it goes back over the head when that has been free for a second. In a crowd where any place would cover somebody it keeps the best place and lets go of its name, down to the seat's colour and shape (`TAGS` and `standTags` in `stages/GameStage.ts`).

And the stage is built so those read:

- **Whatever pets walk on is pale, in every game.** The brawl's platform is a clean, cool white (`floor`, `floorDark`), with no colour of its own to compete with a pet's or a seat's. Every pet and all six seat colours stand out on it, and a white pet is held by its ink line and its ring. The old floor was cream, which is the colour family most pets are made of. A darker green-blue floor was tried and turned down: white reads better. The clouds below are tinted toward the sky (`cloud`), so the platform's edge is the brightest line in the picture. A game's map gets its character from what surrounds the floor (rim, props, sky, light), not from the floor: a themed floor would undo this. Where the floor itself takes colour as part of the game, the colour is lightened until a ring of that same colour still shows on it.
- **Pets are drawn a little bigger than the body the simulation pushes around** (`MODEL_SCALE` in `pets/PetView.ts`), so they read from across a room.
- **The camera stays as close as the fight allows** (see Camera below).

What a pet does to show how it feels (turning its head, jumping, swaying with stars, hopping, hanging its head) is drawn above where it is: its place on the floor, its ring and where its name tag hangs do not move with any of it. Every one of those durations is in the `feel` block of `motion.ts`, and with "Menos tremor e brilho" on a dizzy pet sways half as far.

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
| `victory` (1.3 s) | The beat the word VITÓRIA! has before the winner's name takes its place |
| `feel` (a block) | How long a pet's reactions last on the TV: the pose held by a hit (80, 100 or 120 ms), seeing stars, a cheer, a slump, a glance at what just happened |
| `padMotion.drift`, `slam`, `burst` | On the phone: the background's slow drift, a moment landing with weight (a power, the place, the champion's card), and confetti thrown from the pad |
| `landing` (380 ms) | The roulette's reel dropping back onto the game with a clunk, and the picture it stopped on swelling, before it is carried to the top of the card |
| `iris` (420 ms) | The curtain between worlds closing to a point, and opening |
| `title`, `results`, `roundResults`, `feed` | The few timed sequences: the title's letters, the rows of the results, the places of a round, how long a feed line stays |

Rules:

- On the TV, wrap anything that can leave in `Presence` (`host/hud/Presence.tsx`) so it squishes out instead of vanishing. On the phone, `present` in `controller/pad.ts` does the same. No box is ever up with nothing in it: a list, a table or a banner grows as its rows or letters arrive. And the picture never jumps because a panel came or went: the room the camera has is slid to on a spring.
- Something that appears only when it matters (the power button, a hand over a pet in reach) is itself the message. Do not also leave a greyed-out copy on screen the rest of the time.
- **One world is never seen snapping into another.** A curtain of ink closes to a point just before the map changes (as the roulette stops, before the podium, on a rematch and on the way back to the lobby) and opens once the new world has been drawn. It closes on the simulation's clock and opens on the stage's word, so a slow frame cannot show the join. It is slow and dark, which is why it is not a flash; the players' cards stay above it.
- **The roulette keeps its promise.** The reel slows and stops on the game that will be played, a moment before that game's card. The game is drawn when the reel starts; phones are not told until it stops.
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
| Right, as a round ends | The round's places, best first: shape, name, what the game counted for that player where it counts anything (tiles, food, the share of the way, counting up as the row arrives) and what the round paid, the winner's row in gold. It arrives a second after the round ends, so the winner has the screen first |
| Top centre, at the end | "E o campeão é…" while the drums roll. When the winner drops in, the 3D word VITÓRIA! has that place for one beat (`victory`); then the winner's name in the winner's colour takes it. The camera frames the podium in what the banner leaves free | The name's letters arrive with its box and the verb after the name, so the box is never up with nothing in it.
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
- A game may put one word across the pad for a moment that matters ("stop", the colour to run to). It is the only text a player should ever have to read mid-round. As a round ends the same place says how the player did: their place and what it paid.
- Until the joystick has been used once, a dashed ring with a knob shows where the thumb goes. After that the left half is empty again: the joystick appears under the thumb, wherever it lands.
- The left half is the joystick, which appears under the thumb wherever it lands. The right half is A and B, and a touch presses whichever is nearer.
- **A thumb that is down stays down.** When the pet is grabbed, let go or knocked out, the joystick stays where it is. It goes dim while nothing listens to it.
- **A control is on screen only while it does something, and says what it will do.** B turns gold with a hand when something is in reach and shows a throw while carrying. The power button exists only while a power waits, with a card naming the power and what it does. A shows a ring while it rests after a dash.
- Each mode owns the whole screen: alive in the seat colour, ghost pale, carried shaking with one instruction, lever gold, ZICA purple and lime.
- iPhones cannot vibrate from a web page, so every vibration also pulses the pad's border, as big as what happened: a thin line for a tap, the whole border and a small jolt for a hit, thick, in the danger colour and jolting the whole pad for a knockout, gold with confetti for a win. A power lands on its button bigger than a pop, with confetti in its colour from behind the button.
- Nothing on the pad is cut away, any more than on the TV. A piece that leaves squishes out first (the card between games, the word mid-round, the power button and its card, the lobby's panel, the lever, the results); a label that changes pops; when the roulette stops, the card lands again with the game's name, a button that game does not use squishes out and A's new face pops; the results arrive a piece at a time, the place landing hardest. One thing at a time has the middle of the pad: the round's place is gone before the next game's card comes.
- The pad is never perfectly still, or it reads as a form: the seat's shapes drift slowly across its background, the shape on the name strip breathes, and the picture on the card between games rocks while it waits. Each is a layer that only moves (a transform, nothing repainted), so an old phone pays next to nothing for it.
- None of this moves a control, changes its size or how a thumb is read, and a held thumb is never under something that is being replaced.
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
- **Maps.** Each game has its own world (`stages/maps/`): its floor, what surrounds it, its sky and light, and its props. The floor is the game's tiles. Everything round it is **modelled in Blender by a script** (`tools/blender/maps/<map>.py`, built with `pnpm models`): chunky toys with fat bevels, no thin parts and nothing realistic, because the game shades in three flat tones with a dark outline and what reads is the silhouette. Nothing is downloaded and nothing is modelled by hand, so every model can be rebuilt and reviewed as a diff. A model carries no colour of its own: each piece names a key of `maps.<map>` and is painted from the tokens. What the round itself moves (a bomb, food, a sofa that falls) is a template the map's code places; what only has to look alive (a swing, a speaker, a flag) is animated in Blender and loops. `tools/blender/README.md` has the rules of the look. A map arrives: its floor ripples in from the middle and its scenery grows out from the middle to its places. When a floor grows after its scenery was modelled, the scenery is not modelled again: the map scales it to the new floor (`fitScenery` in `stages/kit.ts`), and whatever must keep its size (spectators, what the round drops, particles) stays outside the scaled group. What is on screen now:

  | Game | Floor | Around it | Sky |
  | --- | --- | --- | --- |
  | Bate-Bate | White checker | High over a sea of sculpted cloud in layers out to the horizon, darker with depth, that drift at different speeds, and through its gaps a land far below: fields, a river, a sea, a small town. Floating islands stand wide of the floor (a windmill whose sails turn, a cottage with a path, a bench and washing on a line, trees), with hot-air balloons, loose rocks, gulls, a kite, and a toy biplane towing a string of pennants. Eight watchers stand on the islands and in the balloons' baskets: they follow the fight, start at a blast, watch a pet fall and cheer a knockout. A blast rocks the nearest balloon, scatters the gulls and races the windmill. On the last round it is night: the scenery dims toward dusk, windows light up here and in the town below, paper lanterns climb out of the clouds, fireflies come out and a star falls now and then. The barrel is a toy keg with ink hoops, a fuse and a comic-book bang on its lid; the Mystery Cube is gold with a question mark on every face and comes down under a parachute; a meteor is a dark rock with glowing craters and a tail of fire | Day; night when it is the last round |
  | Batata Quente | A pale steel frying pan, with two wide rings a shade deeper | The pan's rolled rim (the wall, kept low so it hides nobody) and its riveted handle; a cast-iron grate over teardrop flames that stand taller as a fuse runs out; a stove with knobs, cold burners, a pot whose lid rattles, a kettle coming to the boil, a wooden spoon, a salt shaker and a pepper mill. Spectators stand on tins round the back and the sides and on the pan's handle, and watch whoever has the bomb. A kitchen timer behind the pan has the fuse for its hand: once round the dial and it is over. Fat spits at the pan's edge. When the bomb goes off, everything on the stove hops. The bomb rides on its holder's head, and the holder's name moves up to make room | Pink evening |
  | Batatinha Frita 1, 2, 3 | A pale green lane with white lines and a chequered finish, inside a kerb | A playground in a park that is somewhere: a street with houses and an ice-cream van beyond the fence, hills behind. The giant cat (the cat pet, drawn big, with a white outline since it is nobody's) sits in a sandbox behind the middle of the lane. **When the cat turns to look, the whole park stops dead**, and starts again with the song: the swings in mid-air, the merry-go-round, the seesaw, a dog chasing its ball, birds on the fence, ducks on the pond, butterflies, pinwheels, the van, and every one of the ten spectators (on the bench, the slide tower, crates behind the fence, a swing, the merry-go-round and a spring horse). They wince when someone is caught and cheer a finish. A strip down each side of the lane is green while the cat sings and red while it looks | Day |
  | Come e Cresce | White and pale red gingham, with a scalloped red hem | A table of planks laid for a picnic, everything giant beside the pets, stepping up each side from cutlery to the tallest piece at the back corner: a sandwich, half a watermelon and a wicker basket on the left; cheese, a teapot, a layer cake and a jug on the right; a far row on the horizon, and a garden far below the table's edge. Eight guests on the basket, the sandwich, the cheese, bottle caps and the jam watch whoever is biggest, clap a big mouthful and a pet growing, and flinch at a bite. The jelly shakes when food lands near it, the teapot whistles a jet of steam when someone grows a size, the ants march between basket and cookie and scatter at a bite, and over the round the cake loses its slices and the cookie is nibbled away. Food is chunky and bright, each kind its own shape, held up to the camera the way that shows it; the pepper wears the curse colours | Day |
  | Cor Certa | Sixteen patches in four pale colours (orange, lemon, grape, mint), each with its fruit lying on it, so a colour is never told by hue alone. The camera keeps the whole floor in the picture, clear of the clock and the players' cards: a patch nobody can see cannot be run to | A stage floating in space with a rail for a rim (the wall; it takes the called colour). Speaker stacks at the sides with the called fruit resting on them, a DJ behind a desk with a turntable and a meter at each end, a light tower and a mirror ball on two pods where dancers dance. When a colour is called every light on the stage takes it, the meters jump and confetti of it goes up from the pods; at the drop the speakers kick and a rocket fires; each wave the stage plays a little faster and rests a little dimmer (the speakers never thump faster than 2.5 times a second). Round it: a giant banded planet behind the DJ, a belt of rocks, comets, a satellite, a flying saucer with a passenger and a conga line of stars. Under a dropped patch there is only space | Space |
  | Corrida Maluca | Pale mint and lemon blocks, with a chequered stretch before the line | The track stands on striped stilts, each in its own puff of cloud, over a sea of cloud that runs to the horizon and a patchwork of fields and a river far below. The track is drawn afresh every round, so everything along it is placed from the round and nothing assumes where it runs: a green start arch off the side it starts from and a gold chequered finish arch past its end, which is always a back corner; a flag outside every corner whose cloth points the way to turn (moved to the corner's side wherever the usual place would hang its cloth over the track), and one just past every obstacle that has another after it; a starting grid two abreast and three rows deep, far enough apart that six rings can each be seen; a stilt under each stretch between two obstacles, never under one; the grandstand beside the last stretch on its outer side, which is always open sky (behind the floor, or off its side); and a marshals' tower behind the floor, wherever is farthest from the start and from the grandstand: nothing stands beside six pets being found by their players. Eleven spectators (none the same animal as a racer) cheer the start, clap the first pet past each flag, flinch at a fall or a pet swept away, and watch the leader. A flag whips when a pet passes it, a bar's post jolts when it sweeps one, the windmill turns faster as the leader nears the line, and at a finish a light runs along the arch's lamps and the grandstand throws confetti. In the sky: a blimp, a balloon race far below, a biplane towing a banner, gulls under the track. The bars that sweep are striped in the danger colour: they are the one real danger here | Morning |
  | O Chão é Lava | Pale stone at first; then the furniture itself, whose every top is pale (linen cushions, a cloth on the table, a mattress) over teal and wood sides, because the pets spend the round standing on it. Each piece is a chunky toy of its own shape, told apart at a glance: a square pouf and an armchair (one seat), a low table (two), a sofa (three), a bed (four). Its top is flat and exactly the rectangle the game counts: what makes it a sofa (arm rolls, a back roll, pillows) stands no more than a hand above the top and is hidden inside whatever lands on it. A piece is outlined in gold, at the height it will stand, from the moment its layer is called; it falls from high over that outline in its last 0.65 s, lands with a squash, dust and a small shake on a plain dark leg of its own (so a piece that hangs out past the layer below is standing on something), and is gone when the lava is well over it | A crater, and a sea of lava that rises and never stops. The pets climb, and the picture stays with them: it is the sea and everything standing in it (the wall of basalt columns with its lava falls and glowing cracks, a tiered volcano, a dinosaur's skeleton, nine spectators on their columns, three lava creatures that surface to watch) that rise together, while the slab and the pile sink into them. Before each layer is taken the alarm builds: the volcano trembles, swells and smokes harder, the boulders tremble, the cracks brighten and the current quickens; when it is taken the volcano's fountain stands up, and when a pet is burnt the skull clatters. Once the slab is under, the lava round the pile bubbles and spits, so that it is never a flat colour. The sea is brighter than white so it glows, and what stands in it is edged in a deep red no seat has; ash falls at the sides, never over the pile | Night |
  | Pinta o Chão | White paper; a painted tile is its player's colour, lightened | The paper is taped to a green cutting mat on an artist's desk, under a wall with a window, pinned drawings, an easel and a wooden figure. Eight guests sit on the ruler (a bench behind the paper), the sketchbook, a block of notes and the palette, and watch a falling bucket or else whoever leads. A tin of paint for each player colour stands at the ends of the back, clear of the timer. The lamp's head turns toward the leader, and only sweeps while the count is hidden, so it gives nothing away. When a bucket is kicked over, the kicker's tin hops and spills, the tube squirts their colour, the wind-up robot jumps, the paper plane is thrown across the desk and two splats land on the mat and stay. A drinking bird dips into the glass faster and faster as the round runs out | Morning |

- **A world is alive when someone in it cares what happens.** Every map has spectators (`maps/crowd.ts`): pets nobody is playing, standing on something the map gives them (tins, balloons' baskets, a grandstand, the speakers), who idle out of step, fidget, turn to watch what matters, clap, flinch and cheer with the round's events, each a moment after its neighbour. They are never to be taken for players: they stand off the floor and never at its front edge, they are smaller than a player's pet, their outline is white with no seat colour, and they have no ring and no name. Beyond them, a map's scenery answers the round and does not only loop: what stands near a blast jumps, a timer shows a fuse, a volcano erupts with the flood, a park stops dead when the cat looks. A loop that bobs is the least a thing can do.

- **The winner's stage** stands on a clean platform at night, and is built to be seen from the front: a round velvet rug with a gold edge; a podium of moulded steps with 1, 2 and 3 on upright plates; behind it an arch of lights open to the night sky, with a velvet curtain drawn back at each side; lamps on the arch's towers and the curtain rods; a trophy cup, balloons, and a confetti cannon at each side. An audience of twelve sits on two tiers under each curtain, and no face in it is a pet anyone played. Everything answers each place as it is shown: the lamps swing to it, a ripple runs round the footlights from that step, the arch's lights race, the cup spins and hops, the audience looks and claps. For the winner the audience cheers in waves, the cup lifts off its stand, and balloons are let go, a flight of them and then one after another. It pops in piece by piece, rug first.

- **Camera.** Tilted 52° down through a narrow lens. In a round it frames the living pets and nothing more (a ghost's cursor and a falling cube pull it a little), so it is as close as the fight allows and moves in and out with it: the platform's empty corners are not worth the pixels. The fit is exact: the farthest pet's name tag stays below the round counter and the nearest pet's ring above the players' cards (the HUD reports what it covers as insets). A map may ask for more to be kept in view (the race keeps the next few metres of track ahead of every pet). It looks a moment ahead along each pet's path, pulls back at once when someone is about to leave the picture and closes in gently, and never comes so close that a fight in the middle has no edge in view. It shakes with impacts in proportion to them and punches in on big moments. The numbers are at the top of `render/CameraRig.ts`.

  A shot of one thing gathers speed as it begins and as it is left (0.45 s) instead of starting at full tilt; the podium opens with the camera already in front of the steps, and the one move left to see is a slow push in while the drums roll. Whenever the world changes behind the curtain the camera is put where it is going at once (`CameraRig.settle`), so the curtain opens on the new picture and not on the end of the way there: leaving the podium for another match or for the lobby is the same. Outside a round the camera may leave that angle for **a shot of one thing, from lower down**, the way a hero is shown: faces instead of the tops of heads. There are three, and no others without a reason as good: the round's winner as the round ends (close, following it, swinging a little from side to side so its face stays in view); a new world while its card is up (from far and low, drifting round it, so the place is seen before the round is); and the podium (from the front, like an audience). The countdown always brings the camera back up to where the game is played from before anyone has to steer.

### How big should an effect be?

| What happened | Pet | World | Camera |
| --- | --- | --- | --- |
| A shove (a tap of A) | Small nudge | A puff of dust | Nothing |
| Nothing in particular | A pet turns its head (its body, on a neck between it and its legs) toward what matters to it just then: a rival at its elbow, the bomb's holder, a cube, a bucket or a sofa coming down, the cat while it looks. It goes on looking for a moment after, so no head snaps back. Coming out of a dash it digs its heels in; a dash that met nothing leaves it winded for a moment | Nothing | Nothing |
| A charged hit | Squash, spin, both hold the pose 80 ms (120 at a full charge) and shudder while they hold it; the one hit gets up swaying, with stars circling its head for a second | Stars thrown the way the blow went, and a ring sized by the charge | Shake scaled by the charge, and a jolt the way the blow went that springs back: a shake goes every way at once and cannot say which |
| A grab | Both hold the pose 100 ms, the caught pet looks scared | Stars, the word PEGOU! | Small shake |
| A thrown pet landing on someone | Both squash and hold the pose 120 ms; the one landed on sees stars | Ring, stars | Medium shake and a jolt |
| An explosion | Thrown, tumbling, and seeing stars once back on their feet; whoever was near jumps, and everyone near turns to look | Bright sphere, smoke, sparks, debris, scorch | Shake, colour fringe, extra glow |
| A SUPER arriving | Its owner changes on the spot; everyone else looks scared | A wide warning on the floor, then a strike and its blast | Close on the owner for the gacha, then shake |
| A jump, and coming back after a fall | Leaves the floor; arrives in a puff with a hop | Dust at the take-off | Nothing |
| A hard landing, and a pet knocked through the air | Squash | A ring stamped into the floor where it lands; puffs trailing behind it in the air | Nothing |
| Swept by a bar | Takes it like any other blow: a flash, a spin, a held pose, then thrown aside and seeing stars | Stars | A small shake and a jolt |
| First over the line | Hops twice, pleased with itself | Confetti in its colour, the word CHEGOU! | A shake |
| Something eaten | Munches, and grows when it has eaten enough; a hop for a slice of melon, red in the face for a pepper | A few crumbs in the eater's colour; a purple puff for a pepper | Nothing |
| A bite that lands | A flash and a held pose, then thrown back, seeing stars | Stars, a puff, the word NHAC! in the biter's colour | Small shake and a jolt |
| Furniture falling into the lava game | Nothing: a pet under a piece is carried up on it | A gold outline of the piece, at the height it will stand, from the moment it is called, swelling slowly; the piece itself only in its last 0.65 s; then dust from under it and the outline squeezing shut | Small shake at each landing |
| The lava's alarm, and the lava | Every pet standing still jumps at the alarm; whoever the lava reaches bursts into sparks | The sea rises all the time. While the alarm sounds, every piece of the layer the lava is about to take wears its outline again, on its top and in the danger colour, beating with the alarm, and trembles (not with "less shake" on): from above a pile does not show which of its layers is the low one, and this is what says "not here". The words SOBE! at the alarm and LAVA! when the layer is taken, over the pile wherever it has got to | Small shake, then a bigger one with a little glow |
| A colour called, and the drop | Whoever stands beside a patch that drops jumps; those on the wrong patch fall | The band round the floor takes the colour and its fruit goes up over the speakers; then every other patch tumbles away | Small shake, then a bigger one with a little glow |
| The bomb changing hands | Every pet turns its head to whoever holds it | Stars and a ring in the new holder's colour; a broken red ring turns under whoever holds it | Nothing; a small shake for a new bomb |
| The bomb going off | Its holder shatters; those close are thrown back | The reach of the blast is drawn round the holder for the last 1.4 s, then an explosion and the word KABUM! | As an explosion |
| The cat turning, and a pet caught | The cat hops round to face the lane, and the pets look at it while it looks; a caught pet goes back to the start in a puff, red in the face, and hangs its head | The count 1, 2, 3 and the word PAROU!; the strips beside the lane go red. For a pet caught: a red puff, stars, the word MEXEU! | Small shake |
| The lava's alarm, in the crater | Nothing | The volcano trembles and swells, boulders tremble, cracks brighten: all of it building until the flood. With "less shake" on, nothing trembles | Nothing beyond the alarm's own shake |
| Something the spectators care about | They turn to it; they clap, flinch or cheer, each a moment after its neighbour | Nothing: they are the effect | Nothing |
| A bucket of paint kicked over | The kicker hops twice | A ring and a burst of cubes in the kicker's colour, as wide as the patch painted | Small shake |
| A round won | The winner dances; the others shake their heads; every bubble says how its pet feels | Confetti in the winner's colour, the word FIM! (small, in the strip between the banner that names the winner and the winner's own name tag, so it never lies across the winner's face), and the round's places listed at the right | Comes down to the winner's eye level, close, and stays with it |
| The count before a round | The pets bounce on their toes at 3, 2 and 1, a little higher each time and each a moment after its neighbour; nobody hops at the word for go, which is when they are steered | The numbers in gold with an ink edge, each bigger than the last, pinned to the middle of the picture (not to the map: a race lines its pets up at one end and the camera goes with them). From the second number on the count steps aside when it would stand on a pet or a name tag | A small nod at each number; none with "less shake" on |
| The roulette stopping, and the game's card | Nothing | The reel slows the way a wheel does, drifts a little past the pointers and drops back with a clunk that jolts its window; the picture it stopped on stays where it is while the reel squishes away, and is carried to the top of the card that pops in round it, with a throw of confetti from behind. On the last round, VALE DOBRADO! is stamped onto the card once the name is spelled out, and the card jolts under it | Nothing |
| A round's places and what they paid | Nothing | The list builds a row at a time, each box growing with what it holds; each row's points punch as the row lands and fly to that player's card with the seat's colour and shape, and the score counts up when they arrive | Nothing |
| A place revealed in the finale | Pops in a hop above its step and lands on it; the step sinks under it and takes its colour; those already up turn to look | Dust and a ring in its colour, as it lands | Small shake |
| The winner | Drops in falling faster all the way down, is flattened for an instant and rings back, bigger than the rest, crowned, dancing; those already on the steps are thrown into the air by the landing; those who missed the podium watch from beside it | Spotlight, the stage's lamps chasing round the podium; dust, confetti from the two cannons and the footlights answer the landing; fireworks, the word VITÓRIA! and then the name | Colour returns; it closes in from the front and swings a little from side to side |
| A knockout | Shatters into cubes in its colours; whoever is near turns to look | Confetti, points fly to the scorer. A pet that went over the edge kicks dust off it and trails puffs on the way down; its pieces come back up over the edge as a fountain, and a ring in its colour is left on the nearest floor, so the room sees where it went | Slow motion for the deciding ones |

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
- **Sounds are balanced by measurement** (`pnpm listen`): an event's sound peaks around -20 dB below full scale, an impact or a blast around -4, and the announcer at full scale. A press always makes a sound that can be heard over the music, however small the move. A new sound is measured before it is kept, and sits within a few decibels of its neighbours.
- **The announcer is a stadium voice, and the loudest thing in the game.** His lines are recorded (`strings.announcer`, `pnpm voice`) and played deeper than recorded, doubled, pushed into grit, squashed flat and thrown into a big hall with an echo after it; the big lines land with a low boom, and the music gets out of the way. He speaks only at the moments the whole room should look up: the next game and its name, the countdown, the lava's alarm, a colour called in Cor Certa, the final round, the end of a round and of the match, the winner, a SUPER and its curse, the revenge swap, a chain of explosions. A new line has to be one of those moments, or he becomes noise.
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
9. It was opened and looked at, on the TV and on a phone-sized screen. Passing tests do not show that it looks right, and a still does not show that something moves well: what moves was filmed (`pnpm look <game> --at=… --video`).
10. Every pet can still be found at a glance: checked with a pale pet, a charcoal pet and all six seat colours, in a six-player round with everyone spread out, and nothing in the HUD covers a pet's name tag. Nothing recolours a pet's ring or name tag. No name tag lies over another pet for longer than a moment (`pnpm look <game> --six` shows the six with their tags).
11. A new or changed map: its floor is pale, its palette is its own block in `tokens.ts`, its scenery is modelled by its script in `tools/blender/maps/` in the toy look (and the `.glb` is rebuilt and committed), nothing tall stands near the front edge or reaches over the floor, and it has a row in the table of maps. It was looked at with `pnpm look <game>`, with `--six`, with `--card`, and its cost with `--perf`.
12. A change to what happens between rounds was filmed (`pnpm look a,b --flow --video`) and watched frame by frame: one world is never seen snapping into another, and nothing is on screen with nothing in it.
