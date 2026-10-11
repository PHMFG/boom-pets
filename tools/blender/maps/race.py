# Corrida Maluca: a track of pale blocks folded in an S, high over the morning clouds. The track is the
# game's own tiles (top at Z = 0): three lanes joined by a turn at each end, the start nearest the camera
# and the finish farthest. This is everything round it and under it.
#
# HOW LONG THE TRACK IS BELONGS TO THE RULES (`tuning.race`), so nothing here is placed along it. Whatever
# stands on or beside the track is a template the game places from the round: the stilts, the arches, the
# flags, the bars, the grandstand, the marshals' tower. What is built in place is the sky, which fits a
# track of any length; the few pieces that stand off one end of the track say which (`off(...)`), and the
# game moves them out as far as the track reaches. The numbers below are for a track 24 m across.
#
# Three cameras look at it, all from the front:
#   - in a round, from 52 degrees up, framing the pets and the track ahead of them. It never sees the
#     horizon, so the height is told by what lies below: clouds at three depths, a patchwork of land far
#     under them, islands and balloons that get smaller the deeper they are, and the stilts. It sees
#     nothing above the floor that is more than about 6 m behind the far lane;
#   - while the game's card is up, from far and low (27 degrees): it sees 90 m past the track at the
#     clouds' level, and the sky above them. That is what the far clouds, the bank on the horizon, the two
#     high balloons and the plane with its banner are for; the round's camera never has them in the picture;
#   - as a round ends, from the winner's eye level (30 degrees, 13 m away), which sees about 55 m past it.
# A pet that falls drops 6 m before it is put back. What it can fall through beside the track is cloud;
# whatever is solid lies deeper than that, or well off to the side.
import math
import random

import kit
from kit import *

# For the pictures only: the track's lanes and turns.
guide_floor(width=24, depth=15, show=False)
for size, at in (((24, 3), (0, -6)), ((24, 3), (0, 0)), ((24, 3), (0, 6)), ((3, 6), (10.5, -3)), ((3, 6), (-10.5, 3))):
    kit._guides.append(box('guide_lane', (size[0], size[1], 1), 'track', at=(at[0], at[1], -0.5), bevel=0))
for spot in ((-10.5, -6, 0), (2, 0, 0), (8, 6, 0)):
    guide_pet(spot)

# Where the round's camera stands when it frames about half the track: this far back from what it looks at, and this high.
CAMERA = (19.0, 24.0)


def seen(x, y, depth):
    """
    Where to put something `depth` metres below the floor so that it shows at (x, y) of the floor's plane: on the
    line from the camera through that spot. The deeper a thing lies, the more it slides about as the camera moves.
    """
    back, height = CAMERA
    reach = (height + depth) / height
    return (x * reach, (y + back) * reach - back, -depth)


def settle(obj):
    """Bakes where a piece stands, how it is turned and its size into its shape, so that its origin is the scene's."""
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
    return obj


def below(obj, outline=0.05):
    """
    For whatever lies under the track or far from it: it casts no shadow, and none falls on it. The track's
    shadow would, and the shadow's map ends a few metres out, so it would stop in mid-air.
    """
    return tag(obj, outline=outline, shadow=False, receive=False)


def off(obj, side):
    """Says that a piece stands off the left (-1) or right (1) end of the track: the game moves it out with a longer one."""
    obj['side'] = side
    return obj


def sheet(name, shapes, at=(0, 0, 0)):
    """
    Flat pieces lying level, seen only from above: each is (colour, corners), the corners counter-clockwise.
    One face each, facing up, with no underside and no thickness.
    """
    bm = bmesh.new()
    names = []
    for color, shape in shapes:
        if color not in names:
            names.append(color)
        bm.faces.new([bm.verts.new((x, y, 0)) for x, y in shape]).material_index = names.index(color)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for color in names:
        mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    return obj


