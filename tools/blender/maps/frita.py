# Batatinha Frita 1, 2, 3: a lane across a playground, with a giant cat sitting behind the middle of it.
# The game draws the lane (its tiles, its lines, the chequered finish and the strip down each side that goes
# from green to red) and the cat. This is the park round them: the kerb the lane sits in, the cat's sandbox,
# bushes, trees, a playground that keeps moving by itself, and the street and hills beyond the fence.
#
# The lane runs left to right and the camera looks down on it from the front, so the near side holds nothing
# taller than a low bush, the back is where the tall things stand, and the cat's sandbox is left open in
# front of it. Nothing reaches over the lane. Between rounds the camera comes down low and looks across the
# park, so the lawn runs on past the fence to a street of houses and a ring of hills: it never ends in sky.
#
# Every object costs the game three passes for each of its colours, so whatever stands still is joined into
# a few big pieces, and whatever repeats is made once as a group (four trees, a row of bushes) and copied.
#
# Everything that moves here is a loop the game plays, and the game stops every one of them dead while the
# cat is looking: swings in mid-air, the dog in mid-stride, petals hanging on the wind. So nothing here may
# move in a way that does not come from this file. The game also stands spectators on the bench, the slide's
# tower and the crates behind the fence, and sits them on the swing, the merry-go-round and the horse.
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


def put(pieces, at=(0, 0, 0), turn=0, size=1):
    """Joins the pieces of one prop, built round the origin, and stands the prop where it belongs. Returns it as one piece."""
    return place(grounded(join('prop', *pieces)), at=at, rot=(0, 0, turn), scale=size)


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


def bare_under(obj):
    """Takes away the faces that look straight down: the underside of something lying on the ground, which nobody sees and the file need not carry."""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.delete(mesh, geom=[face for face in mesh.faces if face.normal.z < -0.9], context='FACES')
    mesh.to_mesh(obj.data)
    mesh.free()
    return obj


def facing_out(obj):
    """Turns an open shell (a disc, a dome with no floor) the right way out: such a shape has no inside to tell by."""
    face = obj.data.polygons[0]
    if face.normal.dot(face.center + Vector((0, 0, 0.001))) < 0:
        obj.data.flip_normals()
    return obj


def blob(radius, color, at, seed, squash=(1.2, 1.0, 0.8), detail=3):
    """A soft lump of leaves."""
    return rock('blob', radius, color, at=at, seed=seed, rough=0.12, scale=squash, detail=detail, smooth=80)


# ── The ground ───────────────────────────────────────────────────────────────
# The lawn runs far past the fence, out under the hills, so that no camera finds its edge. It is held by the
# middle of the map, and so is the first thing to arrive: the game brings a world in from its middle outward.
ground(grounded(box('lawn', (240, 200, 1.0), 'lawn', at=(0, 30, LAWN - 0.5), bevel=0)))
# Mown patches a shade deeper, so the lawn is not one flat green. One lies under every tree, where its shadow would be.
patches = []
for index, (x, y, wide, deep) in enumerate((
    (-19, 1.6, 4.6, 3.6), (-9.5, 10, 4.2, 2.6), (10.8, 9.6, 4.4, 3.2), (17.5, 0.5, 4.2, 3.4), (-21, 9.5, 3.2, 2.4), (22.4, 9.4, 3.2, 2.4),
    (-6, -8.5, 5, 1.6), (7, -8.6, 6, 1.5), (-14.6, 12.6, 2.8, 2.0), (16.2, 12.6, 2.8, 2.0), (-6, 12.8, 2.6, 1.8), (7.4, 12.8, 2.6, 1.8),
    (-23.8, -2.2, 3.0, 2.2), (25.4, -2.2, 3.0, 2.2), (-15, -7.6, 3.4, 1.4), (15.5, -7.8, 3.8, 1.4), (-24, 21, 9, 3), (22, 21.5, 10, 3), (0, 19, 12, 2.4),
)):
    patches.append(place(facing_out(lathe('patch', [(0, 0.03), (1.0, 0.03)], 'lawnDark', at=(x, y, LAWN), sides=14)), scale=(wide, deep, 1)))
ground(join('patches', *patches))

# The kerb the lane sits in. The game lays its green-and-red strips along the top of the long sides.
kerb = [box('kerb_%d' % index, (COLUMNS + 1.0, 0.5, 0.52), 'kerb', at=(0, side * (BACK + 0.25), LAWN + 0.24), bevel=0.08, segments=1) for index, side in enumerate((-1, 1))]
kerb += [box('kerb_end_%d' % index, (0.5, ROWS + 0.2, 0.52), 'kerb', at=(side * (RIGHT + 0.25), 0, LAWN + 0.24), bevel=0.08, segments=1) for index, side in enumerate((-1, 1))]
tag(join('kerb', *kerb), outline=0.04, shadow=False)


# ── Small things that many places share ──────────────────────────────────────
def flower_heads(kind, at=(0, 0), turn=0):
    """A handful of daisies lying in the grass, each with five round petals: white ones (0), or pink (1)."""
    heads = []
    for index, (x, y, size) in enumerate(((0, 0, 0.27), (0.56, 0.32, 0.21), (-0.5, 0.28, 0.22), (0.22, -0.5, 0.22), (-0.4, -0.4, 0.19), (0.78, -0.22, 0.18))):
        # Ten corners, out and in by turns: five petals.
        reach = [size * (0.5 if step % 2 else 1.0) for step in range(10)]
        petals = [(math.cos(math.radians(step * 36 + index * 25)) * reach[step], math.sin(math.radians(step * 36 + index * 25)) * reach[step]) for step in range(10)]
        heads.append(bare_under(slab('petals', petals, 0.05, 'white' if kind == 0 else 'petal', at=(x, y, 0.1), bevel=0)))
        heads.append(facing_out(lathe('eye', [(size * 0.38, 0), (size * 0.2, 0.07), (0, 0.07)], 'pollen', at=(x, y, 0.12), sides=6)))
    return put(heads, at=(at[0], at[1], 0), turn=turn)


