# Pinta o Chão: a sheet of white paper taped to a cutting mat on an artist's desk, at a window. The paper is
# the floor (the game draws its squares and paints them; their top is Z = 0), and what an artist leaves
# lying about is giant round it.
#
# It is looked at three ways, and laid out for all three:
#   - a round is played from high in front (52 degrees down). That picture ends about four metres behind
#     the paper, with the clock over its top middle: behind the paper lies only what is low, the pots of
#     paint stand at the two ends of the back, where the clock never covers one, and what is tall stands
#     at the sides;
#   - a new world's card and a round's winner are shown from low in front, swinging to either side. Nothing
#     tall stands where it could come between that camera and a pet at the paper's edge, and a far row of
#     tall things stands on the horizon, in front of the window, too far back to be in a round's picture;
#   - from low, whatever is in front of the paper is nearest the camera: that strip stays flat.
#
# What the round moves is left as pieces of its own for the map's code (PaintMap.ts) to find by name: the
# lamp's head, the bird, the brush in the glass, the pencil, the tube. Empties named `stand_N` are where
# spectators stand, `splat_N` where paint may land on the mat, and `mark_*` are places the code needs.
import math

from kit import *

W, D = 14.0, 12.0
# The top of the mat the paper is taped to, and of the desk under the mat.
MAT = -0.06
DESK = -0.18
# The outline every prop wears, and the one for small or flat things. Few thicknesses, so props can be drawn together.
LINE, THIN = 0.05, 0.03


def upright(obj):
    """
    For what stands up smooth and round (a glass, a tin of paint, a lamp): its own shadow, falling on its own side,
    shows there as stripes. It still casts one; none falls on it.
    """
    return tag(obj, outline=LINE, receive=False)

# What stands farther back than this is the far row.
FAR = 13.0

guide_floor(W, D)
for spot in ((-3.5, 1.5, 0), (2.2, -2.4, 0), (4.6, 3.2, 0)):
    guide_pet(spot)


# ── Helpers ──────────────────────────────────────────────────────────────────

