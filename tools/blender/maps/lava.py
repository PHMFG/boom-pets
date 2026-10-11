# O Chão é Lava: a slab of pale stone in the mouth of a volcano. The slab is the game's own tiles (14 by 12,
# top at Z = 0); this is everything round it. The lava lies at Z = -0.75 while it is calm and climbs over the
# floor in a flood, so whatever stands in it is built from well below that.
#
# Three cameras look at it, all from the front:
#   - in a round, from 52 degrees up, framing the pets: it sees the slab, two or three metres to each side
#     and four or five beyond the back edge, and nothing higher than about 3 m there;
#   - while the game's card is up, from far and low (27 degrees): the card covers the slab, and the back
#     corners show at its top left and top right;
#   - as a round ends, from the winner's eye level (30 degrees, 13 m away): behind the winner is the back wall.
# None of them ever sees the horizon, or more than about 24 m past the middle. So the two signature pieces,
# the volcano and the dinosaur, stand at the back corners, small and close; the wall between them is read
# by its feet, not its tops; and the front stays below the floor.
#
# The place is lived in. Spectators stand on flat-topped columns at the back and the sides (`perches`),
# never at the front, where they could be taken for players. A current runs along the strip of open lava
# behind the slab, and small creatures of the lava come up to watch. The game moves all of that: this
# script only builds the pieces and says where the perches and the open lava are.
import math
import random

import kit
from kit import *

HALF_X = 7.0
HALF_Y = 6.0
SEA = -0.75
# How bright the lava's own colour is drawn where it is hottest near the floor (bubbles, spouts, the falls' feet):
# a lighter orange. Yellow is the colour of a player, and is kept for small things far from the floor.
HOT = 2.2

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
    """Bakes where a piece stands, how it is turned and its size into its shape, so that its origin is the scene's."""
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix.Identity(4)
    return obj


def pivot(obj, at):
    """
    Moves a piece's origin to `at` without moving the piece. The game brings a map's scenery in from the middle
    outward, by where each piece's origin is: a piece joined from many would otherwise arrive by its first one.
    """
    settle(obj)
    obj.data.transform(Matrix.Translation(-Vector(at)))
    obj.location = at
    return obj


def grown(outline, by):
    """An outline pushed outward from the middle by `by` metres."""
    return [(x + x / math.hypot(x, y) * by, y + y / math.hypot(x, y) * by) for x, y in outline]


# Everything in here rides on the lava: the game moves it up and down with the lava's level.
afloat = []
# The line round whatever stands in the lava, a deeper red than the lava itself: one flat piece, made of a disc
# under each thing. (It was amber once, which is the yellow player's colour.)
foams = []
# Where something stands in the lava, as (x, y, radius): the lava never bubbles or spits up through one of these.
solid = []
# Where a spectator may stand, as (x, y, z): the flat tops of columns built for it.
perches = []


def foam(x, y, radius):
    foams.append(disc(x, y, radius, len(foams) * 0.3))
    solid.append((x, y, radius))


# Where the two signature pieces stand: the volcano's middle, and the back of the dinosaur's head with the way it faces.
VOLCANO = (-9.9, 6.0)
HEAD = (10.6, 7.6)
FACING = 228
NOSE = (HEAD[0] + math.cos(math.radians(FACING)) * 3.2, HEAD[1] + math.sin(math.radians(FACING)) * 3.2)
# And the spectators' stands beside the slab, one each side, close enough to be in most pictures of a round:
# x, y and which side is away from the slab.
SIDE_STANDS = [(-9.2, 0.4, -1), (9.2, 1.6, 1)]


# ── The slab's feet ──────────────────────────────────────────────────────────
# A ring of six-sided basalt stubs the pale slab stands in, every top below the floor. The lava climbs over
# them during the alarm, so how many still show is how long there is left.
rng = random.Random(21)
stubs = []


def stub(x, y, radius, top):
    stubs.append(column('stub_%d' % len(stubs), radius, -1.6, top, 'cone' if len(stubs) % 3 == 0 else 'rim', at=(x, y, 0), turn=rng.choice((0, 30)) + rng.uniform(-6, 6), chamfer=0))


for x, y in frame(HALF_X + 0.42, HALF_Y + 0.42, 0.5, turn=2):
    # The volcano's foot covers the corner it stands at.
    if math.hypot(x - VOLCANO[0], y - VOLCANO[1]) > 2.75:
        stub(x + rng.uniform(-0.08, 0.08), y + rng.uniform(-0.08, 0.08), rng.uniform(0.5, 0.62), rng.uniform(-0.46, -0.14))
