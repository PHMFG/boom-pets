# Batatinha Frita 1, 2, 3: a lane across a playground, with a giant cat sitting behind the middle of it.
# The game draws the lane (its tiles, its lines, the chequered finish and the strip down each side that goes
# from green to red) and the cat. This is the park round them: the kerb the lane sits in, the cat's sandbox,
# bushes, trees, and a playground that keeps moving by itself.
#
# The lane runs left to right and the camera looks down on it from the front, so the near side holds nothing
# taller than a low bush, the back is where the tall things stand, and the cat's sandbox is left open in
# front of it. Nothing reaches over the lane.
import math

from kit import *

# The lane, the finish line and the cat: the same numbers as tuning.frita and FritaMap.ts.
COLUMNS, ROWS = 26.0, 9.0
LEFT, RIGHT, FRONT, BACK = -COLUMNS / 2, COLUMNS / 2, -ROWS / 2, ROWS / 2
FINISH = RIGHT - 3.0
CAT = BACK + 3.4
# The lawn lies this far under the lane, and the cat's feet stand this far under it.
LAWN = -0.56
SAND = -0.3
# Flat things that should be seen face on lean back this far: the camera looks down at 52 degrees.
FACING = 38
# Nothing here moves fast, so its motion is written down 12 times a second instead of 30: the file is a third the size.
FPS = 12
bpy.context.scene.render.fps = FPS

guide_floor(width=COLUMNS, depth=ROWS)
for spot in ((-12, -3, 0), (-12, 0, 0), (-12, 3, 0), (4, 3.6, 0), (11.5, -3.6, 0)):
    guide_pet(spot)
# The cat, two and a half pets big.
place(guide_pet((0, CAT, 0)), at=(0, CAT, SAND + 0.65 * 2.5), scale=2.5)


def paced(seconds):
    """The nearest length that ends on a written frame, so a loop closes without a jump."""
    return max(1, round(seconds * FPS)) / FPS


def grounded(obj):
    """
    Gives a piece the scene's origin for its own. A joined piece is otherwise held by wherever its first part
    happened to be, and turned as that part was: this makes it something to place by its foot, or to hinge where it was built.
    """
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix()
    return obj


shapes = {}


def again(kind, name, make):
    """
    One shape for everything of a kind: the first is made, the rest are copies of it, which add nothing to the file.
    `make` builds it round the origin; whoever asks puts it in its place.
    """
    if kind in shapes:
        return copy(shapes[kind], name, at=(0, 0, 0), rot=(0, 0, 0), scale=1)
    shapes[kind] = made = grounded(make())
    made.name = name
    return made


def ground(obj):
    """Something lying flat on the lawn: no outline, and it casts nothing."""
    return tag(obj, outline=0, shadow=False)


def blob(radius, color, at, seed, squash=(1.2, 1.0, 0.8), detail=3):
    """A soft lump of leaves."""
    return rock('blob', radius, color, at=at, seed=seed, rough=0.12, scale=squash, detail=detail, smooth=80)


# ── The ground ───────────────────────────────────────────────────────────────
ground(box('lawn', (72, 54, 1.0), 'lawn', at=(0, 2, LAWN - 0.5), bevel=0))
# Mown patches a shade deeper, so the lawn is not one flat green.
patches = []
for index, (x, y, wide, deep) in enumerate((
    (-19, 1.6, 4.6, 3.6), (-9.5, 10, 4.2, 2.6), (10.8, 9.6, 4.4, 3.2), (17.5, 0.5, 4.2, 3.4), (-21, 9.5, 3.2, 2.4), (21, 9, 3.0, 2.4),
    (-6, -8.5, 5, 1.6), (7, -8.6, 6, 1.5), (0, 13.6, 7, 1.6), (-15, -7.6, 3.4, 1.4), (15.5, -7.8, 3.8, 1.4),
)):
    patches.append(place(cylinder('patch_%d' % index, 1.0, 0.03, 'lawnDark', at=(x, y, LAWN + 0.012), sides=18), scale=(wide, deep, 1)))
ground(join('patches', *patches))