def prop(name, *pieces, at=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """Joins pieces built round the origin into one object and stands it at `at`. The origin stays where it was built."""
    bpy.context.view_layer.update()
    whole = join(name, *pieces) if len(pieces) > 1 else pieces[0]
    whole.name = whole.data.name = name
    whole.data.transform(whole.matrix_basis)
    whole.matrix_basis = Matrix.Identity(4)
    return place(whole, at=at, rot=rot, scale=scale)


def settle():
    """
    Makes a few big objects of everything that stands still. The game draws an object once for each of its
    colours, again for its outline and again for its shadow, so fifty props of three colours are 450 draws
    and one object of thirty colours is 90. Props are sorted by how they are drawn (outline, shadow, whether
    shadows fall on them), and the far row apart from the near, so it arrives after it. What moves and the
    templates are left alone.
    """
    bpy.context.view_layer.update()
    sorts = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or obj.parent is not None or obj.children or obj.animation_data is not None or obj.get('part') or obj.get('live') or obj.name.startswith('guide_'):
            continue
        low, high = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low, high = Vector(map(min, low, world)), Vector(map(max, high, world))
        outline = obj.get('outline', LINE)
        line = 0 if outline == 0 else THIN if outline < 0.04 else LINE
        far = (low.y + high.y) / 2 > FAR and high.y - low.y < 10
        sorts.setdefault((far, line, bool(obj.get('shadow', True)), bool(obj.get('receive', True))), []).append((obj, low, high))
    for (far, line, shadow, receive), found in sorts.items():
        name = '_'.join(word for word in ('far' if far else '', {0: 'ground', THIN: 'thin', LINE: 'props'}[line], '' if shadow else 'flat', '' if receive else 'upright') if word)
        for obj, _, _ in found:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
        whole = prop(name, *[obj for obj, _, _ in found])
        # Its origin goes to the middle of what it holds: the game brings things in by how far they are from the map's middle.
        middle = Vector(((min(low.x for _, low, _ in found) + max(high.x for _, _, high in found)) / 2, (min(low.y for _, low, _ in found) + max(high.y for _, _, high in found)) / 2, 0))
        whole.data.transform(Matrix.Translation(-middle))
        whole.location = middle
        for setting in ('outline', 'shadow', 'receive', 'glow'):
            if setting in whole:
                del whole[setting]
        tag(whole, outline=line, shadow=shadow, receive=receive)


def live(obj, pivot):
    """
    Keeps a piece out of `settle`, for the map's code to move: it is found by its name, stands unturned, and
    `pivot` is the point it turns and swells round.
    """
    bpy.context.view_layer.update()
    obj.data.transform(Matrix.Translation(-Vector(pivot)) @ obj.matrix_basis)
    obj.matrix_basis = Matrix.Translation(Vector(pivot))
    obj['live'] = True
    return obj


def mark(name, at):
    """A place with a name and nothing drawn there, for the map's code."""
    return group(name, at=at)


def reshape(obj, change):
    """Moves every corner of a shape already made: `change` takes x, y, z and returns the new three."""
    for vert in obj.data.vertices:
        vert.co = change(*vert.co)
    return obj


def circle(radius, steps=20, start=0.0, end=360.0, centre=(0, 0)):
    """Points round an arc, counter-clockwise, for `slab`."""
    whole = abs(end - start) >= 360
    return [(centre[0] + math.cos(math.radians(start + (end - start) * i / steps)) * radius,
             centre[1] + math.sin(math.radians(start + (end - start) * i / steps)) * radius) for i in range(steps if whole else steps + 1)]


def rounded(width, depth, radius, steps=3):
    """A rectangle with round corners, for `slab`."""
    points = []
    for corner, (sx, sy) in enumerate(((1, -1), (1, 1), (-1, 1), (-1, -1))):
        points += circle(radius, steps, corner * 90 - 90, corner * 90, (sx * (width / 2 - radius), sy * (depth / 2 - radius)))
    return points


def blot(radius, seed, steps=14, rough=0.3):
    """The outline of a splash of paint: a circle with lobes."""
    rng = random.Random(seed)
    return [(math.cos(2 * math.pi * i / steps) * radius * (1 + rng.uniform(-rough, rough)), math.sin(2 * math.pi * i / steps) * radius * (1 + rng.uniform(-rough, rough))) for i in range(steps)]


def torn(length, width, teeth=3, bite=0.14):
    """A strip of tape torn off the roll: both its ends are jagged."""
    half = length / 2
    points = [(-half, -width / 2), (half, -width / 2)]
    for tooth in range(teeth):
        points += [(half - bite, -width / 2 + width * (tooth + 0.5) / teeth), (half, -width / 2 + width * (tooth + 1) / teeth)]
    points.append((-half, width / 2))
    for tooth in range(teeth - 1):
        points += [(-half + bite, width / 2 - width * (tooth + 0.5) / teeth), (-half, width / 2 - width * (tooth + 1) / teeth)]
    points.append((-half + bite, -width / 2 + width * 0.5 / teeth))
    return points


# ── The desk and the mat ─────────────────────────────────────────────────────
ground = [box('desk', (58, 42, 1.2), 'desk', at=(0, 1, DESK - 0.6), bevel=0.3, segments=1)]
rng = random.Random(5)
while len(ground) < 17:
    x, y, length = rng.uniform(-20, 20), rng.uniform(-11, 12), rng.uniform(2, 5)
    if abs(x) < 12.5 and -9.5 < y < 10.5:
        continue
    ground.append(box('grain_%d' % len(ground), (length, 0.16, 0.03), 'deskDark', at=(x, y, DESK + 0.001), bevel=0))


def shade(x, y, radius):
    """The far row stands beyond the reach of the game's shadows: each piece of it gets a dark patch under it instead."""
    ground.append(place(cylinder('shade_%d' % len(ground), radius, 0.03, 'deskDark', at=(x + radius * 0.12, y - radius * 0.2, DESK + 0.002), sides=14), scale=(1.15, 0.8, 1)))


# What an artist's desk collects: the ring a mug left, doodles in pencil, dots of paint, rubbings-out.
for index, (x, y, radius) in enumerate(((-13.6, -2.6, 0.9), (13.4, 7.6, 0.9), (14.2, 6.9, 0.9))):
    ground.append(lathe('mug_ring_%d' % index, [(radius - 0.1, 0), (radius, 0), (radius, 0.03), (radius - 0.1, 0.03), (radius - 0.1, 0)], 'deskDark', at=(x, y, DESK + 0.001), sides=14))


def doodle(name, points, at, turn=0, size=1.0, closed=False):
    """A line drawn on the desk in pencil."""
    line = pipe(name, [(x * size, y * size, 0) for x, y in points], 0.05, 'lead', sides=3, closed=closed)
    return place(line, at=(at[0], at[1], DESK + 0.03), rot=(0, 0, turn))

STAR = [(math.cos(math.radians(90 + i * 36)) * (1.0 if i % 2 == 0 else 0.42), math.sin(math.radians(90 + i * 36)) * (1.0 if i % 2 == 0 else 0.42)) for i in range(10)]
SPIRAL = [(math.cos(i * 0.7) * i * 0.045, math.sin(i * 0.7) * i * 0.045) for i in range(26)]
HEART = [(0, -0.9), (0.9, 0.05), (0.9, 0.6), (0.5, 0.9), (0, 0.55), (-0.5, 0.9), (-0.9, 0.6), (-0.9, 0.05)]
ZIGZAG = [(i * 0.4 - 1.2, 0.4 if i % 2 else -0.4) for i in range(7)]
ground += [doodle('doodle_star', STAR, (-14.6, 2.4), 12, closed=True), doodle('doodle_spiral', SPIRAL, (13.9, -4.2), 0, 1.1), doodle('doodle_heart', HEART, (-13.3, -6.6), -14, 0.8, closed=True),
           doodle('doodle_zigzag', ZIGZAG, (14.3, 2.9), 70), doodle('doodle_ring', circle(0.8, 12), (-5.2, -10.4), 0, closed=True), doodle('doodle_zag', ZIGZAG, (4.6, -10.2), -8, 0.9), doodle('doodle_star_b', STAR, (11.6, -10.3), -20, 0.7, closed=True)]
for index in range(40):
    x, y = rng.uniform(-14.5, 14.5), rng.uniform(-10.5, 11.5)
    if abs(x) < 10.7 and -8.2 < y < 10.2:
        continue
    ground.append(cylinder('dot_%d' % index, rng.uniform(0.07, 0.2), 0.03, ('teal', 'salmon', 'sky', 'tangerine', 'paper')[index % 5], at=(x, y, DESK + 0.002), sides=7))
# Sheets of coloured paper pushed under the mat's corners, and sticky notes with a line or two on them.
for index, (color, x, y, turn) in enumerate((('sky', -12.4, -9.6, 17), ('tape', 12.2, 10.6, -11), ('eraser', 13.6, -8.6, -24))):
    tag(box('sheet_%d' % index, (7.5, 9.5, 0.05), color, at=(x, y, DESK + 0.025 + index * 0.01), rot=(0, 0, turn), bevel=0), outline=THIN, shadow=False)
for index, (color, x, y, turn) in enumerate((('tape', -14.2, 9.2, 8), ('eraser', -15.6, 7.6, -12), ('tape', 14.6, -0.3, -6))):
    note = box('note_%d' % index, (1.7, 1.7, 0.05), color, bevel=0)
    words = [box('note_%d_line_%d' % (index, i), (1.1 - i * 0.3, 0.09, 0.06), 'lead', at=(-0.1 - i * 0.15, 0.35 - i * 0.4, 0), bevel=0) for i in range(3)]
    tag(prop('note_%d' % index, note, *words, at=(x, y, DESK + 0.03), rot=(0, 0, turn)), outline=THIN, shadow=False)

# The cutting mat: green, with its grid of pale lines and a border.
MAT_W, MAT_D, MAT_Y = 23.0, 18.4, 1.0
tag(slab('mat', rounded(MAT_W, MAT_D, 0.6, 4), MAT - DESK, 'mat', at=(0, MAT_Y, (MAT + DESK) / 2), bevel=0), outline=THIN, shadow=False)
ground += [box('mat_line_x_%d' % i, (0.07, MAT_D - 1.2, 0.02), 'matLine', at=(x, MAT_Y, MAT), bevel=0) for i, x in enumerate(range(-10, 11, 2))]
ground += [box('mat_line_y_%d' % i, (MAT_W - 1.2, 0.07, 0.02), 'matLine', at=(0, y, MAT), bevel=0) for i, y in enumerate(range(-7, 10, 2))]
ground += [box('mat_edge_x_%d' % i, (0.12, MAT_D - 1.08, 0.02), 'matLine', at=(side * (MAT_W / 2 - 0.6), MAT_Y, MAT), bevel=0) for i, side in enumerate((-1, 1))]
ground += [box('mat_edge_y_%d' % i, (MAT_W - 1.08, 0.12, 0.02), 'matLine', at=(0, MAT_Y + side * (MAT_D / 2 - 0.6), MAT), bevel=0) for i, side in enumerate((-1, 1))]

# Masking tape all the way round the paper: it is also the wall nobody can walk through. The strips cross at the corners.
TAPE = 0.6
strips = [slab('tape_%d' % i, torn(W + 2.6, TAPE), 0.1, 'tape', at=(0.15 * side, side * (D / 2 + TAPE / 2 - 0.01), MAT + 0.05), rot=(0, 0, side * 0.5), bevel=0) for i, side in enumerate((-1, 1))]
strips += [slab('tape_%d' % (i + 2), torn(D + 2.4, TAPE), 0.124, 'tape', at=(side * (W / 2 + TAPE / 2 - 0.01), -0.1 * side, MAT + 0.062), rot=(0, 0, 90 + side * 0.4), bevel=0) for i, side in enumerate((-1, 1))]
tag(prop('tape', *strips), outline=THIN, shadow=False)

# Splashes of paint that missed the paper, and the places (`splat_N`) where the code lets more land as buckets are kicked over.
for index, (color, x, y, size) in enumerate((('teal', 3.6, 7.3, 0.8), ('salmon', -9.2, -5.6, 0.7), ('tangerine', -1.4, -7.5, 0.6), ('sky', -8.6, 5.6, 0.5))):
    ground.append(slab('splash_%d' % index, blot(size, index + 2), 0.03, color, at=(x, y, MAT + 0.016), bevel=0))
    ground += [cylinder('splash_%d_%d' % (index, i), size * 0.22 * (1 - i * 0.25), 0.03, color, at=(x + math.cos(index * 2.1 + i * 1.9) * size * (1.5 + 0.3 * i), y + math.sin(index * 2.1 + i * 1.9) * size * (1.5 + 0.3 * i), MAT + 0.016), sides=8) for i in range(3)]
for index, (x, y) in enumerate(((-8.7, -3.4), (8.7, -5.2), (-5.6, 7.2), (6.6, 7.1), (-8.5, 4.4), (8.5, 1.2), (-3.2, -7.4), (5.4, -7.3), (-8.8, -7.2), (0.8, 7.2), (8.8, 5.6), (-1.0, -7.9), (8.4, -1.6), (-6.4, -7.6))):
    mark('splat_%d' % index, (x, y, MAT + 0.02))


# ── Behind the paper: only what is low, and a place for the pots at each end ──
# The ruler lies along the back. Guests stand on it as on a bench.
ruler = box('ruler', (9.6, 1.3, 0.16), 'wood', at=(0, 0, 0.08), bevel=0.04)
ticks = [box('ruler_tick_%d' % i, (0.08, 0.55 if i % 4 == 0 else 0.3, 0.03), 'lead', at=(-4.4 + i * 0.4, -0.65 + (0.55 if i % 4 == 0 else 0.3) / 2 + 0.04, 0.16), bevel=0) for i in range(23)]
RULER = (0.0, 8.3)
tag(prop('ruler', ruler, *ticks, at=(RULER[0], RULER[1], MAT), rot=(0, 0, 1.2)), outline=LINE)
for index, x in enumerate((-3.9, -2.5, 2.5, 3.9)):
    mark('stand_%d' % index, (x, RULER[1] + 0.15, MAT + 0.17))

# A roll of masking tape, the sharpener with its shavings, and two blocks of sticky notes, one with a guest on it.
roll = lathe('tape_roll', [(0.62, 0), (1.05, 0), (1.05, 0.62), (0.62, 0.62), (0.62, 0)], 'tape', sides=20)
core = lathe('tape_core', [(0.56, 0.03), (0.63, 0.03), (0.63, 0.59), (0.56, 0.59), (0.56, 0.03)], 'wood', sides=20)
upright(prop('tape_roll', roll, core, at=(6.0, 8.25, MAT)))
wedge_shape = slab('sharpener', [(-0.7, -0.5), (0.7, -0.38), (0.7, 0.38), (-0.7, 0.5)], 0.6, 'teal', at=(0, 0, 0.3), bevel=0.08)
knife = box('sharpener_blade', (0.9, 0.5, 0.06), 'tin', at=(0.05, 0, 0.62), rot=(0, 0, 12), bevel=0)
hole = cylinder('sharpener_hole', 0.2, 0.06, 'lead', at=(-0.71, 0, 0.3), rot=(0, 90, 0), sides=8)
tag(prop('sharpener', wedge_shape, knife, hole, at=(-6.1, 8.15, MAT), rot=(0, 0, 28)), outline=LINE)


def shaving(name, at, turn, size=1.0):
    """A curl off a sharpened pencil: a fan of wood with the pencil's paint along its scalloped edge."""
    def arc_point(angle, reach):
        return (math.cos(math.radians(angle)) * reach * size, math.sin(math.radians(angle)) * reach * size)
    def scallop(angle):
        return 0.06 * math.cos(math.radians(angle * 6))
    fan = [(0, 0)] + [arc_point(a, 0.62 + scallop(a)) for a in range(-70, 71, 14)]
    edge = [arc_point(a, 0.7 + scallop(a)) for a in range(-70, 71, 14)] + [arc_point(a, 0.5) for a in range(70, -71, -14)]
    return prop(name, slab(name, fan, 0.05, 'wood', bevel=0), slab(name + '_paint', edge, 0.07, 'pencil', bevel=0), at=at, rot=(0, 0, turn))

tag(prop('shavings', shaving('shaving_a', (0, 0, 0.03), 20), shaving('shaving_b', (0.9, -0.5, 0.03), 160, 0.8), shaving('shaving_c', (-0.4, -0.9, 0.03), -80, 0.7), at=(-5.6, 9.4, MAT)), outline=THIN, shadow=False)
for index, (x, y, color, turn) in enumerate(((-12.0, 6.6, 'tape', 14), (12.3, 6.4, 'eraser', -10))):
    block = box('notes_%d' % index, (1.6, 1.6, 0.6), color, at=(0, 0, 0.3), bevel=0.03)
    leaf = box('notes_%d_leaf' % index, (1.6, 1.6, 0.04), 'paper', at=(0.06, -0.05, 0.62), rot=(0, 0, 5), bevel=0)
    tag(prop('notes_%d' % index, block, leaf, at=(x, y, MAT), rot=(0, 0, turn)), outline=LINE)
mark('stand_4', (-12.0, 6.6, MAT + 0.65))


# ── The left side: a sketchbook with a pencil on it, under the lamp ──────────
BOOK = (-10.6, 0.7)
cover = box('sketchbook', (5.2, 3.8, 0.14), 'sky', at=(0, 0, 0.07), bevel=0.05)
pages = box('sketchbook_pages', (5.0, 3.6, 0.3), 'paper', at=(0.06, 0, 0.29), bevel=0)
front = box('sketchbook_front', (5.2, 3.8, 0.14), 'sky', at=(0, 0, 0.5), bevel=0.05)
label = box('sketchbook_label', (2.2, 1.0, 0.04), 'paper', at=(0.6, 0.6, 0.575), bevel=0)
coils = [ring('sketchbook_coil_%d' % i, 0.34, 0.06, 'tin', at=(-2.52, -1.5 + i * 0.5, 0.3), rot=(90, 0, 0), sides=8, around=4) for i in range(7)]
tag(prop('sketchbook', cover, pages, front, label, *coils, at=(BOOK[0], BOOK[1], MAT), rot=(0, 0, -84)), outline=LINE)
mark('stand_5', (BOOK[0] - 0.95, BOOK[1] + 1.55, MAT + 0.58))
mark('stand_6', (BOOK[0] + 0.95, BOOK[1] - 1.6, MAT + 0.58))


def pencil(name, length, body):
    """A six-sided pencil lying along X on one of its flats, its middle at the origin: a rubber and its band at one end, the point at the other."""
    wide = 0.46
    def along(piece, start):
        piece.data.transform(Matrix.Rotation(math.radians(30), 4, 'Z'))
        return place(piece, at=(start, 0, 0), rot=(0, 90, 0))
    half = length / 2
    return prop(name, along(cylinder(name, wide, length, body, sides=6), 0), along(cylinder(name + '_wood', wide, 1.0, 'wood', top=0.16, sides=6), half + 0.5),
                along(cylinder(name + '_lead', 0.16, 0.4, 'lead', top=0.02, sides=6), half + 1.2), along(cylinder(name + '_band', wide + 0.02, 0.6, 'lead', sides=12), -half - 0.3),
                along(cylinder(name + '_rubber', wide - 0.04, 0.6, 'eraser', sides=12, bevel=0.1), -half - 0.85))

# The pencil lies across the sketchbook. It is the code's to roll: `mark_pencil_tip` says which way it points.
LIE = math.radians(58)
PENCIL = (BOOK[0] - 0.1, BOOK[1], MAT + 0.57 + 0.4)
live(tag(prop('pencil', *[pencil('pencil', 3.9, 'pencil')], at=PENCIL, rot=(0, 0, 58)), outline=LINE), PENCIL)
mark('mark_pencil_tip', (PENCIL[0] + math.cos(LIE) * 3, PENCIL[1] + math.sin(LIE) * 3, PENCIL[2]))
rubber = box('rubber', (1.7, 0.9, 0.6), 'eraser', at=(0, 0, 0.3), bevel=0.12)
sleeve = box('rubber_sleeve', (0.9, 0.94, 0.64), 'teal', at=(0.3, 0, 0.3), bevel=0.04)
tag(prop('rubber', rubber, sleeve, at=(-9.3, -3.6, MAT), rot=(0, 0, -20)), outline=LINE)

# The desk lamp, low and leaning in. Its foot and arm stand still; its head, with the lit bulb in it, is the
# code's to turn: at rest it shines on `mark_lamp_aim`.
LAMP = (-12.3, 5.2)
ELBOW, HEAD = Vector((-0.5, 0.5, 2.3)), Vector((1.5, -1.1, 3.3))
AIM = Vector((-6.2, 1.6, 0.0))
foot = lathe('lamp_foot', [(0, 0), (1.1, 0), (1.2, 0.14), (1.06, 0.36), (0.4, 0.47), (0, 0.47)], 'salmon', sides=20)
lower = pipe('lamp_lower', [(0, 0, 0.42), tuple(ELBOW)], 0.14, 'tin', sides=8)
upper = pipe('lamp_upper', [tuple(ELBOW), tuple(HEAD)], 0.14, 'tin', sides=8)
elbow = ball('lamp_elbow', 0.27, 'salmon', at=tuple(ELBOW), detail=1)
upright(prop('lamp', foot, lower, upper, elbow, at=(LAMP[0], LAMP[1], MAT)))
head_at = Vector((LAMP[0], LAMP[1], MAT)) + HEAD
aim = (AIM - head_at).normalized()
turn = (math.degrees(math.acos(aim.z)), math.degrees(math.atan2(aim.y, aim.x)))
shade_profile = [(0, -0.1), (0.36, -0.1), (0.44, 0.02), (1.02, 1.1), (1.08, 1.22), (0.94, 1.22), (0.34, 0.12), (0, 0.12)]
head = live(upright(prop('lamp_head', lathe('lamp_head', shade_profile, 'salmon', sides=18), ball('lamp_neck', 0.25, 'tin', detail=1), at=tuple(head_at), rot=(0, turn[0], turn[1]))), tuple(head_at))
bulb = live(tag(ball('lamp_bulb', 0.42, 'bulb', at=tuple(head_at + aim * 0.82)), glow=1.5, shadow=False), tuple(head_at))
bulb.parent = head
bulb.matrix_basis = Matrix.Identity(4)
mark('mark_lamp_aim', tuple(AIM))


# ── The right side: the bird that drinks, the palette, crayons ───────────────
def brush(name, tip, at, rot, grip_color='salmon', length=4.6):
    """A fat round brush built standing on its bristles' tip: bristles, a metal collar, a long handle."""
    hair = lathe(name + '_hair', [(0, 0), (0.1, 0.08), (0.3, 0.5), (0.36, 1.0), (0.32, 1.3), (0, 1.3)], 'bristle', sides=10, smooth=70)
    paint = lathe(name + '_paint', [(0, -0.02), (0.12, 0.06), (0.33, 0.5), (0.34, 0.62), (0, 0.62)], tip, sides=10, smooth=70)
    collar = cylinder(name + '_collar', 0.36, 0.9, 'tin', at=(0, 0, 1.7), top=0.26, sides=10)
    grip = lathe(name, [(0, 2.1), (0.27, 2.1), (0.3, 2.9), (0.2, length - 1.2), (0.14, length), (0.1, length + 0.2), (0, length + 0.22)], grip_color, sides=10)
    return prop(name, grip, hair, paint, collar, at=at, rot=rot)

# A glass of water gone cloudy. The brush standing in it is the code's to rattle.
GLASS = (11.0, 3.2)
tumbler = lathe('glass', [(0, 0), (1.05, 0), (1.14, 0.14), (1.3, 2.3), (1.3, 2.4), (1.14, 2.4), (1.12, 1.9), (0, 1.9)], 'glass', sides=20)
water = lathe('glass_water', [(0, 1.9), (1.13, 1.9), (1.13, 2.0), (0, 2.0)], 'water', sides=20)
upright(prop('glass', tumbler, water, at=(GLASS[0], GLASS[1], MAT)))
live(upright(brush('brush', 'teal', (GLASS[0] + 0.25, GLASS[1] + 0.55, MAT + 0.4), (-8, 15, 0), grip_color='pencil', length=3.6)), (GLASS[0] + 0.25, GLASS[1] + 0.55, MAT + 0.4))
mark('mark_water', (GLASS[0], GLASS[1], MAT + 2.02))

# The toy bird that drinks. Its stand is here; the bird hangs on its axle for the code to tip into the glass.
# It faces X, so it is seen side on, and the rings it leaves on the water are the code's to spread.
REACH, PERCH = 1.8, 2.2
BIRD = (GLASS[0] - REACH, GLASS[1], MAT + PERCH)
legs = [box('bird_leg_%d' % i, (0.34, 0.18, 2.3), 'tin', at=(0, side * 0.68, -1.1), bevel=0.05) for i, side in enumerate((-1, 1))]
feet = [box('bird_foot_%d' % i, (1.5, 0.34, 0.22), 'salmon', at=(0, side * 0.68, -PERCH + 0.11), bevel=0.08) for i, side in enumerate((-1, 1))]
brace = box('bird_brace', (0.2, 1.4, 0.18), 'salmon', at=(-0.6, 0, -PERCH + 0.11), bevel=0.05)
tag(prop('bird_stand', *legs, *feet, brace, at=BIRD), outline=LINE)
neck = pipe('bird_neck', [(0, 0, -1.2), (0, 0, 1.4)], 0.13, 'lead', sides=8)
belly = ball('bird_belly', 0.46, 'sky', at=(0, 0, -1.25), scale=(1, 1, 1.1))
face = ball('bird_head', 0.44, 'sky', at=(0, 0, 1.5))
beak = cylinder('bird_beak', 0.17, 0.75, 'tangerine', at=(0.72, 0, 1.45), rot=(0, 90, 0), top=0.03, sides=8)
hat = [cylinder('bird_brim', 0.5, 0.08, 'lead', at=(0, 0, 1.9), sides=12), cylinder('bird_hat', 0.32, 0.45, 'lead', at=(0, 0, 2.15), sides=12)]
eyes = [ball('bird_eye_%d' % i, 0.08, 'lead', at=(0.3, side * 0.28, 1.66), detail=1) for i, side in enumerate((-1, 1))]
axle = cylinder('bird_axle', 0.1, 1.5, 'lead', rot=(90, 0, 0), sides=8)
live(upright(prop('bird', neck, belly, face, beak, *hat, *eyes, axle, at=BIRD)), BIRD)
for index in range(2):
    live(tag(ring('ripple_%d' % index, 1.1, 0.035, 'paper', at=(GLASS[0], GLASS[1], MAT + 2.02), sides=18, around=4), outline=0, shadow=False), (GLASS[0], GLASS[1], MAT + 2.02))

# The palette: a kidney of wood with a thumb hole, blobs of paint round its edge and a brush across it. A guest stands on it.
PALETTE = (10.9, -1.2)
def kidney(angle):
    """An oval pinched in at one place, where the thumb comes round."""
    reach = 1 + 0.1 * math.cos(angle * 2 + 0.5) - 0.24 * math.exp(-((angle - 5.6) / 0.33) ** 2)
    return (math.cos(angle) * 2.5 * reach, math.sin(angle) * 1.9 * reach)

board = slab('palette', [kidney(2 * math.pi * i / 26) for i in range(26)], 0.2, 'wood', at=(0, 0, 0.1), bevel=0.05)
thumb = cylinder('palette_hole', 0.38, 0.03, 'mat', at=(1.3, -0.65, 0.2), sides=12)
dabs = [lathe('dab_%d' % i, [(0, 0), (size, 0), (size * 0.9, 0.14), (size * 0.5, 0.26), (0, 0.3)], color, at=(math.cos(angle) * 1.7, math.sin(angle) * 1.25, 0.19), sides=10, smooth=70)
        for i, (color, angle, size) in enumerate((('teal', 0.5, 0.44), ('paper', 1.25, 0.4), ('sky', 2.0, 0.46), ('salmon', 2.8, 0.42), ('tangerine', 3.6, 0.44), ('pencil', 4.35, 0.38)))]
tag(prop('palette', board, thumb, *dabs, at=(PALETTE[0], PALETTE[1], MAT), rot=(0, 0, 18)), outline=LINE)
mark('stand_7', (PALETTE[0] - 0.5, PALETTE[1] + 0.1, MAT + 0.21))
tag(brush('brush_lying', 'sky', (PALETTE[0] + 2.3, PALETTE[1] - 1.5, MAT + 0.56), (0, -87, -40), length=4.2), outline=LINE)

# A tube of paint, squeezed flat at its tail. The code squeezes it again when a bucket is kicked over: `mark_tube` is its nozzle.
def squeezed(x, y, z):
    flat = min(1, max(0, (z - 1.0) / 1.9))
    return (x * (1 + 0.45 * flat), y * (1 - 0.82 * flat), z)

TUBE = (10.6, 6.0)
paint_tube = reshape(lathe('tube', [(0, 0), (0.2, 0), (0.2, 0.3), (0.62, 0.55), (0.66, 0.7), (0.66, 2.9), (0, 2.9)], 'paper', sides=12), squeezed)
tube_label = reshape(lathe('tube_label', [(0.675, 1.0), (0.68, 1.05), (0.68, 2.0), (0.675, 2.05)], 'sky', sides=12), squeezed)
crimp = box('tube_crimp', (2.0, 0.22, 0.3), 'tin', at=(0, 0, 2.95), bevel=0.05)
live(upright(prop('tube', paint_tube, tube_label, crimp, at=(TUBE[0] - 1.45, TUBE[1], MAT + 0.62), rot=(-90, 0, -90))), (TUBE[0] + 1.45, TUBE[1], MAT))
mark('mark_tube', (TUBE[0] - 1.5, TUBE[1], MAT + 0.62))
squirt = [ball('squirt_0', 0.5, 'sky', at=(0, 0, 0.2), scale=(1.2, 1, 0.6)), ball('squirt_1', 0.34, 'sky', at=(-0.5, -0.35, 0.14), scale=(1, 1, 0.6)), ball('squirt_2', 0.2, 'sky', at=(-0.95, -0.55, 0.1), scale=(1, 1, 0.6), detail=1)]
tag(prop('squirt', *squirt, at=(TUBE[0] - 2.1, TUBE[1] - 0.1, MAT)), outline=LINE)


def crayon(name, color, at, turn):
    stick = cylinder(name, 0.36, 3.4, color, at=(0, 0, 1.7), sides=10)
    wrap = cylinder(name + '_wrap', 0.385, 2.0, 'paper', at=(0, 0, 1.5), sides=10)
    band = cylinder(name + '_band', 0.39, 0.22, color, at=(0, 0, 2.1), sides=10)
    tip = cylinder(name + '_tip', 0.36, 0.7, color, at=(0, 0, 3.75), top=0.12, sides=10)
    return tag(prop(name, stick, wrap, band, tip, at=(at[0], at[1], MAT + 0.37), rot=(0, 90, turn)), outline=LINE)

crayon('crayon_a', 'teal', (9.0, -7.9), 104)
crayon('crayon_b', 'salmon', (9.9, -8.1), 89)
crayon('crayon_c', 'tangerine', (10.8, -7.8), 73)

# Where the paper plane lands, either side, and where the wind-up toy walks, behind the ruler. Both are the code's.
mark('mark_plane_a', (12.3, -5.2, MAT + 0.25))
mark('mark_plane_b', (-12.4, -5.4, MAT + 0.25))
mark('mark_toy_a', (-6.2, 9.65, MAT))
mark('mark_toy_b', (6.2, 9.65, MAT))


# ── In front of the paper: only what lies flat ───────────────────────────────
def blade(name, side):
    steel = slab(name, [(-0.24, -1.2), (0.24, -1.2), (0.3, 0.2), (0.24, 2.6), (0.02, 3.5), (-0.16, 2.6), (-0.24, 0.2)], 0.14, 'tin', bevel=0)
    loop = ring(name + '_loop', 0.62, 0.17, 'tangerine', at=(side * 0.35, -1.9, 0), sides=14, around=6)
    return prop(name, steel, loop, rot=(0, 0, side * 13), at=(0, 0, 0.1 + (0.07 if side > 0 else -0.07)))

screw = cylinder('scissors_screw', 0.16, 0.34, 'lead', at=(0, 0, 0.1), sides=8)
tag(prop('scissors', blade('blade_a', -1), blade('blade_b', 1), screw, at=(-4.6, -8.3, MAT + 0.08), rot=(0, 0, -75), scale=0.85), outline=LINE)
handle = lathe('flat_brush', [(0, 0), (0.2, 0.05), (0.3, 1.2), (0.24, 3.4), (0.3, 4.0), (0, 4.0)], 'teal', sides=10)
ferrule = box('flat_brush_collar', (0.4, 0.9, 1.0), 'tin', at=(0, 0, 4.4), bevel=0.06)
hairs = slab('flat_brush_hair', [(-0.45, 0), (0.45, 0), (0.5, 0.9), (0.2, 1.1), (-0.3, 1.05), (-0.5, 0.85)], 0.34, 'bristle', at=(0, 0, 4.9), rot=(90, 0, 90), bevel=0.05)
tag(prop('flat_brush', handle, ferrule, hairs, at=(0.4, -8.5, MAT + 0.3), rot=(0, 90, 4)), outline=LINE)
clip = tag(pipe('clip_a', [(0.2, 0.55, 0), (0.2, -0.45, 0), (0.02, -0.66, 0), (-0.2, -0.45, 0), (-0.2, 0.75, 0), (0.05, 0.98, 0), (0.34, 0.75, 0), (0.34, -0.7, 0)], 0.055, 'tin', sides=5, at=(7.2, -7.7, MAT + 0.06), rot=(0, 0, 40)), outline=THIN, shadow=False)
copy(clip, 'clip_b', at=(-7.8, -7.8, MAT + 0.06), rot=(0, 0, -65))
copy(clip, 'clip_c', at=(-8.6, 5.0, MAT + 0.06), rot=(0, 0, 110))
tag(slab('tape_scrap', torn(1.9, TAPE), 0.06, 'tape', at=(7.9, -8.8, MAT + 0.03), rot=(0, 0, 24), bevel=0), outline=THIN, shadow=False)


# ── The far row, on the horizon ──────────────────────────────────────────────
# A round's picture ends well short of it. From low it is the skyline: plain big shapes, each unlike its neighbour.
def far(name, *pieces, at, rot=(0, 0, 0), reach=1.4, size=1.0):
    shade(at[0], at[1], reach * size)
    return tag(prop(name, *pieces, at=(at[0], at[1], DESK), rot=rot, scale=size), outline=LINE, shadow=False)


# A mug of pencils and brushes.
mug = lathe('mug', [(0, 0), (1.25, 0), (1.35, 0.15), (1.35, 2.3), (1.2, 2.3), (1.2, 2.0), (0, 2.0)], 'sky', sides=16)
mug_band = lathe('mug_band', [(1.37, 0.8), (1.39, 0.85), (1.39, 1.4), (1.37, 1.45)], 'paper', sides=16)
mug_ear = pipe('mug_ear', [(1.3, 0, 1.9), (2.0, 0, 1.8), (2.1, 0, 1.1), (1.3, 0, 0.6)], 0.17, 'sky', sides=6)
sticks = []
for index, (x, y, lean, color, height) in enumerate(((-0.5, 0.2, -10, 'pencil', 4.3), (0.3, 0.3, 6, 'salmon', 3.9), (0.6, -0.3, 14, 'teal', 4.1), (-0.2, -0.4, -3, 'tangerine', 3.6))):
    sticks.append(cylinder('mug_stick_%d' % index, 0.2, height - 1.4, color, at=(x + math.sin(math.radians(lean)) * height / 2, y, 1.4 + (height - 1.4) / 2), rot=(0, lean, 0), sides=6))
    top = Vector((x + math.sin(math.radians(lean)) * (height - 0.6), y, height + 0.15))
    sticks.append(cylinder('mug_tip_%d' % index, 0.2, 0.5, 'wood' if index % 2 == 0 else 'bristle', at=tuple(top), rot=(0, lean, 0), top=0.04 if index % 2 == 0 else 0.14, sides=6))
far('mug', mug, mug_band, mug_ear, *sticks, at=(-14.4, 14.2), rot=(0, 0, 200), size=0.78)

# The little wooden figure artists draw from, one arm up.
JOINT = 0.22
figure = [box('figure_base', (2.2, 1.6, 0.3), 'wood', at=(0, 0, 0.15), bevel=0.08), pipe('figure_rod', [(0, 0.3, 0.3), (0, 0.3, 2.2)], 0.09, 'tin', sides=5),
          box('figure_hips', (0.9, 0.6, 0.6), 'wood', at=(0, 0, 2.3), bevel=0.14), box('figure_chest', (1.1, 0.7, 1.1), 'wood', at=(0, 0, 3.2), bevel=0.2), ball('figure_head', 0.42, 'wood', at=(0, 0, 4.25), scale=(0.9, 0.9, 1.15), detail=2)]
for side in (-1, 1):
    figure += [pipe('figure_leg_%d' % side, [(side * 0.28, 0, 2.1), (side * 0.36, -0.1, 1.2), (side * 0.32, 0.05, 0.36)], 0.17, 'wood', sides=6), ball('figure_knee_%d' % side, JOINT, 'pencil', at=(side * 0.36, -0.1, 1.2), detail=1)]
figure += [pipe('figure_arm_up', [(0.62, 0, 3.6), (1.25, 0, 3.9), (1.5, 0, 4.7)], 0.15, 'wood', sides=6), ball('figure_elbow_up', JOINT, 'pencil', at=(1.25, 0, 3.9), detail=1), ball('figure_hand_up', 0.2, 'wood', at=(1.52, 0, 4.82), detail=1),
           pipe('figure_arm_down', [(-0.62, 0, 3.6), (-1.0, -0.2, 2.9), (-0.8, -0.5, 2.3)], 0.15, 'wood', sides=6), ball('figure_elbow_down', JOINT, 'pencil', at=(-1.0, -0.2, 2.9), detail=1), ball('figure_hand_down', 0.2, 'wood', at=(-0.78, -0.55, 2.2), detail=1)]
far('figure', *figure, at=(-8.4, 14.6), rot=(0, 0, 10), size=0.76)

# A pile of books with a bottle of ink on it.
books = []
height = 0
for index, (color, thick, turn) in enumerate((('salmon', 0.8, 4), ('teal', 0.6, -7), ('tangerine', 0.7, 9))):
    books.append(box('book_%d' % index, (3.6 - index * 0.3, 2.6, thick), color, at=(0, 0, height + thick / 2), rot=(0, 0, turn), bevel=0.06))
    books.append(box('book_pages_%d' % index, (3.5 - index * 0.3, 2.5, thick - 0.2), 'paper', at=(0.1, -0.08, height + thick / 2), rot=(0, 0, turn), bevel=0))
    height += thick
ink = lathe('ink', [(0, 0), (0.6, 0), (0.66, 0.1), (0.66, 0.8), (0.3, 1.1), (0.3, 1.3), (0, 1.3)], 'lead', at=(0.4, 0, height), sides=10)
ink_cap = cylinder('ink_cap', 0.34, 0.3, 'tin', at=(0.4, 0, height + 1.42), sides=10)
ink_label = lathe('ink_label', [(0.675, 0.25), (0.68, 0.3), (0.68, 0.65), (0.675, 0.7)], 'paper', at=(0.4, 0, height), sides=10)
far('books', *books, ink, ink_cap, ink_label, at=(-2.4, 14.4), reach=2.2, size=0.85)

# A small canvas on an easel: a sun over two hills.
canvas = [box('canvas', (3.6, 0.2, 3.0), 'paper', at=(0, 0, 2.6), bevel=0.04), box('canvas_sky', (3.2, 0.06, 2.6), 'sky', at=(0, -0.11, 2.6), bevel=0),
          cylinder('canvas_sun', 0.5, 0.06, 'pencil', at=(0.8, -0.15, 3.2), rot=(90, 0, 0), sides=12),
          slab('canvas_hill', [(-1.6, -1.3)] + [(-1.6 + i * 0.4, -0.5 + 0.55 * math.sin(i * 0.9)) for i in range(9)] + [(1.6, -1.3)], 0.06, 'mat', at=(0, -0.17, 2.6), rot=(90, 0, 0), bevel=0)]
legs = [pipe('easel_leg_%d' % i, [(side * 1.5, -0.3, 0), (side * 0.3, 0.1, 4.4)], 0.13, 'wood', sides=5) for i, side in enumerate((-1, 1))]
legs += [pipe('easel_back', [(0, 1.5, 0), (0, 0.1, 4.4)], 0.13, 'wood', sides=5), box('easel_shelf', (3.9, 0.5, 0.18), 'wood', at=(0, -0.2, 1.0), bevel=0.04)]
far('easel', *canvas, *legs, at=(3.8, 14.9), rot=(-8, 0, -6), reach=2.0, size=0.8)

# A cactus in a pot, in flower.
planter = lathe('planter', [(0, 0), (0.9, 0), (1.15, 1.2), (1.25, 1.25), (1.25, 1.5), (0, 1.5)], 'salmon', sides=12)
trunk = lathe('cactus', [(0, 1.4), (0.6, 1.5), (0.7, 2.4), (0.66, 3.5), (0.4, 3.95), (0, 4.05)], 'mat', sides=8, smooth=70)
arms = [pipe('cactus_arm_%d' % i, [(side * 0.5, 0, 2.2 + i * 0.3), (side * 1.25, 0, 2.3 + i * 0.3), (side * 1.3, 0, 3.2 + i * 0.4)], 0.3, 'mat', sides=6) for i, side in enumerate((-1, 1))]
flower = [ball('cactus_flower', 0.3, 'eraser', at=(0, 0, 4.15), scale=(1, 1, 0.6), detail=1), ball('cactus_flower_b', 0.2, 'eraser', at=(-1.3, 0, 3.35), scale=(1, 1, 0.6), detail=1)]
far('cactus', planter, trunk, *arms, *flower, at=(9.4, 14.3), size=0.82)

# A bottle of glue.
glue = lathe('glue', [(0, 0), (1.0, 0), (1.1, 0.15), (1.1, 2.6), (0.6, 3.3), (0.5, 3.4), (0, 3.4)], 'paper', sides=12)
glue_label = lathe('glue_label', [(1.115, 0.7), (1.12, 0.75), (1.12, 2.0), (1.115, 2.05)], 'sky', sides=12)
glue_cap = lathe('glue_cap', [(0.5, 3.36), (0.5, 3.6), (0.2, 4.3), (0, 4.34)], 'tangerine', sides=10)
far('glue', glue, glue_label, glue_cap, at=(14.2, 14.2), size=0.8)
tag(prop('ground', *ground), outline=0, shadow=False)


# ── The room ─────────────────────────────────────────────────────────────────
# The desk stands at a window. Only from low, past the far row, is any of it seen, and then only its foot:
# the sill with what stands on it, the bottoms of the curtains, the sky through the panes, drawings pinned to the wall.
WALL, SILL, HALF = 23.5, 0.5, 17.0
room = [box('wall_below', (130, 1, 40), 'wall', at=(0, WALL + 0.5, SILL - 20), bevel=0), box('wall_left', (48, 1, 40), 'wall', at=(-HALF - 24, WALL + 0.5, SILL + 20), bevel=0),
        box('wall_right', (48, 1, 40), 'wall', at=(HALF + 24, WALL + 0.5, SILL + 20), bevel=0), box('wall_above', (130, 1, 20), 'wall', at=(0, WALL + 0.5, SILL + 30), bevel=0),
        box('sill', (HALF * 2 + 2.4, 2.2, 0.5), 'paper', at=(0, WALL - 0.3, SILL), bevel=0.1, segments=1), box('window_rail', (HALF * 2, 0.5, 0.5), 'paper', at=(0, WALL + 0.3, SILL + 9), bevel=0)]
room += [box('window_post_%d' % i, (0.6, 0.5, 20), 'paper', at=(x, WALL + 0.3, SILL + 10), bevel=0) for i, x in enumerate((-HALF, -HALF / 3, HALF / 3, HALF))]
for side in (-1, 1):
    folds = [(side * (HALF - 0.3 - i * 0.55), WALL - 0.1 + (0.28 if i % 2 else -0.05)) for i in range(8)]
    room.append(slab('curtain_%d' % side, folds + [(x, y + 0.3) for x, y in reversed(folds)], 20, 'matLine', at=(0, 0, SILL + 10.6), bevel=0))
# On the sill: a plant, a jar of brushes, a row of little pots.
room += [lathe('sill_pot', [(0, 0), (1.0, 0), (1.3, 1.6), (0, 1.6)], 'salmon', at=(-9.5, WALL - 0.4, SILL + 0.25), sides=10)]
room += [rock('sill_plant_%d' % i, 1.2, 'mat', at=(-9.5 + dx, WALL - 0.4, SILL + 2.6 + dz), seed=i, rough=0.2, detail=1, smooth=70) for i, (dx, dz) in enumerate(((0, 0.6), (-1.0, 0), (1.0, 0.1)))]
room += [lathe('sill_jar', [(0, 0), (0.9, 0), (0.9, 1.8), (0.7, 1.9), (0, 1.9)], 'glass', at=(8.0, WALL - 0.4, SILL + 0.25), sides=10)]
room += [cylinder('sill_brush_%d' % i, 0.14, 2.6, color, at=(8.0 + (i - 1) * 0.4, WALL - 0.4, SILL + 2.4), rot=(0, (i - 1) * 9, 0), sides=5) for i, color in enumerate(('teal', 'pencil', 'salmon'))]
room += [cylinder('sill_tub_%d' % i, 0.6, 0.9, color, at=(-1.5 + i * 1.5, WALL - 0.4, SILL + 0.7), sides=8) for i, color in enumerate(('sky', 'tangerine', 'eraser'))]
# On the wall either side of the window: drawings, low enough to be seen.
for index, (x, turn, color) in enumerate(((-21.5, 4, 'paper'), (-26.5, -6, 'tape'), (-32, 3, 'paper'), (21.5, -5, 'paper'), (26.5, 5, 'eraser'), (32, -3, 'paper'))):
    room.append(box('drawing_%d' % index, (3.4, 0.08, 3.6), color, at=(x, WALL - 0.06, SILL + 2.5), rot=(0, turn, 0), bevel=0))
    room.append(cylinder('drawing_pin_%d' % index, 0.22, 0.14, 'salmon', at=(x, WALL - 0.14, SILL + 3.9), rot=(90, 0, 0), sides=6))
    scribble = (STAR, HEART, SPIRAL)[index % 3]
    room.append(place(pipe('drawing_line_%d' % index, [(px * 1.2, 0, py * 1.2) for px, py in scribble], 0.08, ('teal', 'salmon', 'sky')[index % 3], sides=3, closed=index % 3 != 2), at=(x, WALL - 0.14, SILL + 2.3)))
tag(prop('room', *room), outline=0, shadow=False, receive=False)


# ── Templates the game places itself ─────────────────────────────────────────
# A pot of paint: the game stands three at each end of the back, paints each with a player's colour and makes it jump.
can = lathe('pot', [(0, 0), (0.72, 0), (0.76, 0.06), (0.76, 0.98), (0.84, 1.02), (0.84, 1.1), (0.72, 1.1), (0.72, 0.98), (0, 0.98)], 'bucket', sides=16)
wrapper = lathe('pot_wrapper', [(0.77, 0.24), (0.785, 0.27), (0.785, 0.72), (0.77, 0.75)], 'paper', sides=16)
surface = lathe('pot_paint', [(0, 0.98), (0.71, 0.98), (0.62, 1.07), (0.3, 1.12), (0, 1.13)], 'potPaint', sides=16, smooth=70)
run = pipe('pot_run', [(0.1, -0.6, 1.08), (0.12, -0.8, 1.13), (0.13, -0.9, 1.02), (0.13, -0.9, 0.62)], 0.12, 'potPaint', sides=6)
bead = ball('pot_bead', 0.16, 'potPaint', at=(0.13, -0.9, 0.56), detail=1)
part(group('pot', tag(prop('pot_tin', can, wrapper), outline=0.045, receive=False), tag(prop('pot_paint', surface, run, bead), outline=0.045, shadow=False, receive=False)))

# The bucket that falls: tin, brimming with paint, with a wire handle.
pail = lathe('bucket', [(0, 0), (0.32, 0), (0.35, 0.04), (0.43, 0.55), (0.48, 0.57), (0.48, 0.64), (0.4, 0.64), (0.39, 0.55), (0, 0.55)], 'bucket', sides=14)
hoop = lathe('bucket_hoop', [(0.375, 0.17), (0.395, 0.19), (0.405, 0.25), (0.39, 0.27)], 'lead', sides=14)
brim = lathe('bucket_paint', [(0, 0.55), (0.4, 0.55), (0.38, 0.66), (0.22, 0.73), (0, 0.75)], 'gold', sides=14, smooth=70)
dribble = pipe('bucket_dribble', [(-0.2, -0.3, 0.68), (-0.26, -0.4, 0.68), (-0.28, -0.42, 0.56), (-0.28, -0.42, 0.34)], 0.07, 'gold', sides=6)
drop = ball('bucket_drop', 0.095, 'gold', at=(-0.28, -0.42, 0.3), detail=1)
wire = pipe('bucket_wire', [(math.cos(math.radians(a)) * 0.5, 0.2 * math.sin(math.radians(a)), 0.58 + math.sin(math.radians(a)) * 0.46) for a in range(0, 181, 30)], 0.04, 'lead', sides=5)
part(tag(prop('bucket', pail, hoop, brim, dribble, drop, wire), outline=0.045, receive=False))

# A splash of paint on the mat: the code lays one down, in the kicker's colour, each time a bucket goes over.
part(tag(prop('splat', slab('splat', blot(0.62, 9, 12, 0.32), 0.03, 'potPaint', bevel=0), *[cylinder('splat_drop_%d' % i, 0.16 - i * 0.04, 0.03, 'potPaint', at=(math.cos(i * 2.2) * (0.95 + i * 0.12), math.sin(i * 2.2) * (0.95 + i * 0.12), 0), sides=7) for i in range(3)]), outline=0, shadow=False))

# The paper plane, pointing along X. The code throws it from one side of the desk to the other, round the back.
wings = [slab('plane_wing_%d' % i, [(1.0, 0), (-0.75, side * 0.85), (-0.5, 0)] if side > 0 else [(1.0, 0), (-0.5, 0), (-0.75, side * 0.85)], 0.07, 'paper', rot=(side * 14, 0, 0), bevel=0) for i, side in enumerate((-1, 1))]
keel = slab('plane_keel', [(-0.75, 0), (0.5, -0.3), (1.0, 0)], 0.07, 'paperDark', rot=(90, 0, 0), bevel=0)
part(tag(prop('plane', *wings, keel), outline=THIN, shadow=False))

# A wind-up robot, facing X, that walks the back of the desk. Its key is a piece of its own, for the code to turn.
body = box('toy', (0.7, 0.62, 0.62), 'tin', at=(0, 0, 0.6), bevel=0.1)
dome = ball('toy_head', 0.26, 'sky', at=(0.08, 0, 1.02), scale=(1, 1, 0.8), detail=1)
eyes = [ball('toy_eye_%d' % i, 0.08, 'lead', at=(0.36, side * 0.15, 0.7), detail=1) for i, side in enumerate((-1, 1))]
wheels = [box('toy_foot_%d' % i, (0.44, 0.2, 0.3), 'salmon', at=(0.04, side * 0.2, 0.15), bevel=0.06) for i, side in enumerate((-1, 1))]
robot = tag(prop('toy_body', body, dome, *eyes, *wheels), outline=THIN, shadow=False, receive=False)
stem = cylinder('toy_key', 0.05, 0.3, 'lead', at=(-0.45, 0, 0), rot=(0, 90, 0), sides=5)
wing = ring('toy_key_wing', 0.2, 0.06, 'pencil', at=(-0.78, 0, 0), rot=(90, 0, 0), sides=8, around=4)
winder = place(tag(prop('toy_key', stem, wing), outline=THIN, shadow=False), at=(0, 0, 0.62))
part(group('toy', robot, winder))

settle()
