# Pinta o Chão: a sheet of white paper taped to a cutting mat on an artist's desk. The paper is the floor
# (the game draws its squares and paints them; their top is Z = 0), and what an artist leaves lying about
# is giant round it. The camera looks down from the front, so what is tall stands at the sides, and the
# strip in front of the paper stays flat.
import math

from kit import *

W, D = 14.0, 12.0
# The top of the mat the paper is taped to, and of the desk under the mat.
MAT = -0.06
DESK = -0.18

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
tag(box('desk', (58, 42, 1.2), 'desk', at=(0, 1, DESK - 0.6), bevel=0.3, segments=1), outline=0, shadow=False)
rng = random.Random(5)
grain = []
while len(grain) < 16:
    x, y, length = rng.uniform(-20, 20), rng.uniform(-11, 14), rng.uniform(2, 5)
    if abs(x) < 12.5 and -9.5 < y < 10.5:
        continue
    grain.append(box('grain_%d' % len(grain), (length, 0.16, 0.03), 'deskDark', at=(x, y, DESK + 0.001), bevel=0))
tag(prop('grain', *grain), outline=0, shadow=False)
# Sheets of coloured paper pushed under the mat's corners.
for index, (color, x, y, turn) in enumerate((('sky', -12.4, -9.6, 17), ('tape', 12.2, 10.6, -11), ('eraser', 13.6, -8.6, -24))):
    tag(box('sheet_%d' % index, (7.5, 9.5, 0.05), color, at=(x, y, DESK + 0.025 + index * 0.01), rot=(0, 0, turn), bevel=0), outline=0.03, shadow=False)

# The cutting mat: green, with its grid of pale lines and a border.
MAT_W, MAT_D, MAT_Y = 21.0, 18.0, 1.0
tag(slab('mat', rounded(MAT_W, MAT_D, 0.6, 4), MAT - DESK, 'mat', at=(0, MAT_Y, (MAT + DESK) / 2), bevel=0), outline=0.03, shadow=False)
lines = [box('mat_line_x_%d' % i, (0.07, MAT_D - 1.2, 0.02), 'matLine', at=(x, MAT_Y, MAT), bevel=0) for i, x in enumerate(range(-9, 10, 2))]
lines += [box('mat_line_y_%d' % i, (MAT_W - 1.2, 0.07, 0.02), 'matLine', at=(0, y, MAT), bevel=0) for i, y in enumerate(range(-7, 10, 2))]
lines += [box('mat_edge_x_%d' % i, (0.12, MAT_D - 1.08, 0.02), 'matLine', at=(side * (MAT_W / 2 - 0.6), MAT_Y, MAT), bevel=0) for i, side in enumerate((-1, 1))]
lines += [box('mat_edge_y_%d' % i, (MAT_W - 1.08, 0.12, 0.02), 'matLine', at=(0, MAT_Y + side * (MAT_D / 2 - 0.6), MAT), bevel=0) for i, side in enumerate((-1, 1))]
tag(prop('mat_lines', *lines), outline=0, shadow=False)

# Masking tape all the way round the paper: it is also the wall nobody can walk through. The strips cross at the corners.
TAPE = 0.6
strips = [slab('tape_%d' % i, torn(W + 2.6, TAPE), 0.1, 'tape', at=(0.15 * side, side * (D / 2 + TAPE / 2 - 0.01), MAT + 0.05), rot=(0, 0, side * 0.5), bevel=0) for i, side in enumerate((-1, 1))]
strips += [slab('tape_%d' % (i + 2), torn(D + 2.4, TAPE), 0.124, 'tape', at=(side * (W / 2 + TAPE / 2 - 0.01), -0.1 * side, MAT + 0.062), rot=(0, 0, 90 + side * 0.4), bevel=0) for i, side in enumerate((-1, 1))]
tag(prop('tape', *strips), outline=0.03, shadow=False)