def bush(kind, small, at=(0, 0), turn=0, size=1):
    """Three lumps of hedge, the middle one the biggest. Kind 2 is in flower. A small one is drawn at half the size, and is made of less."""
    main, side = ('hedge', 'hedgeDark') if kind != 1 else ('hedgeDark', 'hedge')
    detail = 1 if small else 2
    lumps = [blob(0.95, main, (0, 0, 0.5), 10 + kind, detail=2), blob(0.7, side, (-1.0, 0.12, 0.34), 20 + kind, detail=detail), blob(0.64, main, (0.98, -0.1, 0.3), 30 + kind, detail=detail)]
    if kind == 2:
        lumps += [ball('bloom', 0.14, 'petal', at=spot, detail=1, smooth=80)
                  for spot in ((-0.2, -0.75, 0.9), (0.5, -0.6, 0.95), (-1.1, -0.45, 0.62), (1.1, -0.6, 0.5), (0.1, -0.2, 1.24), (-0.6, -0.3, 1.1))]
    return put(lumps, at=(at[0], at[1], 0), turn=turn, size=size)


def tree(at, size, turn, seed):
    """A fat tree: a trunk and a canopy of three lumps."""
    trunk = lathe('trunk', [(0, 0), (0.56, 0), (0.4, 0.45), (0.32, 1.7), (0.4, 2.2), (0, 2.2)], 'trunk', sides=8)
    canopy = [blob(1.75, 'leaf', (0, 0, 3.3), seed, squash=(1.1, 1.1, 0.92), detail=2), blob(1.2, 'leafLight', (-1.15, -0.6, 2.95), seed + 2, detail=2), blob(1.1, 'leaf', (1.2, 0.3, 2.85), seed + 4, detail=2)]
    return put([trunk] + canopy, at=(at[0], at[1], 0), turn=turn, size=size)


def pinwheel_stick(x, y):
    return cylinder('stick', 0.05, 1.0, 'cream', at=(x, y, LAWN + 0.5), sides=5)


# ── The cat's corner ─────────────────────────────────────────────────────────
# A wooden frame with the sand a step down inside it. The cat sits in the middle, and the toys keep to the corners.
HALF_X, HALF_Y = 3.55, 2.65
corner = [box('beam', (HALF_X * 2 + 0.5, 0.5, 0.56), 'wood', at=(0, CAT + side * HALF_Y, LAWN + 0.28), bevel=0.12, segments=1) for side in (-1, 1)]
corner += [box('beam', (0.5, HALF_Y * 2 + 0.5, 0.56), 'wood', at=(side * HALF_X, CAT, LAWN + 0.28), bevel=0.12, segments=1) for side in (-1, 1)]
corner += [cylinder('beam_post', 0.42, 0.74, 'trunk', at=(x * HALF_X, CAT + y * HALF_Y, LAWN + 0.37), sides=10, bevel=0.08) for x, y in ((-1, -1), (1, -1), (-1, 1), (1, 1))]

# A sandcastle with a flag, front left.
castle = [cylinder('castle', 0.62, 0.3, 'sandDark', at=(0, 0, 0.15), sides=12), cylinder('keep', 0.42, 0.7, 'sandDark', at=(0, 0, 0.6), sides=10)]
for index in range(4):
    turn = math.radians(45 + index * 90)
    castle.append(cylinder('turret', 0.2, 0.62, 'sandDark', at=(math.cos(turn) * 0.5, math.sin(turn) * 0.5, 0.46), sides=8))
    castle.append(box('crenel', (0.2, 0.2, 0.18), 'sandDark', at=(math.cos(turn + 0.78) * 0.3, math.sin(turn + 0.78) * 0.3, 1.02), bevel=0))
castle.append(pipe('castle_pole', [(0, 0, 0.9), (0, 0, 1.55)], 0.05, 'trunk', sides=5))
castle.append(slab('castle_flag', [(0, 0), (0.48, -0.16), (0, -0.34)], 0.06, 'coral', at=(0.04, 0, 1.55), rot=(90, 0, 0), bevel=0))
corner.append(put(castle, at=(-2.5, CAT - 1.6, SAND)))

# A bucket and a spade, front right.
pail = lathe('bucket', [(0, 0), (0.3, 0), (0.44, 0.6), (0.5, 0.62), (0.5, 0.7), (0.4, 0.7), (0.38, 0.62), (0, 0.62)], 'coral', sides=12)
grip = pipe('bucket_handle', arc((-0.46, 0, 0.66), (0.46, 0, 0.66), 0.5, steps=6), 0.05, 'cream', sides=5)
corner.append(put([pail, grip], at=(2.55, CAT - 1.7, SAND), turn=25))
blade = slab('spade', [(-0.2, 0), (0.2, 0), (0.24, 0.5), (0, 0.62), (-0.24, 0.5)], 0.08, 'teal', bevel=0)
shaft = box('spade_shaft', (0.1, 0.8, 0.1), 'wood', at=(0, -0.38, 0), bevel=0)
knob = box('spade_grip', (0.36, 0.12, 0.12), 'wood', at=(0, -0.8, 0), bevel=0)
corner.append(place(join('spade', blade, shaft, knob), at=(3.0, CAT - 0.4, SAND + 0.5), rot=(-70, 0, 20)))

# A ball of yarn at the back, for when the song is over.
wool = [ball('yarn', 0.62, 'coral', detail=3)]
wool += [ring('yarn_wrap', 0.6, 0.06, 'petal', rot=rot, sides=12, around=4) for rot in ((70, 0, 0), (70, 0, 55), (20, 60, 110))]
wool.append(pipe('yarn_end', [(0.5, 0, -0.5), (1.0, 0.2, -0.56), (1.4, -0.1, -0.56), (1.8, 0.25, -0.56)], 0.06, 'petal', sides=5))
corner.append(put(wool, at=(-2.5, CAT + 1.3, SAND + 0.6)))

# Two little trees clipped into balls, in pots, at the back corners of the sandbox.
for x in (-4.7, 4.7):
    pot = lathe('pot', [(0, 0), (0.42, 0), (0.56, 0.6), (0.62, 0.62), (0.62, 0.74), (0, 0.74)], 'coral', sides=10)
    stem = cylinder('stem', 0.12, 1.0, 'trunk', at=(0, 0, 1.2), sides=6)
    corner.append(put([pot, stem, ball('clipped', 0.9, 'hedgeDark', at=(0, 0, 2.3), detail=3), ball('clipped_low', 0.55, 'hedgeDark', at=(0, 0, 1.25), detail=2, smooth=80)], at=(x, CAT + 2.9, LAWN)))
corner += [pinwheel_stick(-4.3, 5.6), pinwheel_stick(4.3, 5.6)]
tag(join('cat_corner', *corner), outline=0.04)

sand = [box('sand', (HALF_X * 2, HALF_Y * 2, 0.3), 'sand', at=(0, CAT, SAND - 0.15), bevel=0)]
sand += [ball('heap', size, 'sand', at=(x, CAT + y, SAND - 0.05), scale=(1.3, 1.0, 0.4), detail=2) for x, y, size in ((-2.4, 1.7, 0.9), (2.3, 1.9, 1.1), (0.4, 2.2, 0.7))]
tag(join('sand', *sand), outline=0.03, shadow=False)