def gores(name, profile, colors, sides=12, at=(0, 0, 0), rot=(0, 0, 0), smooth=50):
    """Like `lathe`, but its sides take the colours in turn: the panels of a hot-air balloon or a beach ball."""
    bm = bmesh.new()
    rings = []
    for radius, z in profile:
        if radius <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((math.cos(2 * math.pi * i / sides) * radius, math.sin(2 * math.pi * i / sides) * radius, z)) for i in range(sides)])
    for lower, upper in zip(rings, rings[1:]):
        for i in range(sides):
            corners = []
            for vert in (lower[i % len(lower)], lower[(i + 1) % len(lower)], upper[(i + 1) % len(upper)], upper[i % len(upper)]):
                if vert not in corners:
                    corners.append(vert)
            if len(corners) >= 3:
                bm.faces.new(corners).material_index = i % len(colors)
    obj = kit._finish_mesh(name, bm, colors[0], at, rot, smooth)
    for color in colors[1:]:
        obj.data.materials.append(mat(color))
    return obj


# ── The land, far below ──────────────────────────────────────────────────────
# A patchwork of fields with a river through it, 46 m down: it shows between the clouds, and slides past more
# slowly than they do, which is what tells how high the track is. Everything on it is pale, as things far off are.
# It runs on past where the cameras stop seeing (400 m), so its far edge is never in the picture.
rng = random.Random(12)
patches = [('land', [(-520, -160), (520, -160), (520, 400), (-520, 400)])]
for column in range(-9, 10):
    for row in range(-3, 12):
        if rng.random() < 0.3:
            continue
        x, y = column * 19 + rng.uniform(-1.5, 1.5), row * 19 + rng.uniform(-1.5, 1.5)
        wide, deep = rng.uniform(7.5, 8.8), rng.uniform(7.5, 8.8)
        patches.append((rng.choice(('landGreen', 'landGreen', 'landWheat')), [(x - wide, y - deep), (x + wide, y - deep), (x + wide, y + deep), (x - wide, y + deep)]))
# The fields lie a little over the ground and the river a little over the fields, or they would flicker through each other.
land = sheet('land', patches[:1], at=(0, 0, -46.3))
fields = sheet('fields', patches[1:], at=(0, 0, -46.15))
# The river is one bent ribbon, a little over the fields.
bends = [(-190, 96), (-130, 70), (-84, 84), (-40, 44), (8, 56), (52, 22), (104, 36), (150, 4), (200, 14)]
banks = [(x, y + 5.5) for x, y in bends] + [(x, y - 5.5) for x, y in reversed(bends)]
river = sheet('river', [('landRiver', [banks[index], banks[index + 1], banks[len(banks) - 2 - index], banks[len(banks) - 1 - index]][::-1]) for index in range(len(bends) - 1)], at=(0, 0, -46))
below(settle(join('land', land, fields, river)), outline=0)


# ── Clouds ───────────────────────────────────────────────────────────────────
# Fluffy heaps with flat bottoms. A bank is three of them some metres apart, in one piece, so that a whole
# sky of them costs a handful of pieces to draw.
def heap(name, seed, lobes, size, color, at=(0, 0, 0), detail=2):
    rng = random.Random(seed)
    pieces = []
    for index in range(lobes):
        radius = size * (1.0 if index == 0 else rng.uniform(0.55, 0.82))
        x = 0 if index == 0 else rng.choice((-1, 1)) * rng.uniform(0.6, 1.25) * size
        y = 0 if index == 0 else rng.uniform(-0.45, 0.45) * size
        pieces.append(ball('%s_%d' % (name, index), radius, color, at=(at[0] + x, at[1] + y, at[2] + radius * 0.5), scale=(1.2, 1.0, 0.62), detail=detail))
    return pieces


def bank(name, size, color, spread, detail=2):
    """Three heaps of cloud round the origin, `spread` metres apart. `detail` 1 is for banks so far off that their corners cannot be seen."""
    pieces = heap(name + '_a', 3, 4, size, color, detail=detail) + heap(name + '_b', 8, 3, size * 0.85, color, at=(-spread, spread * 0.42, -size * 0.3), detail=detail) \
        + heap(name + '_c', 15, 5, size * 1.1, color, at=(spread * 1.1, -spread * 0.3, size * 0.2), detail=detail)
    return below(settle(join(name, *pieces)), outline=0)


