# O Chão é Lava: a slab of pale stone in the mouth of a volcano. The slab is the game's own tiles (14 by 12,
# top at Z = 0); this is everything round it. The lava lies at Z = -0.75 while it is calm and climbs over the
# floor in a flood, so whatever stands in it is built from well below that.
# The camera looks down from the front and, in a round, sees little more than the slab: what is always in
# the picture is the ring of basalt at the slab's feet and the first few metres of lava. Height is built at
# the sides, the back is a wall whose top is seldom seen, and the front stays below the floor.
import math
import random

import kit
from kit import *

HALF_X = 7.0
HALF_Y = 6.0
SEA = -0.75

guide_floor(width=HALF_X * 2, depth=HALF_Y * 2)
for spot in ((-3.5, 2.0, 0), (2.5, -3.0, 0), (5.5, 4.0, 0)):
    guide_pet(spot)


# ── Shapes this map needs ────────────────────────────────────────────────────

def blob(radius, points, seed, rough=0.18, stretch=(1.0, 1.0)):
    """The corners of a lumpy round outline, counter-clockwise."""
    rng = random.Random(seed)
    turn = rng.uniform(0, math.pi)
    return [(math.cos(turn + 2 * math.pi * i / points) * radius * stretch[0] * (1 + rng.uniform(-rough, rough)),
             math.sin(turn + 2 * math.pi * i / points) * radius * stretch[1] * (1 + rng.uniform(-rough, rough))) for i in range(points)]