# ── Green things ─────────────────────────────────────────────────────────────
# A hedge along the back of the lane, leaving the cat's sandbox open: four bushes made as one piece, and their mirror image.
def back_hedge():
    return tag(join('hedge', bush(0, False, (-12.2, 6.2), 0), bush(2, False, (-9.7, 6.35), 180, 0.95), bush(1, False, (-7.3, 6.15), 10), bush(0, False, (-5.1, 6.3), 170, 0.9)), outline=0.045)


place(again('back_hedge', 'hedge_left', back_hedge), at=(0, 0, LAWN))
place(again('back_hedge', 'hedge_right', back_hedge), at=(0, 0, LAWN), scale=(-1, 1, 1))


# A low row along the front: three small bushes and the daisies between them, made as one piece and laid three times.
def front_row():
    row = [bush(1, True, (-3.4, 0.05), 0, 0.58), bush(0, True, (0, -0.1), 180, 0.6), bush(2, True, (3.4, 0.05), 0, 0.58)]
    row += [flower_heads(0, (-1.7, -0.1), 0), flower_heads(1, (1.7, -0.15), 40), flower_heads(0, (5.1, 0), 90)]
    return tag(join('front_row', *row), outline=0.04, shadow=False)


for index, x in enumerate((-10.2, 0, 10.2)):
    place(again('front_row', 'front_row_%d' % index, front_row), at=(x, -6.0, LAWN))

# Daisies here and there about the park: three beds made as one piece, and their mirror image.
def daisies():
    return tag(join('daisies', flower_heads(1, (-4.6, 8.0), 0), flower_heads(0, (-15.5, 5.2), 20), flower_heads(1, (-19.6, -3.2), 60)), outline=0.03, shadow=False)


place(again('daisies', 'daisies_left', daisies), at=(0, 0, LAWN))
place(again('daisies', 'daisies_right', daisies), at=(0.2, -0.4, LAWN), scale=(-1, 1, 1))


# Eight trees: four made as one piece, and their mirror image a little farther out. Their shade is a mown patch.
def copse():
    return tag(join('copse', tree((-20.8, 8.6), 1.0, 0, 3), tree((-14.6, 11.8), 0.9, 120, 5), tree((-5.9, 11.9), 0.86, 240, 7), tree((-23.8, -2.8), 0.9, 30, 9)), outline=0.06, shadow=False)


place(again('copse', 'trees_left', copse), at=(0, 0, LAWN))
place(again('copse', 'trees_right', copse), at=(1.6, 0, LAWN), scale=(-1, 1, 1))

# A kite caught in the tree to the left of the sandbox. It flaps, and its tail swings under it.
sail = slab('kite', [(0, 0.75), (-0.5, 0.1), (0, -0.75), (0.5, 0.1)], 0.07, 'coral', bevel=0)
spars = [box('kite_spar', (0.07, 1.5, 0.09), 'cream', bevel=0), box('kite_cross', (1.0, 0.07, 0.09), 'cream', at=(0, 0.1, 0), bevel=0)]
tail = [pipe('kite_tail', [(0, -0.75, 0), (0.15, -1.2, 0), (-0.1, -1.7, 0), (0.12, -2.2, 0)], 0.04, 'cream', sides=4)]
tail += [slab('kite_bow', [(-0.22, 0.12), (0, 0.03), (0.22, 0.12), (0.22, -0.12), (0, -0.03), (-0.22, -0.12)], 0.06, 'coral', at=(x, y, 0), bevel=0) for x, y in ((0.15, -1.2), (-0.1, -1.7), (0.12, -2.2))]
kite = tag(join('kite', sail, *spars, *tail), outline=0.04, shadow=False)
sway(place(kite, rot=(0, 0, 24)), 9, paced(1.9), axis=2)
group('kite_hold', kite, at=(-5.0, 10.9, LAWN + 4.4), rot=(FACING, 0, 0))


# A picket fence along the back of the park: half of it made as one piece, and laid twice.
def fence():
    pickets = [box('picket', (0.32, 0.09, 0.95), 'white', at=(-27.75 + step * 0.5, 0, 0.5), bevel=0) for step in range(56)]
    rails = [box('rail', (28.0, 0.07, 0.13), 'white', at=(-14, 0.06, 0.3 + step * 0.42), bevel=0) for step in range(2)]
    # Two lamp posts stand just inside each half.
    lamps = []
    for x in (-7.5, -18.5):
        lamps += [cylinder('lamp_post', 0.09, 3.0, 'metal', at=(x, -0.4, 1.5), sides=6), cylinder('lamp_foot', 0.2, 0.3, 'metal', at=(x, -0.4, 0.15), sides=8),
                  ball('lamp', 0.3, 'cream', at=(x, -0.4, 3.15), detail=2), cone('lamp_cap', 0.26, 0.2, 'metal', at=(x, -0.4, 3.5), sides=8)]
    return tag(join('fence', *pickets, *rails, *lamps), outline=0.035, shadow=False)


for index, x in enumerate((0, 28)):
    place(again('fence', 'fence_%d' % index, fence), at=(x, 14.6, LAWN))

# ── The playground ───────────────────────────────────────────────────────────
left, right = [], []

# A swing set, back left: two seats that swing out of step.
HIGH, WIDE = 3.3, 4.6
SWINGS = dict(at=(-9.6, 10.0, LAWN), rot=(0, 0, -12))
frame = [pipe('swing_bar', [(-WIDE / 2 - 0.25, 0, HIGH), (WIDE / 2 + 0.25, 0, HIGH)], 0.15, 'coral', sides=8)]
for side in (-1, 1):
    frame += [pipe('swing_leg', [(side * WIDE / 2, lean * 1.55, 0), (side * WIDE / 2, 0, HIGH)], 0.14, 'coral', sides=8) for lean in (-1, 1)]
    frame.append(ball('swing_cap', 0.24, 'cream', at=(side * (WIDE / 2 + 0.25), 0, HIGH), detail=2))