# Three layers under the track: white ones just below it, lavender ones farther down, and a deep, wide one.
# The game drifts each layer along X at its own speed, the near one fastest. A layer is two rows of banks, one
# in front of the track and one behind it, evenly spaced over PERIOD metres: a bank that has left on one side
# comes back on the other, so a layer has no end and no hole in it, however long the track is.
PERIOD = 104
layers = {
    # name: colour, how big, how far apart a bank's heaps are, how deep, how many banks to a row (the bigger the
    # bank, the fewer it takes) and the two rows' y. A bank is pushed back 0.78 m for every metre of depth, which
    # is the slope the round's camera looks down, so that it shows at about that y of the floor's plane.
    'clouds_near': ('white', 1.25, 8.5, 5.0, 5, (-10.2, 7.5)),
    'clouds_mid': ('cloud', 2.3, 9.5, 11.2, 4, (-6.5, 6.5)),
    'clouds_far': ('cloudDeep', 4.2, 11, 21.0, 4, (-7.5, 6.5)),
}
moulds = {}
rng = random.Random(5)
for layer, (color, size, spread, depth, per_row, rows) in layers.items():
    mould = moulds[layer] = bank(layer + '_bank', size, color, spread)
    made = []
    for row, y in enumerate(rows):
        for index in range(per_row):
            # The second row stands in the gaps of the first.
            x = -PERIOD / 2 + (index + 0.25 + row * 0.5) * PERIOD / per_row
            deep = depth + rng.uniform(-0.6, 0.9)
            where = (x, y + rng.uniform(-1.2, 1.2) + deep * 0.78, -deep)
            turn = (row * 180 + rng.uniform(-15, 15))
            made.append(place(mould, at=where, rot=(0, 0, turn)) if not made else copy(mould, '%s_%d' % (layer, len(made)), at=where, rot=(0, 0, turn), scale=rng.uniform(1.0, 1.25)))
    group(layer, *made)['period'] = PERIOD

# The far clouds: the same sea going on to the horizon, where the card's camera looks. They stand still, and
# are too far off for their corners to be seen.
far = [bank('far_bank_a', 2.3, 'cloud', 9.5, detail=1), bank('far_bank_b', 4.2, 'cloudDeep', 11, detail=1)]
for index, (x, y, depth, size, turn) in enumerate([(-58, 30, 12, 1.5, 0), (-28, 34, 13, 1.7, 180), (4, 31, 12, 1.6, 20), (34, 35, 13, 1.7, 200), (64, 30, 12, 1.5, 0),
                                                   (-44, 50, 13, 2.0, 180), (-8, 54, 14, 2.2, 0), (28, 52, 13, 2.1, 160), (66, 50, 13, 2.0, 30), (-78, 44, 13, 2.0, 10)]):
    mould = far[index % 2]
    (place(mould, at=(x, y, -depth), rot=(0, 0, turn), scale=size) if index < 2 else copy(mould, 'far_sea_%d' % index, at=(x, y, -depth), rot=(0, 0, turn), scale=size))
# And a bank of tall ones along the horizon, paler for being far.
horizon = bank('horizon_bank', 9.5, 'cloudFar', 17)
for index, (x, y, z, size, turn) in enumerate([(-84, 76, -16, 1.0, 0), (-40, 84, -14, 1.2, 180), (6, 80, -15, 1.1, 10), (50, 86, -14, 1.25, 190), (96, 76, -16, 1.0, 0)]):
    (place(horizon, at=(x, y, z), rot=(0, 0, turn), scale=size) if index == 0 else copy(horizon, 'horizon_%d' % index, at=(x, y, z), rot=(0, 0, turn), scale=size))


# ── Stilts ───────────────────────────────────────────────────────────────────
# What holds the track up: a fat striped leg standing in a puff of cloud of its own. It is short: long ones
# cross the whole picture like scaffolding. The game stands one wherever the round's track is always whole.
def puff(name, at, size=1.0):
    """A small heap of cloud for something to stand in."""
    return [ball('%s_%d' % (name, index), radius * size, 'white', at=(at[0] + x * size, at[1] + y * size, at[2] + z * size), scale=(1.2, 1.0, 0.7))
            for index, (radius, x, y, z) in enumerate([(0.95, 0, 0, 0), (0.7, 0.95, 0.15, -0.1), (0.66, -0.9, -0.1, -0.12)])]