# ── The left side: a ruler, a pencil, scissors, a sketchbook under the lamp ──
ruler = box('ruler', (1.3, 9.6, 0.16), 'wood', at=(0, 0, 0.08), bevel=0.04)
ticks = [box('ruler_tick_%d' % i, (0.55 if i % 4 == 0 else 0.3, 0.08, 0.03), 'lead', at=(0.65 - (0.55 if i % 4 == 0 else 0.3) / 2 - 0.04, -4.4 + i * 0.4, 0.16), bevel=0) for i in range(23)]
tag(prop('ruler', ruler, *ticks, at=(-9.0, 0.5, MAT), rot=(0, 0, 3)), outline=0.04)


def pencil(name, length, body, at, turn):
    """A six-sided pencil lying on one of its flats, sharpened at the far end, with a metal band and a rubber at the near one."""
    wide = 0.46
    def along(piece, start):
        return place(piece, at=(0, 0, start), rot=(0, 0, 30))
    pieces = [along(cylinder(name, wide, length, body, sides=6), length / 2),
              along(cylinder(name + '_wood', wide, 1.0, 'wood', top=0.16, sides=6), length + 0.5),
              along(cylinder(name + '_lead', 0.16, 0.4, 'lead', top=0.02, sides=6), length + 1.2),
              along(cylinder(name + '_band', wide + 0.02, 0.6, 'tin', sides=12), -0.3),
              along(cylinder(name + '_rubber', wide - 0.04, 0.6, 'eraser', sides=12, bevel=0.1), -0.85)]
    return tag(prop(name, *pieces, at=(at[0], at[1], at[2] + wide * 0.87), rot=(0, 90, turn)), outline=0.05)

pencil('pencil', 7.4, 'pencil', (-12.6, -5.0, DESK), 76)

# Scissors, open, their two blades crossing at the screw.
def blade(name, side):
    steel = slab(name, [(-0.24, -1.2), (0.24, -1.2), (0.3, 0.2), (0.24, 2.6), (0.02, 3.5), (-0.16, 2.6), (-0.24, 0.2)], 0.14, 'tin', bevel=0)
    loop = ring(name + '_loop', 0.62, 0.17, 'tangerine', at=(side * 0.35, -1.9, 0), sides=14, around=6)
    return prop(name, steel, loop, rot=(0, 0, side * 13), at=(0, 0, 0.1 + (0.07 if side > 0 else -0.07)))

screw = cylinder('scissors_screw', 0.16, 0.34, 'lead', at=(0, 0, 0.1), sides=8)
tag(prop('scissors', blade('blade_a', -1), blade('blade_b', 1), screw, at=(-9.4, -8.0, MAT + 0.08), rot=(0, 0, -75)), outline=0.045)

# A spiral sketchbook with a rubber left on it, and the sharpener beside it.
BOOK = (-11.7, 8.0)
cover = box('sketchbook', (5.2, 3.8, 0.14), 'sky', at=(0, 0, 0.07), bevel=0.05)
pages = box('sketchbook_pages', (5.0, 3.6, 0.3), 'paper', at=(0.06, 0, 0.29), bevel=0)
front = box('sketchbook_front', (5.2, 3.8, 0.14), 'sky', at=(0, 0, 0.5), bevel=0.05)
label = box('sketchbook_label', (2.2, 1.0, 0.04), 'paper', at=(0.6, 0.6, 0.575), bevel=0)
coils = [ring('sketchbook_coil_%d' % i, 0.34, 0.06, 'tin', at=(-2.52, -1.5 + i * 0.5, 0.3), rot=(90, 0, 0), sides=8, around=4) for i in range(7)]
tag(prop('sketchbook', cover, pages, front, label, *coils, at=(BOOK[0], BOOK[1], MAT), rot=(0, 0, 9)), outline=0.05)
rubber = box('rubber', (1.7, 0.9, 0.6), 'eraser', at=(0, 0, 0.3), bevel=0.12)
sleeve = box('rubber_sleeve', (0.9, 0.94, 0.64), 'teal', at=(0.3, 0, 0.3), bevel=0.04)
tag(prop('rubber', rubber, sleeve, at=(BOOK[0] + 0.9, BOOK[1] - 0.7, MAT + 0.57), rot=(0, 0, -20)), outline=0.045)
# The sharpener: a wedge with a blade screwed on top and the hole the pencil goes in. Shavings beside it.
wedge_shape = slab('sharpener', [(-0.7, -0.5), (0.7, -0.38), (0.7, 0.38), (-0.7, 0.5)], 0.6, 'teal', at=(0, 0, 0.3), bevel=0.08)
knife = box('sharpener_blade', (0.9, 0.5, 0.06), 'tin', at=(0.05, 0, 0.62), rot=(0, 0, 12), bevel=0)
hole = cylinder('sharpener_hole', 0.2, 0.06, 'lead', at=(-0.71, 0, 0.3), rot=(0, 90, 0), sides=8)
tag(prop('sharpener', wedge_shape, knife, hole, at=(-8.3, 9.1, MAT), rot=(0, 0, 28)), outline=0.045)