left.append(place(join('swing_frame', *frame), **SWINGS))
seats = []
for index, (x, pace, reach) in enumerate(((-1.05, 2.6, 26), (1.05, 3.1, 20))):
    def seat():
        sleeve = cylinder('swing_sleeve', 0.2, 0.9, 'metal', rot=(0, 90, 0), sides=8)
        ropes = [box('swing_rope', (0.08, 0.08, 2.3), 'metal', at=(side * 0.4, 0, -1.15), bevel=0) for side in (-1, 1)]
        return tag(join('swing_seat', sleeve, *ropes, box('swing_board', (1.05, 0.42, 0.14), 'slide', at=(0, 0, -2.3), bevel=0.05, segments=1)), outline=0.04)
    seats.append(sway(place(again('swing_seat', 'swing_seat_%d' % index, seat), at=(x, 0, HIGH)), reach, paced(pace), axis=0))
group('swings', *seats, **SWINGS)

# A merry-go-round on the grass to the left of the start: a wooden deck, so that no big disc of a bright colour
# lies near the pets at the start. It never stops turning.
wheel = [lathe('roundabout', [(0, 0.3), (1.9, 0.3), (1.98, 0.36), (1.98, 0.5), (1.88, 0.56), (0, 0.56)], 'wood', sides=24)]
for index in range(3):
    points = [(0, 0)] + [(math.cos(math.radians(index * 120 + step * 15)) * 1.82, math.sin(math.radians(index * 120 + step * 15)) * 1.82) for step in range(5)]
    wheel.append(slab('roundabout_wedge', points, 0.05, 'cream', at=(0, 0, 0.57), bevel=0))
    turn = math.radians(index * 120 + 90)
    wheel.append(pipe('roundabout_bar', [(math.cos(turn) * 0.2, math.sin(turn) * 0.2, 1.2), (math.cos(turn) * 1.5, math.sin(turn) * 1.5, 1.2), (math.cos(turn) * 1.5, math.sin(turn) * 1.5, 0.56)], 0.08, 'coral', sides=6))
wheel.append(cylinder('roundabout_hub', 0.3, 1.0, 'coral', at=(0, 0, 0.9), sides=10, bevel=0.06))
ROUNDABOUT = (-19.0, 1.1, LAWN)
place(spin(tag(join('roundabout', *wheel), outline=0.045), 10), at=ROUNDABOUT)
left.append(cylinder('roundabout_foot', 0.7, 0.34, 'metal', at=(ROUNDABOUT[0], ROUNDABOUT[1], LAWN + 0.17), sides=12))

# Things left on the grass by the start: a ball, and three blocks.
band = lambda low, high, reach: [(math.cos(math.radians(low)) * reach, math.sin(math.radians(low)) * reach), (math.cos(math.radians(high)) * reach, math.sin(math.radians(high)) * reach)]
left.append(place(join('ball', ball('ball', 0.72, 'slide', detail=3), lathe('ball_band', band(-18, 18, 0.735), 'cream', sides=20)), at=(-17.7, 4.7, LAWN + 0.72), rot=(55, 20, 0)))
blocks = [box('block', (0.66, 0.66, 0.66), color, at=at, rot=(0, 0, turn), bevel=0.1) for color, at, turn in (('coral', (0, 0, 0.33), 10), ('teal', (0.78, 0.1, 0.33), -14), ('cream', (0.36, 0.06, 0.99), 30))]
left.append(put(blocks, at=(-16.7, -3.3, LAWN)))

# An inflated arch behind the start line, past the end of the lane: nobody runs under it, so it covers nobody.
# It is teal and cream: a colour no player wears, and none that means danger.
GATE = LEFT - 1.7
span = arc((GATE, FRONT - 1.2, LAWN + 0.2), (GATE, BACK + 1.2, LAWN + 0.2), 4.1, steps=14)
left.append(pipe('arch', span, 0.42, 'teal', sides=10))
left += [pipe('arch_band', [span[index], span[index + 1]], 0.45, 'cream', sides=10) for index in range(1, 14, 2)]
left += [cylinder('arch_foot', 0.62, 0.5, 'cream', at=(GATE, side * (BACK + 1.2), LAWN + 0.25), sides=12, bevel=0.1) for side in (-1, 1)]
left.append(pinwheel_stick(-14.6, 5.9))
tag(join('play_left', *left), outline=0.045)

# A slide, back right, seen from the side: a little tower with a roof, the ladder up its right and the chute down its left.
DECK = 2.0
tower = [box('slide_deck', (1.7, 1.7, 0.2), 'wood', at=(0, 0, DECK - 0.1), bevel=0.06, segments=1)]
tower += [box('slide_post', (0.24, 0.24, 3.5), 'teal', at=(x * 0.72, y * 0.72, 1.75), bevel=0.07, segments=1) for x in (-1, 1) for y in (-1, 1)]
tower.append(cone('slide_roof', 1.55, 1.0, 'coral', at=(0, 0, 4.0), rot=(0, 0, 45), sides=4, smooth=20))
tower += [pipe('slide_rail', [(-0.72, side * 0.72, DECK + 0.8), (0.72, side * 0.72, DECK + 0.8)], 0.07, 'cream', sides=5) for side in (-1, 1)]
tower += [pipe('ladder', [(side * 0.42, 2.0, 0), (side * 0.42, 0.85, DECK)], 0.09, 'teal', sides=6) for side in (-1, 1)]
tower += [pipe('rung', [(-0.42, 2.0 - step * 0.26, step * 0.45), (0.42, 2.0 - step * 0.26, step * 0.45)], 0.07, 'cream', sides=5) for step in range(1, 5)]
# The chute: a bed with a wall down each side, and a flat lip at the bottom.
RUN, DROP = 3.4, DECK - 0.35
long, slope = math.hypot(RUN, DROP), math.degrees(math.atan2(DROP, RUN))
chute = [box('chute', (1.15, long, 0.14), 'slide', bevel=0.04, segments=1)]
chute += [box('chute_wall', (0.16, long, 0.4), 'slide', at=(side * 0.58, 0, 0.2), bevel=0.06, segments=1) for side in (-1, 1)]
tower.append(place(join('slide_chute', *chute), at=(0, -0.85 - RUN / 2, DECK - DROP / 2), rot=(slope, 0, 0)))
tower.append(box('slide_lip', (1.15, 0.9, 0.14), 'slide', at=(0, -0.85 - RUN - 0.4, 0.37), bevel=0.04, segments=1))
right.append(put(tower, at=(12.4, 9.7, LAWN), turn=-70))