# The kerb the lane sits in. The game lays its green-and-red strips along the top of the long sides.
kerb = [box('kerb_%d' % index, (COLUMNS + 1.0, 0.5, 0.52), 'kerb', at=(0, side * (BACK + 0.25), LAWN + 0.24), bevel=0.08, segments=1) for index, side in enumerate((-1, 1))]
kerb += [box('kerb_end_%d' % index, (0.5, ROWS + 0.2, 0.52), 'kerb', at=(side * (RIGHT + 0.25), 0, LAWN + 0.24), bevel=0.08, segments=1) for index, side in enumerate((-1, 1))]
tag(join('kerb', *kerb), outline=0.04, shadow=False)

# ── The cat's sandbox ────────────────────────────────────────────────────────
# A wooden frame with the sand a step down inside it. The cat sits in the middle, and the toys keep to the corners.
HALF_X, HALF_Y = 3.55, 2.65
frame = [box('beam_%d' % index, (HALF_X * 2 + 0.5, 0.5, 0.56), 'wood', at=(0, CAT + side * HALF_Y, LAWN + 0.28), bevel=0.12) for index, side in enumerate((-1, 1))]
frame += [box('beam_side_%d' % index, (0.5, HALF_Y * 2 + 0.5, 0.56), 'wood', at=(side * HALF_X, CAT, LAWN + 0.28), bevel=0.12) for index, side in enumerate((-1, 1))]
frame += [cylinder('beam_post_%d' % index, 0.42, 0.74, 'trunk', at=(x * HALF_X, CAT + y * HALF_Y, LAWN + 0.37), sides=10, bevel=0.08) for index, (x, y) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]
tag(join('sandbox', *frame), outline=0.045)
sand = [box('sand', (HALF_X * 2, HALF_Y * 2, 0.3), 'sand', at=(0, CAT, SAND - 0.15), bevel=0)]
sand += [ball('heap_%d' % index, size, 'sand', at=(x, CAT + y, SAND - 0.05), scale=(1.3, 1.0, 0.4), detail=2) for index, (x, y, size) in enumerate(((-2.4, 1.7, 0.9), (2.3, 1.9, 1.1), (0.4, 2.2, 0.7)))]
tag(join('sand', *sand), outline=0.03, shadow=False)

# A sandcastle with a flag, front left.
castle = [cylinder('castle', 0.62, 0.3, 'sandDark', at=(0, 0, 0.15), sides=12), cylinder('keep', 0.42, 0.7, 'sandDark', at=(0, 0, 0.6), sides=10)]
for index in range(4):
    turn = math.radians(45 + index * 90)
    castle.append(cylinder('turret_%d' % index, 0.2, 0.62, 'sandDark', at=(math.cos(turn) * 0.5, math.sin(turn) * 0.5, 0.46), sides=8))
    castle.append(box('crenel_%d' % index, (0.2, 0.2, 0.18), 'sandDark', at=(math.cos(turn + 0.78) * 0.3, math.sin(turn + 0.78) * 0.3, 1.02), bevel=0))
castle.append(pipe('castle_pole', [(0, 0, 0.9), (0, 0, 1.55)], 0.05, 'trunk', sides=5))
castle.append(slab('castle_flag', [(0, 0), (0.48, -0.16), (0, -0.34)], 0.06, 'coral', at=(0.04, 0, 1.55), rot=(90, 0, 0), bevel=0))
tag(place(grounded(join('sandcastle', *castle)), at=(-2.5, CAT - 1.6, SAND)), outline=0.035)

# A bucket and a spade, front right.
pail = lathe('bucket', [(0, 0), (0.3, 0), (0.44, 0.6), (0.5, 0.62), (0.5, 0.7), (0.4, 0.7), (0.38, 0.62), (0, 0.62)], 'coral', sides=12)
grip = pipe('bucket_handle', arc((-0.46, 0, 0.66), (0.46, 0, 0.66), 0.5, steps=6), 0.05, 'cream', sides=5)
tag(place(join('bucket', pail, grip), at=(2.55, CAT - 1.7, SAND), rot=(0, 0, 25)), outline=0.035)
blade = slab('spade', [(-0.2, 0), (0.2, 0), (0.24, 0.5), (0, 0.62), (-0.24, 0.5)], 0.08, 'teal', bevel=0)
shaft = box('spade_shaft', (0.1, 0.8, 0.1), 'wood', at=(0, -0.38, 0), bevel=0)
knob = box('spade_grip', (0.36, 0.12, 0.12), 'wood', at=(0, -0.8, 0), bevel=0)
tag(place(join('spade', blade, shaft, knob), at=(3.0, CAT - 0.4, SAND + 0.5), rot=(-70, 0, 20)), outline=0.035)

