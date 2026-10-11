# Models made in Blender

The game's own 3D models are built by scripts, in Blender, through the socket bridge of Blender's MCP add-on
(the "MCP" extension from Blender Lab; Blender 5.1 or later). Nothing is modelled by hand, so every model can be
rebuilt, changed in a diff and reviewed.

- `kit.py`: the modelling kit. Read its top comment first: the look, the axes, how colours work.
- `maps/<map>.py`: one script per map. It builds the map's scenery where it stands, and the templates the
  game places itself.
- `pnpm models <map>` runs the script in Blender and writes `apps/web/public/models/maps/<map>.glb`
  (committed) and two pictures into `test-results/models/`: `<map>.png`, framed like a round, and
  `<map>-wide.png`, everything that was built. **Look at both after every build.**
- `apps/web/src/host/render/models.ts` loads the file (`new Model('<map>')`), paints every piece from
  `maps.<map>` in `tokens.ts` and outlines it. `maps/potato.py` and `stages/maps/PotatoMap.ts` are the worked example.

## Working on a map

1. Colours first: every colour is a key of `maps.<map>` in `apps/web/src/shared/tokens.ts` (or of the shared
   `colors`). Add the keys you need there; the build stops at a name it does not know.
2. Write or change `maps/<map>.py`. Start with `guide_floor(...)` (the floor the pets walk on, for the pictures
   only) and a few `guide_pet(...)` to judge sizes against.
3. `pnpm models <map>`, then open the two pictures. Repeat until the shapes are right.
4. Use it in `apps/web/src/host/stages/maps/<Map>Map.ts`: add the map to `MODEL_IDS` in `render/models.ts`,
   `new Model('<map>')`, add `model.scene` to the map's group, clone templates with `model.part('name')`,
   call `model.update(dt)` every frame and `model.dispose()` at the end.
5. `pnpm look <map>` plays a round with bots and saves pictures of the real game into `test-results/look/`.
   `--six` stands six pets on it, `--at=2,8,20` picks the moments, `--card` adds the card between rounds,
   `--frames=6 --every=120` takes a burst to judge motion. **A model is finished when it looks right in these,
   not in Blender's pictures.**

To try things in a Blender that stays open between runs (the scene is kept, so it is quicker):

```
/Applications/Blender.app/Contents/MacOS/Blender --background --online-mode --command blender_mcp --port 9877
pnpm models <map> --port=9877
pnpm models --run=scratch.py --port=9877     # any Python; what it leaves in `result` is printed
```

Two things to know:

- A rebuild does not write the same bytes twice, so `pnpm models` always shows the `.glb` as changed in git.
  Commit a model when its script changed, and `git checkout` the rest.
- `join()` puts the new object's origin where its first piece was. A template made with `part()` is placed
  by its origin, so build its first piece round (0, 0, 0).

## Rules of the look

- **Chunky toys.** Bold silhouettes, fat bevels, nothing thinner than about 0.12 m, nothing realistic.
  The game shades in three flat tones with a dark outline, so detail smaller than a pet's ear is noise.
- **The floor stays pale and the pets stay findable.** A map's character lives in what surrounds the floor.
  Nothing saturated lies on the floor itself, and nothing uses a seat colour (`seats` in `tokens.ts`) in a
  way that could be taken for a player.
- **The camera looks down from the front** (tilted 52 degrees). Anything taller than about 0.5 m near the
  front edge of the floor (low Y) hides pets: keep the front low and build height at the back and the sides.
  Nothing may reach over the floor.
- **Only what the game says is dangerous may look dangerous.** Scenery never looks like something to dodge.
- **Cheap.** Under about 40 000 triangles and 150 objects a map. `join()` the pieces of one prop into one
  object; `copy()` repeats share their shape. Tag big ground pieces `outline=0` and `shadow=False`.
- **It moves.** Give the scenery life with `spin`, `sway`, `bob` and `throb` (they loop for ever, each at its
  own pace), and let the map's code drive whatever reacts to the round. Nothing blinks faster than 2.6 times a
  second, and nothing flashes.
- Anything the round itself changes (tiles, rocks that rise, food, the bomb) is placed by the map's code:
  make it a `part()`.