def leg(name, at=(0, 0, 0), reach=-5.2):
    """A striped leg from under the floor down to `reach`, with its puff."""
    pieces = [lathe(name, [(0, -1.0), (0.95, -1.0), (0.95, -1.22), (0.62, -1.62), (0.5, -2.0), (0.5, reach), (0, reach)], 'pylon', at=at, sides=10)]
    pieces += [cylinder('%s_band_%d' % (name, index), 0.55, 0.42, 'white', at=(at[0], at[1], at[2] + z), sides=10) for index, z in enumerate((-2.9, -4.0))]
    return pieces + puff(name + '_puff', (at[0], at[1], at[2] + reach - 0.1))


part(below(settle(join('stilt', *leg('stilt')))))


# ── Hot-air balloons ─────────────────────────────────────────────────────────
ENVELOPE = [(0, 0), (0.45, 0.02), (1.2, 0.8), (1.8, 1.9), (1.95, 2.8), (1.7, 3.6), (1.05, 4.15), (0, 4.35)]


def balloon(name, colors):
    envelope = gores('%s_envelope' % name, ENVELOPE, colors, sides=12)
    neck = cylinder('%s_neck' % name, 0.42, 0.5, 'basket', at=(0, 0, -0.2), top=0.36, sides=10)
    basket = box('%s_basket' % name, (0.95, 0.95, 0.7), 'basket', at=(0, 0, -0.85), bevel=0.14)
    rim = box('%s_rim' % name, (1.08, 1.08, 0.18), colors[0], at=(0, 0, -0.52), bevel=0.07)
    return below(join(name, envelope, neck, basket, rim))


# A big one off the right end of the track, its top well below the floor, in a holder the game lifts when
# somebody crosses the line.
indigo = balloon('balloon_indigo', ('indigo', 'cream'))
bob(indigo, 0.6, 5.4)
off(group('lift_0', indigo, at=(15.6, 0.0, -6.6), rot=(0, 0, 15)), 1)
# Three small ones far below, racing each other under the track: the game moves each holder along at its own
# pace and brings it round again, and each bobs in its holder.
teal = balloon('balloon_teal', ('pylon', 'cream'))
for index, (mould, y, depth, size, seconds) in enumerate([(teal, -3.0, 11.5, 0.9, 4.6), (None, 3.1, 15, 0.8, 5.9), (None, -3.0, 19, 0.8, 6.8)]):
    racer = mould or copy(teal if index % 2 == 0 else indigo, 'racer_balloon_%d' % index, at=(0, 0, 0), scale=size)
    place(racer, at=(0, 0, 0), scale=size)
    bob(racer, 0.6, seconds)
    group('racer_%d' % index, racer, at=seen(-14 + index * 13, y, depth), rot=(0, 0, index * 40))
# And two high in the far sky, one to each side, for the card's camera: far enough behind the track and high
# enough that the round's camera never has them in the picture. Twice the size, so their outline is twice as
# thick, which is right for something that far away. They too are lifted at the line.
for index, (mould, x, y, z, size, seconds) in enumerate([(teal, -25, 31, -4.4, 1.8, 7.0), (indigo, 26, 28, -5.6, 1.85, 8.2)]):
    high = copy(mould, 'balloon_high_%d' % index, at=(0, 0, 0), scale=size)
    high.animation_data_clear()
    bob(high, 1.0, seconds)
    off(group('lift_%d' % (index + 1), high, at=(x, y, z), rot=(0, 0, 30 + index * 50)), -1 if x < 0 else 1)


# ── A blimp, cruising under the gap between the middle lane and the far one ───
# Built along X. The game slides it across the sky and brings it round again; its propeller turns here.
hull = settle(gores('blimp_hull', [(0, -3.1), (0.55, -2.8), (1.05, -1.9), (1.3, -0.4), (1.25, 0.9), (0.95, 2.1), (0.5, 2.8), (0, 3.05)], ('cream', 'indigo'), sides=12, rot=(0, 90, 0)))
fins = [slab('blimp_fin_%d' % index, [(0, 0.2), (1.0, 0.4), (1.6, 1.9), (0.7, 1.7)], 0.16, 'indigo', at=(-3.0, 0, 0), rot=(turn, 0, 0), bevel=0.05) for index, turn in enumerate((90, 210, 330))]
cabin = box('blimp_cabin', (1.6, 0.7, 0.6), 'basket', at=(0.3, 0, -1.45), bevel=0.2)
blimp_body = below(join('blimp_body', hull, *fins, cabin))
blades = below(join('blimp_blades', box('blade_a', (0.12, 1.5, 0.3), 'white', bevel=0.05), box('blade_b', (0.12, 0.3, 1.5), 'white', bevel=0.05), ball('blade_hub', 0.2, 'white')), outline=0.04)
place(blades, at=(-3.3, 0, 0))
spin(blades, 1.6, axis=0)
# It bobs inside the group the game slides, so the two never fight over where it is.
blimp_float = group('blimp_float', blimp_body, blades)
bob(blimp_float, 0.4, 6.0)
group('blimp', blimp_float, at=seen(-9, 3.0, 7.6))