# A ball of yarn at the back, for when the song is over.
wool = [ball('yarn', 0.62, 'coral', detail=3)]
wool += [ring('yarn_wrap_%d' % index, 0.6, 0.06, 'petal', rot=rot, sides=16, around=5) for index, rot in enumerate(((70, 0, 0), (70, 0, 55), (20, 60, 110)))]
wool.append(pipe('yarn_end', [(0.5, 0, -0.5), (1.0, 0.2, -0.56), (1.4, -0.1, -0.56), (1.8, 0.25, -0.56)], 0.06, 'petal', sides=5))
tag(place(join('yarn', *wool), at=(-2.5, CAT + 1.3, SAND + 0.6)), outline=0.035)

# ── Green things ─────────────────────────────────────────────────────────────
def bush(kind, small):
    """Three lumps of hedge, the middle one the biggest. Kind 2 is in flower. A small one is drawn at half the size, and is made of less."""
    main, side = ('hedge', 'hedgeDark') if kind != 1 else ('hedgeDark', 'hedge')
    detail = 2 if small else 3
    lumps = [blob(0.95, main, (0, 0, 0.5), 10 + kind, detail=detail), blob(0.7, side, (-1.0, 0.12, 0.34), 20 + kind, detail=detail), blob(0.64, main, (0.98, -0.1, 0.3), 30 + kind, detail=2)]
    if kind == 2:
        lumps += [ball('bloom_%d' % index, 0.14, 'petal', at=at, detail=1, smooth=80)
                  for index, at in enumerate(((-0.2, -0.75, 0.9), (0.5, -0.6, 0.95), (-1.1, -0.45, 0.62), (1.1, -0.6, 0.5), (0.1, -0.2, 1.24), (-0.6, -0.3, 1.1)))]
    return tag(join('bush', *lumps), outline=0.045)


# A hedge of them along the back of the lane, leaving the cat's sandbox open, and a low row along the front.
for index, (x, y, kind, size, turn) in enumerate((
    (-12.2, 6.2, 0, 1.0, 0), (-9.7, 6.35, 2, 0.95, 180), (-7.3, 6.15, 1, 1.0, 10), (-5.1, 6.3, 0, 0.9, 170),
    (5.1, 6.3, 1, 0.9, 5), (7.3, 6.15, 2, 1.0, 0), (9.7, 6.35, 0, 0.95, 190), (12.2, 6.2, 1, 1.0, -8),
    (-13.6, -6.1, 1, 0.56, 0), (-10.6, -5.95, 0, 0.6, 180), (-7.2, -6.1, 2, 0.58, 0), (-3.7, -5.95, 1, 0.6, 180), (-0.3, -6.1, 0, 0.56, 0),
    (3.2, -5.95, 2, 0.6, 0), (6.7, -6.1, 0, 0.58, 180), (10.1, -5.95, 1, 0.6, 0), (13.5, -6.1, 2, 0.56, 0),
)):
    small = size < 0.8
    place(again('bush_%d%s' % (kind, '_small' if small else ''), 'bush_%d' % index, lambda: bush(kind, small)), at=(x, y, LAWN), rot=(0, 0, turn), scale=size)


def flowers(kind):
    """A handful of daisies lying in the grass, each with five round petals: white ones, or pink."""
    heads = []
    for index, (x, y, size) in enumerate(((0, 0, 0.27), (0.56, 0.32, 0.21), (-0.5, 0.28, 0.22), (0.22, -0.5, 0.22), (-0.4, -0.4, 0.19), (0.78, -0.22, 0.18))):
        petals = [(math.cos(math.radians(step * 18 + index * 25)) * size * (0.74 + 0.26 * math.cos(math.radians(step * 90))),
                   math.sin(math.radians(step * 18 + index * 25)) * size * (0.74 + 0.26 * math.cos(math.radians(step * 90)))) for step in range(20)]
        heads.append(slab('petals_%d' % index, petals, 0.05, 'white' if kind == 0 else 'petal', at=(x, y, 0.1), bevel=0))
        heads.append(ball('eye_%d' % index, size * 0.4, 'pollen', at=(x, y, 0.13), scale=(1, 1, 0.6), detail=1, smooth=80))
    return tag(join('flowers', *heads), outline=0.03, shadow=False)