def shaving(name, at, turn, size=1.0):
    """A curl off a sharpened pencil: a fan of wood with the pencil's paint along its scalloped edge."""
    def arc_point(angle, reach):
        return (math.cos(math.radians(angle)) * reach * size, math.sin(math.radians(angle)) * reach * size)
    def scallop(angle):
        return 0.06 * math.cos(math.radians(angle * 6))
    fan = [(0, 0)] + [arc_point(a, 0.62 + scallop(a)) for a in range(-70, 71, 14)]
    edge = [arc_point(a, 0.7 + scallop(a)) for a in range(-70, 71, 14)] + [arc_point(a, 0.5) for a in range(70, -71, -14)]
    return prop(name, slab(name, fan, 0.05, 'wood', bevel=0), slab(name + '_paint', edge, 0.07, 'pencil', bevel=0), at=at, rot=(0, 0, turn))

tag(prop('shavings', shaving('shaving_a', (0, 0, 0.03), 20), shaving('shaving_b', (0.9, -0.5, 0.03), 160, 0.8), shaving('shaving_c', (-0.4, -0.9, 0.03), -80, 0.7), at=(-8.5, 7.6, MAT)), outline=0.03, shadow=False)

# The desk lamp, leaning in over the corner. Its bulb is lit.
LAMP = (-12.6, 3.9)
foot = lathe('lamp_foot', [(0, 0), (1.3, 0), (1.42, 0.16), (1.25, 0.42), (0.45, 0.55), (0, 0.55)], 'salmon', sides=20)
elbow_at, head_at = Vector((-0.5, 0.6, 2.9)), Vector((1.7, 0.3, 4.3))
lower = pipe('lamp_lower', [(0, 0, 0.5), tuple(elbow_at)], 0.15, 'tin', sides=8)
upper = pipe('lamp_upper', [tuple(elbow_at), tuple(head_at)], 0.15, 'tin', sides=8)
elbow = ball('lamp_elbow', 0.3, 'salmon', at=tuple(elbow_at))
shade = lathe('lamp_shade', [(0, 0), (0.42, 0), (0.5, 0.12), (1.2, 1.3), (1.26, 1.42), (1.1, 1.42), (0.4, 0.25), (0, 0.25)], 'salmon', at=tuple(head_at), rot=(0, 118, -12), sides=18)
tag(prop('lamp', foot, lower, upper, elbow, shade, at=(LAMP[0], LAMP[1], DESK)), outline=0.055)
aim = Euler((0, math.radians(118), math.radians(-12))).to_matrix() @ Vector((0, 0, 1))
tag(ball('lamp_bulb', 0.5, 'bulb', at=tuple(Vector((LAMP[0], LAMP[1], DESK)) + head_at + aim * 1.05)), glow=1.5, shadow=False)


