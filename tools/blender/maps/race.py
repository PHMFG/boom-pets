# Corrida Maluca: a track of pale blocks folded in an S, high over the morning clouds. The track is the
# game's own tiles (24 by 15, top at Z = 0): three lanes at Y = -6 (the start, nearest the camera), 0 and 6
# (the finish), joined by a turn at each end. This is everything round it and under it.
# The camera looks down from the front and never sees the horizon, so the height is told by what lies below:
# clouds at three depths, islands and balloons that get smaller the deeper they are, and the stilts.
# A pet that falls drops 6 m before it is put back. What it can fall through beside the track is cloud; whatever
# is solid lies deeper than that, or well off to the side.
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

# Where the camera stands when it frames about half the track: this far back from what it looks at, and this high.
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
    """Bakes where a piece stands into its shape, so that its origin is the scene's and the game can turn it plainly."""
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
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


# ── Clouds ───────────────────────────────────────────────────────────────────
# Fluffy heaps with flat bottoms, at three depths: white ones just under the track, lavender ones farther
# down, and a deep, wide layer. The game drifts each layer along X at its own speed, the near one fastest.
def cloud(name, seed, lobes, size, color):
    rng = random.Random(seed)
    pieces = []
    for index in range(lobes):
        radius = size * (1.0 if index == 0 else rng.uniform(0.55, 0.82))
        x = 0 if index == 0 else rng.choice((-1, 1)) * rng.uniform(0.6, 1.25) * size
        y = 0 if index == 0 else rng.uniform(-0.45, 0.45) * size
        pieces.append(ball('%s_%d' % (name, index), radius, color, at=(x, y, radius * 0.5), scale=(1.2, 1.0, 0.62)))
    return tag(settle(join(name, *pieces)), outline=0, shadow=False)


layers = {
    # name: colour, how big, and for each cloud x, y and depth. It is pushed back 0.78 m for every metre of depth,
    # which is the slope the camera looks down, so that it shows at about that x and y of the floor's plane.
    'clouds_near': ('white', 1.25, [(-17, -10.5, 4.6), (-7.5, -11, 5.4), (6, -10.2, 4.4), (17.5, -9, 5.2), (-15.5, 4, 5.0), (15.8, 3.2, 4.6), (-24, -2, 5.6),
                                    (24, -6, 5.0), (-3, 10.6, 4.2), (10, 11, 5.0), (-1.5, -3.2, 6.6), (-27, 8, 5.2), (28, 9, 4.8)]),
    'clouds_mid': ('cloud', 2.3, [(-21, -9, 10), (-9, -4, 11.5), (3, -8.5, 10.5), (14, -2, 12), (25, -8, 11), (-16, 5, 12.5), (-3, 3.4, 11), (9, 7.5, 10.2), (21, 6, 12.6),
                                  (-27, 0, 11.8), (-11, 10.5, 10.6), (29, 1, 10.4)]),
    'clouds_far': ('cloudDeep', 4.2, [(-24, -8, 19), (-10, -11, 21), (4, -5, 20), (18, -10, 22), (28, -2, 19.5), (-18, 2, 22.5), (-4, 6, 20.5), (11, 3, 22), (24, 8, 20),
                                      (-28, 9, 21.5), (-12, -2, 23), (0, 12, 21)]),
}
for layer, (color, size, spots) in layers.items():
    moulds = [cloud('%s_a' % layer, 3, 4, size, color), cloud('%s_b' % layer, 8, 3, size * 0.85, color), cloud('%s_c' % layer, 15, 5, size * 1.1, color)]
    made = []
    for index, (x, y, depth) in enumerate(spots):
        mould = moulds[index % 3]
        made.append(place(mould, at=(x, y + depth * 0.78, -depth)) if index < 3 else copy(mould, '%s_%d' % (layer, index), at=(x, y + depth * 0.78, -depth), rot=(0, 0, (index * 67) % 40 - 20), scale=1.0 + (index % 4) * 0.08))
    group(layer, *made)