for index, (x, y, kind, turn) in enumerate((
    (-11.9, -6.1, 0, 0), (-8.9, -6.2, 1, 40), (-5.4, -6.0, 0, 90), (-2.0, -6.2, 1, 10), (1.5, -6.05, 0, 200), (5.0, -6.2, 1, 120), (8.4, -6.05, 0, 30), (11.8, -6.2, 1, 80),
    (-4.6, 8.2, 1, 0), (4.6, 7.6, 0, 60), (-15.4, 5.4, 0, 20), (15.8, 4.6, 1, 100), (-19.8, -3.2, 1, 0), (19.4, -3.2, 0, 45), (-13.2, 9.2, 0, 70), (14.2, 12.2, 1, 0),
)):
    place(again('flowers_%d' % kind, 'flowers_%d' % index, lambda: flowers(kind)), at=(x, y, LAWN), rot=(0, 0, turn))


def tree(index, x, y, size, turn, pace):
    """A fat tree: a trunk, and a canopy of three lumps that rocks a little in the wind, each tree at its own pace."""
    trunk = again('trunk', 'trunk_%d' % index, lambda: tag(lathe('trunk', [(0, 0), (0.56, 0), (0.4, 0.45), (0.32, 1.7), (0.4, 2.2), (0, 2.2)], 'trunk', sides=10), outline=0.05))
    canopy = again('canopy', 'canopy_%d' % index, lambda: tag(join('canopy', blob(1.75, 'leaf', (0, 0, 0), 3, squash=(1.1, 1.1, 0.92)), blob(1.2, 'leafLight', (-1.15, -0.6, -0.35), 5),
                                                                    blob(1.15, 'hedge', (1.2, 0.3, -0.45), 7), blob(0.9, 'leafLight', (0.5, -0.9, 0.75), 9, detail=2)), outline=0.06))
    sway(place(canopy, at=(0, 0, 3.3)), 2.2, paced(pace), axis=1)
    return place(group('tree_%d' % index, trunk, canopy, at=(x, y, LAWN), rot=(0, 0, turn)), scale=size)


tree(0, -20.8, 8.6, 1.0, 0, 5.2)
tree(1, -14.6, 11.8, 0.9, 120, 4.4)
tree(2, -5.9, 11.9, 0.86, 240, 4.9)
tree(3, 5.9, 12.1, 0.9, 60, 5.6)
tree(4, 17.8, 11.6, 0.95, 180, 4.6)
tree(5, 21.4, 6.4, 1.0, 300, 5.0)
tree(6, -23.8, -2.8, 0.9, 30, 4.2)
tree(7, 22.6, -2.4, 0.86, 200, 5.4)

# A kite caught in the tree to the left of the sandbox. It flaps, and its tail swings under it.
sail = slab('kite', [(0, 0.75), (-0.5, 0.1), (0, -0.75), (0.5, 0.1)], 0.07, 'coral', bevel=0)
spars = [box('kite_spar', (0.07, 1.5, 0.09), 'cream', bevel=0), box('kite_cross', (1.0, 0.07, 0.09), 'cream', at=(0, 0.1, 0), bevel=0)]
tail = [pipe('kite_tail', [(0, -0.75, 0), (0.15, -1.2, 0), (-0.1, -1.7, 0), (0.12, -2.2, 0)], 0.04, 'cream', sides=4)]
tail += [slab('kite_bow_%d' % index, [(-0.22, 0.12), (0, 0.03), (0.22, 0.12), (0.22, -0.12), (0, -0.03), (-0.22, -0.12)], 0.06, 'teal', at=(x, y, 0), bevel=0) for index, (x, y) in enumerate(((0.15, -1.2), (-0.1, -1.7), (0.12, -2.2)))]
kite = tag(join('kite', sail, *spars, *tail), outline=0.04)
sway(place(kite, rot=(0, 0, 24)), 9, paced(1.9), axis=2)
group('kite_hold', kite, at=(-5.0, 10.9, LAWN + 4.4), rot=(FACING, 0, 0))