# ── The right side: crayons, the palette, a glass of water and the bird that drinks from it ─
def crayon(name, color, at, turn):
    stick = cylinder(name, 0.36, 3.4, color, at=(0, 0, 1.7), sides=10)
    wrap = cylinder(name + '_wrap', 0.385, 2.0, 'paper', at=(0, 0, 1.5), sides=10)
    band = cylinder(name + '_band', 0.39, 0.22, color, at=(0, 0, 2.1), sides=10)
    tip = cylinder(name + '_tip', 0.36, 0.7, color, at=(0, 0, 3.75), top=0.12, sides=10)
    return tag(prop(name, stick, wrap, band, tip, at=(at[0], at[1], MAT + 0.37), rot=(0, 90, turn)), outline=0.045)

crayon('crayon_a', 'teal', (9.7, -6.6), 106)
crayon('crayon_b', 'salmon', (10.5, -6.9), 89)
crayon('crayon_c', 'tangerine', (11.3, -6.6), 71)

# The palette: a kidney of wood with a thumb hole, blobs of paint round its edge and a brush across it.
PALETTE = (11.9, 0.3)
def kidney(angle):
    """An oval pinched in at one place, where the thumb comes round."""
    reach = 1 + 0.1 * math.cos(angle * 2 + 0.5) - 0.24 * math.exp(-((angle - 5.6) / 0.33) ** 2)
    return (math.cos(angle) * 2.9 * reach, math.sin(angle) * 2.2 * reach)

board = slab('palette', [kidney(2 * math.pi * i / 26) for i in range(26)], 0.2, 'wood', at=(0, 0, 0.1), bevel=0.05)
thumb = cylinder('palette_hole', 0.42, 0.03, 'desk', at=(1.5, -0.75, 0.2), sides=12)
dabs = [lathe('dab_%d' % i, [(0, 0), (size, 0), (size * 0.9, 0.14), (size * 0.5, 0.26), (0, 0.3)], color, at=(math.cos(angle) * 1.95, math.sin(angle) * 1.45, 0.19), sides=10, smooth=70)
        for i, (color, angle, size) in enumerate((('teal', 0.5, 0.5), ('paper', 1.25, 0.44), ('sky', 2.0, 0.52), ('salmon', 2.8, 0.46), ('tangerine', 3.6, 0.5), ('pencil', 4.35, 0.42)))]
smear = slab('palette_smear', blot(0.75, 4, 12, 0.25), 0.04, 'sky', at=(-0.2, -0.1, 0.21), bevel=0)
tag(prop('palette', board, thumb, *dabs, smear, at=(PALETTE[0], PALETTE[1], DESK), rot=(0, 0, 18)), outline=0.045)


def brush(name, tip, at, rot, wet=None, length=4.6):
    """A fat round brush built standing on its bristles' tip: bristles, a metal collar, a long handle."""
    hair = lathe(name + '_hair', [(0, 0), (0.1, 0.08), (0.3, 0.5), (0.36, 1.0), (0.32, 1.3), (0, 1.3)], 'bristle', sides=10, smooth=70)
    paint = lathe(name + '_paint', [(0, -0.02), (0.12, 0.06), (0.33, 0.5), (0.34, 0.62), (0, 0.62)], tip, sides=10, smooth=70)
    collar = cylinder(name + '_collar', 0.36, 0.9, 'tin', at=(0, 0, 1.7), top=0.26, sides=10)
    grip = lathe(name, [(0, 2.1), (0.27, 2.1), (0.3, 2.9), (0.2, length - 1.2), (0.14, length), (0.1, length + 0.2), (0, length + 0.22)], 'salmon' if wet is None else wet, sides=10)
    return tag(prop(name, grip, hair, paint, collar, at=at, rot=rot), outline=0.045)

brush('brush_lying', 'sky', (PALETTE[0] + 0.9, PALETTE[1] - 1.5, DESK + 0.56), (0, -87, -53), length=5.4)