# A second row here and there, lower, so the ring's outer edge is ragged. None where the volcano's foot, the skull's
# nose and the stands are, and none along the back, where the current runs.
for x, y in frame(HALF_X + 1.12, HALF_Y + 1.12, 1.0, across=13, along=11, turn=3):
    taken = math.hypot(x - VOLCANO[0], y - VOLCANO[1]) < 3.3 or math.hypot(x - NOSE[0], y - NOSE[1]) < 1.9 or y > HALF_Y + 0.5 \
        or any(math.hypot(x - stand_x, y - stand_y - 0.8) < 2.1 for stand_x, stand_y, _ in SIDE_STANDS)
    if rng.random() < 0.42 and not taken:
        stub(x + rng.uniform(-0.12, 0.12), y + rng.uniform(-0.12, 0.12), rng.uniform(0.42, 0.56), rng.uniform(-0.66, -0.44))
        foam(x, y, 0.72)
tag(settle(join('causeway', *stubs)), outline=0.045, shadow=False)
foams.extend(band(frame(HALF_X + 0.2, HALF_Y + 0.2, 0.4), frame(HALF_X + 0.92, HALF_Y + 0.92, 0.8, seed=5, rough=0.22)))


# ── The back wall: basalt columns, with lava falling through two gaps ────────
# Three rows, each farther back and taller than the one before: from above their tops step up like seats, and
# from low down the front row's tops are what is seen behind a winner. It stops short of the volcano on the
# left, which is then seen against lava, and runs on behind the dinosaur's shoulders on the right.
FALLS = [(-2.9, 10.25, 1.5, 2.3), (4.3, 10.3, 1.3, 2.0)]
# Five of its columns are wide, flat on top and no taller than a step of a grandstand: the spectators' places.
# Each has a flat face toward the camera, with a crack of lava down it. (x, y, how high its top is)
STANDS = [(-4.9, 9.6, 0.9), (0.6, 9.55, 1.1), (6.2, 9.6, 0.8), (-6.6, 10.9, 1.9), (2.5, 11.0, 2.0)]
rng = random.Random(31)
pillars = []
cracks = []
for index, (x, y, top) in enumerate(STANDS):
    pillars.append(column('stand_%d' % index, 0.98, -1.5, top - SEA, 'cone', at=(x, y, SEA), chamfer=0.1))
    foam(x, y, 1.4)
    perches.append((x, y, top))
    face = y - 0.98 * math.cos(math.radians(30)) - 0.02
    for step, (aside, lean) in enumerate([(0.12, 22), (-0.05, -26), (0.14, 18)]):
        cracks.append(box('crack_%d_%d' % (index, step), (0.13, 0.06, 0.52), 'lava', at=(x + aside + (index % 2) * 0.2 - 0.1, face, top - 0.34 - step * 0.43), rot=(0, lean, 0), bevel=0))
for row, (y, low, high, left, right) in enumerate([(9.75, 0.7, 1.9, -6.0, 8.3), (11.05, 1.9, 3.3, -6.3, 10.2), (12.5, 3.0, 5.2, -6.0, 11.6)]):
    x = left
    while x < right:
        radius = rng.uniform(0.68, 0.98)
        # The falls come down between the first two rows: no column stands in their way, and none crowds a stand.
        blocked = row < 2 and any(abs(x - fall_x) < width / 2 + radius * 0.75 for fall_x, _, width, _ in FALLS)
        crowding = any(math.hypot(x - stand_x, y - stand_y) < 1.75 for stand_x, stand_y, _ in STANDS)
        if not blocked and not crowding:
            pillars.append(column('pillar_%d' % len(pillars), radius, -1.5, rng.uniform(low, high) - SEA, 'cone' if len(pillars) % 3 == 0 else 'rim',
                                  at=(x, y + rng.uniform(-0.3, 0.3), SEA), turn=rng.choice((0, 30)) + rng.uniform(-5, 5)))
            foam(x, y, radius + 0.42)
        x += radius * rng.uniform(1.55, 1.8)
tag(pivot(join('wall', *pillars), (0, 11, 0)), outline=0.05, shadow=False)
# The cracks glow, and the game makes them glow harder as the alarm climbs.
tag(pivot(join('cracks', *cracks), (0, 10, 0)), glow=1.35, outline=0, shadow=False)