# Two little trees clipped into balls, in pots, at the back corners of the sandbox.
for index, x in enumerate((-4.7, 4.7)):
    def topiary():
        pot = lathe('pot', [(0, 0), (0.42, 0), (0.56, 0.6), (0.62, 0.62), (0.62, 0.74), (0, 0.74)], 'coral', sides=10)
        stem = cylinder('stem', 0.12, 1.0, 'trunk', at=(0, 0, 1.2), sides=6)
        return tag(join('topiary', pot, stem, ball('clipped', 0.9, 'hedgeDark', at=(0, 0, 2.3), detail=3), ball('clipped_low', 0.55, 'hedge', at=(0, 0, 1.25), detail=2)), outline=0.045)
    place(again('topiary', 'topiary_%d' % index, topiary), at=(x, CAT + 2.9, LAWN))

# A picket fence along the back of the park.
for index in range(14):
    def panel():
        pickets = [box('picket_%d' % step, (0.3, 0.09, 0.95), 'white', at=(-1.75 + step * 0.5, 0, 0.5), bevel=0) for step in range(8)]
        rails = [box('rail_%d' % step, (4.0, 0.07, 0.13), 'white', at=(0, 0.06, 0.3 + step * 0.42), bevel=0) for step in range(2)]
        return tag(join('fence', *pickets, *rails), outline=0.035)
    place(again('fence', 'fence_%d' % index, panel), at=(-26 + index * 4.0, 14.6, LAWN))

# ── The playground ───────────────────────────────────────────────────────────
# A swing set, back left: two seats that swing out of step.
HIGH, WIDE = 3.3, 4.6
swing = [pipe('swing_bar', [(-WIDE / 2 - 0.25, 0, HIGH), (WIDE / 2 + 0.25, 0, HIGH)], 0.15, 'coral', sides=8)]
for side in (-1, 1):
    for lean in (-1, 1):
        swing.append(pipe('swing_leg', [(side * WIDE / 2, lean * 1.55, 0), (side * WIDE / 2, 0, HIGH)], 0.14, 'coral', sides=8))
    swing.append(ball('swing_cap', 0.24, 'cream', at=(side * (WIDE / 2 + 0.25), 0, HIGH), detail=2))
swings = [tag(join('swing_frame', *swing), outline=0.045)]
for index, (x, pace, reach) in enumerate(((-1.05, 2.6, 26), (1.05, 3.1, 20))):
    def seat():
        sleeve = cylinder('swing_sleeve', 0.2, 0.9, 'metal', rot=(0, 90, 0), sides=8)
        ropes = [box('swing_rope', (0.08, 0.08, 2.3), 'metal', at=(side * 0.4, 0, -1.15), bevel=0) for side in (-1, 1)]
        return tag(join('swing_seat', sleeve, *ropes, box('swing_board', (1.05, 0.42, 0.14), 'slide', at=(0, 0, -2.3), bevel=0.05, segments=1)), outline=0.04)
    swings.append(sway(place(again('swing_seat', 'swing_seat_%d' % index, seat), at=(x, 0, HIGH)), reach, paced(pace), axis=0))
group('swing_set', *swings, at=(-9.6, 10.0, LAWN), rot=(0, 0, -12))