# A glass of water gone cloudy, with a brush left standing in it.
GLASS = (11.2, 5.6)
tumbler = lathe('glass', [(0, 0), (1.05, 0), (1.14, 0.14), (1.3, 2.3), (1.3, 2.4), (1.14, 2.4), (1.12, 1.9), (0, 1.9)], 'glass', sides=20)
water = lathe('glass_water', [(0, 1.9), (1.13, 1.9), (1.13, 2.0), (0, 2.0)], 'water', sides=20)
tag(prop('glass', tumbler, water, at=(GLASS[0], GLASS[1], DESK)), outline=0.05)
brush('brush_resting', 'teal', (GLASS[0] - 0.08, GLASS[1] + 0.85, DESK + 0.4), (-14, 4, 0), wet='pencil')

# The toy bird that drinks: it rocks on its stand, then dips its beak in the glass, over and over.
# It is built facing X with its axle at the origin, which is what it tips round, and stands side on to the camera.
REACH, PERCH = 1.8, 2.35
tube = pipe('bird_neck', [(0, 0, -1.25), (0, 0, 1.5)], 0.13, 'glass', sides=8)
belly = ball('bird_belly', 0.46, 'sky', at=(0, 0, -1.3), scale=(1, 1, 1.1))
head = ball('bird_head', 0.44, 'sky', at=(0, 0, 1.6))
beak = cylinder('bird_beak', 0.17, 0.75, 'tangerine', at=(0.72, 0, 1.55), rot=(0, 90, 0), top=0.03, sides=8)
hat = [cylinder('bird_brim', 0.5, 0.08, 'lead', at=(0, 0, 2.0), sides=12), cylinder('bird_hat', 0.32, 0.45, 'lead', at=(0, 0, 2.25), sides=12)]
eyes = [ball('bird_eye_%d' % i, 0.08, 'lead', at=(0.3, side * 0.28, 1.76), detail=1) for i, side in enumerate((-1, 1))]
axle = cylinder('bird_axle', 0.1, 1.5, 'tin', rot=(90, 0, 0), sides=8)
bird = tag(prop('bird', tube, belly, head, beak, *hat, *eyes, axle), outline=0.045)
key(bird, 'rotation_euler', [(second, (0, math.radians(angle), 0)) for second, angle in ((0, 5), (0.7, -5), (1.4, 6), (2.0, -3), (2.9, 66), (3.4, 66), (4.1, -7), (4.6, 5))])
legs = [box('bird_leg_%d' % i, (0.34, 0.18, 2.4), 'tin', at=(0, side * 0.68, -1.15), bevel=0.05) for i, side in enumerate((-1, 1))]
feet = [box('bird_foot_%d' % i, (1.5, 0.34, 0.22), 'salmon', at=(0, side * 0.68, -PERCH + 0.11), bevel=0.08) for i, side in enumerate((-1, 1))]
brace = box('bird_brace', (0.2, 1.4, 0.18), 'salmon', at=(-0.6, 0, -PERCH + 0.11), bevel=0.05)
stand = tag(prop('bird_stand', *legs, *feet, brace), outline=0.045)
facing = math.radians(12)
group('drinking_bird', stand, bird, at=(GLASS[0] - math.cos(facing) * REACH, GLASS[1] - math.sin(facing) * REACH, MAT + PERCH), rot=(0, 0, 12))
# Rings run out over the water from where its beak goes in, and are lost against the glass.
for index, seconds in enumerate((2.3, 3.0)):
    ripple = tag(ring('ripple_%d' % index, 1.16, 0.035, 'paper', at=(GLASS[0], GLASS[1], DESK + 2.0), sides=18, around=4), outline=0, shadow=False)
    key(ripple, 'scale', [(0, (0.2, 0.2, 1)), (seconds, (1, 1, 1))], linear=True)

# A tube of paint, squeezed flat at its tail, with what came out of it.
def squeezed(x, y, z):
    flat = min(1, max(0, (z - 1.0) / 1.9))
    return (x * (1 + 0.45 * flat), y * (1 - 0.82 * flat), z)