# Lava pouring through: a fat tongue that comes out between the rows, rolls over an edge and drops into the sea,
# with brighter drops sliding down its face and a hot foot. From low down its top is seen, so it has one.
# The drops are small and far from the floor, so they may be yellow; the foot is the lighter orange.
ribbons = []
for index, (x, y, width, height) in enumerate(FALLS):
    top = SEA + height
    # Seen from the side: back between the columns, forward to the edge, over it and down. It is drawn round and then made wide.
    course = [(0, 1.9, top - 0.1), (0, 0.6, top), (0, 0.1, top - 0.12), (0, -0.2, top - 0.6), (0, -0.34, SEA + height * 0.45), (0, -0.42, SEA - 0.4)]
    ribbons.append(settle(place(pipe('fall_%d' % index, course, 0.32, 'lava', sides=8), at=(x, y, 0), scale=(width / 0.64, 1, 1))))
    # A fat drop and a thin one, at different paces: two alike, side by side, look like a pair of eyes.
    for thread, (size, side) in enumerate([(0.27, -0.2), (0.16, 0.27)]):
        drop = tag(ball('fall_drop_%d_%d' % (index, thread), size, 'lavaHot', scale=(1.0, 0.6, 1.9)), glow=1.6, outline=0, shadow=False)
        side *= width
        seconds = 1.0 + 0.55 * thread + 0.2 * index
        key(drop, 'location', [(0, (x + side, y - 0.5, top - 0.5)), (seconds, (x + side, y - 0.72, SEA + 0.05))], linear=True)
        key(drop, 'scale', [(0, (0.3, 0.3, 0.3)), (seconds * 0.25, (1, 1, 1)), (seconds * 0.8, (1, 1, 1)), (seconds, (0.2, 0.2, 0.2))])
    splash = tag(ball('fall_foot_%d' % index, width * 0.55, 'lava', at=(x, y - 0.7, 0.0), scale=(1.2, 0.8, 0.3)), glow=HOT, outline=0, shadow=False)
    solid.append((x, y - 0.7, width * 0.7))
    throb(splash, 0.22, 0.9 + index * 0.17)
    afloat.append(splash)
tag(pivot(join('lavafalls', *ribbons), (0, 10.3, 0)), glow=1.35, outline=0, shadow=False)


# ── The volcano, beside the back left corner ─────────────────────────────────
# A toy of a volcano, small enough that the round's camera has its mouth in the picture: three steep tiers
# with a ledge between them, a fat lip, lava running down the sides the cameras see, and smoke.
TOP = 2.5
# From the lip down to the sea bed: (how far from the middle, how high).
SIDE = [(0.98, TOP - 0.04), (1.06, 2.2), (1.3, 1.25), (1.62, 1.12), (1.84, 0.12), (2.16, 0.0), (2.34, -0.85), (2.7, -2.2)]

cone_body = lathe('volcano_cone', [(0, -2.2)] + list(reversed(SIDE)) + [(0.78, TOP - 0.08), (0.7, TOP - 0.45), (0, TOP - 0.5)], 'cone', sides=9, smooth=10)
lip = ring('volcano_lip', 1.0, 0.24, 'rim', at=(0, 0, TOP), sides=9, around=6)
# A paler band on each ledge, so the tiers can be told apart from above.
ledges = [lathe('volcano_ledge_%d' % index, [(inner, high + 0.04), (outer, low + 0.04), (outer, low - 0.06), (inner, high - 0.06), (inner, high + 0.04)], 'rock', sides=9, smooth=10)
          for index, (inner, high, outer, low) in enumerate([(1.26, 1.28, 1.66, 1.1), (1.8, 0.15, 2.2, -0.02)])]
volcano = group('volcano', tag(join('volcano_body', cone_body, lip, *ledges), outline=0.06, shadow=False), at=(VOLCANO[0], VOLCANO[1], 0))
mouth = tag(cylinder('volcano_mouth', 0.8, 0.3, 'lavaHot', at=(0, 0, TOP - 0.2), sides=9), glow=1.7, outline=0, shadow=False)
mouth.parent = volcano
throb(mouth, 0.05, 1.7)

# Lava running down: a fat glowing rope from the mouth, over the lip and down tier by tier, with a pool at its end.
streams = [(-20, 7, 0.21), (-64, 4, 0.19), (-106, 7, 0.23), (-152, 5, 0.18), (32, 5, 0.19)]
ropes = []
for index, (angle, reach, radius) in enumerate(streams):
    def spot(away, z, step):
        wander = math.radians(angle + math.sin(step * 1.7 + index) * 5)
        return (math.cos(wander) * away, math.sin(wander) * away, z)
    points = [spot(0.66, TOP - 0.12, 0), spot(1.02, TOP + 0.24, 0)]
    for step in range(1, reach):
        (r0, z0), (r1, z1) = SIDE[step], SIDE[min(step + 1, len(SIDE) - 1)]
        points.append(spot(r0 + 0.04, z0, step))
        # Half way down each slope as well, so the rope bends round the ledges instead of cutting them.
        if step < reach - 1:
            points.append(spot((r0 + r1) / 2 + 0.04, (z0 + z1) / 2, step))
    ropes.append(pipe('stream_rope_%d' % index, points, radius, 'lava', sides=7))
    ropes.append(ball('stream_head_%d' % index, radius * 2.0, 'lava', at=points[-1], scale=(1, 1, 0.55)))
    if index in (0, 2):
        # A brighter lump that slides down the rope and is gone at the bottom.
        lump = tag(ball('stream_lump_%d' % index, radius * 1.3, 'lavaHot'), glow=1.6, outline=0, shadow=False)
        lump.parent = volcano
        seconds = 2.2 + index * 0.45
        outward = [(x * 1.05, y * 1.05, z + 0.08) for x, y, z in points[1:]]
        key(lump, 'location', [(seconds * step / (len(outward) - 1), outward[step]) for step in range(len(outward))], linear=True)
        key(lump, 'scale', [(0, (0.2, 0.2, 0.2)), (seconds * 0.2, (1, 1, 1)), (seconds * 0.85, (1, 1, 1)), (seconds, (0.15, 0.15, 0.15))])