# ── Stilts ───────────────────────────────────────────────────────────────────
# What holds the track up: a fat striped leg under the middle of each lane, where the track is always whole,
# standing in a puff of cloud of its own. They are short: long ones cross the whole picture like scaffolding.
def puff(name, at, size=1.0):
    """A small heap of cloud for something to stand in."""
    return [ball('%s_%d' % (name, index), radius * size, 'white', at=(at[0] + x * size, at[1] + y * size, at[2] + z * size), scale=(1.2, 1.0, 0.7))
            for index, (radius, x, y, z) in enumerate([(0.95, 0, 0, 0), (0.7, 0.95, 0.15, -0.1), (0.66, -0.9, -0.1, -0.12), (0.6, 0.1, -0.7, -0.05)])]


flange = lathe('stilt_top', [(0, -1.0), (0.95, -1.0), (0.95, -1.22), (0.62, -1.62), (0.5, -2.0), (0.5, -5.2), (0, -5.2)], 'pylon', sides=14)
bands = [cylinder('stilt_band_%d' % index, 0.55, 0.42, 'white', at=(0, 0, z), sides=14) for index, z in enumerate((-2.9, -4.0))]
stilt = tag(join('stilt', flange, *bands, *puff('stilt_puff', (0, 0, -5.3))), outline=0.05, shadow=False)
spots = [(x, y) for y in (-6, 0, 6) for x in (-10.5, -3, 3, 10.5)]
place(stilt, at=(spots[0][0], spots[0][1], 0))
for index, (x, y) in enumerate(spots[1:]):
    copy(stilt, 'stilt_%d' % index, at=(x, y, 0))


# ── Hot-air balloons ─────────────────────────────────────────────────────────
ENVELOPE = [(0, 0), (0.45, 0.02), (1.2, 0.8), (1.8, 1.9), (1.95, 2.8), (1.7, 3.6), (1.05, 4.15), (0, 4.35)]


def balloon(name, colors):
    envelope = gores('%s_envelope' % name, ENVELOPE, colors, sides=12)
    neck = cylinder('%s_neck' % name, 0.42, 0.5, 'basket', at=(0, 0, -0.2), top=0.36, sides=10)
    basket = box('%s_basket' % name, (0.95, 0.95, 0.7), 'basket', at=(0, 0, -0.85), bevel=0.14)
    rim = box('%s_rim' % name, (1.08, 1.08, 0.18), 'pylon', at=(0, 0, -0.52), bevel=0.07)
    return tag(join(name, envelope, neck, basket, rim), outline=0.05, shadow=False)


# A big one off each end of the track, where the turns are, its top well below the floor; and two small ones
# far below, seen through the gaps between the lanes. Each bobs at its own pace.
teal = balloon('balloon_teal', ('pylon', 'cream'))
place(teal, at=(-15.8, 3.8, -6.2))
bob(teal, 0.5, 4.6)
indigo = balloon('balloon_indigo', ('indigo', 'cream'))
place(indigo, at=(15.6, 0.0, -6.6), rot=(0, 0, 15))
bob(indigo, 0.6, 5.4)
for index, (x, y, depth, size) in enumerate([(7.0, 3.1, 15, 0.8), (-6.5, -3.0, 19, 0.8)]):
    small = copy(teal if index % 2 else indigo, 'balloon_far_%d' % index, at=seen(x, y, depth), rot=(0, 0, index * 40), scale=size)
    bob(small, 0.7, 5.0 + index * 0.9)


# ── A blimp, cruising under the gap between the middle lane and the far one ───
# Built along X. The game slides it across the sky and brings it round again; its propeller turns here.
hull = settle(gores('blimp_hull', [(0, -3.1), (0.55, -2.8), (1.05, -1.9), (1.3, -0.4), (1.25, 0.9), (0.95, 2.1), (0.5, 2.8), (0, 3.05)], ('cream', 'indigo'), sides=12, rot=(0, 90, 0)))
fins = [slab('blimp_fin_%d' % index, [(0, 0.2), (1.0, 0.4), (1.6, 1.9), (0.7, 1.7)], 0.16, 'pylon', at=(-3.0, 0, 0), rot=(turn, 0, 0), bevel=0.05) for index, turn in enumerate((90, 210, 330))]
cabin = box('blimp_cabin', (1.6, 0.7, 0.6), 'basket', at=(0.3, 0, -1.45), bevel=0.2)
blimp_body = tag(join('blimp_body', hull, *fins, cabin), outline=0.05, shadow=False)
blades = tag(join('blimp_blades', box('blade_a', (0.12, 1.5, 0.3), 'white', bevel=0.05), box('blade_b', (0.12, 0.3, 1.5), 'white', bevel=0.05), ball('blade_hub', 0.2, 'pylon')), outline=0.04, shadow=False)
place(blades, at=(-3.3, 0, 0))
spin(blades, 1.6, axis=0)
# It bobs inside the group the game slides, so the two never fight over where it is.
blimp_float = group('blimp_float', blimp_body, blades)
bob(blimp_float, 0.4, 6.0)
group('blimp', blimp_float, at=seen(-9, 3.0, 7.6))


