# Come e Cresce: a picnic laid on a wooden table. The gingham blanket is the floor (the game draws its
# squares; their top is Z = 0), and everything round it is giant: the pets are the size of crumbs.
#
# It is looked at three ways, and laid out for all three:
#   - a round is played from high in front (52 degrees down). That picture ends about five metres behind
#     the blanket and four to each side of it, and height pushes a thing toward its edges, so the pieces
#     worth seeing stand close in, at the two sides and the back corners, and none is over about 3.3 m;
#   - a new world's card and a round's winner are shown from low in front, swinging to either side. Each
#     side therefore steps up from front to back (cutlery, something low, something taller, the tallest
#     at the corner), so nothing hides its neighbour or comes between the camera and a winner at the edge;
#   - from low, what is behind the blanket is the backdrop. The strip just behind it holds only what is
#     low, and a far row of tall things stands on the horizon, too far back to be in a round's picture;
#   - from low, whatever is in front of the blanket is nearest the camera: that strip stays flat.
#
# What the round moves is left as pieces of its own for the map's code (GrowMap.ts) to find by name: the
# jelly, the teapot's lid, the basket's flap, the cookie. Empties named `stand_N` are where spectators
# stand, and `mark_*` are places the code needs (the spout the steam leaves by, where the ants walk).
import math

from kit import *

W, D = 16.0, 12.0
# The table's top. The blanket lies on it, this thick.
TABLE = -0.16
# The outline every prop wears, and the one for small or flat things. Few thicknesses, so props can be drawn together.
LINE, THIN = 0.05, 0.03


def upright(obj):
    """
    For what stands up smooth and round (a jar, a jug, a cake): its own shadow, falling on its own side,
    shows there as stripes. It still casts one; none falls on it.
    """
    return tag(obj, outline=LINE, receive=False)
# What stands farther back than this is the far row.
FAR = 13.0

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
for index, (x, y) in enumerate(((-15.6, -1.2), (15.2, 9.6), (6.5, 11.3), (-3, -9.6))):
    grain.append(place(cylinder('knot_%d' % index, 0.24, 0.03, 'tableDark', at=(x, y, TABLE + 0.001), sides=10), scale=(1.8, 1, 1)))


# What a picnic leaves on a table: rings where cups stood, crumbs, a few grains of sugar, a drop of jam.
for index, (x, y, radius) in enumerate(((-13.6, -4.4, 0.72), (13.4, -2.6, 0.72), (12.9, -1.5, 0.72), (-2.2, -10.6, 0.9), (0.9, 9.9, 0.72))):
    grain.append(lathe('cup_ring_%d' % index, [(radius - 0.09, 0), (radius, 0), (radius, 0.03), (radius - 0.09, 0.03), (radius - 0.09, 0)], 'tableDark', at=(x, y, TABLE + 0.001), sides=14))
for index in range(46):
    x, y = rng.uniform(-14, 14), rng.uniform(-10.5, 10.5)
    if abs(x) < W / 2 + 0.6 and abs(y) < D / 2 + 0.6:
        continue
    grain.append(box('crumb_%d' % index, (0.14, 0.14, 0.1), ('cookie', 'bread', 'white')[index % 3], at=(x, y, TABLE + 0.05), rot=(0, 0, index * 37), bevel=0))
grain.append(slab('jam_spill', ruffled([(-0.5, -0.3), (0.5, -0.35), (0.6, 0.3), (-0.4, 0.4)], 4, 0.07), 0.03, 'jam', at=(6.2, 6.75, TABLE + 0.002), bevel=0))
grain += [cylinder('jam_drop_%d' % i, 0.1 - i * 0.02, 0.03, 'jam', at=(6.9 + i * 0.3, 6.6, TABLE + 0.002), sides=8) for i in range(3)]


def shade(x, y, radius):
    """The far row stands beyond the reach of the game's shadows: each piece of it gets a dark patch under it instead."""
    grain.append(place(cylinder('shade_%d' % len(grain), radius, 0.03, 'tableDark', at=(x + radius * 0.12, y - radius * 0.2, TABLE + 0.002), sides=14), scale=(1.15, 0.8, 1)))


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

tag(slab('hem', scalloped(W, D), 0.13, 'clothEdge', at=(0, 0, TABLE + 0.065), bevel=0), outline=THIN, shadow=False)


# ── The cutlery, either side of the blanket's front half ─────────────────────
def napkin(name, at, turn):
    cloth = slab(name, rounded(2.3, 4.2, 0.25), 0.12, 'napkin', bevel=0.04)
    lines = [box('%s_line_%d' % (name, i), (2.3, 0.22, 0.13), 'enamel', at=(0, y, 0), bevel=0) for i, y in enumerate((-1.55, 1.55))]
    return tag(prop(name, cloth, *lines, at=(at[0], at[1], TABLE + 0.06), rot=(0, 0, turn)), outline=THIN, shadow=False)


def handle(name, length=2.9):
    """The fat plastic grip every piece of the set has."""
    return box(name, (0.78, length, 0.36), 'enamel', at=(0, length / 2, 0.18), bevel=0.17)


napkin('napkin_left', (-9.9, -6.9), 4)
# The fork: one flat shape, four prongs.
prongs = [(0.18, 2.7), (0.2, 3.5), (0.75, 4.1), (0.75, 6.5), (0.51, 6.5), (0.51, 4.7), (0.33, 4.7), (0.33, 6.5), (0.09, 6.5), (0.09, 4.7),
          (-0.09, 4.7), (-0.09, 6.5), (-0.33, 6.5), (-0.33, 4.7), (-0.51, 4.7), (-0.51, 6.5), (-0.75, 6.5), (-0.75, 4.1), (-0.2, 3.5), (-0.18, 2.7)]
fork = slab('fork_head', prongs, 0.18, 'silver', at=(0, 0, 0.15), bevel=0)
tag(prop('fork', fork, handle('fork_handle'), at=(-9.7, -9.6, TABLE + 0.12), rot=(0, 0, 4), scale=0.9), outline=LINE)