# A seesaw on the grass past the finish, rocking.
SEESAW = dict(at=(17.6, 1.2, LAWN), rot=(0, 0, 28))
plank = [cylinder('seesaw_axle', 0.14, 0.8, 'metal', rot=(90, 0, 0), sides=8), box('seesaw_plank', (4.8, 0.52, 0.15), 'wood', at=(0, 0, 0.12), bevel=0.05, segments=1)]
for side in (-1, 1):
    plank.append(box('seesaw_seat', (0.7, 0.6, 0.12), 'coral', at=(side * 2.0, 0, 0.25), bevel=0.04, segments=1))
    plank.append(pipe('seesaw_grip', [(side * 1.45, -0.2, 0.18), (side * 1.45, -0.2, 0.6), (side * 1.45, 0.2, 0.6), (side * 1.45, 0.2, 0.18)], 0.06, 'metal', sides=5))
group('seesaw', sway(place(tag(grounded(join('seesaw_plank', *plank)), outline=0.045), at=(0, 0, 0.82)), 13, paced(2.4), axis=1), **SEESAW)
right.append(place(slab('seesaw_stand', [(-0.55, 0), (0.55, 0), (0.16, 0.8), (-0.16, 0.8)], 0.5, 'teal', bevel=0.05), at=SEESAW['at'], rot=(90, 0, SEESAW['rot'][2])))

# A horse on a spring beside it, rocking: cream, with a dark mane and tail and a saddle to sit on.
horse = [lathe('spring', [(0.16, 0), (0.24, 0.07), (0.16, 0.14), (0.24, 0.21), (0.16, 0.28), (0.24, 0.35), (0.16, 0.42), (0.16, 0.56)], 'metal', sides=8),
         ball('horse_body', 0.5, 'cream', at=(0, 0, 1.0), scale=(1.55, 0.7, 0.74), detail=3),
         box('horse_neck', (0.4, 0.36, 0.86), 'cream', at=(0.62, 0, 1.46), rot=(0, 30, 0), bevel=0.14),
         box('horse_head', (0.72, 0.36, 0.4), 'cream', at=(0.98, 0, 1.84), rot=(0, 24, 0), bevel=0.15),
         box('horse_mane', (0.16, 0.14, 0.95), 'trunk', at=(0.42, 0, 1.6), rot=(0, 30, 0), bevel=0.05, segments=1),
         box('horse_forelock', (0.3, 0.16, 0.14), 'trunk', at=(0.84, 0, 2.06), rot=(0, 24, 0), bevel=0.05, segments=1),
         pipe('horse_tail', [(-0.7, 0, 1.12), (-1.02, 0, 1.0), (-1.16, 0, 0.62)], 0.11, 'trunk', sides=6),
         box('horse_saddle', (0.56, 0.6, 0.14), 'coral', at=(-0.1, 0, 1.36), bevel=0.05, segments=1),
         pipe('horse_grip', [(0.8, -0.46, 1.82), (0.8, 0.46, 1.82)], 0.06, 'metal', sides=5),
         pipe('horse_rest', [(0.12, -0.5, 0.76), (0.12, 0.5, 0.76)], 0.06, 'metal', sides=5)]
horse += [cone('horse_ear', 0.1, 0.24, 'cream', at=(0.76, side * 0.12, 2.12), sides=6) for side in (-1, 1)]
# Its legs are tucked up fore and aft, the way a rocking horse gallops.
horse += [box('horse_leg', (0.2, 0.18, 0.62), 'cream', at=(fore * 0.56, side * 0.2, 0.68), rot=(0, -fore * 32, 0), bevel=0.07, segments=1) for fore in (-1, 1) for side in (-1, 1)]
HORSE = (16.4, -2.6)
sway(place(tag(join('spring_horse', *horse), outline=0.04), at=(HORSE[0], HORSE[1], LAWN), rot=(0, 0, 180)), 8, paced(1.3), axis=1)
right.append(cylinder('spring_foot', 0.42, 0.1, 'metal', at=(HORSE[0], HORSE[1], LAWN + 0.05), sides=10))

# A bench facing the lane, by the slide.
seat = [box('bench_slat', (2.6, 0.22, 0.1), 'wood', at=(0, -0.26 + index * 0.26, 0.55), bevel=0) for index in range(3)]
seat += [box('bench_back', (2.6, 0.1, 0.24), 'wood', at=(0, 0.42, 0.85 + index * 0.3), bevel=0) for index in range(2)]
seat += [box('bench_leg', (0.16, 0.9, 0.55), 'metal', at=(side * 1.05, 0.05, 0.27), bevel=0.04, segments=1) for side in (-1, 1)]
seat += [box('bench_arm', (0.14, 0.14, 0.9), 'metal', at=(side * 1.05, 0.44, 0.9), bevel=0) for side in (-1, 1)]
right.append(put(seat, at=(15.6, 7.4, LAWN), turn=-14))

# Two posts at the finish, each with a chequered flag that flutters. The near one is short, so it hides nobody.
for index, (side, top, size) in enumerate(((1, 2.9, 0.34), (-1, 1.3, 0.26))):
    post = (FINISH + 0.5, side * (BACK + 0.85))
    right += [cylinder('finish_post', 0.11, top - LAWN, 'white', at=(post[0], post[1], (top + LAWN) / 2), sides=8), ball('finish_knob', 0.2, 'slide', at=(post[0], post[1], top + 0.1), detail=2),
              cylinder('finish_foot', 0.3, 0.2, 'white', at=(post[0], post[1], LAWN + 0.1), sides=10)]
    flag = [cylinder('flag_sleeve', 0.14, size * 3, 'white', at=(0, 0, -size * 1.5), sides=6)]
    flag += [box('flag_square', (size, 0.07, size), 'ink' if (column + row) % 2 == 0 else 'white', at=(0.12 + size * (column + 0.5), 0, -size * (row + 0.5)), bevel=0) for column in range(4) for row in range(3)]
    sway(place(tag(grounded(join('finish_flag_%d' % index, *flag)), outline=0.035, shadow=False), at=(post[0], post[1], top)), 16, paced(1.2 + index * 0.25), axis=2)
right.append(pinwheel_stick(14.7, 5.7))
tag(join('play_right', *right), outline=0.045)


# Pinwheels stuck in the grass, turning. Their sticks stand with the things round them.
def pinwheel(index, x, y, pace):
    def vanes():
        blades = [slab('vane', [(0, 0), (math.cos(math.radians(quarter * 90)) * 0.5, math.sin(math.radians(quarter * 90)) * 0.5), (math.cos(math.radians(quarter * 90 + 62)) * 0.34, math.sin(math.radians(quarter * 90 + 62)) * 0.34)],
                       0.05, 'coral' if quarter % 2 == 0 else 'cream', bevel=0) for quarter in range(4)]
        return tag(join('pinwheel', *blades, cylinder('pin', 0.08, 0.1, 'cream', sides=6)), outline=0.035, shadow=False)
    return group('pinwheel_head_%d' % index, spin(again('pinwheel', 'pinwheel_%d' % index, vanes), paced(pace)), at=(x, y - 0.1, LAWN + 1.0), rot=(FACING, 0, 0))