# A slide, back right, seen from the side: a little tower with a roof, the ladder up its right and the chute down its left.
DECK = 2.0
tower = [box('slide_deck', (1.7, 1.7, 0.2), 'wood', at=(0, 0, DECK - 0.1), bevel=0.06, segments=1)]
tower += [box('slide_post', (0.24, 0.24, 3.5), 'teal', at=(x * 0.72, y * 0.72, 1.75), bevel=0.07, segments=1) for x in (-1, 1) for y in (-1, 1)]
tower.append(cone('slide_roof', 1.55, 1.0, 'coral', at=(0, 0, 4.0), rot=(0, 0, 45), sides=4, smooth=20))
tower += [pipe('slide_rail', [(-0.72, side * 0.72, DECK + 0.8), (0.72, side * 0.72, DECK + 0.8)], 0.07, 'cream', sides=5) for side in (-1, 1)]
tower += [pipe('ladder', [(side * 0.42, 2.0, 0), (side * 0.42, 0.85, DECK)], 0.09, 'teal', sides=6) for side in (-1, 1)]
tower += [pipe('rung', [(-0.42, 2.0 - step * 0.26, step * 0.45), (0.42, 2.0 - step * 0.26, step * 0.45)], 0.07, 'cream', sides=5) for step in range(1, 5)]
slide = [tag(join('slide_tower', *tower), outline=0.045)]
# The chute: a bed with a wall down each side, and a flat lip at the bottom.
RUN, DROP = 3.4, DECK - 0.35
long, slope = math.hypot(RUN, DROP), math.degrees(math.atan2(DROP, RUN))
chute = [box('chute', (1.15, long, 0.14), 'slide', bevel=0.04, segments=1)]
chute += [box('chute_wall', (0.16, long, 0.4), 'slide', at=(side * 0.58, 0, 0.2), bevel=0.06, segments=1) for side in (-1, 1)]
slide.append(tag(place(join('slide_chute', *chute), at=(0, -0.85 - RUN / 2, DECK - DROP / 2), rot=(slope, 0, 0)), outline=0.045))
slide.append(tag(box('slide_lip', (1.15, 0.9, 0.14), 'slide', at=(0, -0.85 - RUN - 0.4, 0.37), bevel=0.04, segments=1), outline=0.045))
group('slide', *slide, at=(12.4, 9.7, LAWN), rot=(0, 0, -70))

# A merry-go-round on the grass to the left of the start. It never stops turning.
wheel = [lathe('roundabout', [(0, 0.3), (1.9, 0.3), (1.98, 0.36), (1.98, 0.5), (1.88, 0.56), (0, 0.56)], 'teal', sides=24)]
for index in range(3):
    points = [(0, 0)] + [(math.cos(math.radians(index * 120 + step * 15)) * 1.82, math.sin(math.radians(index * 120 + step * 15)) * 1.82) for step in range(5)]
    wheel.append(slab('roundabout_wedge_%d' % index, points, 0.05, 'cream', at=(0, 0, 0.57), bevel=0))
    turn = math.radians(index * 120 + 90)
    wheel.append(pipe('roundabout_bar_%d' % index, [(math.cos(turn) * 0.2, math.sin(turn) * 0.2, 1.2), (math.cos(turn) * 1.5, math.sin(turn) * 1.5, 1.2), (math.cos(turn) * 1.5, math.sin(turn) * 1.5, 0.56)], 0.08, 'coral', sides=6))
wheel.append(cylinder('roundabout_hub', 0.3, 1.0, 'coral', at=(0, 0, 0.9), sides=10, bevel=0.06))
turning = spin(tag(join('roundabout', *wheel), outline=0.045), 10)
foot = tag(cylinder('roundabout_foot', 0.7, 0.34, 'metal', at=(0, 0, 0.17), sides=12), outline=0.045)
group('merry_go_round', turning, foot, at=(-19.0, 1.1, LAWN))

# A seesaw on the grass past the finish, rocking.
plank = [cylinder('seesaw_axle', 0.14, 0.8, 'metal', rot=(90, 0, 0), sides=8), box('seesaw_plank', (4.8, 0.52, 0.15), 'wood', at=(0, 0, 0.12), bevel=0.05, segments=1)]
for side in (-1, 1):
    plank.append(box('seesaw_seat', (0.7, 0.6, 0.12), 'coral', at=(side * 2.0, 0, 0.25), bevel=0.04, segments=1))
    plank.append(pipe('seesaw_grip', [(side * 1.45, -0.2, 0.18), (side * 1.45, -0.2, 0.6), (side * 1.45, 0.2, 0.6), (side * 1.45, 0.2, 0.18)], 0.06, 'metal', sides=5))
rocking = sway(place(tag(grounded(join('seesaw_plank', *plank)), outline=0.045), at=(0, 0, 0.82)), 13, paced(2.4), axis=1)
stand = tag(slab('seesaw_stand', [(-0.55, 0), (0.55, 0), (0.16, 0.8), (-0.16, 0.8)], 0.5, 'teal', rot=(90, 0, 0), bevel=0.05), outline=0.045)
group('seesaw', rocking, stand, at=(17.6, 1.2, LAWN), rot=(0, 0, 28))