tag(settle(join('streams', *ropes)), glow=1.35, outline=0, shadow=False).parent = volcano

# Smoke: three puffs that swell out of the mouth, rise and shrink away, each at its own pace.
for index, (seconds, drift) in enumerate([(3.4, 0.6), (4.3, -0.45), (5.2, 0.2)]):
    lobes = [ball('smoke_%d_%d' % (index, lobe), radius, 'smoke', at=at) for lobe, (radius, at) in enumerate([(0.5, (0, 0, 0)), (0.37, (0.42, 0.08, 0.1)), (0.34, (-0.35, -0.1, 0.17)), (0.3, (0.07, 0.17, 0.38))])]
    puff = tag(join('smoke_%d' % index, *lobes), outline=0.05, shadow=False)
    puff.parent = volcano
    key(puff, 'location', [(0, (0, 0, TOP - 0.3)), (seconds, (drift, 0.45, TOP + 2.7 + index * 0.35))], linear=True)
    key(puff, 'scale', [(0, (0.15, 0.15, 0.15)), (seconds * 0.35, (1.0, 1.0, 1.0)), (seconds * 0.7, (1.15, 1.15, 1.15)), (seconds, (0.05, 0.05, 0.05))])
foam(VOLCANO[0], VOLCANO[1], 2.72)


# ── A dinosaur's bones, beside the back right corner ─────────────────────────
# Its skull rests on the lava with its nose toward the slab, and its spine curls away behind it and sinks.
# Heights here are over the lava's calm level.
CURL = 3.9
NECK = 145
TAIL = 35
neck = (HEAD[0] - math.cos(math.radians(FACING)) * 0.3, HEAD[1] - math.sin(math.radians(FACING)) * 0.3)
heart = (neck[0] - math.cos(math.radians(NECK)) * CURL, neck[1] - math.sin(math.radians(NECK)) * CURL)


def spine_at(t, away=0.0):
    """The spot a share `t` of the way from the neck to the tail, `away` metres outside the curl, and how high the spine is there."""
    angle = math.radians(NECK + (TAIL - NECK) * t)
    return (heart[0] + math.cos(angle) * (CURL + away), heart[1] + math.sin(angle) * (CURL + away), 1.25 - 3.8 * (t - 0.25) ** 2)


spine = pipe('spine', [spine_at(step / 11) for step in range(12)], 0.2, 'bone', sides=8)
solid.extend((spine_at(step / 11)[0], spine_at(step / 11)[1], 0.5) for step in range(12))
knobs = []
for index in range(10):
    t = 0.05 + index * 0.092
    x, y, z = spine_at(t)
    knobs.append(box('knob_%d' % index, (0.34, 0.3, 0.5), 'bone', at=(x, y, z + 0.3), rot=(0, 0, NECK + (TAIL - NECK) * t - 90), bevel=0.1))
ribs = []
for index, t in enumerate((0.2, 0.31, 0.42, 0.53, 0.64)):
    wide = 1.75 - abs(t - 0.4) * 1.4
    inner, outer = spine_at(t, -wide), spine_at(t, wide)
    ribs.append(pipe('rib_%d' % index, arc((inner[0], inner[1], -0.8), (outer[0], outer[1], -0.8), spine_at(t)[2] + 0.8, steps=8), 0.15, 'bone', sides=6))
    foam(outer[0], outer[1], 0.42)
    foam(inner[0], inner[1], 0.38)
bones = place(join('bones', spine, *knobs, *ribs), at=(0, 0, SEA - 0.05))