pinwheel(0, -4.3, 5.6, 2.0)
pinwheel(1, 4.3, 5.6, 2.4)
pinwheel(2, -14.6, 5.9, 2.2)
pinwheel(3, 14.7, 5.7, 2.6)


# Butterflies over the flowers: each flaps its wings and wanders round a little loop of its own.
def butterfly(index, x, y, color, pace):
    def wing():
        return tag(slab('wing', [(0, -0.12), (0.1, -0.34), (0.3, -0.4), (0.42, -0.22), (0.3, -0.02), (0.52, 0.1), (0.54, 0.38), (0.24, 0.44), (0, 0.1)], 0.05, color, bevel=0), outline=0.03, shadow=False)
    wings = [sway(place(again('wing_' + color, 'wing_%d_%d' % (index, side), wing), scale=(side, 1, 1)), 38 * side, paced(0.75), axis=1) for side in (-1, 1)]
    flying = group('butterfly_%d' % index, *wings)
    loop = paced(pace)
    spots = [(0, 0, 0.9), (1.1, 0.5, 1.3), (0.4, 1.3, 1.0), (-0.9, 0.8, 1.4), (-0.6, -0.4, 1.0), (0, 0, 0.9)]
    key(flying, 'location', [(loop * step / 5, (x + dx, y + dy, LAWN + dz)) for step, (dx, dy, dz) in enumerate(spots)])
    # It heads the way it is going, near enough.
    return key(flying, 'rotation_euler', [(loop * step / 5, (0, 0, math.radians(turn))) for step, turn in enumerate((-60, 20, 100, 190, 280, 300))])


butterfly(0, -4.6, 8.4, 'pollen', 6.5)
butterfly(1, 15.6, 4.8, 'petal', 7.5)
butterfly(2, -20.2, -4.2, 'white', 5.8)

# ── Paths, chalk and a pond ──────────────────────────────────────────────────
def flat(points, color, lift=0.02):
    """A flat patch lying on the lawn: `points` are its corners, counter-clockwise."""
    return bare_under(slab('flat', points, 0.04, color, at=(0, 0, LAWN + lift), bevel=0))


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def oval(x, y, wide, deep, sides=16):
    return [(x + math.cos(2 * math.pi * step / sides) * wide, y + math.sin(2 * math.pi * step / sides) * deep) for step in range(sides)]


# A sandy path runs along the inside of the fence, with a branch down to the cat's sandbox, and someone has
# chalked a game of hopscotch on it.
WALK = 13.4
paths = [flat(rect(-24.5, WALK - 0.7, 24.5, WALK + 0.7), 'sand'), flat(rect(-0.8, CAT + HALF_Y + 0.3, 0.8, WALK - 0.7), 'sand')]
paths += [flat(rect(-12.6 + step * 0.6, WALK - 0.26, -12.08 + step * 0.6, WALK + 0.26), 'white' if step % 2 == 0 else 'petal', lift=0.045) for step in range(7)]
ground(join('paths', *paths))

# A pond past the finish, with stones round it and two lily pads. The ducks go round and round.
POND = (22.6, 2.6)
pond = [flat(oval(POND[0], POND[1], 2.7, 1.9), 'water', lift=0.03), flat(oval(POND[0] - 1.3, POND[1] + 0.6, 0.42, 0.36, sides=8), 'leaf', lift=0.06),
        flat(oval(POND[0] + 1.5, POND[1] - 0.7, 0.34, 0.3, sides=8), 'leaf', lift=0.06)]
pond += [ball('pebble', 0.3 + (step % 3) * 0.06, 'kerb', at=(POND[0] + math.cos(step * 0.7) * 2.85, POND[1] + math.sin(step * 0.7) * 2.05, LAWN + 0.05), scale=(1.2, 1, 0.5), detail=1, smooth=80) for step in range(9)]
tag(join('pond', *pond), outline=0.04, shadow=False)


def duck(x, y, turn):
    body = ball('duck', 0.26, 'white', at=(0, 0, 0.14), scale=(1.3, 1, 0.8), detail=2)
    head = ball('duck_head', 0.15, 'white', at=(0.26, 0, 0.36), detail=2)
    beak = cone('duck_beak', 0.07, 0.16, 'slide', at=(0.44, 0, 0.34), rot=(0, 90, 0), sides=6)
    return put([body, head, beak], at=(x, y, 0), turn=turn)


ducks = tag(grounded(join('ducks', duck(0.95, 0, 90), duck(-0.95, 0.2, 270))), outline=0.035, shadow=False)
spin(place(ducks, at=(POND[0], POND[1], LAWN + 0.05)), 11)

# ── Who else is in the park ──────────────────────────────────────────────────
# A dog chases its ball up and down the path by the fence, and turns round at each end.
dog = [ball('dog', 0.34, 'wood', at=(0, 0, 0.5), scale=(1.5, 0.8, 0.8), detail=2), ball('dog_head', 0.27, 'wood', at=(0.52, 0, 0.82), detail=2),
       box('dog_snout', (0.26, 0.2, 0.16), 'cream', at=(0.76, 0, 0.76), bevel=0.05, segments=1), ball('dog_nose', 0.06, 'ink', at=(0.9, 0, 0.8), detail=1),
       pipe('dog_tail', [(-0.45, 0, 0.62), (-0.7, 0, 0.95)], 0.07, 'wood', sides=5)]