# A rider on a spring beside it, wobbling.
steed = [lathe('spring', [(0.16, 0), (0.24, 0.07), (0.16, 0.14), (0.24, 0.21), (0.16, 0.28), (0.24, 0.35), (0.16, 0.42), (0.16, 0.5)], 'metal', sides=8),
         ball('rider', 0.5, 'coral', at=(0, 0, 0.82), scale=(1.5, 0.75, 0.75), detail=3),
         ball('rider_head', 0.32, 'coral', at=(0.66, 0, 1.16), detail=2),
         pipe('rider_grip', [(0.5, -0.46, 1.2), (0.5, 0.46, 1.2)], 0.06, 'cream', sides=5),
         box('rider_seat', (0.5, 0.5, 0.1), 'cream', at=(-0.2, 0, 1.2), bevel=0.04, segments=1)]
sway(place(tag(join('spring_rider', *steed), outline=0.04), at=(16.4, -2.6, LAWN), rot=(0, 0, 200)), 8, paced(1.3), axis=1)

# A bench facing the lane, by the slide.
seat = [box('bench_slat_%d' % index, (2.6, 0.22, 0.1), 'wood', at=(0, -0.26 + index * 0.26, 0.55), bevel=0) for index in range(3)]
seat += [box('bench_back_%d' % index, (2.6, 0.1, 0.24), 'wood', at=(0, 0.42, 0.85 + index * 0.3), bevel=0) for index in range(2)]
seat += [box('bench_leg_%d' % index, (0.16, 0.9, 0.55), 'metal', at=(side * 1.05, 0.05, 0.27), bevel=0.04, segments=1) for index, side in enumerate((-1, 1))]
seat += [box('bench_arm_%d' % index, (0.14, 0.14, 0.9), 'metal', at=(side * 1.05, 0.44, 0.9), bevel=0) for index, side in enumerate((-1, 1))]
tag(place(grounded(join('bench', *seat)), at=(15.6, 7.4, LAWN), rot=(0, 0, -14)), outline=0.04)

# Things left on the grass by the start: a ball, and three blocks.
band = lambda low, high, reach: [(math.cos(math.radians(low)) * reach, math.sin(math.radians(low)) * reach), (math.cos(math.radians(high)) * reach, math.sin(math.radians(high)) * reach)]
tag(place(join('ball', ball('ball', 0.72, 'slide', detail=3), lathe('ball_band', band(-18, 18, 0.735), 'cream', sides=20)), at=(-17.7, 4.7, LAWN + 0.72), rot=(55, 20, 0)), outline=0.045)
blocks = [box('block_%d' % index, (0.66, 0.66, 0.66), color, at=at, rot=(0, 0, turn), bevel=0.1) for index, (color, at, turn) in enumerate((('coral', (0, 0, 0.33), 10), ('teal', (0.78, 0.1, 0.33), -14), ('cream', (0.36, 0.06, 0.99), 30)))]
tag(place(grounded(join('blocks', *blocks)), at=(-16.7, -3.3, LAWN)), outline=0.04)


# Pinwheels stuck in the grass, turning.
def pinwheel(index, x, y, pace):
    def vanes():
        blades = [slab('vane', [(0, 0), (math.cos(math.radians(quarter * 90)) * 0.5, math.sin(math.radians(quarter * 90)) * 0.5), (math.cos(math.radians(quarter * 90 + 62)) * 0.34, math.sin(math.radians(quarter * 90 + 62)) * 0.34)],
                       0.05, 'coral' if quarter % 2 == 0 else 'cream', bevel=0) for quarter in range(4)]
        return tag(join('pinwheel', cylinder('pin', 0.08, 0.1, 'pollen', sides=6), *blades), outline=0.035, shadow=False)
    stick = again('pinwheel_stick', 'pinwheel_stick_%d' % index, lambda: tag(cylinder('stick', 0.05, 1.0, 'cream', sides=5), outline=0.03, shadow=False))
    head = group('pinwheel_head_%d' % index, spin(again('pinwheel', 'pinwheel_%d' % index, vanes), paced(pace)), at=(0, -0.1, 1.0), rot=(FACING, 0, 0))
    return group('pinwheel_hold_%d' % index, place(stick, at=(0, 0, 0.5)), head, at=(x, y, LAWN))


