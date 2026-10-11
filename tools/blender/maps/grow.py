# Come e Cresce: a picnic laid on a wooden table. The gingham blanket is the floor (the game draws its
# squares; their top is Z = 0), and everything round it is giant: the pets are the size of crumbs.
# The camera looks down from the front, so what is tall stands at the back and at the sides, and the
# strip in front of the blanket stays flat.
import math

from kit import *

W, D = 16.0, 12.0
# The table's top. The blanket lies on it, this thick.
TABLE = -0.16

guide_floor(W, D)
for spot in ((-3.5, 1.5, 0), (2.2, -2.4, 0), (5.6, 3.2, 0)):
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


def wedge(radius, start, end, steps=8):
    """A slice of something round: its point, then its arc."""
    return [(0, 0)] + circle(radius, steps, start, end)


def rounded(width, depth, radius, steps=3):
    """A rectangle with round corners, for `slab`."""
    points = []
    for corner, (sx, sy) in enumerate(((1, -1), (1, 1), (-1, 1), (-1, -1))):
        points += circle(radius, steps, corner * 90 - 90, corner * 90, (sx * (width / 2 - radius), sy * (depth / 2 - radius)))
    return points


def ruffled(points, per_edge=6, amount=0.1):
    """The same outline with a wave along every side: the edge of a lettuce leaf, of spilt jam."""
    out = []
    for index, (ax, ay) in enumerate(points):
        bx, by = points[(index + 1) % len(points)]
        length = math.hypot(bx - ax, by - ay) or 1
        nx, ny = (by - ay) / length, -(bx - ax) / length
        for step in range(per_edge):
            t = step / per_edge
            push = math.sin(t * math.pi * 2 * max(1, per_edge // 3)) * amount
            out.append((ax + (bx - ax) * t + nx * push, ay + (by - ay) * t + ny * push))
    return out


def plate(name, radius, stripe='enamel'):
    """A dish with a raised rim and a painted line round it."""
    well = 0.66
    def rim(share):
        return 0.24 + 0.2 * (share - well) / (1 - well)
    dish = lathe(name, [(0, 0), (radius * 0.58, 0), (radius * 0.64, 0.1), (radius, 0.34), (radius, 0.44), (radius * well, 0.24), (0, 0.24)], 'plate', sides=24)
    line = lathe(name + '_line', [(radius * 0.8, rim(0.8) - 0.02), (radius * 0.9, rim(0.9) - 0.02), (radius * 0.9, rim(0.9) + 0.014), (radius * 0.8, rim(0.8) + 0.014), (radius * 0.8, rim(0.8) - 0.02)], stripe, sides=24)
    return [dish, line]


# ── The table ────────────────────────────────────────────────────────────────
# Planks running across, a shade apart, with the dark of the gaps showing between them.
PLANK = 3.2
planks = [box('plank_%d' % (index + 5), (52, PLANK - 0.07, 1.2), 'table' if index % 2 == 0 else 'tableAlt', at=((index % 3 - 1) * 1.4, index * PLANK, TABLE - 0.6), bevel=0.16, segments=1) for index in range(-5, 6)]
tag(prop('planks', *planks), outline=0, shadow=False)
tag(box('gaps', (50, PLANK * 11 - 1, 0.5), 'tableDark', at=(0, 0, TABLE - 0.7), bevel=0), outline=0, shadow=False)

# The grain of the wood: a few dark strokes and a knot or two, only where the blanket does not cover them.
rng = random.Random(11)
grain = []
while len(grain) < 24:
    x, row, length = rng.uniform(-19, 19), rng.randint(-4, 4), rng.uniform(1.6, 4.6)
    y = row * PLANK + rng.uniform(-1.1, 1.1)
    if abs(x) < W / 2 + 3 and abs(y) < D / 2 + 0.8:
        continue
    grain.append(box('grain_%d' % len(grain), (length, 0.16, 0.03), 'tableDark', at=(x, y, TABLE + 0.001), bevel=0))
for index, (x, y) in enumerate(((-12.6, -1.2), (13.2, 6.2), (6.5, 12.3), (-3, -8.9))):
    grain.append(place(cylinder('knot_%d' % index, 0.24, 0.03, 'tableDark', at=(x, y, TABLE + 0.001), sides=10), scale=(1.8, 1, 1)))
tag(prop('grain', *grain), outline=0, shadow=False)


# ── The blanket's hem ────────────────────────────────────────────────────────
# The squares are the game's. Under them lies the cloth's red edge, scalloped, one scallop to a square.
def scalloped(width, depth, margin=0.14, bulge=0.26, steps=4):
    points = []
    half_w, half_d = width / 2, depth / 2
    sides = (((-half_w, -half_d), (1, 0), (0, -1), int(width)), ((half_w, -half_d), (0, 1), (1, 0), int(depth)),
             ((half_w, half_d), (-1, 0), (0, 1), int(width)), ((-half_w, half_d), (0, -1), (-1, 0), int(depth)))
    for (sx, sy), (ax, ay), (ox, oy), count in sides:
        for square in range(count):
            for step in range(steps):
                share = step / steps
                out = margin + bulge * math.sin(math.pi * share)
                points.append((sx + ax * (square + share) + ox * out, sy + ay * (square + share) + oy * out))
    return points

tag(slab('hem', scalloped(W, D), 0.13, 'clothEdge', at=(0, 0, TABLE + 0.065), bevel=0), outline=0.03, shadow=False)


# ── The left side: a sandwich on a plate, and a fork on its napkin ───────────
def bread(name, outline, z):
    """A slice: crust round the edge, crumb on the faces."""
    middle = (sum(x for x, _ in outline) / len(outline), sum(y for _, y in outline) / len(outline))
    inner = [(middle[0] + (x - middle[0]) * 0.9, middle[1] + (y - middle[1]) * 0.9) for x, y in outline]
    return [slab(name + '_crust', outline, 0.32, 'crust', at=(0, 0, z + 0.17), bevel=0.1),
            slab(name + '_crumb', inner, 0.36, 'bread', at=(0, 0, z + 0.17), bevel=0.05)]


def sandwich(name, at, rot):
    """Half a sandwich, cut corner to corner: bread, lettuce, ham, cheese, bread."""
    cut = [(-0.95, -0.95), (1.9, -0.95), (-0.95, 1.9)]
    def grown(by):
        return [(x * by, y * by) for x, y in cut]
    pieces = bread(name + '_under', cut, 0)
    pieces.append(slab(name + '_lettuce', ruffled(grown(1.1), 9, 0.09), 0.12, 'leaf', at=(0, 0, 0.4), bevel=0))
    pieces.append(slab(name + '_ham', ruffled(grown(1.04), 6, 0.05), 0.14, 'ham', at=(0, 0, 0.52), bevel=0))
    pieces.append(slab(name + '_cheese', grown(1.06), 0.1, 'cheese', at=(0.04, 0.04, 0.64), rot=(0, 0, 7), bevel=0))
    pieces += bread(name + '_over', cut, 0.68)
    return tag(prop(name, *pieces, at=at, rot=rot), outline=0.05)


tag(prop('dinner_plate', *plate('dinner_plate', 2.9), at=(-11.7, 3.4, TABLE)), outline=0.05)
half = sandwich('sandwich_a', (-12.2, 3.9, TABLE + 0.26), (0, 0, 24))
copy(half, 'sandwich_b', at=(-10.9, 2.5, TABLE + 0.62), rot=(16, -14, 205))
# A pick through the half on top, with an olive on it.
pick = pipe('pick', [(0, 0, 0), (0, 0, 1.5)], 0.07, 'stem', sides=6)
olive = ball('olive', 0.24, 'leaf', at=(0, 0, 1.5), scale=(1, 1, 1.15))
pimento = ball('pimento', 0.11, 'apple', at=(0, 0, 1.74), detail=1)
tag(prop('pick', pick, olive, pimento, at=(-11.0, 2.7, TABLE + 1.4), rot=(10, -8, 0)), outline=0.04)


def napkin(name, at, turn):
    cloth = slab(name, rounded(3.1, 4.6, 0.25), 0.12, 'napkin', bevel=0.04)
    lines = [box('%s_line_%d' % (name, i), (3.1, 0.22, 0.13), 'enamel', at=(0, y, 0), bevel=0) for i, y in enumerate((-1.75, 1.75))]
    return tag(prop(name, cloth, *lines, at=(at[0], at[1], TABLE + 0.06), rot=(0, 0, turn)), outline=0.03, shadow=False)


def handle(name, length=2.9):
    """The fat plastic grip every piece of the set has."""
    return box(name, (0.78, length, 0.36), 'enamel', at=(0, length / 2, 0.18), bevel=0.17)


napkin('napkin_left', (-10.9, -3.3), 9)
# The fork: one flat shape, four prongs.
prongs = [(0.18, 2.7), (0.2, 3.5), (0.75, 4.1), (0.75, 6.5), (0.51, 6.5), (0.51, 4.7), (0.33, 4.7), (0.33, 6.5), (0.09, 6.5), (0.09, 4.7),
          (-0.09, 4.7), (-0.09, 6.5), (-0.33, 6.5), (-0.33, 4.7), (-0.51, 4.7), (-0.51, 6.5), (-0.75, 6.5), (-0.75, 4.1), (-0.2, 3.5), (-0.18, 2.7)]
fork = slab('fork_head', prongs, 0.18, 'silver', at=(0, 0, 0.15), bevel=0)
tag(prop('fork', fork, handle('fork_handle'), at=(-10.9, -6.5, TABLE + 0.12), rot=(0, 0, 9)), outline=0.045)


# Two cherries on one stalk, between the plate and the fork.
fruit = [ball('cherry_%d' % i, 0.42, 'apple', at=(x, 0, 0.4), scale=(1, 1, 0.92)) for i, x in enumerate((-0.45, 0.5))]
stalks = [pipe('cherry_stalk_%d' % i, [(x, 0, 0.72), (x * 0.5, 0.1, 1.3), (0.05, 0.3, 1.7)], 0.06, 'stem', sides=6) for i, x in enumerate((-0.45, 0.5))]
glints = [ball('cherry_glint_%d' % i, 0.09, 'white', at=(x - 0.14, -0.3, 0.56), detail=1) for i, x in enumerate((-0.45, 0.5))]
tag(prop('cherries', *fruit, *stalks, *glints, at=(-9.7, -0.2, TABLE), rot=(0, 0, 30)), outline=0.045)


# ── The right side: knife and spoon, a pot of jam, a jelly ───────────────────
napkin('napkin_right', (10.9, -3.4), -7)
blade = slab('knife_blade', [(-0.2, 2.7), (0.2, 2.7), (0.42, 3.1), (0.42, 5.6), (0.3, 6.2), (0.05, 6.55), (-0.2, 6.5), (-0.32, 6.0), (-0.32, 3.1)], 0.16, 'silver', at=(0, 0, 0.15), bevel=0)
tag(prop('knife', blade, handle('knife_handle'), at=(10.2, -6.6, TABLE + 0.12), rot=(0, 0, -7)), outline=0.045)
neck = slab('spoon_neck', [(-0.16, 2.7), (0.16, 2.7), (0.14, 4.6), (-0.14, 4.6)], 0.16, 'silver', at=(0, 0, 0.15), bevel=0)
bowl = ball('spoon_bowl', 1.0, 'silver', at=(0, 5.4, 0.2), scale=(0.72, 1.0, 0.26), detail=3)
hollow = ball('spoon_hollow', 1.0, 'glass', at=(0, 5.4, 0.36), scale=(0.52, 0.78, 0.12), detail=2)
tag(prop('spoon', neck, bowl, hollow, handle('spoon_handle'), at=(11.75, -6.3, TABLE + 0.12), rot=(0, 0, -7)), outline=0.045)

# A pot of jam under a cloth cap tied with string, and a heart on its label.
jar = lathe('jam_jar', [(0, 0), (1.0, 0), (1.12, 0.14), (1.12, 1.55), (0.92, 1.8), (0.92, 1.95), (0, 1.95)], 'jam', sides=20)
label = lathe('jam_label', [(1.14, 0.45), (1.15, 0.5), (1.15, 1.25), (1.14, 1.3)], 'cream', sides=20)
cap = lathe('jam_cap', [(1.02, 1.62), (1.3, 1.5), (1.34, 1.56), (1.0, 1.9), (0.98, 2.06), (0.7, 2.2), (0, 2.24)], 'cream', sides=20, smooth=60)

def frilled(x, y, z):
    """The cloth's hem stands out in ten folds below the string."""
    fold = 1 + 0.1 * math.cos(math.atan2(y, x) * 10) if z < 1.6 else 1
    return (x * fold, y * fold, z)

reshape(cap, frilled)
string = ring('jam_string', 1.01, 0.08, 'clothEdge', at=(0, 0, 1.88), sides=20, around=4)
heart = slab('jam_heart', [(0, -0.3), (0.3, 0.02), (0.3, 0.2), (0.16, 0.3), (0, 0.18), (-0.16, 0.3), (-0.3, 0.2), (-0.3, 0.02)], 0.1, 'apple', at=(0, -1.15, 0.86), rot=(90, 0, 0), bevel=0.03)
tag(prop('jam', jar, label, cap, string, heart, at=(10.5, 1.2, TABLE), rot=(0, 0, 14)), outline=0.05)

# A jelly in two layers, fluted from its mould, that never stops wobbling.
JELLY = (10.7, 4.9)
tag(prop('jelly_plate', *plate('jelly_plate', 1.6), at=(JELLY[0], JELLY[1], TABLE)), outline=0.05)

def fluted(x, y, z):
    """Eight flutes down its sides, dying out toward the top."""
    deep = 1 + 0.11 * math.cos(math.atan2(y, x) * 8) * min(1, max(0, (1.25 - z) / 0.4))
    return (x * deep, y * deep, z)

lower = reshape(lathe('jelly_lower', [(0, 0), (1.0, 0), (1.06, 0.12), (1.0, 0.45), (0.9, 0.72), (0, 0.72)], 'jelly', sides=32, smooth=75), fluted)
upper = reshape(lathe('jelly_upper', [(0, 0.72), (0.9, 0.72), (0.76, 1.0), (0.58, 1.18), (0.4, 1.24), (0, 1.25)], 'icing', sides=32, smooth=75), fluted)
cherry = ball('jelly_cherry', 0.22, 'apple', at=(0, 0, 1.4))
jelly = tag(prop('jelly', lower, upper, cherry, at=(JELLY[0], JELLY[1], TABLE + 0.24)), outline=0.05)
key(jelly, 'rotation_euler', [(0, (0, math.radians(-6), 0)), (0.3, (math.radians(4), 0, 0)), (0.6, (0, math.radians(6), 0)), (0.9, (math.radians(-4), 0, 0)), (1.2, (0, math.radians(-6), 0))])
key(jelly, 'scale', [(0, (1, 1, 1)), (0.3, (1.05, 1.05, 0.93)), (0.6, (1, 1, 1)), (0.9, (0.96, 0.96, 1.06)), (1.2, (1, 1, 1))])

# A bee going round the jam.
bee_body = ball('bee_body', 0.22, 'cheese', scale=(1.35, 1, 1))
bee_head = ball('bee_head', 0.15, 'ink', at=(0.3, 0, 0.02), detail=1)
stripes = [cylinder('bee_stripe_%d' % i, 0.22 * math.sqrt(1 - (x / 0.3) ** 2) + 0.012, 0.09, 'ink', at=(x, 0, 0), rot=(0, 90, 0), sides=10) for i, x in enumerate((-0.14, 0.05))]
bee = tag(prop('bee_body', bee_body, bee_head, *stripes), outline=0.03)
wings = []
for index, side in enumerate((-1, 1)):
    # Each wing is hinged where it meets the back, so it beats instead of spinning on the spot.
    wing = reshape(ball('bee_wing_%d' % index, 0.2, 'white', at=(-0.02, side * 0.06, 0.17), scale=(0.7, 1.2, 0.18), rot=(side * 20, 0, 0), detail=1), lambda x, y, z: (x, y + side * 0.22, z))
    wings.append(sway(tag(wing, outline=0.02, shadow=False), degrees=26 * side, seconds=0.4, axis=0))
flier = bob(place(group('bee', bee, *wings, at=(1.6, 0, 0), rot=(0, 0, 90)), scale=1.25), height=0.35, seconds=0.9)
spin(group('bee_round', flier, at=(10.5, 1.2, TABLE + 2.5)), seconds=4.2)


# ── The back: the basket, a watermelon, a cake, the juice, the teapot ────────
# The basket, with one flap open, a loaf and a bottle sticking out and a checked cloth hanging over its front.
BASKET = (-10.6, 9.9)
weave = [box('weave_%d' % i, (5.0 + (0.14 if i % 2 else 0), 3.2 + (0.14 if i % 2 else 0), 0.52), 'wicker' if i % 2 else 'wickerDark', at=(0, 0, 0.26 + i * 0.44), bevel=0.15) for i in range(5)]
brim = box('basket_brim', (5.3, 3.5, 0.28), 'wickerDark', at=(0, 0, 2.3), bevel=0.12)
shut = box('basket_flap_shut', (2.5, 3.3, 0.22), 'wicker', at=(-1.3, 0, 2.5), bevel=0.08)
open_flap = box('basket_flap_open', (2.5, 3.3, 0.22), 'wicker', at=(0.7, 0, 3.55), rot=(0, -62, 0), bevel=0.08)
inside = box('basket_inside', (2.3, 3.0, 0.1), 'wickerDark', at=(1.35, 0, 2.42), bevel=0)
grip = pipe('basket_grip', arc((-2.55, 0, 2.3), (2.55, 0, 2.3), 2.7, steps=12), 0.2, 'wickerDark', sides=8)
# The stakes the cane is woven round, on the faces the camera sees.
stakes = [box('stake_front_%d' % i, (0.24, 0.2, 2.2), 'wicker', at=(x, -1.66, 1.1), bevel=0) for i, x in enumerate((-2.15, -1.4, -0.65))]
stakes += [box('stake_side_%d_%d' % (i, j), (0.2, 0.24, 2.2), 'wicker', at=(side * 2.56, y, 1.1), bevel=0) for i, side in enumerate((-1, 1)) for j, y in enumerate((-0.95, 0, 0.95))]
tag(prop('basket', *weave, *stakes, brim, shut, open_flap, inside, grip, at=(BASKET[0], BASKET[1], TABLE)), outline=0.06)

loaf = lathe('loaf', [(0, 0), (0.3, 0.14), (0.38, 0.6), (0.38, 2.7), (0.3, 3.1), (0, 3.25)], 'crust', sides=10, smooth=60)
cuts = [box('loaf_cut_%d' % i, (0.5, 0.12, 0.2), 'bread', at=(0, -0.34, 1.6 + i * 0.6), rot=(0, 35, 0), bevel=0.04) for i in range(3)]
tag(prop('loaf', loaf, *cuts, at=(BASKET[0] + 1.25, BASKET[1] + 0.5, TABLE + 1.3), rot=(-12, 22, 0)), outline=0.05)
bottle = lathe('bottle', [(0, 0), (0.42, 0), (0.44, 1.5), (0.2, 2.1), (0.2, 2.8), (0.27, 2.85), (0.27, 3.0), (0, 3.0)], 'rind', sides=12)
cork = cylinder('cork', 0.17, 0.3, 'cookie', at=(0, 0, 3.1), sides=8)
tag(prop('bottle', bottle, cork, at=(BASKET[0] + 2.0, BASKET[1] - 0.7, TABLE + 1.1), rot=(8, 10, 0)), outline=0.05)


def checks(name, columns, rows, cell, flat):
    """A checked cloth, `flat` on the table or hanging: white, with every other square red."""
    width, length = columns * cell, rows * cell
    size = (width + 0.16, length + 0.16, 0.26) if flat else (width + 0.16, 0.16, length + 0.16)
    pieces = [box(name, size, 'cloth', bevel=0.05)]
    for column in range(columns):
        for row in range(rows):
            if (column + row) % 2:
                continue
            x, v = (column + 0.5) * cell - width / 2, (row + 0.5) * cell - length / 2
            pieces.append(box('%s_%d_%d' % (name, column, row), (cell, cell, 0.28) if flat else (cell, 0.18, cell), 'clothEdge', at=(x, v, 0) if flat else (x, 0, v), bevel=0))
    return pieces

hanging = prop('cloth_hanging', *checks('cloth_hanging', 4, 4, 0.55, False), at=(1.2, -1.72, 1.3))
lying = prop('cloth_lying', *checks('cloth_lying', 4, 3, 0.55, True), at=(1.2, -2.5, 0.17))
over = box('cloth_over', (2.36, 1.0, 0.16), 'cloth', at=(1.2, -1.3, 2.5), bevel=0.05)
tag(prop('basket_cloth', hanging, lying, over, at=(BASKET[0], BASKET[1], TABLE)), outline=0.05)

# Half a watermelon, its cut face turned to the camera.
R = 1.9
shell = lathe('melon_shell', [(0, 0)] + [(math.sin(math.radians(a)) * R, R - math.cos(math.radians(a)) * R) for a in (15, 30, 45, 60, 75, 90)] + [(0, R)], 'rind', sides=24, smooth=60)
pith = cylinder('melon_pith', R * 0.97, 0.1, 'pith', at=(0, 0, R), sides=24)
flesh = cylinder('melon_flesh', R * 0.86, 0.16, 'flesh', at=(0, 0, R + 0.03), sides=24, bevel=0.04)
seeds = [ball('melon_seed_%d' % i, 0.1, 'ink', at=(math.cos(i * 0.9 + 0.3) * R * (0.5 if i % 2 else 0.3), math.sin(i * 0.9 + 0.3) * R * (0.5 if i % 2 else 0.3), R + 0.11), scale=(1, 1.5, 0.5), rot=(0, 0, math.degrees(i * 0.9 + 0.3) - 90), detail=1) for i in range(7)]
tilt = Euler((math.radians(52), 0, math.radians(-14)))
centre = Vector((-4.9, 10.2, TABLE + R))
foot = centre - tilt.to_matrix() @ Vector((0, 0, R))
tag(prop('melon_half', shell, pith, flesh, *seeds, at=tuple(foot), rot=(52, 0, -14)), outline=0.06)

# A layer cake on a stand, with one slice gone to a plate of its own.
LAYERS = (('sponge', 0.5, 1.0), ('icing', 0.18, 1.03), ('sponge', 0.5, 1.0), ('cream', 0.26, 1.05))

def cake(name, start, end, radius=1.7):
    """Sponge, pink filling, sponge and icing, from `start` to `end` degrees round: a cake with a slice gone, or the slice."""
    layers = []
    z = 0
    for index, (color, height, reach) in enumerate(LAYERS):
        layers.append(slab('%s_%d' % (name, index), wedge(radius * reach, start, end, max(3, int((end - start) / 20))), height, color, at=(0, 0, z + height / 2), bevel=0.06 if color != 'icing' else 0))
        z += height
    return layers

stand = lathe('cake_stand', [(0, 0), (1.15, 0), (1.2, 0.12), (0.34, 0.32), (0.24, 0.9), (1.95, 1.06), (2.05, 1.14), (2.05, 1.24), (0, 1.24)], 'plate', sides=28)
line = lathe('cake_stand_line', [(1.98, 1.1), (2.07, 1.13), (2.07, 1.25), (1.98, 1.25), (1.98, 1.1)], 'enamel', sides=28)
tag(prop('cake_stand', stand, line, at=(0.7, 10.3, TABLE)), outline=0.05)
toppings = []
for index in range(6):
    angle = math.radians(-20 + index * 55)
    toppings.append(ball('cake_cream_%d' % index, 0.26, 'white', at=(math.cos(angle) * 1.25, math.sin(angle) * 1.25, 1.52), scale=(1, 1, 0.8)))
    toppings.append(ball('cake_cherry_%d' % index, 0.19, 'apple', at=(math.cos(angle) * 1.25, math.sin(angle) * 1.25, 1.78), detail=2))
tag(prop('cake', *cake('cake', -40, 265), *toppings, at=(0.7, 10.3, TABLE + 1.24)), outline=0.05)
tag(prop('slice_plate', *plate('slice_plate', 1.35), at=(3.0, 7.9, TABLE)), outline=0.045)
tag(prop('cake_slice', *cake('cake_slice', -27, 27), ball('slice_cream', 0.26, 'white', at=(1.2, 0, 1.52), scale=(1, 1, 0.8)), ball('slice_cherry', 0.19, 'apple', at=(1.2, 0, 1.78)),
         at=(3.75, 7.75, TABLE + 0.26), rot=(0, 0, 168)), outline=0.05)

# A jug of orange juice with ice in it, and two cups with straws.
def glassful(name, profile, level, sides=18):
    """Something of glass with juice in it: glass at the foot and the lip, the drink's colour in between and on top."""
    foot = [point for point in profile if point[1] <= 0.16]
    drink = [point for point in profile if 0.16 <= point[1] <= level]
    lip = [point for point in profile if point[1] >= level]
    inner = min(radius for radius, _ in lip) - 0.1
    return [lathe(name + '_foot', foot + [(0, 0.16)], 'glass', sides=sides),
            lathe(name + '_drink', [(0, 0.16)] + drink + [(0, level)], 'juice', sides=sides),
            lathe(name + '_lip', [(0, level)] + lip + [(inner, lip[-1][1]), (inner, level + 0.02), (0, level + 0.02)], 'glass', sides=sides),
            lathe(name + '_top', [(0, level + 0.03), (inner - 0.01, level + 0.03), (inner - 0.01, level + 0.07), (0, level + 0.07)], 'juice', sides=sides)]

jug = glassful('jug', [(0, 0), (1.05, 0), (1.18, 0.16), (1.3, 1.0), (1.22, 2.0), (1.02, 2.7), (0.98, 3.0), (1.08, 3.3), (1.12, 3.4)], 2.7, sides=20)
jug_grip = pipe('jug_grip', [(1.1, 0, 2.9), (1.8, 0, 2.8), (2.05, 0, 2.0), (1.8, 0, 1.2), (1.25, 0, 0.9)], 0.16, 'glass', sides=8)
spout = cone('jug_spout', 0.4, 0.7, 'glass', at=(-1.2, 0, 3.22), rot=(0, 120, 0), sides=8)
ice = [box('ice_%d' % i, (0.5, 0.5, 0.5), 'white', at=(x, y, 2.8), rot=(20 * i, 30, 15 * i), bevel=0.08) for i, (x, y) in enumerate(((0.3, -0.3), (-0.35, 0.2), (0.25, 0.45)))]
tag(prop('jug', *jug, jug_grip, spout, *ice, at=(5.9, 10.2, TABLE), rot=(0, 0, -25)), outline=0.05)


def cup(name, at, turn):
    drink = glassful(name, [(0, 0), (0.46, 0), (0.5, 0.16), (0.62, 1.15), (0.66, 1.45), (0.68, 1.5)], 1.15, sides=14)
    straw = pipe(name + '_straw', [(0.1, 0, 0.3), (-0.3, 0, 1.9), (-0.38, 0, 2.1), (-0.8, 0, 2.3)], 0.08, 'white', sides=6)
    bands = [cylinder('%s_band_%d' % (name, i), 0.095, 0.16, 'clothEdge', at=(0.1 - 0.4 * share, 0, 0.3 + 1.6 * share), rot=(0, -14, 0), sides=6) for i, share in enumerate((0.62, 0.8, 0.98))]
    return tag(prop(name, *drink, straw, *bands, at=(at[0], at[1], TABLE), rot=(0, 0, turn)), outline=0.045)

cup('cup_a', (4.4, 8.2), 30)
cup('cup_b', (7.9, 8.4), 150)

# The teapot, steaming.
TEAPOT = (11.4, 8.9)
pot = lathe('teapot_body', [(0, 0), (0.85, 0), (0.95, 0.1), (1.4, 0.6), (1.5, 1.1), (1.3, 1.7), (0.85, 2.0), (0, 2.0)], 'enamel', sides=24, smooth=60)
belt = lathe('teapot_belt', [(1.46, 0.85), (1.53, 1.0), (1.53, 1.2), (1.46, 1.35)], 'cream', sides=24)
lid = lathe('teapot_lid', [(0.9, 1.98), (0.88, 2.1), (0.45, 2.26), (0, 2.28)], 'cream', sides=24)
knob = ball('teapot_knob', 0.22, 'enamel', at=(0, 0, 2.42))
nose = pipe('teapot_nose', [(1.15, 0, 0.75), (1.85, 0, 1.0), (2.2, 0, 1.6), (2.5, 0, 2.05)], 0.25, 'enamel', sides=8)
ear = pipe('teapot_ear', [(-1.3, 0, 1.6), (-1.95, 0, 1.75), (-2.3, 0, 1.2), (-2.0, 0, 0.6), (-1.3, 0, 0.55)], 0.17, 'enamel', sides=8)
tag(prop('teapot', pot, belt, lid, knob, nose, ear, at=(TEAPOT[0], TEAPOT[1], TABLE), rot=(0, 0, 205)), outline=0.055)
# Steam: three puffs that leave the spout, swell, rise and shrink away, each at its own pace.
turn = math.radians(205)
tip = Vector((TEAPOT[0] + math.cos(turn) * 2.55, TEAPOT[1] + math.sin(turn) * 2.55, TABLE + 2.3))
for index, (seconds, drift) in enumerate(((2.6, -0.5), (3.4, 0.3), (3.0, -0.1))):
    puff = tag(rock('steam_%d' % index, 0.34, 'white', seed=index + 3, rough=0.12, detail=2, smooth=80), outline=0.03, shadow=False)
    key(puff, 'location', [(0, tuple(tip)), (seconds, (tip.x + drift, tip.y + 0.3, tip.z + 2.2))], linear=True)
    key(puff, 'scale', [(share * seconds, (size, size, size)) for share, size in ((0, 0.001), (0.25, 1.0), (0.6, 0.85), (1.0, 0.001))])


# ── The front: only what lies low ────────────────────────────────────────────
# Strawberries on their sides, and two lumps of sugar.
berry = lathe('strawberry', [(0, 0), (0.18, 0.06), (0.4, 0.42), (0.44, 0.66), (0.32, 0.86), (0, 0.9)], 'apple', sides=10, smooth=70)
calyx = slab('strawberry_calyx', [(math.cos(math.radians(a)) * (0.42 if a % 72 == 0 else 0.16), math.sin(math.radians(a)) * (0.42 if a % 72 == 0 else 0.16)) for a in range(0, 360, 36)], 0.08, 'leaf', at=(0, 0, 0.9), bevel=0)
stub = cylinder('strawberry_stub', 0.06, 0.2, 'leaf', at=(0, 0, 1.02), sides=6)
berry = tag(prop('strawberry_a', berry, calyx, stub, at=(-5.3, -7.7, TABLE + 0.4), rot=(96, 0, 60)), outline=0.045)
copy(berry, 'strawberry_b', at=(-4.1, -8.3, TABLE + 0.4), rot=(100, 0, 200))
copy(berry, 'strawberry_c', at=(6.9, -7.6, TABLE + 0.4), rot=(94, 0, 130))
lumps = [box('sugar_%d' % i, (0.5, 0.5, 0.5), 'white', at=(x, y, 0.25), rot=(0, 0, turn), bevel=0.06, segments=1) for i, (x, y, turn) in enumerate(((0, 0, 15), (0.75, 0.35, 50)))]
tag(prop('sugar', *lumps, at=(4.6, -8.0, TABLE)), outline=0.04)


# ── A cookie the ants are carrying off ───────────────────────────────────────
COOKIE = (-1.0, 7.4)
biscuit = lathe('cookie', [(0, 0), (0.92, 0), (1.0, 0.14), (0.92, 0.36), (0.5, 0.45), (0, 0.46)], 'cookie', sides=16, smooth=60)
chips = [ball('chip_%d' % i, 0.14, 'stem', at=(math.cos(i * 1.3) * (0.3 + 0.12 * (i % 3)), math.sin(i * 1.3) * (0.3 + 0.12 * (i % 3)), 0.42), scale=(1, 1, 0.6), detail=1) for i in range(6)]
tag(prop('cookie', biscuit, *chips, at=(COOKIE[0], COOKIE[1], TABLE)), outline=0.045)
crumbs = [rock('crumb_%d' % i, 0.12, 'cookie', at=(x, y, 0.07), seed=i, detail=1) for i, (x, y) in enumerate(((1.4, 0.3), (1.7, -0.3), (1.25, -0.5), (-0.3, 1.3), (0.5, 1.25)))]
tag(prop('crumbs', *crumbs, at=(COOKIE[0], COOKIE[1], TABLE)), outline=0.025)


def ant(name, x, y, facing, carrying):
    """An ant walking along X. One going home has a crumb in its jaws."""
    pieces = [ball(name + '_tail', 0.14, 'ink', at=(-0.2 * facing, 0, 0.16), scale=(1.3, 1, 0.9), detail=1),
              ball(name + '_chest', 0.09, 'ink', at=(0, 0, 0.14), detail=1),
              ball(name + '_head', 0.11, 'ink', at=(0.17 * facing, 0, 0.16), detail=1)]
    pieces += [box('%s_leg_%d' % (name, i), (0.05, 0.44, 0.05), 'ink', at=(offset, 0, 0.06), rot=(0, 0, (i - 1) * 16), bevel=0) for i, offset in enumerate((-0.08, 0.01, 0.1))]
    if carrying:
        pieces.append(box(name + '_crumb', (0.17, 0.17, 0.17), 'cream', at=(0.34 * facing, 0, 0.14), rot=(0, 0, 20), bevel=0))
    for piece in pieces:
        piece.location.x += x
        piece.location.y += y
    return pieces

# Two files of ants between the cookie and the basket's cloth, one going and one coming back loaded. Each file
# is one object that walks one ant's gap and starts again; both its ends are out of sight, inside the cloth
# and inside the cookie, so the march never seems to jump.
GAP, ANTS, PACE = 1.2, 7, 1.5
cloth_edge = BASKET[0] + 2.4
going = [piece for index in range(ANTS) for piece in ant('ant_out_%d' % index, cloth_edge - 0.75 + index * GAP, COOKIE[1] + 0.42, 1, False)]
key(tag(prop('ants_out', *going, at=(0, 0, TABLE)), outline=0, shadow=False), 'location', [(0, (0, 0, TABLE)), (PACE, (GAP, 0, TABLE))], linear=True)
coming = [piece for index in range(ANTS) for piece in ant('ant_home_%d' % index, COOKIE[0] - 0.4 - index * GAP, COOKIE[1] - 0.42, -1, True)]
key(tag(prop('ants_home', *coming, at=(0, 0, TABLE)), outline=0, shadow=False), 'location', [(0, (0, 0, TABLE)), (PACE, (-GAP, 0, TABLE))], linear=True)


# ── A butterfly over the basket ──────────────────────────────────────────────
body = tag(lathe('butterfly_body', [(0, -0.3), (0.07, -0.2), (0.08, 0.2), (0, 0.32)], 'ink', rot=(90, 0, 0), sides=6), outline=0, shadow=False)
flaps = []
for index, side in enumerate((-1, 1)):
    shape = [(0, -0.3), (0.5, -0.42), (0.62, -0.1), (0.4, 0.04), (0.74, 0.2), (0.7, 0.55), (0.3, 0.5), (0, 0.22)]
    flap = slab('butterfly_wing_%d' % index, shape if side > 0 else [(-x, y) for x, y in reversed(shape)], 0.08, 'juice', bevel=0)
    flaps.append(sway(tag(flap, outline=0.03, shadow=False), degrees=38 * side, seconds=0.5, axis=1))
flutter = bob(group('butterfly', body, *flaps, at=(2.6, 0, 0)), height=0.5, seconds=1.3)
spin(group('butterfly_round', flutter, at=(BASKET[0] - 0.2, BASKET[1] - 1.6, TABLE + 2.6)), seconds=7.5)


# ── The food the game drops ──────────────────────────────────────────────────
# Each kind has a shape of its own. They stand on Z = 0 and are about the sizes the rules reach for.
apple = lathe('apple', [(0, 0.08), (0.12, 0.02), (0.24, 0.05), (0.33, 0.2), (0.37, 0.38), (0.33, 0.54), (0.22, 0.63), (0.1, 0.64), (0, 0.56)], 'apple', sides=12, smooth=75)
stalk = pipe('apple_stalk', [(0, 0, 0.52), (0.02, 0, 0.72), (0.09, 0, 0.88)], 0.05, 'stem', sides=6)
leaf = slab('apple_leaf', [(0, 0), (0.12, -0.1), (0.3, -0.06), (0.4, 0.04), (0.28, 0.12), (0.1, 0.1)], 0.07, 'leaf', at=(0.04, 0, 0.72), rot=(20, -28, 0), bevel=0)
shine = ball('apple_shine', 0.07, 'white', at=(-0.16, -0.25, 0.44), scale=(1, 0.6, 1.3), detail=1)
part(tag(prop('apple', apple, stalk, leaf, shine), outline=0.045))

dough = ring('donut', 0.28, 0.145, 'dough', at=(0, 0, 0.145), sides=20, around=8)
round_tube = lambda reach, angles: [(0.28 + math.cos(math.radians(a)) * reach, 0.15 + math.sin(math.radians(a)) * reach) for a in angles]
icing = lathe('donut_icing', round_tube(0.168, (205, 160, 125, 90, 55, 20, -25)) + round_tube(0.09, (-25, 90, 205)) + round_tube(0.168, (205,)), 'icing', sides=20, smooth=70)
# The icing runs down in drips: its outer edge dips lower every so often.
reshape(icing, lambda x, y, z: (x, y, z - 0.07 * max(0, math.cos(math.atan2(y, x) * 5))) if math.hypot(x, y) > 0.42 and z < 0.2 else (x, y, z))
ring_part = tag(prop('donut_ring', dough, icing), outline=0.045)
sprinkles = [box('sprinkle_%d' % i, (0.11, 0.045, 0.04), ('white', 'cheese', 'enamel')[i % 3], at=(math.cos(i * 0.9) * 0.28, math.sin(i * 0.9) * 0.28, 0.325), rot=(0, 0, i * 67), bevel=0) for i in range(7)]
part(group('donut', ring_part, tag(prop('donut_sprinkles', *sprinkles), outline=0, shadow=False)))

# A slice of watermelon standing on its rind: red, a line of white, green, and a few pips.
def slice_of_melon(name):
    pieces = [slab(name + '_flesh', wedge(0.52, -140, -40), 0.3, 'flesh', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0.04),
              slab(name + '_pith', wedge(0.59, -139, -41), 0.27, 'pith', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0),
              slab(name + '_rind', wedge(0.66, -138, -42), 0.24, 'rind', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0)]
    for side in (-1, 1):
        for x, z in ((0, 0.42), (-0.15, 0.3), (0.15, 0.3)):
            pieces.append(ball('%s_pip' % name, 0.045, 'ink', at=(x, side * 0.15, z), scale=(1, 0.5, 1.5), detail=1))
    return pieces

part(tag(prop('melon', *slice_of_melon('melon')), outline=0.045))

# The pepper wears the colours of a curse and is bent like a horn: the one thing here not to eat.
flesh = lathe('pepper', [(0, 0), (0.06, 0.04), (0.14, 0.2), (0.22, 0.42), (0.26, 0.62), (0.22, 0.76), (0.1, 0.82), (0, 0.82)], 'tierCursed', sides=10, smooth=75)
reshape(flesh, lambda x, y, z: (x + 0.75 * (0.82 - z) ** 2, y, z))
cap = lathe('pepper_cap', [(0.21, 0.72), (0.25, 0.78), (0.14, 0.87), (0, 0.9)], 'tierCursedAccent', sides=10)
stalk = pipe('pepper_stalk', [(0, 0, 0.86), (-0.03, 0, 1.0), (-0.12, 0, 1.1)], 0.055, 'tierCursedAccent', sides=6)
shine = ball('pepper_shine', 0.055, 'white', at=(0.0, -0.23, 0.56), scale=(1, 0.6, 1.5), detail=1)
part(tag(prop('pepper', flesh, cap, stalk, shine, at=(-0.16, 0, 0.04), rot=(0, -22, 0)), outline=0.045))