napkin('napkin_right', (9.95, -6.9), -4)
blade = slab('knife_blade', [(-0.2, 2.7), (0.2, 2.7), (0.42, 3.1), (0.42, 5.6), (0.3, 6.2), (0.05, 6.55), (-0.2, 6.5), (-0.32, 6.0), (-0.32, 3.1)], 0.16, 'silver', at=(0, 0, 0.15), bevel=0)
tag(prop('knife', blade, handle('knife_handle'), at=(9.3, -9.6, TABLE + 0.12), rot=(0, 0, -4), scale=0.9), outline=LINE)
neck = slab('spoon_neck', [(-0.16, 2.7), (0.16, 2.7), (0.14, 4.6), (-0.14, 4.6)], 0.16, 'silver', at=(0, 0, 0.15), bevel=0)
bowl = ball('spoon_bowl', 1.0, 'silver', at=(0, 5.4, 0.2), scale=(0.72, 1.0, 0.26), detail=3)
hollow = ball('spoon_hollow', 1.0, 'glass', at=(0, 5.4, 0.36), scale=(0.52, 0.78, 0.12), detail=2)
tag(prop('spoon', neck, bowl, hollow, handle('spoon_handle'), at=(10.4, -9.4, TABLE + 0.12), rot=(0, 0, -4), scale=0.9), outline=LINE)


# ── The left side: a sandwich, half a watermelon, and the basket at the back corner ─
def bread(name, outline, z):
    """A slice: crust round the edge, crumb on the faces."""
    middle = (sum(x for x, _ in outline) / len(outline), sum(y for _, y in outline) / len(outline))
    inner = [(middle[0] + (x - middle[0]) * 0.9, middle[1] + (y - middle[1]) * 0.9) for x, y in outline]
    return [slab(name + '_crust', outline, 0.32, 'crust', at=(0, 0, z + 0.17), bevel=0.1),
            slab(name + '_crumb', inner, 0.36, 'bread', at=(0, 0, z + 0.17), bevel=0)]


def sandwich(name, at, rot):
    """Half a sandwich, cut corner to corner: bread, lettuce, ham, cheese, bread."""
    cut = [(-0.8, -0.8), (1.6, -0.8), (-0.8, 1.6)]
    def grown(by):
        return [(x * by, y * by) for x, y in cut]
    pieces = bread(name + '_under', cut, 0)
    pieces.append(slab(name + '_lettuce', ruffled(grown(1.1), 6, 0.09), 0.12, 'leaf', at=(0, 0, 0.4), bevel=0))
    pieces.append(slab(name + '_ham', ruffled(grown(1.04), 6, 0.05), 0.14, 'ham', at=(0, 0, 0.52), bevel=0))
    pieces.append(slab(name + '_cheese', grown(1.06), 0.1, 'cheese', at=(0.04, 0.04, 0.64), rot=(0, 0, 7), bevel=0))
    pieces += bread(name + '_over', cut, 0.68)
    return tag(prop(name, *pieces, at=at, rot=rot), outline=LINE)


SANDWICH = (-10.65, -1.5)
tag(prop('dinner_plate', *plate('dinner_plate', 1.85), at=(SANDWICH[0], SANDWICH[1], TABLE)), outline=LINE)
half = sandwich('sandwich_a', (SANDWICH[0] - 0.3, SANDWICH[1] + 0.35, TABLE + 0.26), (0, 0, 24))
copy(half, 'sandwich_b', at=(SANDWICH[0] + 0.55, SANDWICH[1] - 0.6, TABLE + 0.6), rot=(16, -14, 205))
# A pick through the half on top, with an olive on it.
pick = pipe('pick', [(0, 0, 0), (0, 0, 1.0)], 0.07, 'stem', sides=6)
olive = ball('olive', 0.24, 'leaf', at=(0, 0, 1.0), scale=(1, 1, 1.15), detail=1)
tag(prop('pick', pick, olive, at=(SANDWICH[0] + 0.45, SANDWICH[1] - 0.4, TABLE + 1.3), rot=(10, -8, 0)), outline=LINE)

# Two cherries on one stalk, beside the plate.
fruit = [ball('cherry_%d' % i, 0.42, 'apple', at=(x, 0, 0.4), scale=(1, 1, 0.92)) for i, x in enumerate((-0.45, 0.5))]
stalks = [pipe('cherry_stalk_%d' % i, [(x, 0, 0.72), (x * 0.5, 0.1, 1.3), (0.05, 0.3, 1.7)], 0.06, 'stem', sides=6) for i, x in enumerate((-0.45, 0.5))]
tag(prop('cherries', *fruit, *stalks, at=(-9.35, 0.5, TABLE), rot=(0, 0, 30)), outline=LINE)

# Half a watermelon, its cut face turned to the camera and a little to the blanket.
MELON = (-10.55, 2.5)
R = 1.6
shell = lathe('melon_shell', [(0, 0)] + [(math.sin(math.radians(a)) * R, R - math.cos(math.radians(a)) * R) for a in (15, 30, 45, 60, 75, 90)] + [(0, R)], 'rind', sides=24, smooth=60)
pith = cylinder('melon_pith', R * 0.97, 0.1, 'pith', at=(0, 0, R), sides=24)
flesh = cylinder('melon_flesh', R * 0.86, 0.16, 'flesh', at=(0, 0, R + 0.03), sides=24, bevel=0.04)
seeds = [ball('melon_seed_%d' % i, 0.1, 'ink', at=(math.cos(i * 0.9 + 0.3) * R * (0.5 if i % 2 else 0.3), math.sin(i * 0.9 + 0.3) * R * (0.5 if i % 2 else 0.3), R + 0.11), scale=(1, 1.5, 0.5), rot=(0, 0, math.degrees(i * 0.9 + 0.3) - 90), detail=1) for i in range(7)]
tilt = Euler((math.radians(36), 0, math.radians(20)))
foot = Vector((MELON[0], MELON[1], TABLE + R)) - tilt.to_matrix() @ Vector((0, 0, R))
tag(prop('melon_half', shell, pith, flesh, *seeds, at=tuple(foot), rot=(36, 0, 20)), outline=LINE)