# ── Floating islands ─────────────────────────────────────────────────────────
def tree(name, at, size=1.0):
    trunk = cylinder('%s_trunk' % name, 0.16 * size, 0.9 * size, 'basket', at=(at[0], at[1], at[2] + 0.45 * size), sides=8)
    crown = rock('%s_crown' % name, 0.75 * size, 'leaf', at=(at[0], at[1], at[2] + 1.3 * size), seed=len(name), rough=0.14, smooth=70, detail=2)
    return [trunk, crown]


def island(name, seed, radius):
    under = rock('%s_under' % name, radius * 0.85, 'soil', seed=seed, rough=0.2, scale=(1.1, 1.1, 1.3), at=(0, 0, -radius * 1.1))
    top = lathe('%s_top' % name, [(0, -0.35), (radius * 1.02, -0.35), (radius * 1.12, -0.08), (radius * 0.98, 0.16), (0, 0.24)], 'grass', sides=11, rot=(0, 0, seed * 13))
    return [under, top]


# The windmill's island, off the far left corner, where nothing stands between it and the camera.
mill_spot = seen(-13.2, 6.4, 5.5)
tower = lathe('mill_tower', [(0, 0.1), (0.85, 0.1), (0.62, 2.3), (0, 2.3)], 'cream', sides=10)
roof = cone('mill_roof', 0.85, 0.9, 'indigo', at=(0, 0, 2.7), sides=10)
door = box('mill_door', (0.5, 0.2, 0.8), 'basket', at=(0, -0.76, 0.55), bevel=0.08)
mill_island = tag(settle(join('mill_island', *island('mill', 4, 2.3), tower, roof, door, *tree('mill_tree', (-1.45, -0.5, 0.1), 0.9), *tree('mill_tree2', (1.5, 0.4, 0.1), 0.7))), outline=0.05, shadow=False)
place(mill_island, at=mill_spot)
sails = [slab('sail_%d' % index, [(-0.22, 0.25), (0.22, 0.25), (0.3, 1.9), (-0.3, 1.9)], 0.1, 'white', rot=(90, 0, 0), bevel=0.04) for index in range(4)]
for index, sail in enumerate(sails):
    sail.rotation_euler = Euler((math.radians(90), math.radians(index * 90), 0))
wheel = tag(join('mill_sails', ball('sail_hub', 0.24, 'indigo'), *[settle(sail) for sail in sails]), outline=0.04, shadow=False)
place(wheel, at=(mill_spot[0], mill_spot[1] - 0.95, mill_spot[2] + 1.95))
spin(wheel, 5.0, axis=1)

# Two wooded ones far down: one seen through the gap between the near lane and the middle one, one off the near right corner.
woods = tag(settle(join('wood_island', *island('wood', 9, 2.4), *tree('wood_a', (-0.9, 0.3, 0.1), 1.2), *tree('wood_b', (0.9, -0.5, 0.1), 0.9), *tree('wood_c', (0.5, 1.0, 0.1), 1.05))), outline=0.05, shadow=False)
place(woods, at=seen(2.4, -3.0, 13.0))
bob(woods, 0.4, 7.0)
rocky = tag(settle(join('small_island', *island('small', 14, 1.9), *tree('small_a', (0.2, 0.1, 0.1), 1.2))), outline=0.05, shadow=False)
place(rocky, at=seen(14.6, -9.4, 11.0))
bob(rocky, 0.35, 5.6)


