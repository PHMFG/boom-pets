# Raw asset packs

The unzipped Kenney packs live here and are not committed (see `.gitignore`). Everything is CC0. `pnpm assets` copies the files the game ships into `apps/web/public`.

To restore this folder, download each zip from its page into `assets-raw/zips/` and unzip it into a folder with the name below. Unzip Mobile Controls with `ditto -x -k`; plain `unzip` fails on its "Large (2×)" folder names.

| Folder | Page | What is inside (checked 2026-10-09) |
| --- | --- | --- |
| `cube-pets` | https://kenney.nl/assets/cube-pets | Version 1.0. 24 models as GLB, FBX and OBJ, named `animal-<name>`. One shared texture, `Textures/colormap.png`, referenced by relative path |
| `emotes-pack` | https://kenney.nl/assets/emotes-pack | 30 emotes in 8 styles, pixel and vector, as 32×38 PNGs plus sprite sheets with XML atlases. One SVG holding the whole vector set |
| `impact-sounds` | https://kenney.nl/assets/impact-sounds | 130 `.ogg` files, 26 groups of 5 (`impactPunch_heavy_000.ogg`, `impactWood_light_003.ogg`, `footstep_grass_001.ogg`) |
| `mobile-controls` | https://kenney.nl/assets/mobile-controls | 948 PNGs and 462 SVGs in 8 styles. Reference only: the game draws its own controls |
| `skyboxes` | https://kenney.nl/assets/skyboxes | 5 single-image panoramas, 4096×2048 PNG: day, morning, night, alien, space |

## Pet models

Run `pnpm inspect:pets` for the full report. Summary:

- Each pet is 3 to 7 rigid parts (legs, body, tail, ears) under `animal-<name> > root`. There are no skeletons.
- Every pet ships the same 8 clips, which move, rotate and scale the parts: `static` (0.1 s), `idle` (1 s), `walk` (0.5 s), `run` (0.25 s), `eat` (0.5 s), `dance` (0.5 s), `gesture-positive` (0.25 s), `gesture-negative` (0.25 s).
- There is no dash, hit, fall or win clip. Those motions are code-driven.
- A pet is about 1.25 wide, 1.6 to 2.1 tall and 1.3 to 1.9 deep in model units. The crab (2.4 wide) and the monkey and koala (1.9 wide) are the widest.