# The basket, with one flap ajar, a loaf and a bottle sticking out and a checked cloth hanging over its front.
# Its handle is a low arch: anything taller, this far back, leaves the top of a round's picture.
BASKET = (-10.65, 6.45)
WALL = 1.9
weave = [box('weave_%d' % i, (WALL * 2 + (0.14 if i % 2 else 0), 3.0 + (0.14 if i % 2 else 0), 0.5), 'wicker' if i % 2 else 'wickerDark', at=(0, 0, 0.25 + i * 0.42), bevel=0.15) for i in range(5)]
brim = box('basket_brim', (4.1, 3.3, 0.28), 'wickerDark', at=(0, 0, 2.2), bevel=0.12)
shut = box('basket_flap_shut', (1.9, 3.1, 0.22), 'wicker', at=(-0.98, 0, 2.4), bevel=0.08)
inside = box('basket_inside', (1.75, 2.8, 0.1), 'wickerDark', at=(1.0, 0, 2.32), bevel=0)
grip = pipe('basket_grip', arc((-WALL, 0, 2.2), (WALL, 0, 2.2), 1.15, steps=12), 0.18, 'wickerDark', sides=8)
# The stakes the cane is woven round, on the faces the camera sees.
stakes = [box('stake_front_%d' % i, (0.24, 0.2, 2.1), 'wicker', at=(x, -1.56, 1.05), bevel=0) for i, x in enumerate((0.7, 1.2, 1.7))]
stakes += [box('stake_side_%d_%d' % (i, j), (0.2, 0.24, 2.1), 'wicker', at=(side * (WALL + 0.06), y, 1.05), bevel=0) for i, side in enumerate((-1, 1)) for j, y in enumerate((-0.8, 0, 0.8))]
upright(prop('basket', *weave, *stakes, brim, shut, inside, grip, at=(BASKET[0], BASKET[1], TABLE)))
# The other flap is the map's to move: it lies shut here, hinged along the middle of the basket's top, and the code props it open.
HINGE = (BASKET[0] + 0.02, BASKET[1], TABLE + 2.4)
live(tag(box('basket_flap', (1.9, 3.1, 0.22), 'wicker', at=(HINGE[0] + 0.95, HINGE[1], HINGE[2]), bevel=0.08), outline=LINE), HINGE)
# Two of the picnic's guests watch from the flap that is shut, and one from the top of the sandwich.
mark('stand_0', (BASKET[0] - 1.35, BASKET[1] + 0.75, TABLE + 2.51))
mark('stand_1', (BASKET[0] - 0.75, BASKET[1] + 0.05, TABLE + 2.51))
mark('stand_2', (SANDWICH[0] - 0.25, SANDWICH[1] + 0.35, TABLE + 1.3))

loaf = lathe('loaf', [(0, 0), (0.3, 0.14), (0.38, 0.6), (0.38, 1.9), (0.3, 2.3), (0, 2.45)], 'crust', sides=10, smooth=60)
cuts = [box('loaf_cut_%d' % i, (0.5, 0.12, 0.2), 'bread', at=(0, -0.34, 1.1 + i * 0.45), rot=(0, 35, 0), bevel=0) for i in range(3)]
upright(prop('loaf', loaf, *cuts, at=(BASKET[0] + 1.2, BASKET[1] + 0.5, TABLE + 1.0), rot=(-14, 30, 0)))
bottle = lathe('bottle', [(0, 0), (0.42, 0), (0.44, 1.3), (0.2, 1.9), (0.2, 2.5), (0.27, 2.55), (0.27, 2.7), (0, 2.7)], 'rind', sides=12)
cork = cylinder('cork', 0.17, 0.3, 'cookie', at=(0, 0, 2.8), sides=8)
upright(prop('bottle', bottle, cork, at=(BASKET[0] + 1.55, BASKET[1] - 0.7, TABLE + 0.55), rot=(10, 16, 0)))


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

hanging = prop('cloth_hanging', *checks('cloth_hanging', 4, 4, 0.52, False), at=(-0.6, -1.62, 1.22))
lying = prop('cloth_lying', *checks('cloth_lying', 4, 2, 0.52, True), at=(-0.6, -2.14, 0.17))
over = prop('cloth_over', *checks('cloth_over', 4, 2, 0.52, True), at=(-0.6, -1.1, 2.6))
tag(prop('basket_cloth', hanging, lying, over, at=(BASKET[0], BASKET[1], TABLE)), outline=LINE)

# A butterfly going round over the watermelon.
body = tag(lathe('butterfly_body', [(0, -0.3), (0.07, -0.2), (0.08, 0.2), (0, 0.32)], 'ink', rot=(90, 0, 0), sides=6), outline=0, shadow=False)
flaps = []
for index, side in enumerate((-1, 1)):
    shape = [(0, -0.3), (0.5, -0.42), (0.62, -0.1), (0.4, 0.04), (0.74, 0.2), (0.7, 0.55), (0.3, 0.5), (0, 0.22)]
    flap = slab('butterfly_wing_%d' % index, shape if side > 0 else [(-x, y) for x, y in reversed(shape)], 0.08, 'juice', bevel=0)
    flaps.append(sway(tag(flap, outline=THIN, shadow=False), degrees=38 * side, seconds=0.5, axis=1))
flutter = bob(group('butterfly', body, *flaps, at=(2.0, 0, 0)), height=0.5, seconds=1.3)
spin(group('butterfly_round', flutter, at=(MELON[0] - 0.4, MELON[1], TABLE + 3.0)), seconds=7.5)


# ── The right side: the teapot, a cake on its stand, and the juice at the back corner ─
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