dog += [box('dog_ear', (0.12, 0.1, 0.26), 'trunk', at=(0.46, side * 0.22, 0.86), rot=(side * -20, 0, 0), bevel=0.04, segments=1) for side in (-1, 1)]
dog += [box('dog_leg', (0.12, 0.12, 0.36), 'wood', at=(x, side * 0.16, 0.18), bevel=0.04, segments=1) for x in (-0.3, 0.3) for side in (-1, 1)]
dog = tag(grounded(join('dog', *dog)), outline=0.04)
STRIDE = paced(0.42)
key(dog, 'location', [(0, (0, 0, 0)), (STRIDE / 2, (0, 0, 0.28)), (STRIDE, (0, 0, 0))])
key(dog, 'rotation_euler', [(0, (0, math.radians(-10), 0)), (STRIDE / 2, (0, math.radians(10), 0)), (STRIDE, (0, math.radians(-10), 0))])
its_ball = bob(tag(ball('dog_ball', 0.22, 'coral', at=(2.2, 0, 0.22), detail=2), outline=0.035), 0.5, paced(0.5))
chase = group('dog_run', dog, its_ball)
key(chase, 'location', [(0, (-21, WALK - 0.1, LAWN)), (6, (21, WALK - 0.1, LAWN)), (9, (21, WALK - 0.1, LAWN)), (15, (-21, WALK - 0.1, LAWN)), (18, (-21, WALK - 0.1, LAWN))], linear=True)
# It turns by way of the trees, not the fence.
key(chase, 'rotation_euler', [(0, (0, 0, 0)), (8.4, (0, 0, 0)), (9, (0, 0, -math.pi)), (17.4, (0, 0, -math.pi)), (18, (0, 0, -2 * math.pi))], linear=True)


# Birds sit on the fence, hop, fly off to a perch of their own and come back, each to its own timetable.
def bird(index, color, perch, roost, loop, leave):
    made = [ball('bird', 0.2, color, at=(0, 0, 0.2), scale=(1, 1.25, 0.95), detail=2), ball('bird_head', 0.14, color, at=(0, -0.2, 0.38), detail=2),
            cone('bird_beak', 0.06, 0.14, 'slide', at=(0, -0.36, 0.37), rot=(90, 0, 0), sides=5),
            slab('bird_tail', [(-0.1, 0), (0.1, 0), (0.14, 0.3), (-0.14, 0.3)], 0.05, color, at=(0, 0.2, 0.22), rot=(20, 0, 0), bevel=0)]
    made = tag(grounded(join('bird_%d' % index, *made)), outline=0.035, shadow=False)
    loop = paced(loop)
    high = tuple((a + b) / 2 + (2.2 if axis == 2 else 0) for axis, (a, b) in enumerate(zip(perch, roost)))
    hop = (perch[0], perch[1], perch[2] + 0.2)
    back = loop - 1.2
    return key(made, 'location', [(0, perch), (leave * 0.4, perch), (leave * 0.4 + 0.16, hop), (leave * 0.4 + 0.32, perch), (leave, perch), (leave + 0.6, high), (leave + 1.2, roost),
                                  (back, roost), (back + 0.6, high), (loop, perch)])


RAIL = LAWN + 0.98
bird(0, 'teal', (-13.2, 14.6, RAIL), (-9.0, 10.1, LAWN + 3.45), 13, 6.5)
bird(1, 'petal', (3.5, 14.6, RAIL), (9.5, 14.2, LAWN + 3.6), 17, 9)
bird(2, 'cream', (18.6, 14.6, RAIL), (12.4, 9.7, LAWN + 4.5), 15, 5)

# A balloon over the bench: it tugs at its string for a while, then gets away and is gone over the houses.
balloon = [lathe('balloon', [(0, 0), (0.08, 0.04), (0.3, 0.35), (0.42, 0.75), (0.36, 1.1), (0.2, 1.28), (0, 1.32)], 'teal', sides=12, smooth=70),
           pipe('balloon_string', [(0, 0, 0), (0.06, 0, -0.5), (-0.04, 0, -1.0)], 0.03, 'cream', sides=4)]
balloon = tag(grounded(join('balloon', *balloon)), outline=0.035, shadow=False)
HELD = (15.4, 7.3, LAWN + 2.4)
key(balloon, 'location', [(0, HELD), (2, (HELD[0] + 0.1, HELD[1], HELD[2] + 0.18)), (4, HELD), (6.5, (17.5, 8.6, LAWN + 5.5)), (11, (24, 13, LAWN + 15)), (15, (30, 18, LAWN + 24)), (16, (30, 18, LAWN + 24))])
key(balloon, 'scale', [(0, (0.01, 0.01, 0.01)), (0.4, (1, 1, 1)), (14.2, (1, 1, 1)), (15, (0.01, 0.01, 0.01)), (16, (0.01, 0.01, 0.01))])


# ── On the wind ──────────────────────────────────────────────────────────────
def drift(name, pieces, path, loop, turns=1.0):
    """
    Light things carried on the wind along `path`, tumbling round the way they go. They swell into view at the
    start and shrink away at the end, so the loop never shows its seam. They keep off the lane.
    """
    made = tag(grounded(join(name, *pieces)), outline=0.03, shadow=False)
    loop = paced(loop)
    key(made, 'location', [(loop * step / (len(path) - 1), point) for step, point in enumerate(path)])
    key(made, 'rotation_euler', [(0, (0, 0, 0)), (loop, (2 * math.pi * turns, 0, 0))], linear=True)
    return key(made, 'scale', [(0, (0.01, 0.01, 0.01)), (loop * 0.08, (1, 1, 1)), (loop * 0.9, (1, 1, 1)), (loop, (0.01, 0.01, 0.01))])


def scatter(count, seed, spread, make):
    """`count` pieces strewn through a box `spread` = (x, y, z) big, each turned its own way."""
    rng = random.Random(seed)
    return [make(index, tuple(rng.uniform(-size / 2, size / 2) for size in spread), tuple(rng.uniform(0, 360) for _ in range(3))) for index in range(count)]


petal = lambda color: lambda index, at, rot: slab('petal', [(0, 0.13), (-0.09, 0), (0, -0.13), (0.09, 0)], 0.03, color if index % 3 else 'white', at=at, rot=rot, bevel=0)
drift('petals_0', scatter(8, 1, (5, 1.6, 1.6), petal('petal')), [(-27, 8.6, LAWN + 2.2), (-13, 9.6, LAWN + 3.4), (0, 11.2, LAWN + 2.4), (13, 10.2, LAWN + 3.6), (27, 11.6, LAWN + 2.6)], 13)
drift('petals_1', scatter(8, 2, (6, 1.6, 1.4), petal('petal')), [(-30, 16.5, LAWN + 3.0), (-14, 17.6, LAWN + 4.2), (2, 16.2, LAWN + 3.0), (18, 17.8, LAWN + 4.4), (32, 16.8, LAWN + 3.2)], 18, turns=1.5)
# Leaves come down from the tree by the kite and settle on the path.
leaf = lambda index, at, rot: slab('leaf', [(0, 0.16), (-0.1, 0.02), (0, -0.16), (0.1, 0.02)], 0.03, 'leafLight' if index % 2 else 'leaf', at=at, rot=rot, bevel=0)
drift('leaves', scatter(6, 3, (2.4, 1.6, 1.2), leaf), [(-6.4, 11.6, LAWN + 4.2), (-4.4, 12.0, LAWN + 3.0), (-2.6, 12.6, LAWN + 1.7), (-0.6, 13.0, LAWN + 0.5)], 9, turns=2)
# Dandelion seeds lift off the daisies by the start and sail away over the swings.
seed = lambda index, at, rot: join('seed', ball('tuft', 0.09, 'white', at=at, detail=1, smooth=80), box('stalk', (0.03, 0.03, 0.2), 'cream', at=(at[0], at[1], at[2] - 0.15), bevel=0))
drift('seeds', scatter(7, 4, (3, 2, 1.4), seed), [(-22, -2.4, LAWN + 0.8), (-18, 2.4, LAWN + 2.4), (-14.5, 7, LAWN + 4.0), (-10, 12, LAWN + 5.8), (-4, 18, LAWN + 8)], 15, turns=0.5)