def prism(name, outline, low, high, color, taper=1.0, bevel=0.06, at=(0, 0, 0), rot=(0, 0, 0), smooth=40):
    """An outline of (x, y) corners standing from `low` to `high`, its top `taper` times as wide: a stone with sloping sides."""
    bm = bmesh.new()
    lower = [bm.verts.new((x, y, low)) for x, y in outline]
    upper = [bm.verts.new((x * taper, y * taper, high)) for x, y in outline]
    count = len(outline)
    bm.faces.new(list(reversed(lower)))
    bm.faces.new(upper)
    for i in range(count):
        bm.faces.new((lower[i], lower[(i + 1) % count], upper[(i + 1) % count], upper[i]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES', profile=0.5)
    return kit._finish_mesh(name, bm, color, at, rot, smooth)


def sheet(name, shapes, color, at=(0, 0, 0)):
    """
    Flat pieces lying on the lava, seen only from above: each shape is a list of (x, y) corners, counter-clockwise.
    One face each, facing up, with no underside and no thickness, so a hundred of them weigh almost nothing.
    """
    bm = bmesh.new()
    for shape in shapes:
        bm.faces.new([bm.verts.new((x, y, 0)) for x, y in shape])
    for face in bm.faces:
        face.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    return obj


def band(inner, outer):
    """The shapes of a flat ring between two outlines with the same number of corners: the bright line where lava meets stone."""
    count = len(inner)
    return [[inner[i], outer[i], outer[(i + 1) % count], inner[(i + 1) % count]] for i in range(count)]


def disc(x, y, radius, turn=0.0, sides=12):
    return [(x + math.cos(turn + 2 * math.pi * i / sides) * radius, y + math.sin(turn + 2 * math.pi * i / sides) * radius) for i in range(sides)]


def streak(radius, start, sweep, width):
    """A sliver of an arc round the middle of the map, fat in its middle and pointed at its ends: lava on the move."""
    steps = 8
    outer = []
    inner = []
    for i in range(steps + 1):
        angle = math.radians(start + sweep * i / steps)
        half = width / 2 * math.sin(math.pi * i / steps) + 0.02
        outer.append((math.cos(angle) * (radius + half), math.sin(angle) * (radius + half)))
        inner.append((math.cos(angle) * (radius - half), math.sin(angle) * (radius - half)))
    return outer + list(reversed(inner))


def column(name, radius, low, top, color, at=(0, 0, 0), turn=0.0, chamfer=0.08):
    """A six-sided basalt column from `low` up to a flat top, its rim chamfered if asked. It has no underside: it stands in the lava."""
    rim = [(radius, top - chamfer), (radius - chamfer, top)] if chamfer > 0 else [(radius, top)]
    return lathe(name, [(radius, low)] + rim + [(0, top)], color, at=at, rot=(0, 0, turn), sides=6)


def turned(shape, x, y, degrees):
    """A shape turned round the origin and moved to (x, y)."""
    cos, sin = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    return [(x + px * cos - py * sin, y + px * sin + py * cos) for px, py in shape]


def frame(half_x, half_y, corner, across=14, along=12, turn=4, seed=None, rough=0.0):
    """
    The corners of a rectangle with rounded corners, counter-clockwise: `turn` points round each corner, and the
    long and short sides cut into `across` and `along` steps. Each is pushed out at random by up to `rough`.
    """
    rng = random.Random(seed)
    points = []
    for index, (cx, cy) in enumerate(((half_x - corner, half_y - corner), (-half_x + corner, half_y - corner), (-half_x + corner, -half_y + corner), (half_x - corner, -half_y + corner))):
        for step in range(turn):
            angle = math.radians(index * 90 + step * 90 / (turn - 1))
            points.append((cx + math.cos(angle) * corner, cy + math.sin(angle) * corner))
        # Along the side to where the next corner starts.
        nx, ny = ((-half_x + corner, half_y), (-half_x, -half_y + corner), (half_x - corner, -half_y), (half_x, half_y - corner))[index]
        sx, sy = points[-1]
        count = across if index % 2 == 0 else along
        for step in range(1, count):
            points.append((sx + (nx - sx) * step / count, sy + (ny - sy) * step / count))
    return [(x + x / math.hypot(x, y) * rng.uniform(0, rough), y + y / math.hypot(x, y) * rng.uniform(0, rough)) for x, y in points]


def settle(obj):
    """Bakes where a joined piece stands into its shape, so that its origin is the scene's and copies can be placed by it."""
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
    return obj


used = set()


def stamp(mould, name, at, rot=(0, 0, 0), scale=1.0):
    """One more of a mould. The first one placed is the mould itself, so nothing is left standing out of sight."""
    if mould.name in used:
        return copy(mould, name, at=at, rot=rot, scale=scale)
    used.add(mould.name)
    return place(mould, at=at, rot=rot, scale=scale)


def grown(outline, by):
    """An outline pushed outward from the middle by `by` metres."""
    return [(x + x / math.hypot(x, y) * by, y + y / math.hypot(x, y) * by) for x, y in outline]


# Everything in here rides on the lava: the game moves it up and down with the lava's level.
afloat = []
# The bright line round whatever stands in the lava: one flat piece, made of a disc under each thing.
foams = []


def foam(x, y, radius):
    foams.append(disc(x, y, radius, len(foams) * 0.3))


# ── The slab's feet ──────────────────────────────────────────────────────────
# A ring of six-sided basalt stubs the pale slab stands in, every top below the floor. The lava climbs over
# them during the alarm, so how many still show is how long there is left.
rng = random.Random(21)
stubs = []


def stub(x, y, radius, top):
    stubs.append(column('stub_%d' % len(stubs), radius, -1.6, top, 'cone' if len(stubs) % 3 == 0 else 'rim', at=(x, y, 0), turn=rng.choice((0, 30)) + rng.uniform(-6, 6), chamfer=0))


for x, y in frame(HALF_X + 0.42, HALF_Y + 0.42, 0.5, turn=2):
    stub(x + rng.uniform(-0.08, 0.08), y + rng.uniform(-0.08, 0.08), rng.uniform(0.5, 0.62), rng.uniform(-0.46, -0.14))
# A second row here and there, lower, so the ring's outer edge is ragged.
for x, y in frame(HALF_X + 1.12, HALF_Y + 1.12, 1.0, across=13, along=11, turn=3):
    if rng.random() < 0.42 and not (x < -HALF_X and abs(y) < 3.2):
        stub(x + rng.uniform(-0.12, 0.12), y + rng.uniform(-0.12, 0.12), rng.uniform(0.42, 0.56), rng.uniform(-0.66, -0.44))
        foam(x, y, 0.72)
tag(settle(join('causeway', *stubs)), outline=0.045, shadow=False)
foams.extend(band(frame(HALF_X + 0.2, HALF_Y + 0.2, 0.4), frame(HALF_X + 0.92, HALF_Y + 0.92, 0.8, seed=5, rough=0.22)))


# ── Boulders ─────────────────────────────────────────────────────────────────
boulders = [tag(rock('boulder_a', 1.0, 'rim', seed=3, rough=0.22, scale=(1.2, 1.0, 0.8)), outline=0.05),
            tag(rock('boulder_b', 1.0, 'cone', seed=11, rough=0.26, scale=(1.0, 1.25, 0.9)), outline=0.05),
            tag(rock('boulder_c', 1.0, 'rim', seed=23, rough=0.2, scale=(1.3, 1.1, 0.65)), outline=0.05)]
boulder_count = 0


def boulder(x, y, size, kind=0, turn=0.0, sink=0.35, flat=1.0):
    """A boulder standing in the lava at (x, y), `size` metres across, sunk a share of its height."""
    global boulder_count
    boulder_count += 1
    stamp(boulders[kind % 3], 'rock_%d' % boulder_count, (x, y, SEA + size * 0.4 * flat * (1 - 2 * sink)), (0, 0, turn), (size / 2, size / 2, size / 2 * flat))
    foam(x, y, size * 0.5 + 0.18)


# ── The back wall: basalt columns, with lava falling through the gaps ────────
def columns(name, seed, count, reach, low, high):
    """A clump of six-sided columns of different heights, standing on the sea bed."""
    rng = random.Random(seed)
    pieces = []
    for index in range(count):
        angle = rng.uniform(0, math.pi * 2)
        away = reach * math.sqrt(index / count)
        radius = rng.uniform(0.62, 0.9)
        height = low + (high - low) * rng.random() * (1 - 0.5 * away / max(reach, 0.01))
        pieces.append(column('%s_%d' % (name, index), radius, -1.5, height, 'cone' if index % 3 == 0 else 'rim', at=(math.cos(angle) * away, math.sin(angle) * away, 0), turn=rng.choice((0, 30))))
    return tag(settle(join(name, *pieces)), outline=0.05, shadow=False)


clumps = [columns('basalt_a', 5, 7, 1.5, 1.4, 3.6), columns('basalt_b', 9, 6, 1.3, 0.9, 2.6), columns('basalt_c', 17, 8, 1.7, 1.8, 4.4)]
wall = [
    # x, y, which clump, turn, size
    (-10.8, 8.6, 2, 20, 1.1), (-7.6, 9.6, 0, 80, 1.0), (-4.9, 9.4, 1, 10, 1.0), (-1.2, 9.8, 0, 200, 1.0), (1.6, 9.5, 1, 140, 0.95),
    (5.2, 9.7, 0, 300, 1.0), (8.2, 9.3, 2, 100, 1.0), (11.4, 8.6, 0, 30, 1.15), (-13.8, 7.8, 0, 250, 1.2), (14.2, 7.4, 2, 190, 1.15),
    (-9.2, 12.0, 2, 150, 1.3), (-3.0, 12.4, 2, 60, 1.3), (3.4, 12.4, 2, 260, 1.3), (9.6, 12.0, 2, 330, 1.3),
]
for index, (x, y, kind, turn, size) in enumerate(wall):
    stamp(clumps[kind], 'wall_%d' % index, (x, y, SEA), (0, 0, turn), size)
    foam(x, y, 1.9 * size)

# Lava pouring between the columns: a glowing ribbon, a lighter thread sliding down it, and a hot foot.
for index, (x, y, width, height) in enumerate([(-6.2, 9.3, 1.3, 2.6), (3.5, 9.4, 1.1, 2.2), (9.9, 9.0, 1.0, 2.0)]):
    fall = box('lavafall_%d' % index, (width, 0.5, height + 1.5), 'lava', at=(x, y, SEA + (height - 1.5) / 2), rot=(-14, 0, 0), bevel=0.2)
    tag(fall, glow=1.35, outline=0, shadow=False)
    for thread in range(2):
        drop = tag(ball('fall_drop_%d_%d' % (index, thread), 0.22, 'lavaHot', scale=(1.0, 0.6, 1.9)), glow=1.6, outline=0, shadow=False)
        side = (thread - 0.5) * width * 0.45
        top = (x + side, y + 0.12 * (height + 1.5) - 0.36, SEA + height - 0.25)
        foot = (x + side, y - 0.52, SEA + 0.05)
        seconds = 1.1 + 0.35 * thread + 0.2 * index
        key(drop, 'location', [(0, top), (seconds, foot)], linear=True)
        key(drop, 'scale', [(0, (0.3, 0.3, 0.3)), (seconds * 0.25, (1, 1, 1)), (seconds * 0.8, (1, 1, 1)), (seconds, (0.2, 0.2, 0.2))])
    splash = tag(ball('fall_foot_%d' % index, width * 0.7, 'lavaHot', at=(x, y - 0.7, 0.0), scale=(1.2, 0.8, 0.3)), glow=1.5, outline=0, shadow=False)
    throb(splash, 0.22, 0.9 + index * 0.17)
    afloat.append(splash)


# ── The volcano, on the left ─────────────────────────────────────────────────
# A toy of a volcano: three steep tiers with a ledge between them, a fat lip, lava running down the sides
# the camera sees, and smoke.
VOLCANO = (-11.45, -0.8)
TOP = 4.5
# From the lip down to the sea bed: (how far from the middle, how high).
SIDE = [(1.4, TOP - 0.05), (1.5, 4.0), (1.78, 2.3), (2.16, 2.12), (2.46, 0.42), (2.86, 0.24), (3.1, -0.9), (3.6, -2.5)]

cone_body = lathe('volcano_cone', [(0, -2.5)] + list(reversed(SIDE)) + [(1.1, TOP - 0.1), (1.0, TOP - 0.55), (0, TOP - 0.6)], 'cone', sides=9, smooth=10)
lip = ring('volcano_lip', 1.42, 0.3, 'rim', at=(0, 0, TOP), sides=9, around=6)
# A paler band on each ledge, so the tiers can be told apart from above.
ledges = [lathe('volcano_ledge_%d' % index, [(inner, high + 0.04), (outer, low + 0.04), (outer, low - 0.06), (inner, high - 0.06), (inner, high + 0.04)], 'rock', sides=9, smooth=10)
          for index, (inner, high, outer, low) in enumerate([(1.72, 2.33, 2.22, 2.1), (2.4, 0.45, 2.92, 0.22)])]
volcano = group('volcano', tag(join('volcano_body', cone_body, lip, *ledges), outline=0.06, shadow=False), at=(VOLCANO[0], VOLCANO[1], 0))
mouth = tag(cylinder('volcano_mouth', 1.12, 0.3, 'lavaHot', at=(0, 0, TOP - 0.25), sides=9), glow=1.7, outline=0, shadow=False)
mouth.parent = volcano
throb(mouth, 0.05, 1.7)

# Lava running down: a fat glowing rope from the mouth, over the lip and down tier by tier, with a pool at its end.
streams = [(-18, 7, 0.25), (-64, 4, 0.22), (-108, 7, 0.27), (-156, 5, 0.21), (34, 5, 0.22)]
ropes = []
for index, (angle, reach, radius) in enumerate(streams):
    def spot(away, z, step):
        wander = math.radians(angle + math.sin(step * 1.7 + index) * 5)
        return (math.cos(wander) * away, math.sin(wander) * away, z)
    points = [spot(0.95, TOP - 0.15, 0), spot(1.45, TOP + 0.3, 0)]
    for step in range(1, reach):
        (r0, z0), (r1, z1) = SIDE[step], SIDE[min(step + 1, len(SIDE) - 1)]
        points.append(spot(r0 + 0.04, z0, step))
        # Half way down each slope as well, so the rope bends round the ledges instead of cutting them.
        if step < reach - 1:
            points.append(spot((r0 + r1) / 2 + 0.04, (z0 + z1) / 2, step))
    ropes.append(pipe('stream_rope_%d' % index, points, radius, 'lava', sides=7))
    ropes.append(ball('stream_head_%d' % index, radius * 2.0, 'lava', at=points[-1], scale=(1, 1, 0.55)))
    if index in (0, 2, 3):
        # A brighter lump that slides down the rope and is gone at the bottom.
        lump = tag(ball('stream_lump_%d' % index, radius * 1.25, 'lavaHot'), glow=1.6, outline=0, shadow=False)
        lump.parent = volcano
        seconds = 2.2 + index * 0.45
        outward = [(x * 1.05, y * 1.05, z + 0.08) for x, y, z in points[1:]]
        key(lump, 'location', [(seconds * step / (len(outward) - 1), outward[step]) for step in range(len(outward))], linear=True)
        key(lump, 'scale', [(0, (0.2, 0.2, 0.2)), (seconds * 0.2, (1, 1, 1)), (seconds * 0.85, (1, 1, 1)), (seconds, (0.15, 0.15, 0.15))])
tag(settle(join('streams', *ropes)), glow=1.35, outline=0, shadow=False).parent = volcano

# Smoke: three puffs that swell out of the mouth, rise and shrink away, each at its own pace.
for index, (seconds, drift) in enumerate([(3.4, 0.7), (4.3, -0.5), (5.2, 0.2)]):
    lobes = [ball('smoke_%d_%d' % (index, lobe), radius, 'smoke', at=at) for lobe, (radius, at) in enumerate([(0.6, (0, 0, 0)), (0.44, (0.5, 0.1, 0.12)), (0.4, (-0.42, -0.12, 0.2)), (0.36, (0.08, 0.2, 0.46))])]
    puff = tag(join('smoke_%d' % index, *lobes), outline=0.05, shadow=False)
    puff.parent = volcano
    key(puff, 'location', [(0, (0, 0, TOP - 0.3)), (seconds, (drift, 0.5, TOP + 3.2 + index * 0.4))], linear=True)
    key(puff, 'scale', [(0, (0.15, 0.15, 0.15)), (seconds * 0.35, (1.0, 1.0, 1.0)), (seconds * 0.7, (1.15, 1.15, 1.15)), (seconds, (0.05, 0.05, 0.05))])
foam(VOLCANO[0], VOLCANO[1], 3.3)


# ── A dinosaur's bones, half sunk on the right ───────────────────────────────
# The body is built lying along X with its shoulders at +X and Z = 0 at the lava's calm level.
def spine_at(x):
    return 1.15 - 0.075 * (x - 0.3) ** 2


spine = pipe('spine', [(x, 0, spine_at(x)) for x in (-5.2, -4.2, -3.2, -2.2, -1.2, -0.2, 0.8, 1.8, 2.8, 3.6)], 0.2, 'bone', sides=8)
knobs = [box('knob_%d' % index, (0.34, 0.3, 0.5), 'bone', at=(x, 0, spine_at(x) + 0.3), rot=(0, 8 * (x - 0.3), 0), bevel=0.1) for index, x in enumerate((-4.4, -3.6, -2.8, -2.0, -1.2, -0.4, 0.4, 1.2, 2.0, 2.8))]
ribs = []
for index, x in enumerate((-2.0, -1.1, -0.2, 0.7, 1.6)):
    wide = 1.75 - abs(x + 0.2) * 0.22
    ribs.append(pipe('rib_%d' % index, arc((x, -wide, -0.8), (x, wide, -0.8), spine_at(x) + 0.8, steps=8), 0.15, 'bone', sides=6))
tag(place(join('bones', spine, *knobs, *ribs), at=(12.7, 0.6, SEA - 0.05), rot=(0, 0, 113)), outline=0.05, shadow=False)

# The skull, resting on the lava with its nose toward the slab. Built facing +X from the back of the head.
cranium = box('cranium', (1.7, 1.75, 1.3), 'bone', at=(0.85, 0, 1.1), bevel=0.42, segments=3)
snout = box('snout', (2.0, 1.3, 0.85), 'bone', at=(2.5, 0, 0.98), bevel=0.3, segments=3)
brows = [box('brow_%d' % index, (0.8, 0.42, 0.34), 'bone', at=(1.45, side * 0.62, 1.8), rot=(0, 10, side * 18), bevel=0.14) for index, side in enumerate((-1, 1))]
jaw = box('jaw', (2.7, 1.15, 0.36), 'bone', at=(2.05, 0, 0.14), rot=(0, 9, 0), bevel=0.14)
sockets = [ball('socket_%d' % index, 0.37, 'rim', at=(1.72, side * 0.56, 1.36), scale=(0.55, 1.0, 0.9)) for index, side in enumerate((-1, 1))]
nostrils = [ball('nostril_%d' % index, 0.14, 'rim', at=(3.2, side * 0.28, 1.38), scale=(1.2, 0.8, 0.5)) for index, side in enumerate((-1, 1))]
teeth = [cone('tooth_%d' % index, 0.15, 0.42, 'bone', at=at, rot=(180, 0, 0), sides=5)
         for index, at in enumerate([(3.42, -0.42, 0.42), (3.46, -0.14, 0.42), (3.46, 0.14, 0.42), (3.42, 0.42, 0.42), (2.9, -0.6, 0.42), (2.4, -0.6, 0.42), (2.9, 0.6, 0.42), (2.4, 0.6, 0.42)])]
tag(place(settle(join('skull', cranium, snout, jaw, *brows, *sockets, *nostrils, *teeth)), at=(11.5, 4.1, SEA - 0.3), rot=(0, -10, 214), scale=0.92), outline=0.05, shadow=False)
foam(10.4, 3.35, 1.75)


# ── Obsidian: sharp dark crystals in clumps ──────────────────────────────────
def shards(name, seed, count, tall):
    rng = random.Random(seed)
    pieces = []
    for index in range(count):
        height = tall * (1.0 if index == 0 else rng.uniform(0.45, 0.8))
        angle = rng.uniform(0, math.pi * 2)
        away = 0 if index == 0 else rng.uniform(0.45, 0.8)
        pieces.append(cone('%s_%d' % (name, index), 0.3 + height * 0.14, height + 1.0, 'obsidian',
                           at=(math.cos(angle) * away, math.sin(angle) * away, (height - 1.0) / 2),
                           rot=(0 if index == 0 else math.degrees(math.sin(angle)) * -0.3, 0 if index == 0 else math.degrees(math.cos(angle)) * 0.3, rng.uniform(0, 72)), sides=5, smooth=20))
    return tag(settle(join(name, *pieces)), outline=0.05, shadow=False)


crystal_a = shards('crystal_a', 4, 5, 2.6)
crystal_b = shards('crystal_b', 8, 4, 1.5)
for index, (x, y, kind, turn, size) in enumerate([(9.6, 7.0, 0, 0, 0.9), (-9.5, -5.6, 1, 40, 1.0), (13.6, -4.8, 0, 120, 0.9), (-9.3, 6.9, 1, 200, 1.1), (9.4, -7.9, 1, 300, 0.55), (-6.0, -8.6, 1, 90, 0.5)]):
    stamp(crystal_a if kind == 0 else crystal_b, 'crystals_%d' % index, (x, y, SEA), (0, 0, turn), size)
    foam(x, y, (1.15 if kind == 0 else 1.0) * size + 0.15)


# ── Boulders round the rest of the crater: big at the sides, low at the front ─
for x, y, size, kind, turn, sink, flat in [
    # The right, round the bones.
    (15.6, 4.6, 3.4, 0, 30, 0.3, 1.0), (15.8, -1.6, 2.6, 1, 100, 0.3, 1.0), (13.0, 6.6, 2.2, 2, 10, 0.3, 1.0), (10.2, -3.2, 1.5, 1, 20, 0.35, 0.8),
    # The left, at the volcano's feet.
    (-9.3, 2.9, 1.4, 1, 60, 0.3, 0.9), (-14.8, -4.6, 3.0, 2, 80, 0.3, 1.0), (-11.6, -5.9, 2.0, 1, 310, 0.35, 0.8), (-15.4, 3.4, 3.2, 0, 150, 0.3, 1.0),
    # The front: flat stones barely out of the lava, so they hide nobody.
    (-3.4, -9.0, 2.0, 2, 20, 0.5, 0.55), (0.9, -9.7, 1.5, 0, 170, 0.5, 0.5), (4.6, -8.9, 2.2, 2, 250, 0.5, 0.5), (11.8, -7.4, 2.4, 0, 70, 0.45, 0.6), (-9.6, -9.0, 1.7, 1, 130, 0.5, 0.55),
]:
    boulder(x, y, size, kind, turn, sink, flat)


# ── On the lava ──────────────────────────────────────────────────────────────
# Rafts of cooled crust, each bobbing at its own pace on a bright edge.
for index, (x, y, size, seed) in enumerate([(-9.2, 5.0, 0.8, 1), (9.4, -0.6, 0.75, 2), (12.4, -4.0, 1.1, 3), (7.2, -8.6, 0.8, 5), (-12.4, -8.2, 1.2, 6)]):
    outline = blob(size, 9, seed, 0.26, (1.25, 0.9))
    foams.append(turned(grown(outline, 0.14), x, y, seed * 50))
    raft = tag(slab('raft_%d' % index, outline, 0.26, 'crust', at=(x, y, 0.05), rot=(0, 0, seed * 50), bevel=0.09), outline=0.04, shadow=False)
    bob(raft, 0.09, 2.4 + (index % 4) * 0.5)
    afloat.append(raft)

# Slivers of brighter lava that the game turns slowly round the slab.
swirl = tag(sheet('swirl', [streak(radius, start, sweep, width) for radius, start, sweep, width in [
    (10.4, 10, 22, 0.4), (11.6, 95, 18, 0.5), (10.9, 170, 24, 0.4), (12.6, 240, 18, 0.55), (11.2, 300, 20, 0.45),
    (14.4, 40, 14, 0.6), (15.2, 140, 13, 0.6), (14.0, 210, 15, 0.5), (15.6, 330, 14, 0.6)]], 'lavaHot', at=(0, 0, 0.03)), glow=1.12, outline=0, shadow=False)
afloat.append(swirl)
afloat.append(tag(sheet('foam', foams, 'lavaHot', at=(0, 0, 0.02)), glow=1.12, outline=0, shadow=False))

group('afloat', *afloat, at=(0, 0, SEA))


# ── Templates the game places itself ─────────────────────────────────────────
# The rocks to stand on. Their flat top is 0.3 above the floor and 0.625 across from the middle (the game
# scales them from its own numbers), dark on a pale floor, and nothing else about them looks like footing.
def stone(name, seed, sides):
    outline = blob(0.71, sides, seed, 0.06)
    body = prism('%s_body' % name, outline, -0.6, 0.24, 'rockSide', taper=0.9, bevel=0.07)
    top = prism('%s_top' % name, [(x * 0.9, y * 0.9) for x, y in outline], 0.2, 0.3, 'rock', taper=0.97, bevel=0.04)
    return part(tag(join(name, body, top), outline=0.045))


stone('stone_a', 2, 8)
stone('stone_b', 6, 6)
stone('stone_c', 13, 7)

# A spout of lava: the game shoots one up out of the sea, well away from the slab, and lets it drop.
part(tag(lathe('spout', [(0, -0.2), (0.34, -0.2), (0.4, 0.4), (0.27, 1.0), (0.36, 1.5), (0.24, 1.85), (0, 2.0)], 'lavaHot', sides=9, smooth=70), glow=1.4, outline=0, shadow=False))

# A bubble of lava: the game swells one up out of the sea and bursts it.
part(tag(ball('bubble', 0.5, 'lavaHot', scale=(1, 1, 0.8)), glow=1.5, outline=0, shadow=False))