def cup(name, at, turn):
    drink = glassful(name, [(0, 0), (0.46, 0), (0.5, 0.16), (0.62, 1.15), (0.66, 1.45), (0.68, 1.5)], 1.15, sides=14)
    straw = pipe(name + '_straw', [(0.1, 0, 0.3), (-0.3, 0, 1.9), (-0.38, 0, 2.1), (-0.8, 0, 2.3)], 0.08, 'white', sides=6)
    bands = [cylinder('%s_band_%d' % (name, i), 0.095, 0.16, 'clothEdge', at=(0.1 - 0.4 * share, 0, 0.3 + 1.6 * share), rot=(0, -14, 0), sides=6) for i, share in enumerate((0.62, 0.8, 0.98))]
    return upright(prop(name, *drink, straw, *bands, at=(at[0], at[1], TABLE), rot=(0, 0, turn)))


# A jug of orange juice with ice in it, and a cup with a straw beside it.
jug = glassful('jug', [(0, 0), (1.05, 0), (1.18, 0.16), (1.3, 1.0), (1.22, 2.0), (1.02, 2.7), (0.98, 3.0), (1.08, 3.3), (1.12, 3.4)], 2.7, sides=20)
jug_grip = pipe('jug_grip', [(1.1, 0, 2.9), (1.8, 0, 2.8), (2.05, 0, 2.0), (1.8, 0, 1.2), (1.25, 0, 0.9)], 0.16, 'glass', sides=8)
spout = cone('jug_spout', 0.4, 0.7, 'glass', at=(-1.2, 0, 3.22), rot=(0, 120, 0), sides=8)
ice = [box('ice_%d' % i, (0.5, 0.5, 0.5), 'white', at=(x, y, 2.8), rot=(20 * i, 30, 15 * i), bevel=0.08, segments=1) for i, (x, y) in enumerate(((0.3, -0.3), (-0.35, 0.2), (0.25, 0.45)))]
upright(prop('jug', *jug, jug_grip, spout, *ice, at=(10.35, 7.1, TABLE), rot=(0, 0, 52), scale=0.84))
cup('cup_a', (9.65, 5.15), 200)

# A layer cake on a stand. The stand is here; the cake is slices the map's code stands on it and takes away
# one by one as the round goes by. One slice is already gone, to a plate behind the blanket.
LAYERS = (('sponge', 0.5, 1.0), ('icing', 0.18, 1.03), ('sponge', 0.5, 1.0), ('icing', 0.26, 1.05))
CAKE = (10.35, 2.9)
STAND = 0.85

def slice_of_cake(name, radius=1.3, half=30):
    """A wedge of sponge, filling, sponge and icing with a cherry on it, its point at the origin, lying along X."""
    pieces = []
    z = 0
    for index, (color, height, reach) in enumerate(LAYERS):
        pieces.append(slab('%s_%d' % (name, index), wedge(radius * reach, -half, half, 3), height, color, at=(0, 0, z + height / 2), bevel=0))
        z += height
    pieces.append(ball(name + '_cherry', 0.2, 'apple', at=(radius * 0.7, 0, z + 0.14), detail=1))
    return pieces

stand = lathe('cake_stand', [(0, 0), (0.95, 0), (1.0, 0.1), (0.3, 0.26), (0.22, STAND - 0.3), (1.44, STAND - 0.15), (1.52, STAND - 0.08), (1.52, STAND), (0, STAND)], 'plate', sides=24)
line = lathe('cake_stand_line', [(1.45, STAND - 0.12), (1.54, STAND - 0.09), (1.54, STAND + 0.01), (1.45, STAND + 0.01), (1.45, STAND - 0.12)], 'enamel', sides=24)
tag(prop('cake_stand', stand, line, at=(CAKE[0], CAKE[1], TABLE)), outline=LINE)
mark('mark_cake', (CAKE[0], CAKE[1], TABLE + STAND))

# A bee going round the cake.
bee_body = ball('bee_body', 0.22, 'cheese', scale=(1.35, 1, 1))
bee_head = ball('bee_head', 0.15, 'ink', at=(0.3, 0, 0.02), detail=1)
stripes = [cylinder('bee_stripe_%d' % i, 0.22 * math.sqrt(1 - (x / 0.3) ** 2) + 0.012, 0.09, 'ink', at=(x, 0, 0), rot=(0, 90, 0), sides=10) for i, x in enumerate((-0.14, 0.05))]
bee = tag(prop('bee_body', bee_body, bee_head, *stripes), outline=THIN, shadow=False)
wings = []
for index, side in enumerate((-1, 1)):
    # Each wing is hinged where it meets the back, so it beats instead of spinning on the spot.
    wing = reshape(ball('bee_wing_%d' % index, 0.2, 'white', at=(-0.02, side * 0.06, 0.17), scale=(0.7, 1.2, 0.18), rot=(side * 20, 0, 0), detail=1), lambda x, y, z: (x, y + side * 0.22, z))
    wings.append(sway(tag(wing, outline=THIN, shadow=False), degrees=26 * side, seconds=0.4, axis=0))
flier = bob(place(group('bee', bee, *wings, at=(1.7, 0, 0), rot=(0, 0, 90)), scale=1.25), height=0.35, seconds=0.9)
spin(group('bee_round', flier, at=(CAKE[0] + 0.1, CAKE[1], TABLE + STAND + 2.3)), seconds=4.6)