# ── Floating islands ─────────────────────────────────────────────────────────
def tree(name, at, size=1.0):
    trunk = cylinder('%s_trunk' % name, 0.16 * size, 0.9 * size, 'soil', at=(at[0], at[1], at[2] + 0.45 * size), sides=8)
    crown = rock('%s_crown' % name, 0.75 * size, 'leaf', at=(at[0], at[1], at[2] + 1.3 * size), seed=len(name), rough=0.14, smooth=70, detail=2)
    return [trunk, crown]


def island(name, seed, radius):
    under = rock('%s_under' % name, radius * 0.85, 'soil', seed=seed, rough=0.2, scale=(1.1, 1.1, 1.3), at=(0, 0, -radius * 1.1))
    top = lathe('%s_top' % name, [(0, -0.35), (radius * 1.02, -0.35), (radius * 1.12, -0.08), (radius * 0.98, 0.16), (0, 0.24)], 'grass', sides=11, rot=(0, 0, seed * 13))
    return [under, top]


# The windmill's island, off the far left corner and only a little below the floor, far enough out to be seen
# past the marshals' tower, which the game stands beside the last turn.
mill_spot = (-21.5, 14.0, -3.0)
tower = lathe('mill_tower', [(0, 0.1), (0.85, 0.1), (0.62, 2.3), (0, 2.3)], 'cream', sides=10)
roof = cone('mill_roof', 0.85, 0.9, 'indigo', at=(0, 0, 2.7), sides=10)
door = box('mill_door', (0.5, 0.2, 0.8), 'soil', at=(0, -0.76, 0.55), bevel=0.08)
mill_island = below(settle(join('mill_island', *island('mill', 4, 2.3), tower, roof, door, *tree('mill_tree', (-1.45, -0.5, 0.1), 0.9), *tree('mill_tree2', (1.5, 0.4, 0.1), 0.7))))
off(place(mill_island, at=mill_spot), -1)
# Two spectators stand on the grass in front of the mill: x, y and height, from the island's middle.
mill_island['spots'] = [-0.6, -1.5, 0.24, 0.8, -1.45, 0.24]
sails = [slab('sail_%d' % index, [(-0.22, 0.25), (0.22, 0.25), (0.3, 1.9), (-0.3, 1.9)], 0.1, 'white', rot=(90, 0, 0), bevel=0.04) for index in range(4)]
for index, sail in enumerate(sails):
    sail.rotation_euler = Euler((math.radians(90), math.radians(index * 90), 0))
wheel = below(join('mill_sails', ball('sail_hub', 0.24, 'white'), *[settle(sail) for sail in sails]), outline=0.04)
# The game turns the sails, faster as the leader nears the line. They face the camera.
off(place(wheel, at=(mill_spot[0], mill_spot[1] - 0.95, mill_spot[2] + 1.95)), -1)

# Two wooded ones far down, each seen through one of the gaps between the lanes.
woods = below(settle(join('wood_island', *island('wood', 9, 2.4), *tree('wood_a', (-0.9, 0.3, 0.1), 1.2), *tree('wood_b', (0.9, -0.5, 0.1), 0.9), *tree('wood_c', (0.5, 1.0, 0.1), 1.05))))
place(woods, at=seen(2.4, -3.0, 13.0))
bob(woods, 0.4, 7.0)
rocky = below(settle(join('small_island', *island('small', 14, 1.9), *tree('small_a', (0.2, 0.1, 0.1), 1.2))))
place(rocky, at=seen(7.2, 3.0, 12.0))
bob(rocky, 0.35, 5.6)