# ── Bunting behind the last straight ─────────────────────────────────────────
# Pale pennants on a sagging line between three posts, each post on a bracket bolted to the track's far edge.
def bunting(name, start, end, sag, count, shades):
    pieces = []
    line = arc(start, end, -sag, steps=count)
    pieces.append(pipe('%s_line' % name, line, 0.05, 'post', sides=6))
    for index in range(count):
        a, b = Vector(line[index]), Vector(line[index + 1])
        middle = (a + b) / 2
        wide = (b - a).length * 0.42
        pieces.append(slab('%s_pennant_%d' % (name, index), [(-wide, 0), (wide, 0), (0, -0.62)], 0.07, shades[index % len(shades)], at=(middle.x, middle.y, middle.z - 0.03), rot=(90, 0, 0), bevel=0.02))
    return pieces


posts = []
for index, x in enumerate((4.0, 8.0, 11.9)):
    posts.append(box('bunting_bracket_%d' % index, (0.6, 0.7, 0.5), 'post', at=(x, 7.72, -0.35), bevel=0.1))
    posts.append(cylinder('bunting_post_%d' % index, 0.09, 2.3, 'post', at=(x, 7.8, 1.05), sides=8))
    posts.append(ball('bunting_knob_%d' % index, 0.17, 'flag', at=(x, 7.8, 2.25)))
flags = bunting('bunting_a', (4.0, 7.8, 2.1), (8.0, 7.8, 2.1), 0.5, 6, ('cream', 'mint', 'lilac')) + bunting('bunting_b', (8.0, 7.8, 2.1), (11.9, 7.8, 2.1), 0.5, 6, ('lilac', 'cream', 'mint'))
tag(settle(join('bunting', *posts, *flags)), outline=0.04, shadow=False)


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
part(tag(settle(join('arch_feet', *feet, *puff('arch_puff_a', (0, -HALF, -4.7), 0.85), *puff('arch_puff_b', (0, HALF, -4.7), 0.85))), outline=0.05, shadow=False))


# The start: green, with white arrows on its board pointing down the track.
chevron = [(-0.36, 0.38), (-0.04, 0.38), (0.36, 0), (-0.04, -0.38), (-0.36, -0.38), (0.04, 0)]
start_board = [box('start_board', (1.5, 2.9, 0.16), 'start', at=(0, 0, 3.5), bevel=0.07)]
start_board += [slab('start_arrow_%d' % index, chevron, 0.08, 'white', at=(0, y, 3.6), bevel=0.02) for index, y in enumerate((-0.92, 0, 0.92))]
part(tag(settle(join('arch_start', *arch('arch_start', 'start', start_board))), outline=0.05, shadow=False))

# The finish: gold, with a chequered board.
finish_board = [box('finish_board', (1.5, 2.9, 0.14), 'ink', at=(0, 0, 3.48), bevel=0.07)]
finish_board += [box('finish_check_%d_%d' % (column, row), (0.66, 0.66, 0.1), 'white' if (column + row) % 2 == 0 else 'ink', at=(-0.33 + column * 0.66, -0.99 + row * 0.66, 3.58), bevel=0.03)
                 for column in range(2) for row in range(4)]
part(tag(settle(join('arch_finish', *arch('arch_finish', 'flag', finish_board))), outline=0.05, shadow=False))

# A flag where a fallen pet comes back: a pole on a bracket bolted to the side of the track, and a pennant in
# two halves that the game waves. The pole stands at the origin, the bracket reaches 0.35 either side of it.
bracket = box('flag_bracket', (0.7, 0.7, 0.5), 'post', at=(0, 0, -0.33), bevel=0.1)
pole = cylinder('flag_pole', 0.085, 2.4, 'post', at=(0, 0, 1.1), sides=8)
knob = ball('flag_knob', 0.17, 'flag', at=(0, 0, 2.36))
part(tag(settle(join('flag_post', bracket, pole, knob)), outline=0.045))
part(tag(settle(slab('flag_cloth_a', [(0, -0.38), (0.6, -0.2), (0.6, 0.2), (0, 0.38)], 0.09, 'flag', rot=(90, 0, 0), bevel=0.03)), outline=0.045))
part(tag(settle(slab('flag_cloth_b', [(0, -0.2), (0.62, 0), (0, 0.2)], 0.09, 'flag', rot=(90, 0, 0), bevel=0.03)), outline=0.045))

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