# The teapot, steaming.
TEAPOT = (10.45, -0.9)
TURN, SIZE = 128, 0.92
pot = lathe('teapot_body', [(0, 0), (0.85, 0), (0.95, 0.1), (1.4, 0.6), (1.5, 1.1), (1.3, 1.7), (0.85, 2.0), (0, 2.0)], 'enamel', sides=24, smooth=60)
belt = lathe('teapot_belt', [(1.46, 0.85), (1.53, 1.0), (1.53, 1.2), (1.46, 1.35)], 'cream', sides=24)
lid = lathe('teapot_lid', [(0, 1.96), (0.9, 1.98), (0.88, 2.1), (0.45, 2.26), (0, 2.28)], 'cream', sides=24)
knob = ball('teapot_knob', 0.22, 'enamel', at=(0, 0, 2.42))
nose = pipe('teapot_nose', [(1.15, 0, 0.75), (1.85, 0, 1.0), (2.2, 0, 1.6), (2.5, 0, 2.05)], 0.25, 'enamel', sides=8)
ear = pipe('teapot_ear', [(-1.3, 0, 1.6), (-1.95, 0, 1.75), (-2.3, 0, 1.2), (-2.0, 0, 0.6), (-1.3, 0, 0.55)], 0.17, 'enamel', sides=8)
upright(prop('teapot', pot, belt, nose, ear, at=(TEAPOT[0], TEAPOT[1], TABLE), rot=(0, 0, TURN), scale=SIZE))
# Its lid rattles and jumps when the pot whistles, and the steam leaves by the spout: both are the map's code.
live(upright(prop('teapot_lid', lid, knob, at=(TEAPOT[0], TEAPOT[1], TABLE), rot=(0, 0, TURN), scale=SIZE)), (TEAPOT[0], TEAPOT[1], TABLE + 1.98 * SIZE))
mark('mark_spout', (TEAPOT[0] + math.cos(math.radians(TURN)) * 2.55 * SIZE, TEAPOT[1] + math.sin(math.radians(TURN)) * 2.55 * SIZE, TABLE + 2.25 * SIZE))

# A round of cheese with a wedge gone, for one more guest to stand on.
tag(prop('cheese', slab('cheese', wedge(0.8, 20, 320, 10), 0.55, 'cheese', at=(0, 0, 0.275), bevel=0.06), at=(10.3, -3.55, TABLE), rot=(0, 0, 60)), outline=LINE)
mark('stand_3', (10.2, -3.6, TABLE + 0.55))

# ── Behind the blanket: only what is low ─────────────────────────────────────
# A cookie the ants are carrying off: the code shrinks it as the round goes by, and walks the ants (templates,
# below) between it and the basket, where `mark_ants_*` say.
COOKIE = (-2.6, 7.7)
biscuit = lathe('cookie', [(0, 0), (0.92, 0), (1.0, 0.14), (0.92, 0.36), (0.5, 0.45), (0, 0.46)], 'cookie', sides=16, smooth=60)
chips = [ball('chip_%d' % i, 0.14, 'stem', at=(math.cos(i * 1.3) * (0.3 + 0.12 * (i % 3)), math.sin(i * 1.3) * (0.3 + 0.12 * (i % 3)), 0.42), scale=(1, 1, 0.6), detail=1) for i in range(6)]
live(tag(prop('cookie', biscuit, *chips, at=(COOKIE[0], COOKIE[1], TABLE)), outline=LINE), (COOKIE[0], COOKIE[1], TABLE))
crumbs = [rock('crumb_%d' % i, 0.12, 'cookie', at=(x, y, 0.07), seed=i, detail=1) for i, (x, y) in enumerate(((1.4, 0.3), (1.7, -0.3), (1.25, -0.5), (-0.3, 1.3), (0.5, 1.25)))]
tag(prop('crumbs', *crumbs, at=(COOKIE[0], COOKIE[1], TABLE)), outline=THIN, shadow=False)
mark('mark_ants_from', (BASKET[0] + WALL - 0.3, COOKIE[1], TABLE))
mark('mark_ants_to', (COOKIE[0] - 0.5, COOKIE[1], TABLE))

# Three bottle caps, upside down, for guests to stand on.
for index, x in enumerate((-0.55, 0.6, 1.75)):
    crown = lathe('cap_%d' % index, [(0, 0), (0.5, 0), (0.56, 0.08), (0.5, 0.3), (0.44, 0.34), (0, 0.34)], 'silver', sides=14)
    reshape(crown, lambda x, y, z: (x * (1 + 0.07 * math.cos(math.atan2(y, x) * 7)), y * (1 + 0.07 * math.cos(math.atan2(y, x) * 7)), z) if z < 0.2 else (x, y, z))
    top = cylinder('cap_top_%d' % index, 0.4, 0.03, 'enamel', at=(0, 0, 0.35), sides=14)
    tag(prop('cap_%d' % index, crown, top, at=(x, 7.55 + 0.15 * (index % 2), TABLE)), outline=LINE)
    mark('stand_%d' % (4 + index), (x, 7.55 + 0.15 * (index % 2), TABLE + 0.36))

# The slice that is gone from the cake, a pot of jam and a jelly.
tag(prop('slice_plate', *plate('slice_plate', 1.3), at=(3.7, 7.95, TABLE)), outline=LINE)
upright(prop('cake_slice', *slice_of_cake('cake_slice'), at=(4.4, 7.85, TABLE + 0.26), rot=(0, 0, 168)))

# The jam, under a cloth cap tied with string, with a heart on its label.
jar = lathe('jam_jar', [(0, 0), (1.0, 0), (1.12, 0.14), (1.12, 1.55), (0.92, 1.8), (0.92, 1.95), (0, 1.95)], 'jam', sides=20)
label = lathe('jam_label', [(1.14, 0.45), (1.15, 0.5), (1.15, 1.25), (1.14, 1.3)], 'cream', sides=20)
cap = lathe('jam_cap', [(1.02, 1.62), (1.3, 1.5), (1.34, 1.56), (1.0, 1.9), (0.98, 2.06), (0.7, 2.2), (0, 2.24)], 'cream', sides=20, smooth=60)

def frilled(x, y, z):
    """The cloth's hem stands out in ten folds below the string."""
    fold = 1 + 0.1 * math.cos(math.atan2(y, x) * 10) if z < 1.6 else 1
    return (x * fold, y * fold, z)