pinwheel(0, -4.3, 5.6, 2.0)
pinwheel(1, 4.3, 5.6, 2.4)
pinwheel(2, -14.6, 5.9, 2.2)
pinwheel(3, 14.7, 5.7, 2.6)

# Butterflies over the flowers: each flaps its wings and wanders round a little loop of its own.
def butterfly(index, x, y, color, pace):
    def wing():
        return tag(slab('wing', [(0, -0.12), (0.1, -0.34), (0.3, -0.4), (0.42, -0.22), (0.3, -0.02), (0.52, 0.1), (0.54, 0.38), (0.24, 0.44), (0, 0.1)], 0.05, color, bevel=0), outline=0.03, shadow=False)
    wings = []
    for side in (-1, 1):
        flap = place(again('wing_' + color, 'wing_%d_%d' % (index, side), wing), scale=(side, 1, 1))
        wings.append(sway(flap, 38 * side, paced(0.5), axis=1))
    body = again('butterfly_body', 'butterfly_body_%d' % index, lambda: tag(box('body', (0.12, 0.62, 0.12), 'trunk', bevel=0), outline=0.03, shadow=False))
    flying = group('butterfly_%d' % index, body, *wings)
    loop = paced(pace)
    spots = [(0, 0, 0.9), (1.1, 0.5, 1.3), (0.4, 1.3, 1.0), (-0.9, 0.8, 1.4), (-0.6, -0.4, 1.0), (0, 0, 0.9)]
    key(flying, 'location', [(loop * step / 5, (x + dx, y + dy, LAWN + dz)) for step, (dx, dy, dz) in enumerate(spots)])
    # It heads the way it is going, near enough.
    turns = [-60, 20, 100, 190, 280, 300]
    return key(flying, 'rotation_euler', [(loop * step / 5, (0, 0, math.radians(turn))) for step, turn in enumerate(turns)])


butterfly(0, -4.6, 8.4, 'pollen', 6.5)
butterfly(1, 15.6, 4.8, 'petal', 7.5)
butterfly(2, -20.2, -4.2, 'white', 5.8)
butterfly(3, 8.6, -6.6, 'pollen', 7.0)

# ── The start and the finish ─────────────────────────────────────────────────
# An inflated arch behind the start line, past the end of the lane: nobody runs under it, so it covers nobody.
GATE = LEFT - 1.7
span = arc((GATE, FRONT - 1.2, LAWN + 0.2), (GATE, BACK + 1.2, LAWN + 0.2), 4.1, steps=14)
gate = [pipe('arch', span, 0.42, 'coral', sides=10)]
gate += [pipe('arch_band_%d' % index, [span[index], span[index + 1]], 0.45, 'cream', sides=10) for index in range(1, 14, 2)]
gate += [cylinder('arch_foot_%d' % index, 0.62, 0.5, 'cream', at=(GATE, side * (BACK + 1.2), LAWN + 0.25), sides=12, bevel=0.1) for index, side in enumerate((-1, 1))]
tag(join('start_arch', *gate), outline=0.05)

# Two posts at the finish, each with a chequered flag that flutters. The near one is short, so it hides nobody.
for index, (side, top, size) in enumerate(((1, 2.9, 0.34), (-1, 1.3, 0.26))):
    post = [cylinder('finish_post', 0.11, top - LAWN, 'white', at=(0, 0, (top + LAWN) / 2), sides=8), ball('finish_knob', 0.2, 'pollen', at=(0, 0, top + 0.1), detail=2),
            cylinder('finish_foot', 0.3, 0.2, 'kerb', at=(0, 0, LAWN + 0.1), sides=10)]
    flag = [cylinder('flag_sleeve', 0.14, size * 3, 'white', at=(0, 0, -size * 1.5), sides=6)]
    flag += [box('flag_square', (size, 0.07, size), 'ink' if (column + row) % 2 == 0 else 'white', at=(0.12 + size * (column + 0.5), 0, -size * (row + 0.5)), bevel=0) for column in range(4) for row in range(3)]
    waving = sway(place(tag(grounded(join('finish_flag_%d' % index, *flag)), outline=0.035), at=(0, 0, top)), 16, paced(1.2 + index * 0.25), axis=2)
    group('finish_%d' % index, tag(join('finish_post_%d' % index, *post), outline=0.04), waving, at=(FINISH + 0.5, side * (BACK + 0.85), 0))