paint_tube = reshape(lathe('tube', [(0, 0), (0.2, 0), (0.2, 0.3), (0.62, 0.55), (0.66, 0.7), (0.66, 2.9), (0, 2.9)], 'paper', sides=12), squeezed)
tube_label = reshape(lathe('tube_label', [(0.675, 1.0), (0.68, 1.05), (0.68, 2.0), (0.675, 2.05)], 'sky', sides=12), squeezed)
crimp = box('tube_crimp', (2.0, 0.22, 0.3), 'tin', at=(0, 0, 2.95), bevel=0.05)
tag(prop('tube', paint_tube, tube_label, crimp, at=(9.3, 8.8, MAT + 0.62), rot=(-90, 0, -81)), outline=0.045)
squirt = [ball('squirt_0', 0.5, 'sky', at=(0, 0, 0.2), scale=(1.2, 1, 0.6)), ball('squirt_1', 0.34, 'sky', at=(-0.5, -0.35, 0.14), scale=(1, 1, 0.6)), ball('squirt_2', 0.2, 'sky', at=(-0.95, -0.55, 0.1), scale=(1, 1, 0.6), detail=1)]
tag(prop('squirt', *squirt, at=(8.6, 8.6, MAT)), outline=0.04)

# A paper plane gliding round and round over the crayons.
wings = [slab('plane_wing_%d' % i, [(0, 1.0), (side * 0.85, -0.75), (0, -0.5)] if side < 0 else [(0, 1.0), (0, -0.5), (side * 0.85, -0.75)], 0.07, 'paper', rot=(0, side * -14, 0), bevel=0) for i, side in enumerate((-1, 1))]
keel = slab('plane_keel', [(-0.75, 0), (0.5, -0.3), (1.0, 0)], 0.07, 'paperDark', at=(0, 0, 0), rot=(90, 0, 90), bevel=0)
glider = tag(prop('plane', *wings, keel), outline=0.035, shadow=False)
flight = bob(group('plane_flight', glider, at=(2.3, 0, 0), rot=(8, -16, 0)), height=0.5, seconds=2.6)
spin(group('plane_round', flight, at=(10.9, -3.0, DESK + 3.1)), seconds=9)


# ── The back and the front ───────────────────────────────────────────────────
# A roll of masking tape, and the bit torn off it.
roll = lathe('tape_roll', [(0.62, 0), (1.05, 0), (1.05, 0.62), (0.62, 0.62), (0.62, 0)], 'tape', sides=20)
core = lathe('tape_core', [(0.56, 0.03), (0.63, 0.03), (0.63, 0.59), (0.56, 0.59), (0.56, 0.03)], 'wood', sides=20)
tag(prop('tape_roll', roll, core, at=(0.2, 8.7, MAT)), outline=0.05)
tag(slab('tape_scrap', torn(1.9, TAPE), 0.06, 'tape', at=(8.5, -7.4, MAT + 0.03), rot=(0, 0, 24), bevel=0), outline=0.03, shadow=False)

# Splashes of paint that missed the paper.
for index, (color, x, y, size, level) in enumerate((('teal', -4.8, 7.8, 0.8, MAT), ('salmon', -8.9, -5.7, 0.7, MAT), ('tangerine', 3.4, -7.4, 0.6, MAT), ('sky', -8.6, 5.6, 0.5, MAT))):
    drops = [cylinder('splash_%d_%d' % (index, i), size * 0.22 * (1 - i * 0.25), 0.03, color, at=(math.cos(index * 2.1 + i * 1.9) * size * (1.5 + 0.3 * i), math.sin(index * 2.1 + i * 1.9) * size * (1.5 + 0.3 * i), 0), sides=8) for i in range(3)]
    tag(prop('splash_%d' % index, slab('splash_%d' % index, blot(size, index + 2), 0.03, color, bevel=0), *drops, at=(x, y, level + 0.016)), outline=0, shadow=False)