# ── Somewhere to watch from ──────────────────────────────────────────────────
def bunting(name, start, end, sag, count, shades):
    """Pennants on a sagging line."""
    pieces = []
    line = arc(start, end, -sag, steps=count)
    pieces.append(pipe('%s_line' % name, line, 0.05, 'pylon', sides=6))
    for index in range(count):
        a, b = Vector(line[index]), Vector(line[index + 1])
        middle = (a + b) / 2
        wide = (b - a).length * 0.42
        pieces.append(slab('%s_pennant_%d' % (name, index), [(-wide, 0), (wide, 0), (0, -0.62)], 0.07, shades[index % len(shades)], at=(middle.x, middle.y, middle.z - 0.03), rot=(90, 0, 0), bevel=0.02))
    return pieces


# The grandstand: three steps on two legs, with bunting over its back. The game stands it behind the last lane
# near the finish, its front edge (Y = 0) toward the track, and puts spectators on its steps.
WIDE = 6.6
steps = [box('stand_step_%d' % index, (WIDE, 1.0, 1.1 + index * 0.5), 'cream', at=(0, 0.5 + index * 0.95, -0.3 + index * 0.25), bevel=0.1) for index in range(3)]
cheeks = [box('stand_cheek_%d' % index, (0.3, 3.1, 1.5), 'pylon', at=(side * (WIDE / 2 + 0.1), 1.5, -0.35), bevel=0.1) for index, side in enumerate((-1, 1))]
back = box('stand_back', (WIDE + 0.5, 0.3, 2.2), 'pylon', at=(0, 3.05, 0.25), bevel=0.1)
masts = [cylinder('stand_mast_%d' % index, 0.1, 2.3, 'pylon', at=(side * (WIDE / 2 + 0.1), 3.05, 2.4), sides=8) for index, side in enumerate((-1, 1))]
flags = bunting('stand_bunting', (-WIDE / 2 - 0.1, 3.05, 3.45), (WIDE / 2 + 0.1, 3.05, 3.45), 0.55, 9, ('mint', 'lilac'))
legs = leg('stand_leg_a', at=(-2.0, 1.6, 0.1)) + leg('stand_leg_b', at=(2.0, 1.6, 0.1))
stand = part(below(settle(join('stand', *steps, *cheeks, back, *masts, *flags, *legs))))
# Where its six spectators stand, as x, y and height: three on the first step, two on the second, one on top.
stand['spots'] = [-2.1, 0.5, 0.25, 0.0, 0.5, 0.25, 2.1, 0.5, 0.25, -1.05, 1.45, 0.75, 1.05, 1.45, 0.75, 0.0, 2.4, 1.25]

# The marshals' tower: a round tub on one leg, for three. The game stands it beside the last turn.
tub = lathe('tower_tub', [(0, -0.95), (1.45, -0.95), (1.7, -0.5), (1.7, 0.45), (1.5, 0.45), (1.5, 0.0), (0, 0.0)], 'pylon', sides=14)
floor = cylinder('tower_floor', 1.5, 0.1, 'cream', at=(0, 0, 0.0), sides=14)
tower = part(below(settle(join('tower', tub, floor, *leg('tower_leg', at=(0, 0, 0.05))))))
tower['spots'] = [-0.62, 0.4, 0.05, 0.62, 0.4, 0.05, 0.0, -0.62, 0.05]


# ── Templates the game places itself ─────────────────────────────────────────
# An arch stands just past each end of the track, across it: built here round the origin with the track
# running along X. A fat blown-up tube with a board on top that is read from above, and the two stilts it
# stands on, which are a piece of their own so that the game can wobble the tube.
HALF = 1.95


def arch(name, color, board):
    half = HALF
    path = [(0, -half, -0.7), (0, -half, 0.6), (0, -half, 1.75)]
    for step in range(1, 8):
        angle = math.pi * step / 8
        path.append((0, -half * math.cos(angle), 1.75 + 1.25 * math.sin(angle)))
    path += [(0, half, 1.75), (0, half, 0.6), (0, half, -0.7)]
    tube = pipe('%s_tube' % name, path, 0.42, color, sides=10)
    pieces = [tube]
    # Seams: a white band round the tube at each foot and three over the top.
    for index in (1, 4, 6, 8, 11):
        a, b = Vector(path[index - 1]), Vector(path[index + 1])
        along = (b - a).normalized() * 0.11
        here = Vector(path[index])
        pieces.append(pipe('%s_seam_%d' % (name, index), [tuple(here - along), tuple(here + along)], 0.47, 'white', sides=10))
    return pieces + board