# The skull is built facing +X from the back of the head, in two pieces: the jaw lies in the lava, and the rest
# of the head is hinged on it at the back, so the game can make it clatter.
HINGE = (0.3, 0, 0.5)
cranium = box('cranium', (1.7, 1.75, 1.3), 'bone', at=(0.85, 0, 1.1), bevel=0.42, segments=3)
snout = box('snout', (2.0, 1.3, 0.85), 'bone', at=(2.5, 0, 0.98), bevel=0.3, segments=3)
brows = [box('brow_%d' % index, (0.8, 0.42, 0.34), 'bone', at=(1.45, side * 0.62, 1.8), rot=(0, 10, side * 18), bevel=0.14) for index, side in enumerate((-1, 1))]
sockets = [ball('socket_%d' % index, 0.37, 'rim', at=(1.72, side * 0.56, 1.36), scale=(0.55, 1.0, 0.9)) for index, side in enumerate((-1, 1))]
nostrils = [ball('nostril_%d' % index, 0.14, 'rim', at=(3.2, side * 0.28, 1.38), scale=(1.2, 0.8, 0.5)) for index, side in enumerate((-1, 1))]
teeth = [cone('tooth_%d' % index, 0.15, 0.42, 'bone', at=at, rot=(180, 0, 0), sides=5)
         for index, at in enumerate([(3.42, -0.42, 0.42), (3.46, -0.14, 0.42), (3.46, 0.14, 0.42), (3.42, 0.42, 0.42), (2.9, -0.6, 0.42), (2.4, -0.6, 0.42), (2.9, 0.6, 0.42), (2.4, 0.6, 0.42)])]
head = pivot(join('skull_top', cranium, snout, *brows, *sockets, *nostrils, *teeth), HINGE)
jaw = box('jaw', (2.7, 1.15, 0.36), 'bone', at=(2.05, 0, 0.14), rot=(0, 9, 0), bevel=0.14)
lower = [cone('lower_tooth_%d' % index, 0.13, 0.3, 'bone', at=(3.05, side * 0.3, 0.2), sides=5) for index, side in enumerate((-1, 1))]
skull = group('skull', head, settle(join('skull_jaw', jaw, *lower)), at=(HEAD[0], HEAD[1], SEA - 0.12), rot=(0, -10, FACING))
tag(place(skull, scale=0.92), outline=0.05, shadow=False)
tag(pivot(bones, (HEAD[0] + 2, HEAD[1], 0)), outline=0.05, shadow=False)
foam((HEAD[0] + NOSE[0]) / 2, (HEAD[1] + NOSE[1]) / 2, 1.7)


# ── Boulders and obsidian round the rest of the crater ───────────────────────
# Big at the sides, flat at the front where anything tall would hide a pet. Each side is one piece.
def boulder(x, y, size, seed, turn=0.0, sink=0.3, flat=1.0):
    """A boulder standing in the lava at (x, y), `size` metres across, sunk a share of its height."""
    shape = [(1.2, 1.0, 0.8), (1.0, 1.25, 0.9), (1.3, 1.1, 0.65)][seed % 3]
    foam(x, y, size * 0.5 + 0.18)
    # A boulder is lumpy, and reaches farther than the line round it.
    solid.append((x, y, size * 0.7))
    return rock('boulder_%d' % seed, size / 2, 'cone' if seed % 3 == 1 else 'rim', at=(x, y, SEA + size * 0.4 * flat * (1 - 2 * sink)), seed=seed * 7 + 3, rough=0.23,
                scale=(shape[0], shape[1], shape[2] * flat), rot=(0, 0, turn))


def shards(x, y, seed, count, tall):
    """A clump of sharp dark crystals: the tallest in the middle, the others leaning away from it."""
    rng = random.Random(seed)
    pieces = []
    for index in range(count):
        height = tall * (1.0 if index == 0 else rng.uniform(0.45, 0.8))
        angle = rng.uniform(0, math.pi * 2)
        away = 0 if index == 0 else rng.uniform(0.45, 0.8) * (0.5 + tall * 0.2)
        pieces.append(cone('shard_%d_%d' % (seed, index), 0.3 + height * 0.14, height + 1.0, 'obsidian',
                           at=(x + math.cos(angle) * away, y + math.sin(angle) * away, SEA + (height - 1.0) / 2),
                           rot=(0 if index == 0 else math.degrees(math.sin(angle)) * -0.3, 0 if index == 0 else math.degrees(math.cos(angle)) * 0.3, rng.uniform(0, 72)), sides=5, smooth=20))
    foam(x, y, 0.75 + tall * 0.28)
    return pieces


def stand(x, y, out, tops):
    """
    A clump of three flat columns beside the slab, with room on the first two for a spectator each. `out` is the
    side away from the slab, -1 or 1.
    """
    pieces = []
    for index, (aside, back, radius, top) in enumerate([(0, 0, 0.9, tops[0]), (1.15 * out, 0.75, 0.8, tops[1]), (-0.5 * out, 1.25, 0.62, tops[0] + 0.55)]):
        pieces.append(column('side_stand_%d_%d' % (len(perches), index), radius, -1.5, top - SEA, 'cone', at=(x + aside, y + back, SEA), chamfer=0.1))
        foam(x + aside, y + back, radius + 0.4)
        if index < 2:
            perches.append((x + aside, y + back, top))
    return pieces