# A flat brush lying along the front, and a few paper clips.
handle = lathe('flat_brush', [(0, 0), (0.2, 0.05), (0.3, 1.2), (0.24, 3.6), (0.3, 4.2), (0, 4.2)], 'teal', sides=10)
ferrule = box('flat_brush_collar', (0.4, 0.9, 1.0), 'tin', at=(0, 0, 4.6), bevel=0.06)
hairs = slab('flat_brush_hair', [(-0.45, 0), (0.45, 0), (0.5, 0.9), (0.2, 1.1), (-0.3, 1.05), (-0.5, 0.85)], 0.34, 'bristle', at=(0, 0, 5.1), rot=(90, 0, 90), bevel=0.05)
tag(prop('flat_brush', handle, ferrule, hairs, at=(-3.6, -8.4, MAT + 0.3), rot=(0, 90, 4)), outline=0.045)
clip = tag(pipe('clip_a', [(0.2, 0.55, 0), (0.2, -0.45, 0), (0.02, -0.66, 0), (-0.2, -0.45, 0), (-0.2, 0.75, 0), (0.05, 0.98, 0), (0.34, 0.75, 0), (0.34, -0.7, 0)], 0.055, 'tin', sides=5, at=(5.6, -7.6, MAT + 0.06), rot=(0, 0, 40)), outline=0.03, shadow=False)
copy(clip, 'clip_b', at=(6.9, -8.3, MAT + 0.06), rot=(0, 0, -65))
copy(clip, 'clip_c', at=(-8.5, -5.0 + 9.5, MAT + 0.06), rot=(0, 0, 110))


# ── Templates the game places itself ─────────────────────────────────────────
# A pot of paint: the game stands six along the back, paints each with a player's colour and makes it jump.
can = lathe('pot', [(0, 0), (0.72, 0), (0.76, 0.06), (0.76, 0.98), (0.84, 1.02), (0.84, 1.1), (0.72, 1.1), (0.72, 0.98), (0, 0.98)], 'bucket', sides=16)
wrapper = lathe('pot_wrapper', [(0.77, 0.24), (0.785, 0.27), (0.785, 0.72), (0.77, 0.75)], 'paper', sides=16)
surface = lathe('pot_paint', [(0, 0.98), (0.71, 0.98), (0.62, 1.07), (0.3, 1.12), (0, 1.13)], 'potPaint', sides=16, smooth=70)
run = pipe('pot_run', [(0.1, -0.6, 1.08), (0.12, -0.8, 1.13), (0.13, -0.9, 1.02), (0.13, -0.9, 0.62)], 0.12, 'potPaint', sides=6)
bead = ball('pot_bead', 0.16, 'potPaint', at=(0.13, -0.9, 0.56), detail=1)
part(tag(prop('pot', can, wrapper, surface, run, bead), outline=0.045))

# The bucket that falls: tin, brimming with paint, with a wire handle.
pail = lathe('bucket', [(0, 0), (0.32, 0), (0.35, 0.04), (0.43, 0.55), (0.48, 0.57), (0.48, 0.64), (0.4, 0.64), (0.39, 0.55), (0, 0.55)], 'bucket', sides=14)
hoop = lathe('bucket_hoop', [(0.375, 0.17), (0.395, 0.19), (0.405, 0.25), (0.39, 0.27)], 'tin', sides=14)
brim = lathe('bucket_paint', [(0, 0.55), (0.4, 0.55), (0.38, 0.66), (0.22, 0.73), (0, 0.75)], 'gold', sides=14, smooth=70)
dribble = pipe('bucket_dribble', [(-0.2, -0.3, 0.68), (-0.26, -0.4, 0.68), (-0.28, -0.42, 0.56), (-0.28, -0.42, 0.34)], 0.07, 'gold', sides=6)
drop = ball('bucket_drop', 0.095, 'gold', at=(-0.28, -0.42, 0.3), detail=1)
wire = pipe('bucket_wire', [(math.cos(math.radians(a)) * 0.5, 0.2 * math.sin(math.radians(a)), 0.58 + math.sin(math.radians(a)) * 0.46) for a in range(0, 181, 30)], 0.04, 'lead', sides=5)
part(tag(prop('bucket', pail, hoop, brim, dribble, drop, wire), outline=0.045))