# ── Beyond the fence ─────────────────────────────────────────────────────────
# What the low camera finds past the park: a street of little houses, trees between them, and hills that
# close the view. The camera a round is played from never looks this far.
def house(x, y, wide, wall, roof, turn):
    tall = 2.6
    pieces = [box('wall', (wide, 4.2, tall), wall, at=(0, 0, tall / 2), bevel=0.12, segments=1),
              slab('roof', [(-2.7, 0), (2.7, 0), (0, 1.9)], wide + 0.8, roof, at=(0, 0, tall), rot=(90, 0, 90), bevel=0),
              box('door', (0.95, 0.14, 1.7), 'trunk', at=(-wide * 0.2, -2.12, 0.85), bevel=0),
              box('window', (1.0, 0.14, 1.0), 'teal', at=(wide * 0.2, -2.12, 1.55), bevel=0),
              box('chimney', (0.6, 0.6, 1.3), 'kerb', at=(wide * 0.26, 0.9, tall + 1.2), bevel=0)]
    return put(pieces, at=(x, y, LAWN), turn=turn)


# The street stands well back: the camera a round is played from stops short of it, and never shows a house cut in half.
STREET = 25.0
street = [house(-30, STREET - 0.5, 5.2, 'cream', 'coral', 6), house(-19.5, STREET + 0.5, 4.6, 'petal', 'trunk', -4), house(-9, STREET - 0.2, 5.4, 'white', 'teal', 3),
          house(2.5, STREET + 0.6, 4.8, 'cream', 'trunk', -5), house(13.5, STREET - 0.4, 5.2, 'kerb', 'coral', 4), house(24.5, STREET + 0.4, 4.6, 'white', 'teal', -6), house(35, STREET - 0.6, 5.0, 'petal', 'trunk', 5)]
# Plain round trees between and behind the houses, and down the sides of the park.
for index, (x, y, size) in enumerate(((-24.6, STREET + 2.5, 1.1), (-14, STREET + 3, 1.25), (-3.2, STREET + 2.6, 1.0), (8, STREET + 3.2, 1.2), (19, STREET + 2.4, 1.05), (29.8, STREET + 3, 1.2),
                                      (-37, STREET - 2, 1.3), (41, STREET - 1.5, 1.2), (-36, 12, 1.2), (38, 10, 1.25), (-33, 1, 1.1), (35, -1, 1.1))):
    street.append(put([cylinder('far_trunk', 0.34, 2.0, 'trunk', at=(0, 0, 1.0), sides=6), blob(1.9, 'leaf' if index % 2 else 'hedge', (0, 0, 3.2), 40 + index, squash=(1.0, 1.0, 0.95), detail=1)], at=(x, y, LAWN), size=size))
# Three crates behind the fence, for whoever wants to watch over it.
street += [box('crate', (0.8, 0.8, 0.7), 'wood', at=(x, 15.5, LAWN + 0.35), rot=(0, 0, turn), bevel=0.06, segments=1) for x, turn in ((-8.8, 8), (-2.9, -6), (6.6, 12))]
# The road the houses stand on, with its white dashes.
ROAD = 20.3
street.append(flat(rect(-80, ROAD - 1.5, 80, ROAD + 1.5), 'metal'))
street += [flat(rect(x, ROAD - 0.12, x + 2.0, ROAD + 0.12), 'white', lift=0.045) for x in range(-76, 78, 8)]
tag(join('street', *street), outline=0.06, shadow=False)

# An ice-cream van goes by, again and again.
van = [box('van', (3.2, 1.6, 1.5), 'white', at=(0, 0, 1.05), bevel=0.2), box('van_top', (2.1, 1.5, 0.5), 'petal', at=(-0.35, 0, 2.0), bevel=0.15),
       box('van_glass', (0.12, 1.3, 0.6), 'teal', at=(1.56, 0, 1.35), bevel=0), box('van_hatch', (1.2, 1.66, 0.6), 'teal', at=(-0.4, 0, 1.3), bevel=0),
       cone('van_cone', 0.3, 0.7, 'slide', at=(-0.35, 0, 2.55), rot=(180, 0, 0), sides=8), ball('van_scoop', 0.34, 'cream', at=(-0.35, 0, 3.0), detail=2)]
van += [cylinder('van_wheel', 0.36, 1.7, 'ink', at=(x, 0, 0.36), rot=(90, 0, 0), sides=10) for x in (-1.0, 1.0)]
van = tag(grounded(join('van', *van)), outline=0.06, shadow=False)
key(van, 'location', [(0, (-74, ROAD, LAWN)), (26, (74, ROAD, LAWN))], linear=True)
key(van, 'scale', [(0, (0.01, 0.01, 0.01)), (0.5, (1, 1, 1)), (25.5, (1, 1, 1)), (26, (0.01, 0.01, 0.01))])

# The hills: a ring of low domes round the back and the sides, tall enough to fill the top of the low camera's picture.
hills = []
for index in range(11):
    bearing = math.radians(-112 + index * 22.4)
    reach = 56 + (index % 3) * 5
    size = 19 + (index * 7) % 5 * 1.6
    tall = size * 0.46
    dome = facing_out(lathe('hill', [(size, -1.0), (size * 0.94, tall * 0.3), (size * 0.74, tall * 0.68), (size * 0.42, tall * 0.92), (0, tall)], 'hill', sides=16, smooth=80))
    hills.append(place(dome, at=(math.sin(bearing) * reach, 6 + math.cos(bearing) * reach, LAWN), rot=(0, 0, -math.degrees(bearing)), scale=(1.3, 1.0, 1.0)))
tag(join('hills', *hills), outline=0.12, shadow=False, receive=False)