reshape(cap, frilled)
string = ring('jam_string', 1.01, 0.08, 'clothEdge', at=(0, 0, 1.88), sides=20, around=4)
heart = slab('jam_heart', [(0, -0.3), (0.3, 0.02), (0.3, 0.2), (0.16, 0.3), (0, 0.18), (-0.16, 0.3), (-0.3, 0.2), (-0.3, 0.02)], 0.1, 'apple', at=(0, -1.15, 0.86), rot=(90, 0, 0), bevel=0)
upright(prop('jam', jar, label, cap, string, heart, at=(6.25, 8.0, TABLE), rot=(0, 0, 8)))
mark('stand_7', (6.25, 8.0, TABLE + 2.25))

# A jelly in two layers, fluted from its mould. It never stops wobbling, and the code shakes it harder.
JELLY = (8.55, 8.1)
tag(prop('jelly_plate', *plate('jelly_plate', 1.2), at=(JELLY[0], JELLY[1], TABLE)), outline=LINE)

def fluted(x, y, z):
    """Eight flutes down its sides, dying out toward the top."""
    deep = 1 + 0.11 * math.cos(math.atan2(y, x) * 8) * min(1, max(0, (1.25 - z) / 0.4))
    return (x * deep, y * deep, z)

lower = reshape(lathe('jelly_lower', [(0, 0), (0.9, 0), (0.96, 0.12), (0.9, 0.45), (0.82, 0.72), (0, 0.72)], 'jelly', sides=32, smooth=75), fluted)
upper = reshape(lathe('jelly_upper', [(0, 0.72), (0.82, 0.72), (0.7, 1.0), (0.54, 1.18), (0.38, 1.24), (0, 1.25)], 'icing', sides=32, smooth=75), fluted)
cherry = ball('jelly_cherry', 0.22, 'jelly', at=(0, 0, 1.4))
live(upright(prop('jelly', lower, upper, cherry, at=(JELLY[0], JELLY[1], TABLE + 0.24))), (JELLY[0], JELLY[1], TABLE + 0.24))

# ── In front of the blanket: only what lies low ──────────────────────────────
# Strawberries standing on their points, and two lumps of sugar.
berry = lathe('strawberry', [(0, 0), (0.18, 0.06), (0.4, 0.42), (0.44, 0.66), (0.32, 0.86), (0, 0.9)], 'apple', sides=10, smooth=70)
calyx = slab('strawberry_calyx', [(math.cos(math.radians(a)) * (0.42 if a % 72 == 0 else 0.16), math.sin(math.radians(a)) * (0.42 if a % 72 == 0 else 0.16)) for a in range(0, 360, 36)], 0.08, 'leaf', at=(0, 0, 0.9), bevel=0)
stub = cylinder('strawberry_stub', 0.06, 0.2, 'leaf', at=(0, 0, 1.02), sides=6)
berry = tag(prop('strawberry_a', berry, calyx, stub, at=(-5.2, -7.9, TABLE + 0.04), rot=(-24, 10, 0)), outline=LINE)
copy(berry, 'strawberry_b', at=(-4.0, -8.5, TABLE + 0.04), rot=(-20, -22, 140))
copy(berry, 'strawberry_c', at=(6.3, -7.8, TABLE + 0.04), rot=(-22, 16, 60))
lumps = [box('sugar_%d' % i, (0.5, 0.5, 0.5), 'white', at=(x, y, 0.25), rot=(0, 0, turn), bevel=0.06, segments=1) for i, (x, y, turn) in enumerate(((0, 0, 15), (0.75, 0.35, 50)))]
tag(prop('sugar', *lumps, at=(3.6, -8.2, TABLE)), outline=LINE)


# ── The far row, on the horizon ──────────────────────────────────────────────
# A round's picture ends well short of it. From low it is the skyline: plain big shapes, each unlike its neighbour,
# and none over about 4.8 m, or the card's picture would cut its top off.
def far(name, *pieces, at, rot=(0, 0, 0), reach=1.4, size=1.0):
    shade(at[0], at[1], reach * size)
    return tag(prop(name, *pieces, at=(at[0], at[1], TABLE), rot=rot, scale=size), outline=LINE, shadow=False)


# A bottle of milk.
milk = lathe('milk', [(0, 0), (1.0, 0), (1.1, 0.2), (1.1, 2.7), (0.56, 3.7), (0.5, 4.3), (0.62, 4.4), (0.62, 4.6), (0, 4.6)], 'plate', sides=14)
milk_cap = cylinder('milk_cap', 0.68, 0.34, 'enamel', at=(0, 0, 4.74), sides=14)
far('milk', milk, milk_cap, at=(-15.2, 14.6), size=0.9)

# A flask of something hot, its cup screwed on for a lid.
flask = lathe('thermos', [(0, 0), (1.0, 0), (1.08, 0.12), (1.08, 3.9), (0.9, 4.2), (0, 4.2)], 'enamel', sides=14)
flask_band = lathe('thermos_band', [(1.1, 0.5), (1.12, 0.55), (1.12, 1.0), (1.1, 1.05)], 'silver', sides=14)
flask_cup = lathe('thermos_cup', [(0.92, 4.2), (0.98, 4.26), (0.9, 5.3), (0.8, 5.4), (0, 5.4)], 'silver', sides=14)
flask_grip = pipe('thermos_grip', [(1.0, 0, 3.5), (1.7, 0, 3.4), (1.8, 0, 2.3), (1.05, 0, 1.7)], 0.16, 'silver', sides=6)
far('thermos', flask, flask_band, flask_cup, flask_grip, at=(-9.2, 15.2), rot=(0, 0, 20), size=0.86)

# A whole watermelon, lying on its side.
whole = ball('watermelon', 1.9, 'rind', scale=(1.3, 1, 0.95), detail=2)
bands = [pipe('watermelon_stripe_%d' % i, [(math.cos(t * math.pi / 8) * 1.9 * 1.3, math.sin(t * math.pi / 8) * math.cos(math.radians(i * 36)) * 1.9, math.sin(t * math.pi / 8) * math.sin(math.radians(i * 36)) * 1.9 * 0.95) for t in range(16)],
              0.11, 'pith', sides=4, closed=True) for i in range(5)]