west = [
    boulder(-14.3, 3.2, 2.8, 1, 150), *stand(*SIDE_STANDS[0], (0.75, 0.4)), boulder(-12.7, -1.6, 3.0, 3, 80), boulder(-10.0, -3.6, 1.5, 4, 200, flat=0.85),
    boulder(-14.3, -5.7, 2.8, 5, 310), boulder(-9.4, -9.2, 1.7, 6, 130, sink=0.5, flat=0.55), boulder(-3.4, -9.0, 2.0, 7, 20, sink=0.5, flat=0.55),
    *shards(-13.3, 10.3, 4, 5, 2.4), *shards(-9.6, -6.1, 8, 4, 1.3), *shards(-6.0, -8.7, 12, 3, 0.75),
]
tag(pivot(join('rocks_west', *west), (-12, 0, 0)), outline=0.05, shadow=False)
east = [
    *stand(*SIDE_STANDS[1], (0.7, 0.45)), boulder(13.3, 0.6, 2.4, 8, 30), boulder(16.4, 3.2, 3.0, 9, 100), boulder(10.4, -1.4, 1.5, 10, 20, flat=0.85), boulder(13.7, -3.5, 2.6, 11, 250),
    boulder(16.2, -0.6, 2.2, 12, 70), boulder(11.4, -7.8, 2.4, 13, 70, sink=0.45, flat=0.6), boulder(4.6, -8.9, 2.2, 14, 250, sink=0.5, flat=0.5), boulder(0.9, -9.7, 1.5, 15, 170, sink=0.5, flat=0.5),
    *shards(13.7, 6.0, 5, 5, 2.1), *shards(9.2, -8.0, 13, 3, 0.8),
]
tag(pivot(join('rocks_east', *east), (12, 0, 0)), outline=0.05, shadow=False)


# ── On the lava ──────────────────────────────────────────────────────────────
# Rafts of cooled crust, each bobbing at its own pace on a darker edge.
for index, (x, y, size, seed) in enumerate([(-9.7, -3.0, 0.7, 1), (11.0, -5.0, 1.0, 3), (7.4, -8.7, 0.8, 5), (-11.9, -8.2, 1.2, 6)]):
    outline = blob(size, 9, seed, 0.26, (1.25, 0.9))
    foams.append(turned(grown(outline, 0.14), x, y, seed * 50))
    solid.append((x, y, size * 1.3))
    raft = tag(slab('raft_%d' % index, outline, 0.26, 'crust', at=(x, y, 0.05), rot=(0, 0, seed * 50), bevel=0.09), outline=0.04, shadow=False)
    bob(raft, 0.09, 2.4 + (index % 4) * 0.5)
    afloat.append(raft)

# Slivers of deeper lava that the game turns slowly round the slab.
swirl = tag(sheet('swirl', [streak(radius, start, sweep, width) for radius, start, sweep, width in [
    (10.4, 10, 22, 0.4), (11.6, 95, 18, 0.5), (10.9, 170, 24, 0.4), (12.6, 240, 18, 0.55), (11.2, 300, 20, 0.45),
    (14.4, 40, 14, 0.6), (15.2, 140, 13, 0.6), (14.0, 210, 15, 0.5), (15.6, 330, 14, 0.6)]], 'lavaDeep', at=(0, 0, 0.03)), glow=1.0, outline=0, shadow=False)
afloat.append(swirl)

# The current: slivers of deeper lava along the strip of open lava behind the slab, the same every 3 m, so the
# game can slide them along for ever (it moves them less than one step and starts again). Their ends are under
# the volcano's foot and the dinosaur's head.
STEP = 3.0
slivers = []
for index in range(8):
    for y, shift, length in ((7.5, 0.0, 1.5), (8.02, 1.5, 1.2)):
        x = -11.0 + index * STEP + shift
        slivers.append([(x - length / 2, y), (x, y - 0.08), (x + length / 2, y), (x, y + 0.08)])
afloat.append(tag(sheet('current', slivers, 'lavaDeep', at=(0, 0, 0.03)), glow=1.0, outline=0, shadow=False))
afloat.append(tag(sheet('foam', foams, 'lavaDeep', at=(0, 0, 0.02)), glow=1.0, outline=0, shadow=False))

group('afloat', *afloat, at=(0, 0, SEA))