feet = [lathe('arch_foot_%d' % side, [(0, -0.6), (0.56, -0.6), (0.56, -0.9), (0.36, -1.3), (0.34, -4.6), (0, -4.6)], 'pylon', at=(0, side * HALF, 0), sides=12) for side in (-1, 1)]
part(below(settle(join('arch_feet', *feet, *puff('arch_puff_a', (0, -HALF, -4.7), 0.85), *puff('arch_puff_b', (0, HALF, -4.7), 0.85)))))


# The start: green, with white arrows on its board pointing down the track.
chevron = [(-0.36, 0.38), (-0.04, 0.38), (0.36, 0), (-0.04, -0.38), (-0.36, -0.38), (0.04, 0)]
start_board = [box('start_board', (1.5, 2.9, 0.16), 'start', at=(0, 0, 3.5), bevel=0.07)]
start_board += [slab('start_arrow_%d' % index, chevron, 0.08, 'white', at=(0, y, 3.6), bevel=0.02) for index, y in enumerate((-0.92, 0, 0.92))]
part(tag(settle(join('arch_start', *arch('arch_start', 'start', start_board))), outline=0.05, shadow=False))

# The finish: gold, with a chequered board.
finish_board = [box('finish_board', (1.5, 2.9, 0.14), 'ink', at=(0, 0, 3.48), bevel=0.07)]
finish_board += [box('finish_check_%d_%d' % (column, row), (0.66, 0.66, 0.1), 'white' if (column + row) % 2 == 0 else 'ink', at=(-0.33 + column * 0.66, -0.99 + row * 0.66, 3.58), bevel=0.03)
                 for column in range(2) for row in range(4)]
finish = part(tag(settle(join('arch_finish', *arch('arch_finish', 'flag', finish_board))), outline=0.05, shadow=False))
# Lamps over it, toward the track: the game runs a light along them when somebody crosses the line.
for index in range(7):
    angle = math.pi * (index + 1) / 8
    lamp = ball('lamp_%d' % index, 0.15, 'cream', at=(-0.5, -HALF * 0.96 * math.cos(angle), 1.75 + 1.2 * math.sin(angle)))
    lamp.parent = finish
    tag(lamp, glow=1.3, outline=0, shadow=False)

# A flag where a fallen pet comes back: a pole on a bracket bolted to the side of the track, and a pennant in
# two halves that the game waves. The pole stands at the origin, the bracket reaches 0.35 either side of it.
# The gold knob on top of the pole belongs to the pennant's first half: a ball turns unseen, and each piece
# then has one colour and costs less to draw. They stand off the track, so none casts a shadow.
bracket = box('flag_bracket', (0.7, 0.7, 0.5), 'post', at=(0, 0, -0.33), bevel=0.1)
pole = cylinder('flag_pole', 0.085, 2.4, 'post', at=(0, 0, 1.1), sides=8)
part(tag(settle(join('flag_post', bracket, pole)), outline=0.045, shadow=False))
cloth = slab('flag_cloth_a', [(0, -0.38), (0.6, -0.2), (0.6, 0.2), (0, 0.38)], 0.09, 'flag', rot=(90, 0, 0), bevel=0.03)
knob = ball('flag_knob', 0.17, 'flag', at=(0, 0, 0.5))
part(tag(settle(join('flag_cloth_a', settle(cloth), knob)), outline=0.045, shadow=False))
part(tag(settle(slab('flag_cloth_b', [(0, -0.2), (0.62, 0), (0, 0.2)], 0.09, 'flag', rot=(90, 0, 0), bevel=0.03)), outline=0.045, shadow=False))