far('watermelon', whole, *bands, at=(-3.6, 14.8), rot=(0, 0, 12), reach=2.2).location.z = TABLE + 1.9 * 0.95

# Sunflowers in a vase.
vase = lathe('vase', [(0, 0), (0.8, 0), (0.95, 0.3), (1.0, 1.3), (0.6, 1.9), (0.7, 2.2), (0, 2.2)], 'cream', sides=14)
blooms = []
for index, (x, y, z, lean) in enumerate(((-1.4, 0.1, 3.3, -14), (0.15, 0, 3.9, 4), (1.5, -0.1, 3.0, 16))):
    blooms.append(pipe('sunflower_stem_%d' % index, [(x * 0.2, 0, 2.0), (x * 0.7, y, (z + 2.0) / 2), (x, y, z)], 0.12, 'leaf', sides=6))
    petals = [(math.cos(i * math.pi / 8) * (0.58 if i % 2 else 1.0), math.sin(i * math.pi / 8) * (0.58 if i % 2 else 1.0)) for i in range(16)]
    blooms.append(slab('sunflower_petals_%d' % index, petals, 0.14, 'cheese', at=(x, y - 0.1, z), rot=(72, 0, lean), bevel=0))
    blooms.append(cylinder('sunflower_heart_%d' % index, 0.5, 0.2, 'stem', at=(x, y - 0.24, z + 0.04), rot=(72, 0, lean), sides=10))
blooms.append(slab('sunflower_leaf', [(0, 0), (0.5, -0.3), (1.2, 0), (0.5, 0.3)], 0.08, 'leaf', at=(0.25, -0.1, 2.9), rot=(60, -20, 0), bevel=0))
far('sunflowers', vase, *blooms, at=(1.9, 15.3))

# Ketchup and mustard.
def squeezy(name, color, at, size):
    body = lathe(name, [(0, 0), (0.75, 0), (0.85, 0.15), (0.85, 2.4), (0.5, 3.2), (0.3, 3.4), (0, 3.4)], color, sides=12)
    nozzle = lathe(name + '_nozzle', [(0.34, 3.36), (0.36, 3.5), (0.12, 4.3), (0, 4.34)], 'plate', sides=8)
    return far(name, body, nozzle, at=at, reach=1.1, size=size)

squeezy('ketchup', 'apple', (6.6, 14.8), 1.0)
squeezy('mustard', 'cheese', (8.4, 15.3), 0.88)

# A pineapple.
fruit = lathe('pineapple', [(0, 0), (0.9, 0.15), (1.25, 0.9), (1.3, 1.9), (1.1, 2.8), (0.6, 3.3), (0, 3.4)], 'cheese', sides=12, smooth=60)
crown = [slab('pineapple_leaf_%d' % i, [(-0.24, 0), (0.24, 0), (0, 1.2 + 0.4 * (i % 2))], 0.08, 'leaf', at=(0, 0, 3.25), rot=(90 - 22 - 14 * (i % 3), 0, i * 51), bevel=0) for i in range(7)]
far('pineapple', fruit, *crown, at=(13.7, 14.7), size=0.9)
tag(prop('grain', *grain), outline=0, shadow=False)


# ── The garden the table stands in ───────────────────────────────────────────
# Seen only from low, past the table's far edge: a lawn mown in stripes a long way down, hedges, trees, flowers.
LAWN = -15.0
garden = [cylinder('lawn', 190, 0.5, 'lawn', at=(0, 60, LAWN - 0.25), sides=40)]
garden += [box('mown_%d' % i, (380, 9, 0.06), 'lawnDark', at=(0, 44 + i * 18, LAWN + 0.03), bevel=0) for i in range(7)]
rng = random.Random(4)
for index, (x, y, size) in enumerate(((-46, 70, 0.55), (-17, 78, 0.6), (21, 72, 0.5), (50, 82, 0.62), (-70, 86, 0.6), (74, 74, 0.5), (0, 96, 0.7), (-34, 100, 0.66), (36, 104, 0.7))):
    garden.append(cylinder('trunk_%d' % index, 1.4 * size, 9 * size, 'stem', at=(x, y, LAWN + 4.5 * size), top=1.0 * size, sides=7))
    garden += [rock('leaves_%d_%d' % (index, i), 6.5 * size, 'leaf' if i else 'rind', at=(x + dx * size, y + dy * size, LAWN + (11 + dz) * size), seed=index * 3 + i, rough=0.16, detail=1, smooth=70)
               for i, (dx, dy, dz) in enumerate(((0, 0, 3), (-4.5, 1, 0), (4.5, -1, 0.5)))]
for index in range(9):
    garden.append(rock('hedge_%d' % index, 5.5, 'rind', at=(-80 + index * 20 + rng.uniform(-3, 3), 128 + rng.uniform(-4, 4), LAWN + 2.4), seed=index + 20, rough=0.14, scale=(1.9, 1, 0.9), detail=1, smooth=70))
for index in range(60):
    garden.append(cylinder('flower_%d' % index, 0.7, 0.3, ('cloth', 'cheese', 'icing')[index % 3], at=(rng.uniform(-95, 95), rng.uniform(58, 124), LAWN + 0.2), sides=6))
tag(prop('garden', *garden), outline=0, shadow=False, receive=False)


# ── Small creatures the map's code walks about ───────────────────────────────
def ant(name, carrying):
    """An ant facing X. One going home has a crumb in its jaws."""
    pieces = [ball(name + '_tail', 0.14, 'ink', at=(-0.2, 0, 0.16), scale=(1.3, 1, 0.9), detail=1),
              ball(name + '_head', 0.12, 'ink', at=(0.12, 0, 0.16), scale=(1.2, 1, 1), detail=1)]
    pieces += [box('%s_leg_%d' % (name, i), (0.05, 0.44, 0.05), 'ink', at=(offset, 0, 0.06), rot=(0, 0, (i - 1) * 16), bevel=0) for i, offset in enumerate((-0.08, 0.01, 0.1))]
    if carrying:
        pieces.append(box(name + '_crumb', (0.17, 0.17, 0.17), 'cream', at=(0.34, 0, 0.14), rot=(0, 0, 20), bevel=0))
    return part(tag(prop(name, *pieces), outline=0, shadow=False))