# ── Where the lava may bubble and spit ───────────────────────────────────────
# Open spots round the slab, clear of everything that stands in the lava, for the game to pick from. They are
# handed over as numbers on one empty object: x, y and how far from the slab's edge, three for each spot.
# (Y is this script's: away from the camera. The game's z is the other way round.)
rng = random.Random(77)
vents = []
for attempt in range(20000):
    x, y = rng.uniform(-13.5, 13.5), rng.uniform(-10.0, 9.0)
    off = max(abs(x) - HALF_X, abs(y) - HALF_Y)
    crowded = any(math.hypot(x - other_x, y - other_y) < radius + 0.6 for other_x, other_y, radius in solid) or any(math.hypot(x - vent_x, y - vent_y) < 0.9 for vent_x, vent_y, _ in vents)
    if 1.5 <= off <= 6.0 and not crowded:
        vents.append((round(x, 2), round(y, 2), round(off, 2)))
group('vents')['spots'] = [number for vent in vents for number in vent]
# And where the spectators stand, the same way: x, y and the height of each perch.
group('perches')['spots'] = [round(number, 2) for perch in perches for number in perch]


# ── Templates the game places itself ─────────────────────────────────────────
# The furniture that falls from the sky. The part of each a pet is safe on (`tuning.lava.pieces`) is the seat
# itself, drawn a little wider: a pet that looks on it is on it. Each is built round the middle of its seat, with its back (where it has one)
# toward the back of the map; the game turns some a quarter. Wood and teal, dark on a pale floor, and no
# colour a player wears.
# The top a pet stands on: `lava.height` in the game's tuning. High enough that the piece's side shows, from
# above, under the ring of whoever stands on it. Every piece was first drawn 0.3 high and is lifted by RAISE on a
# taller base, so its proportions above the seat are as they were.
TOP = 0.7
RAISE = TOP - 0.3


# Every piece is built at the size it was first drawn and then widened by this, without getting taller: the
# floor grew, and the furniture with it.
WIDER = 1.2


def furniture(name, *pieces):
    whole = settle(join(name, *pieces))
    whole.data.transform(Matrix.Diagonal((WIDER, WIDER, 1, 1)))
    return part(tag(whole, outline=0.045))


def base(name, size, color, at=(0, 0), bevel=0.06):
    """What a piece stands on: a block from the floor up, as tall as it was plus RAISE."""
    return box(name, (size[0], size[1], size[2] + RAISE), color, at=(at[0], at[1], (size[2] + RAISE) / 2), bevel=bevel)


# A pouf: one seat, round.
furniture(
    'pouf',
    lathe('pouf_body', [(0, 0), (0.5, 0), (0.64, 0.08), (0.66, TOP - 0.1), (0.6, TOP), (0, TOP)], 'cushion', sides=14, smooth=60),
    lathe('pouf_band', [(0.655, 0.26), (0.7, 0.26), (0.7, 0.4), (0.655, 0.4)], 'cushionLight', sides=14),
    ball('pouf_button', 0.1, 'cushionLight', at=(0, 0, TOP), scale=(1, 1, 0.45)),
)

# An armchair: one seat, between two low arms and under a fat back.
furniture(
    'armchair',
    base('armchair_base', (1.42, 1.3, 0.18), 'woodDark', at=(0, 0.06)),
    box('armchair_seat', (1.16, 1.08, 0.14), 'cushion', at=(0, -0.04, 0.23 + RAISE), bevel=0.06),
    box('armchair_back', (1.42, 0.34, 0.92), 'cushion', at=(0, 0.62, 0.56 + RAISE), bevel=0.14, segments=3),
    box('armchair_arm_l', (0.26, 1.02, 0.34), 'cushionLight', at=(-0.62, 0.0, 0.3 + RAISE), bevel=0.11, segments=3),
    box('armchair_arm_r', (0.26, 1.02, 0.34), 'cushionLight', at=(0.62, 0.0, 0.3 + RAISE), bevel=0.11, segments=3),
)

# A low table: two can stand on it, side by side.
furniture(
    'table',
    box('table_top', (2.2, 1.36, 0.14), 'wood', at=(0, 0, TOP - 0.07), bevel=0.045),
    # The runner is the sofa's colour, never the pale of the floor: a pale strip across the top reads as a gap in the table.
    box('table_runner', (0.56, 1.37, 0.03), 'cushion', at=(0, 0, TOP), bevel=0.01),
    *[box('table_leg_%d' % index, (0.26, 0.26, TOP - 0.14), 'woodDark', at=(x, y, (TOP - 0.14) / 2), bevel=0.05)
      for index, (x, y) in enumerate(((-0.9, -0.5), (0.9, -0.5), (-0.9, 0.5), (0.9, 0.5)))],
    # A rail between the legs, so the table is a solid thing from above and not four posts.
    box('table_rail', (1.9, 0.14, 0.18), 'woodDark', at=(0, -0.5, TOP - 0.3), bevel=0.04),
    box('table_rail_back', (1.9, 0.14, 0.18), 'woodDark', at=(0, 0.5, TOP - 0.3), bevel=0.04),
)