# The sweeper: a post in the middle of the track, and the bar the game turns on it. The bar is the one thing
# here that hurts, so it wears the danger colour, striped like a barrier. It is 3.4 long and 0.36 thick, the
# reach and thickness the game scales from its own numbers, and it lies along Y.
foot = lathe('sweeper_foot', [(0, 0), (0.4, 0), (0.4, 0.1), (0.3, 0.2), (0.17, 0.24), (0.17, 0.62), (0.3, 0.64), (0.3, 0.72), (0.18, 0.86), (0, 0.9)], 'post', sides=12)
part(tag(foot, outline=0.045))
RADIUS = 0.18
stripes = [('bar', 0.32), ('white', 0.26), ('bar', 0.5), ('white', 0.26), ('bar', 0.36), ('white', 0.26), ('bar', 0.5), ('white', 0.26), ('bar', 0.32)]
pieces = []
y = -1.7 + RADIUS
for index, (color, length) in enumerate(stripes):
    pieces.append(cylinder('bar_%d' % index, RADIUS, length, color, at=(0, y + length / 2, 0.42), rot=(90, 0, 0), sides=10))
    y += length
pieces += [ball('bar_tip_%d' % index, RADIUS, 'bar', at=(0, side * (1.7 - RADIUS), 0.42)) for index, side in enumerate((-1, 1))]
part(tag(settle(join('sweeper_bar', *pieces)), outline=0.045))

# ── Traffic ──────────────────────────────────────────────────────────────────
# A bird, flying toward +X, seen from above most of the time: a small body and two swept wings, like a gull cut
# out of card. The game sends a flock across under the track now and then, and beats each one's wings by
# squeezing its span.
body = ball('bird_body', 0.15, 'white', scale=(2.3, 0.9, 0.8))
head = ball('bird_head', 0.11, 'white', at=(0.36, 0, 0.03))
tail = slab('bird_tail', [(-0.3, -0.07), (-0.58, -0.17), (-0.58, 0.17), (-0.3, 0.07)], 0.05, 'white', bevel=0.015)
wings = [slab('bird_wing_%d' % index, [(0.16, 0.0), (0.02, side * 0.5), (-0.22, side * 0.86), (-0.3, side * 0.8), (-0.14, 0.0)][::side], 0.05, 'white', at=(0, side * 0.06, 0.05), rot=(side * 10, 0, 0), bevel=0.015)
         for index, side in enumerate((-1, 1))]
part(below(settle(join('bird', body, head, tail, *wings)), outline=0.035))

# A little plane towing a banner, flying toward +X: it crosses the sky behind the track every so often. Its
# propeller is a piece of its own, which the game spins.
fuselage = ball('plane_body', 0.5, 'pylon', scale=(2.3, 0.85, 0.9), detail=2)
wing = [box('plane_wing_%d' % index, (0.9, 3.4, 0.12), 'cream', at=(0.25, 0, z), bevel=0.05) for index, z in enumerate((-0.18, 0.5))]
struts = [cylinder('plane_strut_%d' % index, 0.05, 0.68, 'pylon', at=(0.25, side * 1.1, 0.16), sides=6) for index, side in enumerate((-1, 1))]
tail = [box('plane_tail', (0.5, 1.3, 0.1), 'cream', at=(-1.0, 0, 0.1), bevel=0.04), slab('plane_fin', [(0, 0), (0.55, 0), (0.15, 0.55), (0, 0.55)], 0.1, 'cream', at=(-1.25, 0, 0.1), rot=(90, 0, 0), bevel=0.03)]
rope = pipe('plane_rope', [(-1.1, 0, 0.0), (-2.4, 0, -0.1), (-3.6, 0, -0.05)], 0.035, 'pylon', sides=5)
cloth = []
for index in range(6):
    x = -4.1 - index * 1.0
    cloth.append(box('banner_%d' % index, (1.04, 0.07, 1.0), 'cream' if index % 2 == 0 else 'lilac', at=(x, 0, -0.05 + (0.07 if index % 2 else -0.07)), rot=(0, 9 if index % 2 else -9, 0), bevel=0.02))
plane = part(below(settle(join('plane', fuselage, *wing, *struts, *tail, rope, *cloth))))
prop = below(settle(join('plane_prop', box('prop_a', (0.07, 1.3, 0.2), 'white', bevel=0.03), box('prop_b', (0.07, 0.2, 1.3), 'white', bevel=0.03))), outline=0.03)
prop.parent = plane
prop.location = (1.2, 0, 0)