ant('ant', False)
ant('ant_loaded', True)

# A ladybird, facing X, that walks all the way round the blanket.
shell = ball('ladybird', 0.2, 'apple', at=(0, 0, 0.1), scale=(1.15, 0.95, 0.75), detail=2)
face = ball('ladybird_head', 0.1, 'ink', at=(0.2, 0, 0.08), detail=1)
spots = [ball('ladybird_spot_%d' % i, 0.05, 'ink', at=(x, y, 0.22 - abs(y) * 0.25), scale=(1, 1, 0.4), detail=1) for i, (x, y) in enumerate(((-0.08, 0.1), (-0.08, -0.1), (0.07, 0.09), (0.07, -0.09)))]
seam = box('ladybird_seam', (0.36, 0.025, 0.02), 'ink', at=(-0.02, 0, 0.25), bevel=0)
part(tag(prop('ladybird', shell, face, *spots, seam), outline=THIN, shadow=False))

# One slice of the cake on the stand: the code stands five in a ring and takes them away as the round goes by.
part(tag(prop('slice', *slice_of_cake('slice')), outline=LINE, shadow=False, receive=False))


# ── The food the game drops ──────────────────────────────────────────────────
# Each kind has a shape of its own. They stand on Z = 0 and are about the sizes the rules reach for. A blanket
# full of them is the most the map ever draws, so a glint or a pip has no outline and no shadow of its own.
def food(name, body, *details):
    return part(group(name, tag(body, outline=0.045), tag(prop(name + '_details', *details), outline=0, shadow=False)))


apple = lathe('apple', [(0, 0.08), (0.12, 0.02), (0.24, 0.05), (0.33, 0.2), (0.37, 0.38), (0.33, 0.54), (0.22, 0.63), (0.1, 0.64), (0, 0.56)], 'apple', sides=12, smooth=75)
stalk = pipe('apple_stalk', [(0, 0, 0.52), (0.02, 0, 0.72), (0.09, 0, 0.88)], 0.05, 'leaf', sides=6)
leaf = slab('apple_leaf', [(0, 0), (0.12, -0.1), (0.3, -0.06), (0.4, 0.04), (0.28, 0.12), (0.1, 0.1)], 0.07, 'leaf', at=(0.04, 0, 0.72), rot=(20, -28, 0), bevel=0)
shine = ball('apple_shine', 0.07, 'white', at=(-0.16, -0.25, 0.44), scale=(1, 0.6, 1.3), detail=1)
food('apple', prop('apple_body', apple, stalk, leaf), shine)

dough = ring('donut', 0.28, 0.145, 'dough', at=(0, 0, 0.145), sides=20, around=8)
round_tube = lambda reach, angles: [(0.28 + math.cos(math.radians(a)) * reach, 0.15 + math.sin(math.radians(a)) * reach) for a in angles]
icing = lathe('donut_icing', round_tube(0.168, (205, 160, 125, 90, 55, 20, -25)) + round_tube(0.09, (-25, 90, 205)) + round_tube(0.168, (205,)), 'icing', sides=20, smooth=70)
# The icing runs down in drips: its outer edge dips lower every so often.
reshape(icing, lambda x, y, z: (x, y, z - 0.07 * max(0, math.cos(math.atan2(y, x) * 5))) if math.hypot(x, y) > 0.42 and z < 0.2 else (x, y, z))
sprinkles = [box('sprinkle_%d' % i, (0.11, 0.045, 0.04), ('white', 'enamel')[i % 2], at=(math.cos(i * 0.9) * 0.28, math.sin(i * 0.9) * 0.28, 0.325), rot=(0, 0, i * 67), bevel=0) for i in range(7)]
food('donut', prop('donut_ring', dough, icing), *sprinkles)

# A slice of watermelon standing on its rind: red, a line of white, green, and a few pips.
slice_of_melon = [slab('melon_flesh', wedge(0.52, -140, -40), 0.3, 'flesh', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0.04),
                  slab('melon_pith', wedge(0.59, -139, -41), 0.27, 'pith', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0),
                  slab('melon_rind', wedge(0.66, -138, -42), 0.24, 'rind', at=(0, 0, 0.66), rot=(90, 0, 0), bevel=0)]
pips = [ball('melon_pip', 0.045, 'ink', at=(x, side * 0.15, z), scale=(1, 0.5, 1.5), detail=1) for side in (-1, 1) for x, z in ((0, 0.42), (-0.15, 0.3), (0.15, 0.3))]
food('melon', prop('melon_slice', *slice_of_melon), *pips)

# The pepper wears the colours of a curse and is bent like a horn: the one thing here not to eat.
flesh = lathe('pepper', [(0, 0), (0.06, 0.04), (0.14, 0.2), (0.22, 0.42), (0.26, 0.62), (0.22, 0.76), (0.1, 0.82), (0, 0.82)], 'tierCursed', sides=10, smooth=75)
reshape(flesh, lambda x, y, z: (x + 0.75 * (0.82 - z) ** 2, y, z))
cap = lathe('pepper_cap', [(0.21, 0.72), (0.25, 0.78), (0.14, 0.87), (0, 0.9)], 'tierCursedAccent', sides=10)
stalk = pipe('pepper_stalk', [(0, 0, 0.86), (-0.03, 0, 1.0), (-0.12, 0, 1.1)], 0.055, 'tierCursedAccent', sides=6)
shine = ball('pepper_shine', 0.055, 'white', at=(0.0, -0.23, 0.56), scale=(1, 0.6, 1.5), detail=1)
food('pepper', place(prop('pepper_body', flesh, cap, stalk), at=(-0.16, 0, 0.04), rot=(0, -22, 0)), place(shine, at=(-0.37, -0.23, 0.56)))

settle()