# A sofa: three cushions, three seats.
furniture(
    'sofa',
    base('sofa_base', (3.5, 1.5, 0.18), 'woodDark', at=(0, 0.13)),
    *[box('sofa_cushion_%d' % index, (0.95, 1.12, 0.14), 'cushion', at=(x, -0.02, 0.23 + RAISE), bevel=0.06) for index, x in enumerate((-0.97, 0.0, 0.97))],
    box('sofa_back', (3.5, 0.36, 0.95), 'cushion', at=(0, 0.72, 0.58 + RAISE), bevel=0.15, segments=3),
    box('sofa_arm_l', (0.3, 1.2, 0.36), 'cushionLight', at=(-1.6, 0.02, 0.31 + RAISE), bevel=0.12, segments=3),
    box('sofa_arm_r', (0.3, 1.2, 0.36), 'cushionLight', at=(1.6, 0.02, 0.31 + RAISE), bevel=0.12, segments=3),
)

# A bed: four fit on its blanket. The pillows and the headboard lie beyond the part that is safe.
furniture(
    'bed',
    base('bed_frame', (2.14, 2.7, 0.18), 'woodDark', at=(0, 0.3)),
    box('bed_mattress', (1.98, 2.5, 0.14), 'linen', at=(0, 0.3, 0.23 + RAISE), bevel=0.06),
    box('bed_blanket', (2.02, 1.72, 0.035), 'cushion', at=(0, -0.11, 0.3 + RAISE), bevel=0.012),
    box('bed_fold', (2.02, 0.22, 0.05), 'cushionLight', at=(0, 0.78, 0.305 + RAISE), bevel=0.02),
    box('bed_pillow_l', (0.82, 0.46, 0.12), 'cushionLight', at=(-0.47, 1.22, 0.35 + RAISE), bevel=0.055, segments=3),
    box('bed_pillow_r', (0.82, 0.46, 0.12), 'cushionLight', at=(0.47, 1.22, 0.35 + RAISE), bevel=0.055, segments=3),
    box('bed_head', (2.14, 0.22, 0.95 + RAISE), 'wood', at=(0, 1.62, 0.055 + (0.95 + RAISE) / 2), bevel=0.08, segments=3),
)

# A spout of lava: the game shoots one up out of the sea, well away from the slab, and lets it drop.
part(tag(lathe('spout', [(0, -0.2), (0.34, -0.2), (0.4, 0.4), (0.27, 1.0), (0.36, 1.5), (0.24, 1.85), (0, 2.0)], 'lava', sides=9, smooth=70), glow=HOT, outline=0, shadow=False))

# A bubble of lava: the game swells one up out of the sea and bursts it.
part(tag(ball('bubble', 0.5, 'lava', scale=(1, 1, 0.8)), glow=HOT, outline=0, shadow=False))


# A raft of cooled crust on its darker edge: the game sends them down the current behind the slab. It is long the
# way it goes and narrow across, to fit the strip of open lava between the slab's feet and the wall.
shape = blob(0.56, 9, 11, 0.2, (1.35, 0.85))
crust = tag(settle(slab('raft_crust', shape, 0.26, 'crust', at=(0, 0, 0.07), bevel=0.09)), outline=0.04, shadow=False)
edge = tag(sheet('raft_edge', [grown(shape, 0.14)], 'lavaDeep', at=(0, 0, 0.02)), glow=1.0, outline=0, shadow=False)
part(group('raft', crust, edge))

# What the volcano throws up when the lava comes: a fat fountain, standing in its mouth.
part(tag(lathe('plume', [(0, -0.3), (0.62, -0.3), (0.74, 0.5), (0.5, 1.4), (0.66, 2.1), (0.42, 2.8), (0.2, 3.2), (0, 3.4)], 'lava', sides=9, smooth=70), glow=1.7, outline=0, shadow=False))

# A creature of the lava: a shell of crust with two horns and two bright eyes, that comes up to watch the round
# and ducks under when the alarm sounds. It looks toward the camera (-Y) until the game turns it.
shell = ball('critter_shell', 0.42, 'crust', at=(0, 0, 0.1), scale=(1.1, 1.0, 0.82))
horns = [cone('critter_horn_%d' % index, 0.1, 0.3, 'crust', at=(side * 0.2, 0.05, 0.45), rot=(0, side * 22, 0), sides=5) for index, side in enumerate((-1, 1))]
body = tag(settle(join('critter_body', shell, *horns)), outline=0.045, shadow=False)
eyes = tag(settle(join('critter_eyes', *[ball('critter_eye_%d' % index, 0.1, 'lavaHot', at=(side * 0.17, -0.36, 0.2), scale=(1, 0.6, 1.2)) for index, side in enumerate((-1, 1))])), glow=1.6, outline=0, shadow=False)
part(group('critter', body, eyes))
