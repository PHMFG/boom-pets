# Bate-Bate: a white platform of tiles high over a sea of clouds. The tiles are the game's, and they fall, so
# nothing here touches the platform: the world is what floats round it and far below it. In a round the
# camera looks down from the front, so whatever is near the front (low Y) hangs well below the floor, and
# height is built at the back and the sides. Between rounds it comes down low and looks across the platform,
# from the front and a little to either side: what it sees then is the far back, so the back has a distance
# to it (far islands, a balloon, a bank of cloud at the horizon). It never goes below the floor, so nothing
# here has an underside worth modelling. Far below it all lies a land of fields, a river and a town, seen
# through the gaps in the clouds: the platform is high over somewhere.
# The game stands pets that came to watch on the islands and in the balloons' baskets, so each has room for
# them. The props the brawl plays with (barrel, Mystery Cube, meteor, capsule machine, the case of the slot
# reels) and what the game moves itself (clouds, gulls, lanterns, a plane, a kite, a flock, the windmill's
# sails) are templates, or pieces it finds by name.
#
# A piece costs the game one drawing for each colour it has, and another for each if it is outlined: so a
# piece that stands far off or is drawn many times over keeps its colours few.
import glob
import os

from kit import *

HALF = 8.0

guide_floor(HALF * 2, HALF * 2)
for spot in ((-3, 2, 0), (2.5, -3, 0), (5, 4, 0)):
    guide_pet(spot)


# ── Helpers of this map ──────────────────────────────────────────────────────

def game_font():
    """Lilita One, the font of every big word in the game, so a modelled "?" is the same "?" as on the HUD."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    found = sorted(glob.glob(os.path.join(root, 'node_modules/.pnpm/@fontsource+lilita-one@*/node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff')))
    if not found:
        raise FileNotFoundError('Lilita One was not found in node_modules. Run pnpm install first.')
    return bpy.data.fonts.load(found[-1], check_existing=True)


FONT = game_font()


def letter(name, text, height, depth, color, at=(0, 0, 0), rot=(0, 0, 0)):
    """A character as a solid, `height` tall and `depth` thick, lying on the floor face up. Stand it up with rot=(90, 0, 0)."""
    curve = bpy.data.curves.new(name + '_text', 'FONT')
    curve.body = text
    curve.font = FONT
    curve.extrude = 0.5
    curve.resolution_u = 3
    holder = bpy.data.objects.new(name + '_text', curve)
    bpy.context.scene.collection.objects.link(holder)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(holder)
    bpy.data.curves.remove(curve)
    # Centred on its own outline and sized by it: a font's own box is taller than its letters.
    low = Vector((min(v.co.x for v in mesh.vertices), min(v.co.y for v in mesh.vertices), 0))
    high = Vector((max(v.co.x for v in mesh.vertices), max(v.co.y for v in mesh.vertices), 0))
    size = height / (high.y - low.y)
    for vert in mesh.vertices:
        vert.co = Vector(((vert.co.x - (low.x + high.x) / 2) * size, (vert.co.y - (low.y + high.y) / 2) * size, vert.co.z * depth))
    mesh.name = name
    mesh.materials.clear()
    mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = Euler([math.radians(angle) for angle in rot])
    return obj


def striped(name, profile, colors, at=(0, 0, 0), rot=(0, 0, 0), sides=24, stripe=2, smooth=50):
    """A lathe whose gores take turns between `colors`, `stripe` sides each: a balloon, a parachute."""
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
                bm.faces.new(corners).material_index = (i // stripe) % len(colors)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    limit = math.radians(smooth)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.calc_face_angle(0) < limit
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for color in colors:
        mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = Euler([math.radians(angle) for angle in rot])
    return obj


def wobble(obj, seed, amount=0.12):
    """Pushes a round shape out of true, the same way for every piece given the same seed: a rock is not a lathe."""
    rng = random.Random(seed)
    a, b = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
    for vert in obj.data.vertices:
        angle = math.atan2(vert.co.y, vert.co.x)
        push = 1 + amount * (0.6 * math.sin(2 * angle + a) + 0.4 * math.sin(3 * angle + b))
        vert.co.x *= push
        vert.co.y *= push
    return obj


def centred(obj):
    """Moves an object's own origin to the middle of the world without moving its shape: the game places a template by that point."""
    obj.data.transform(obj.matrix_basis.copy())
    obj.matrix_basis = Matrix.Identity(4)
    return obj


def burst(name, outer, inner, points, depth, color, at=(0, 0, 0), rot=(0, 0, 0)):
    """A spiky star, the shape of a comic-book bang."""
    outline = [(math.cos(math.pi * i / points) * (outer if i % 2 == 0 else inner), math.sin(math.pi * i / points) * (outer if i % 2 == 0 else inner)) for i in range(points * 2)]
    return slab(name, outline, depth, color, at=at, rot=rot, bevel=0)


# ── Clouds ───────────────────────────────────────────────────────────────────
# Three cumulus shapes. The game lays them out in layers at several depths and lets each layer drift at its
# own pace, so the sea moves. They have no outline: an outline is for things, and this is weather.

def cloud(name, puffs, fine=1.45):
    """
    `puffs` is a list of (x, y, radius): fat balls sitting on one level, pressed a little flat. Only the big
    ones (`fine` metres or more) are made truly round: a cloud is drawn dozens of times.
    """
    balls = [ball('%s_%d' % (name, index), radius, 'cloud', at=(x, y, radius * 0.42), scale=(1, 1, 0.72), detail=2 if radius >= fine else 1, smooth=80) for index, (x, y, radius) in enumerate(puffs)]
    return part(tag(centred(join(name, *balls)), outline=0, shadow=False, receive=False))


cloud('cloud_a', [(0, 0, 2.2), (-2.6, 0.3, 1.7), (2.5, -0.2, 1.8), (-4.6, 0, 1.1), (4.5, 0.2, 1.2), (0.6, 1.6, 1.5), (-1.2, -1.5, 1.4)])
cloud('cloud_b', [(0, 0, 2.0), (1.9, 0.8, 1.5), (-1.8, 0.6, 1.4), (0.3, -1.6, 1.3), (-0.6, 1.9, 1.1)])
cloud('cloud_c', [(0, 0, 1.3), (1.5, 0.1, 1.0), (-1.4, -0.1, 0.9)], fine=1.2)
# A long low bank: the sea of clouds as it looks far off, where the low shots between rounds see it. It is
# drawn many times as big as the others, so its puffs are domes turned on a lathe: round to the eye at any
# size, with a fraction of a ball's faces, and no underside, which nothing ever sees.
domes = [lathe('cloud_bank_%d' % index, [(radius * 0.8, -radius * 0.3), (radius, 0), (radius * 0.94, radius * 0.3), (radius * 0.76, radius * 0.56), (radius * 0.45, radius * 0.74), (0, radius * 0.8)], 'cloud', at=(x, y, radius * 0.2), sides=14, smooth=80)
         for index, (x, y, radius) in enumerate([(0, 0, 2.0), (-3.0, 0.2, 1.7), (3.1, -0.1, 1.8), (-6.0, 0, 1.4), (6.2, 0.1, 1.5), (-8.6, 0.1, 1.0), (8.8, 0, 1.1)])]
part(tag(centred(join('cloud_bank', *domes)), outline=0, shadow=False, receive=False))


# ── Floating islands ─────────────────────────────────────────────────────────
# Each is a lawn on a band of earth on a stone that tapers to a point, with something living on top.
# Their lawns are below the platform, so from the camera they sit beside the floor and never over it.

def island(name, radius, depth, seed, sides=10):
    r = radius
    lawn = lathe(name + '_lawn', [(0, -0.4), (r, -0.4), (r * 1.03, -0.08), (r * 0.9, 0.12), (r * 0.5, 0.2), (0, 0.2)], 'grass', sides=sides, smooth=50)
    earth = lathe(name + '_earth', [(0, -1.0), (r * 0.93, -1.0), (r * 0.98, -0.3), (0, -0.3)], 'earth', sides=sides, smooth=30)
    stone = lathe(name + '_stone', [(0, -depth), (r * 0.16, -depth * 0.84), (r * 0.42, -depth * 0.55), (r * 0.62, -depth * 0.36), (r * 0.9, -depth * 0.16), (r * 0.9, -0.9), (0, -0.9)], 'rock', sides=sides, smooth=28)
    return [wobble(piece, seed) for piece in (lawn, earth, stone)]


def tree(name, at, height=1.5, crown=0.8, color='leaf'):
    x, y, z = at
    trunk = cylinder(name + '_trunk', 0.17, height * 0.6, 'wood', at=(x, y, z + height * 0.3), top=0.12, sides=7)
    lower = ball(name + '_crown', crown, color, at=(x, y, z + height * 0.5 + crown * 0.62), scale=(1, 1, 0.9), detail=1, smooth=35)
    upper = ball(name + '_top', crown * 0.66, color, at=(x + crown * 0.14, y, z + height * 0.5 + crown * 1.42), detail=1, smooth=35)
    return [trunk, lower, upper]


def pine(name, at, height=2.4, color='leafDark'):
    x, y, z = at
    trunk = cylinder(name + '_trunk', 0.15, height * 0.3, 'wood', at=(x, y, z + height * 0.15), sides=7)
    tiers = [cone('%s_tier_%d' % (name, i), height * (0.32 - i * 0.07), height * 0.42, color, at=(x, y, z + height * (0.4 + i * 0.22)), sides=8) for i in range(3)]
    return [trunk] + tiers


def pebble(name, at, radius, seed):
    return rock(name, radius, 'rock', at=at, seed=seed, rough=0.2, scale=(1, 1, 0.8))


# The windmill's island, back left: the biggest, and the one thing in the sky that turns.
ground = island('mill_island', 4.4, 6.2, seed=3)
tower = lathe('mill_tower', [(0, 0), (1.05, 0), (1.0, 0.25), (0.7, 2.7), (0.78, 2.85), (0, 2.85)], 'cream', at=(0.4, 0.5, 0.15), sides=10)
cap = cone('mill_cap', 1.0, 1.15, 'roof', at=(0.4, 0.5, 3.55), sides=10)
door = box('mill_door', (0.5, 0.2, 0.85), 'wood', at=(0.4, -0.52, 0.58), bevel=0.06)
porthole = cylinder('mill_porthole', 0.2, 0.2, 'wood', at=(0.4, -0.3, 1.9), rot=(90, 0, 0), sides=10)
greens = tree('mill_tree_a', (-2.4, 0.6, 0.1), 1.5, 0.85) + tree('mill_tree_b', (2.7, 1.4, 0.1), 1.2, 0.7) + pine('mill_pine', (-1.3, 2.2, 0.1), 2.3, 'leaf')
stones = [pebble('mill_pebble_a', (2.4, -1.6, 0.25), 0.5, 4), pebble('mill_pebble_b', (-2.9, -1.4, 0.2), 0.38, 5)]
# A path from the door to a gap in the fence along the island's front, where those who came to watch stand.
path = slab('mill_path', [(-0.34, -3.3), (0.42, -3.3), (0.7, -0.6), (0.1, -0.6)], 0.08, 'earth', at=(0.0, 0.0, 0.2), bevel=0.02)
fence = []
for index, turn in enumerate((-64, -48, -32, -16, 16, 32, 48, 64)):
    angle = math.radians(turn - 90)
    fence.append(box('mill_post_%d' % index, (0.16, 0.16, 0.62), 'wood', at=(math.cos(angle) * 3.55, math.sin(angle) * 3.55, 0.42), bevel=0.04, segments=1))
for index, (start, end) in enumerate(((-64, -16), (16, 64))):
    rail = [(math.cos(math.radians(turn - 90)) * 3.55, math.sin(math.radians(turn - 90)) * 3.55, 0.56) for turn in range(start, end + 1, 16)]
    fence.append(pipe('mill_rail_%d' % index, rail, 0.06, 'wood', sides=5))
mill_body = join('mill_body', *ground, tower, cap, door, porthole, *greens, *stones, path, *fence)
# The sails: four boards on a hub, facing the camera. The game turns them, and races them when something goes off.
hub = cylinder('sails_hub', 0.22, 0.6, 'wood', rot=(90, 0, 0), sides=8)
blades = []
for index in range(4):
    turn = math.radians(index * 90 + 12)
    arm = box('sail_arm_%d' % index, (0.14, 0.12, 2.1), 'wood', at=(math.sin(turn) * 1.05, -0.05, math.cos(turn) * 1.05), rot=(0, math.degrees(turn), 0), bevel=0.04, segments=1)
    cloth = box('sail_cloth_%d' % index, (0.62, 0.08, 1.5), 'cream', at=(math.sin(turn) * 1.3 + math.cos(turn) * 0.32, -0.05, math.cos(turn) * 1.3 - math.sin(turn) * 0.32), rot=(0, math.degrees(turn), 0), bevel=0.03, segments=1)
    blades += [arm, cloth]
sails = place(centred(join('mill_sails', hub, *blades)), at=(0.4, -0.62, 2.55))
lit = tag(cylinder('night_mill_window', 0.15, 0.24, 'window', at=(0.4, -0.3, 1.9), rot=(90, 0, 0), sides=10), glow=1.7, outline=0, shadow=False)
tag(bob(group('mill', mill_body, sails, lit, at=(-18.5, 12.5, -3.2), rot=(0, 0, 14)), height=0.45, seconds=7), outline=0.07, shadow=False)
tag(lit, outline=0)

# The cottage's island, to the right: a house with a red roof, a tall tree and a flag.
ground = island('home_island', 3.4, 5.0, seed=11, sides=9)
walls = box('home_walls', (1.9, 1.5, 1.2), 'cream', at=(-0.3, 0.3, 0.7), bevel=0.1)
gable = slab('home_roof', [(-1.25, 0), (1.25, 0), (0, 1.15)], 1.9, 'roof', at=(-0.3, 0.3, 1.25), rot=(90, 0, 0), bevel=0.08)
chimney = box('home_chimney', (0.34, 0.34, 0.8), 'rock', at=(0.35, 0.6, 2.0), bevel=0.06)
door = box('home_door', (0.42, 0.14, 0.72), 'wood', at=(-0.7, -0.44, 0.5), bevel=0.05)
pane = box('home_pane', (0.46, 0.14, 0.42), 'wood', at=(0.15, -0.44, 0.78), bevel=0.05)
greens = tree('home_tree', (1.9, 0.9, 0.1), 2.1, 1.0, 'leafDark') + pine('home_pine', (-2.2, 1.2, 0.1), 1.9)
stones = [pebble('home_pebble', (1.5, -1.6, 0.2), 0.42, 9)]
pole = cylinder('home_pole', 0.07, 2.4, 'wood', at=(-2.3, -1.0, 1.3), sides=6)
# Washing on a line from the flag's pole to a post.
post = cylinder('home_post', 0.07, 1.5, 'wood', at=(0.9, -2.2, 0.85), sides=6)
line = pipe('home_line', arc((-2.3, -1.0, 1.55), (0.9, -2.2, 1.55), -0.16, steps=6), 0.03, 'wood', sides=4)
washing = [box('home_washing_%d' % index, (0.5, 0.06, height), color, at=(-2.3 + 3.2 * share, -1.0 - 1.2 * share, 1.46 - height / 2), rot=(0, 0, -20.5), bevel=0)
           for index, (share, height, color) in enumerate(((0.25, 0.5, 'cream'), (0.5, 0.66, 'roof'), (0.75, 0.44, 'cream')))]
home_body = join('home_body', *ground, walls, gable, chimney, door, pane, *greens, *stones, pole, post, line, *washing)
flag = sway(place(slab('home_flag', [(0, 0.3), (0, -0.3), (0.95, 0)], 0.08, 'balloonSun', bevel=0.02), at=(-2.25, -1.0, 2.2), rot=(90, 0, 0)), degrees=14, seconds=2.6, axis=2)
lit = tag(box('night_home_window', (0.36, 0.1, 0.32), 'window', at=(0.15, -0.5, 0.78), bevel=0.03), glow=1.7, outline=0, shadow=False)
tag(bob(group('home', home_body, flag, lit, at=(18.5, -2.0, -4.6), rot=(0, 0, -20)), height=0.38, seconds=6), outline=0.07, shadow=False)
tag(lit, outline=0)

# Two small ones: a lone tree low at the front left, and a rock with pines far at the back.
ground = island('lone_island', 2.2, 3.6, seed=21, sides=8)
bench = [box('lone_bench_seat', (1.1, 0.34, 0.1), 'wood', at=(0.95, -0.2, 0.52), rot=(0, 0, 25), bevel=0.03, segments=1)] + [
    box('lone_bench_leg_%d' % index, (0.1, 0.3, 0.34), 'wood', at=(0.95 + side * 0.4, -0.2 + side * 0.19, 0.35), rot=(0, 0, 25), bevel=0) for index, side in enumerate((-1, 1))]
lone_body = join('lone_body', *ground, *tree('lone_tree', (0.2, 0.1, 0.1), 1.9, 1.05), pebble('lone_pebble', (-1.2, -0.7, 0.2), 0.36, 22), *bench)
tag(bob(group('lone', lone_body, at=(-15.5, -6.5, -7.5)), height=0.5, seconds=5), outline=0.07, shadow=False)

ground = island('far_island', 2.8, 4.4, seed=31, sides=9)
far_body = join('far_body', *ground, *pine('far_pine_a', (-0.8, 0.2, 0.1), 2.6), *pine('far_pine_b', (0.9, 0.6, 0.1), 2.0), *pine('far_pine_c', (0.2, -1.1, 0.1), 1.6))
tag(bob(group('far', far_body, at=(11.0, 24.0, -6.5)), height=0.4, seconds=8), outline=0.07, shadow=False)

# Loose stones that hang in the air near the islands. They are one piece and bob together, at a pace that is
# none of the islands': five pebbles each on a bob of its own were ten drawings for a move nobody could see.
stones = [rock('drift_rock_%d' % index, size, 'rock', at=(x, y, z), seed=40 + index, rough=0.24, scale=(1, 1, 0.85))
          for index, (x, y, z, size) in enumerate([(-12.2, 14.6, -4.6, 0.8), (-21.5, 6.8, -5.4, 0.6), (13.4, 3.2, -6.6, 0.7), (22.4, -6.4, -7.0, 0.5), (-12.6, -9.2, -9.4, 0.5)])]
tag(bob(centred(join('drift_rocks', *stones)), height=0.3, seconds=4.3), outline=0.06, shadow=False)


# ── Hot-air balloons ─────────────────────────────────────────────────────────

def balloon(name, color, at, size, seconds):
    envelope = striped(name + '_envelope', [(0, 0.08), (0.46, 0.0), (0.56, 0.12), (1.0, 0.95), (1.42, 1.75), (1.52, 2.35), (1.38, 2.9), (0.95, 3.3), (0.45, 3.48), (0, 3.52)], [color, 'cream'], sides=24, stripe=2, smooth=60)
    skirt = lathe(name + '_skirt', [(0.4, -0.1), (0.52, -0.1), (0.6, 0.14), (0.44, 0.14)], 'wood', sides=12)
    # The basket is open, with a floor and four walls: the game stands a passenger in it.
    # The basket is open, with a floor and four low walls: the game stands a passenger in it, who looks out over the rim.
    basket = [box(name + '_floor', (0.84, 0.84, 0.1), 'wood', at=(0, 0, -1.3), bevel=0.04, segments=1)]
    basket += [box('%s_wall_%d' % (name, i), (0.84 if sy else 0.1, 0.1 if sy else 0.84, 0.3), 'wood', at=(sx * 0.37, sy * 0.37, -1.15), bevel=0.04, segments=1) for i, (sx, sy) in enumerate(((-1, 0), (1, 0), (0, -1), (0, 1)))]
    brim = pipe(name + '_brim', [(-0.4, -0.4, -1.0), (0.4, -0.4, -1.0), (0.4, 0.4, -1.0), (-0.4, 0.4, -1.0)], 0.07, 'wood', sides=6, closed=True)
    ropes = [pipe('%s_rope_%d' % (name, i), [(sx * 0.38, sy * 0.38, -1.0), (sx * 0.42, sy * 0.42, -0.05)], 0.045, 'wood', sides=5) for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)))]
    rig = join(name + '_rig', skirt, *basket, brim, *ropes)
    flame = throb(tag(lathe(name + '_flame', [(0, -0.42), (0.16, -0.36), (0.2, -0.2), (0.1, 0.02), (0, 0.16)], 'flame', sides=8, smooth=70), glow=1.7, outline=0, shadow=False), amount=0.25, seconds=0.9)
    holder = group(name, envelope, rig, flame, at=at)
    holder.scale = (size, size, size)
    tag(envelope, outline=0.06, shadow=False)
    tag(rig, outline=0.05, shadow=False)
    return bob(holder, height=0.7, seconds=seconds)


balloon('balloon_warm', 'balloonWarm', (17.5, 14.5, -9.0), 1.6, 6.5)
balloon('balloon_cool', 'balloonCool', (-13.6, -1.0, -9.6), 1.25, 8.0)
balloon('balloon_sun', 'balloonSun', (-10.0, 33.0, -10.0), 2.1, 7.2)


# ── Far off ──────────────────────────────────────────────────────────────────
# Two islands a long way behind the platform: a crag with pines on each. They are what the low shots between
# rounds have at the back of the picture. They have no outline and do not bob: at that distance a line would
# only shimmer. Both are one piece.
def crag(name, at, size, seed):
    x, y, z = at
    lawn = wobble(lathe(name + '_lawn', [(0, -0.5), (size, -0.5), (size * 1.03, -0.1), (size * 0.9, 0.15), (0, 0.3)], 'grass', sides=9, smooth=50), seed)
    stone = wobble(lathe(name + '_stone', [(0, -size * 1.5), (size * 0.2, -size * 1.2), (size * 0.6, -size * 0.6), (size * 0.92, -0.4), (0, -0.4)], 'rock', sides=9, smooth=28), seed)
    peak = rock(name + '_peak', size * 0.5, 'rock', at=(size * 0.25, size * 0.2, size * 0.42), seed=seed, rough=0.2, scale=(1, 1, 1.5))
    pines = []
    for index, (px, py, height) in enumerate(((-0.55, 0.1, 0.9), (-0.25, -0.5, 0.7), (0.6, -0.35, 0.6))):
        pines += [cone('%s_pine_%d_%d' % (name, index, tier), size * height * (0.3 - tier * 0.08), size * height * 0.5, 'leafDark', at=(px * size, py * size, 0.2 + size * height * (0.25 + tier * 0.26)), sides=7) for tier in range(2)]
    pieces = [lawn, stone, peak, *pines]
    for piece in pieces:
        piece.location = (piece.location.x + x, piece.location.y + y, piece.location.z + z)
    return pieces


tag(centred(join('distant', *crag('crag_left', (-44, 62, -15), 6.0, 51), *crag('crag_right', (41, 74, -17), 7.5, 52))), outline=0, shadow=False, receive=False)


# ── Far below ────────────────────────────────────────────────────────────────
# A land under the clouds: a patchwork of fields with a river through it to a sea, and a town on the river.
# It is drawn in the colours of distance, close to the sky's and to each other, so it sits behind everything
# and takes no eye from the floor. Its fields and houses are toy sized: it lies only 80 m down, since the camera cannot see
# farther than 400 m, and small things read as far away. By night the town's windows are lit.
DEPTH = -80.0
FIELD = 15.0
land_rng = random.Random(77)


def plates(name, quads, color, z):
    """Flat four-cornered pieces lying at height `z`, facing up, as one object. `quads` is a list of four (x, y) corners, counter-clockwise."""
    bm = bmesh.new()
    for corners in quads:
        bm.faces.new([bm.verts.new((x, y, z)) for x, y in corners])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        if face.normal.z < 0:
            face.normal_flip()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def turned(x, y, degrees=24, middle=95.0):
    """
    From the fields' own measure to the world's. The fields lie askew to the platform, the way land never lines
    up with what flies over it, and their middle is well behind it: looking down past the platform from the
    front, what lies 80 m below is seen 60 m and more beyond it.
    """
    angle = math.radians(degrees)
    return (x * math.cos(angle) - y * math.sin(angle), x * math.sin(angle) + y * math.cos(angle) + middle)


def river_x(y):
    """Where the river runs, in the fields' own measure."""
    return -38 + math.sin(y / 46.0) * 30 + math.sin(y / 17.0) * 6


def coast_x(y):
    return 86 + math.sin(y / 38.0) * 14


fields = {'land': [], 'landPale': [], 'landGold': []}
reach = int(170 / FIELD)
for i in range(-reach, reach + 1):
    for j in range(-reach, reach + 1):
        x, y = i * FIELD, j * FIELD
        if math.hypot(x, y) > 164 or x > coast_x(y) - 4 or abs(x - river_x(y)) < 7.5:
            continue
        # Neighbours often share a crop, and no hedge is drawn between them, so the patches are of several sizes
        # and shapes: a regular grid down there would be a second chequered floor.
        tone = random.Random((i // 3) * 131 + (j // 2) * 17 + 5).choice(sorted(fields)) if land_rng.random() < 0.7 else land_rng.choice(sorted(fields))
        fields[tone].append([turned(x, y), turned(x + FIELD, y), turned(x + FIELD, y + FIELD), turned(x, y + FIELD)])
pieces = [plates('ground_' + tone, quads, tone, DEPTH) for tone, quads in fields.items()]
# Under the fields, the colour of everything too far off to make out.
rim = [(math.cos(2 * math.pi * i / 24) * 445, math.sin(2 * math.pi * i / 24) * 445) for i in range(24)]
pieces.append(plates('ground_haze', [[(0, 0), rim[i], rim[(i + 1) % 24]] for i in range(24)], 'haze', DEPTH - 0.5))
# The river, and the sea it runs to.
banks = [(river_x(y), y) for y in range(-200, 201, 10)]
pieces.append(plates('ground_river', [[turned(ax - 4.5, ay), turned(ax + 4.5, ay), turned(bx + 4.5, by), turned(bx - 4.5, by)] for (ax, ay), (bx, by) in zip(banks, banks[1:])], 'water', DEPTH - 0.2))
shore = [(coast_x(y), y) for y in range(-240, 241, 12)]
pieces.append(plates('ground_sea', [[turned(ax, ay), turned(ax + 330, ay), turned(bx + 330, by), turned(bx, by)] for (ax, ay), (bx, by) in zip(shore, shore[1:])], 'water', DEPTH - 0.3))
# The town: little houses along the river, a square tower among them.
houses, windows = [], []
for index in range(18):
    y = -30 + land_rng.uniform(-30, 30)
    x = river_x(y) + land_rng.choice((-1, 1)) * land_rng.uniform(9, 30)
    wide, tall = land_rng.uniform(1.5, 2.3), land_rng.uniform(1.1, 1.8)
    hx, hy = turned(x, y)
    turn = 24 + land_rng.choice((0, 90))
    houses.append(box('town_walls_%d' % index, (wide, wide * 0.8, tall), 'town', at=(hx, hy, DEPTH + tall / 2), rot=(0, 0, turn), bevel=0))
    houses.append(slab('town_roof_%d' % index, [(-wide * 0.62, 0), (wide * 0.62, 0), (0, wide * 0.5)], wide * 0.86, 'townRoof', at=(hx, hy, DEPTH + tall), rot=(90, 0, turn), bevel=0))
    # Not every house is awake.
    if index % 2 == 0:
        windows.append(box('town_window_%d' % index, (0.7, 0.7, 0.4), 'window', at=(hx, hy, DEPTH + tall + wide * 0.5 + 0.5), bevel=0))
tx, ty = turned(river_x(-30) + 16, -30)
houses.append(box('town_tower', (2.0, 2.0, 5.0), 'town', at=(tx, ty, DEPTH + 2.5), rot=(0, 0, 24), bevel=0))
houses.append(cone('town_spire', 1.8, 2.4, 'townRoof', at=(tx, ty, DEPTH + 6.2), sides=4, rot=(0, 0, 69)))
windows.append(box('town_window_tower', (0.9, 0.9, 0.5), 'window', at=(tx, ty, DEPTH + 7.9), bevel=0))
tag(centred(join('ground', *pieces, *houses)), outline=0, shadow=False, receive=False)
tag(centred(join('night_town', *windows)), glow=1.8, outline=0, shadow=False)


# ── Templates: what flies ────────────────────────────────────────────────────
# A toy biplane that tows a string of pennants. It flies toward high Y. Its propeller and the three lengths
# of its banner are pieces of their own, each hinged at its front end: the game turns the one and waves the
# others. The game flies it in a wide ring round the platform, below the floor and well outside it.
hull = ball('plane_hull', 0.5, 'roof', scale=(0.85, 2.6, 0.9), detail=2)
nose = cylinder('plane_nose', 0.36, 0.3, 'cream', at=(0, 1.22, 0), rot=(90, 0, 0), sides=10)
wings = [box('plane_wing_%d' % index, (3.6, 0.9, 0.14), 'cream', at=(0, 0.35, z), bevel=0.06) for index, z in enumerate((-0.28, 0.62))]
struts = [cylinder('plane_strut_%d' % index, 0.05, 0.9, 'wood', at=(side * 1.3, 0.35, 0.17), sides=5) for index, side in enumerate((-1, 1))]
fin = slab('plane_fin', [(0, 0), (0.75, 0), (0.15, 0.62), (0, 0.62)], 0.1, 'cream', at=(0, -1.25, 0.1), rot=(90, 0, 90), bevel=0.03)
tailplane = box('plane_tail', (1.5, 0.5, 0.1), 'cream', at=(0, -1.05, 0.12), bevel=0.04)
wheels = [cylinder('plane_wheel_%d' % index, 0.2, 0.12, 'wood', at=(side * 0.5, 0.5, -0.62), rot=(0, 90, 0), sides=8) for index, side in enumerate((-1, 1))]
towline = pipe('plane_towline', [(0, -1.3, 0), (0, -2.6, 0)], 0.04, 'wood', sides=4)
body = tag(centred(join('plane_body', hull, nose, *wings, *struts, fin, tailplane, *wheels, towline)), outline=0.06, shadow=False)
blades = centred(join('plane_prop', box('plane_blade_a', (1.5, 0.08, 0.2), 'wood', bevel=0.03), box('plane_blade_b', (0.2, 0.08, 1.5), 'wood', bevel=0.03), ball('plane_spinner', 0.14, 'wood', at=(0, 0.06, 0), detail=1)))
prop = tag(place(blades, at=(0, 1.42, 0)), outline=0.05, shadow=False)
LENGTH = 2.0
lengths = []
for index in range(3):
    # Five pennants to a length, hanging from a cord: gold and cream by turns.
    cord = pipe('banner_cord_%d' % index, [(0, 0, 0), (0, -LENGTH, 0)], 0.035, 'cream', sides=4)
    flags = [slab('banner_flag_%d_%d' % (index, flag), [(-0.17, 0), (0.17, 0), (0, -0.62)], 0.06, 'cream' if (index * 5 + flag) % 2 else 'balloonSun', at=(0, -0.2 - flag * 0.4, -0.02), rot=(90, 0, 90), bevel=0) for flag in range(5)]
    lengths.append(tag(place(centred(join('banner_%d' % index, cord, *flags)), at=(0, -2.6 - index * LENGTH, 0)), outline=0, shadow=False))
part(group('plane', body, prop, *lengths))

# A kite, flown from the windmill's island on a line the game stretches to it. It stands upright, facing the camera.
sail = slab('kite_sail', [(0, 0.95), (-0.62, 0.12), (0, -1.0), (0.62, 0.12)], 0.08, 'balloonCool', rot=(90, 0, 0), bevel=0.03)
spars = [box('kite_spar_a', (0.07, 0.06, 1.9), 'cream', at=(0, -0.05, -0.02), bevel=0), box('kite_spar_b', (1.2, 0.06, 0.07), 'cream', at=(0, -0.05, 0.12), bevel=0)]
tail = pipe('kite_tail', [(0, 0, -1.0), (0.1, 0, -1.5), (-0.1, 0, -2.0), (0.06, 0, -2.5)], 0.035, 'cream', sides=4)
bows = [box('kite_bow_%d' % index, (0.4, 0.07, 0.18), 'balloonCool', at=((0.1, -0.1, 0.06)[index], 0, -1.5 - index * 0.5), rot=(0, (24, -24, 24)[index], 0), bevel=0) for index in range(3)]
part(tag(centred(join('kite', sail, *spars, tail, *bows)), outline=0.045, shadow=False))
# Its line: one metre of it, standing on its end. The game turns it and stretches it from hand to kite.
part(tag(centred(cylinder('kite_line', 0.03, 1.0, 'cream', at=(0, 0, 0.5), sides=5)), outline=0, shadow=False))

# A far bird, seen from above: a head, swept wings and a tail, flat and dark, as birds a long way off are.
# A bare bent wing would do, but that is an arrow, and an arrow beside the floor would be read as a sign.
# The game flies a skein of them in one drawing.
part(tag(slab('bird', [(0, 0.46), (-0.1, 0.2), (-0.5, 0.1), (-0.95, -0.22), (-0.48, -0.1), (-0.12, -0.16), (0, -0.44), (0.12, -0.16), (0.48, -0.1), (0.95, -0.22), (0.5, 0.1), (0.1, 0.2)], 0.07, 'rockDark', bevel=0), outline=0, shadow=False))


# ── Templates: a gull ────────────────────────────────────────────────────────
# A few of them circle the platform, wide of it and below it. Its wings are pieces of their own, hinged at
# the body, so the game can flap them. It flies toward high Y.
body = ball('gull_body', 0.24, 'white', scale=(0.75, 1.7, 0.7), detail=1, smooth=50)
tail = slab('gull_tail', [(-0.13, -0.6), (0.13, -0.6), (0, -0.25)], 0.06, 'white', bevel=0.02)
wings = [slab('gull_wing_%s' % side, [(0, -0.2), (0, 0.24), (sign * 0.5, 0.22), (sign * 0.95, -0.05), (sign * 0.5, -0.12)] if sign > 0 else [(0, 0.24), (0, -0.2), (sign * 0.5, -0.12), (sign * 0.95, -0.05), (sign * 0.5, 0.22)], 0.07, 'white', bevel=0.02)
         for side, sign in (('l', -1), ('r', 1))]
part(tag(group('gull', join('gull_trunk', body, tail), *wings), outline=0.035, shadow=False))


# ── Templates: what floats at night ──────────────────────────────────────────
# A paper lantern: a pale glowing shade between two wooden caps. Neither has an outline, so the game can draw
# the whole swarm in two goes. The game sends a slow swarm of them up
# through the clouds on the last round. It is pale and warm, not gold: gold on this floor means a prize.
shade = tag(lathe('lantern_shade', [(0, 0.02), (0.2, 0.02), (0.31, 0.14), (0.36, 0.38), (0.31, 0.6), (0.2, 0.7), (0, 0.7)], 'lantern', sides=10, smooth=60), glow=1.2, outline=0, shadow=False)
caps = tag(join('lantern_caps',
                lathe('lantern_foot', [(0, -0.06), (0.2, -0.06), (0.23, 0.0), (0.2, 0.06), (0, 0.06)], 'wood', sides=10),
                lathe('lantern_head', [(0, 0.67), (0.2, 0.67), (0.22, 0.72), (0.14, 0.8), (0, 0.82)], 'wood', sides=10),
                ring('lantern_loop', 0.09, 0.03, 'wood', at=(0, 0, 0.88), rot=(90, 0, 0), sides=10, around=5)), outline=0, shadow=False)
part(group('lantern', shade, caps))


# ── Templates: the barrel ────────────────────────────────────────────────────
# A fat toy barrel in the danger colour with two ink hoops and an ink fuse with a pale end. A comic-book bang with a "!" is on its
# lid, which is the face the camera sees best, and on its front and back, so it says "explosive" from anywhere.
# Its middle is the origin and it is as big as the rules say (0.42 by 0.9).
body = lathe('barrel_body', [(0, -0.45), (0.33, -0.45), (0.37, -0.42), (0.43, -0.2), (0.45, 0), (0.43, 0.2), (0.37, 0.42), (0.35, 0.45), (0.32, 0.45), (0.32, 0.4), (0, 0.4)], 'danger', sides=18, smooth=50)
hoops = [lathe('barrel_hoop_%d' % index, [(0.36, z - 0.055), (0.46, z - 0.055), (0.47, z), (0.46, z + 0.055), (0.36, z + 0.055)], 'ink', sides=18) for index, z in enumerate((-0.27, 0.27))]
bung = cylinder('barrel_bung', 0.085, 0.1, 'ink', at=(0.24, 0.24, 0.44), sides=8)
fuse = pipe('barrel_fuse', [(0.24, 0.24, 0.44), (0.25, 0.25, 0.58), (0.3, 0.3, 0.67), (0.39, 0.38, 0.7)], 0.065, 'ink', sides=6)
tip = ball('barrel_fuse_tip', 0.085, 'cream', at=(0.42, 0.41, 0.7), detail=1)
bangs = [burst('barrel_top_bang', 0.26, 0.18, 9, 0.03, 'cream', at=(-0.01, -0.01, 0.428))]
marks = [
    burst('barrel_top_edge', 0.3, 0.215, 9, 0.03, 'ink', at=(-0.01, -0.01, 0.415)),
    letter('barrel_top_mark', '!', 0.25, 0.03, 'ink', at=(-0.01, -0.01, 0.45)),
]
for index, turn in enumerate((0, 180)):
    facing = -1 if turn == 0 else 1
    bangs.append(burst('barrel_bang_%d' % index, 0.275, 0.19, 9, 0.06, 'cream', at=(0, facing * 0.435, 0.01), rot=(90, 0, turn)))
    marks += [
        burst('barrel_bang_edge_%d' % index, 0.32, 0.225, 9, 0.06, 'ink', at=(0, facing * 0.41, 0.01), rot=(90, 0, turn)),
        letter('barrel_mark_%d' % index, '!', 0.28, 0.05, 'ink', at=(0, facing * 0.468, 0.01), rot=(90, 0, turn)),
    ]
staves = tag(body, outline=0.045)
# Everything on the staves is one piece with no outline and no shadow of its own: it is ink, or lies on ink,
# and stays inside the barrel's shadow. A barrel is drawn six times over, so each piece counts six times.
irons = tag(centred(join('barrel_irons', *hoops, bung, fuse, *marks, tip, *bangs)), outline=0, shadow=False)
part(group('barrel', staves, irons))


# ── Templates: the Mystery Cube and its parachute ────────────────────────────
body = box('cube_body', (0.85, 0.85, 0.85), 'gold', bevel=0.12, segments=2)
faces = []
for index, (rot, at) in enumerate([((90, 0, 0), (0, -1, 0)), ((90, 0, 90), (1, 0, 0)), ((90, 0, 180), (0, 1, 0)), ((90, 0, 270), (-1, 0, 0)), ((0, 0, 0), (0, 0, 1)), ((180, 0, 0), (0, 0, -1))]):
    x, y, z = at
    faces.append(box('cube_plate_%d' % index, (0.6, 0.6, 0.05), 'cubeLight', at=(x * 0.415, y * 0.415, z * 0.415), rot=rot, bevel=0.02, segments=1))
    faces.append(letter('cube_mark_%d' % index, '?', 0.44, 0.05, 'ink', at=(x * 0.452, y * 0.452, z * 0.452), rot=rot))
part(tag(join('cube', body, *faces), outline=0.05))

canopy = striped('chute_canopy', [(0, 1.62), (0.26, 1.58), (0.54, 1.46), (0.74, 1.3), (0.82, 1.16), (0.86, 1.2), (0.8, 1.38), (0.58, 1.6), (0.27, 1.73), (0, 1.77)], ['chute', 'cream'], sides=16, stripe=2, smooth=60)
straps = [pipe('chute_strap_%d' % i, [(sx * 0.3, sy * 0.3, 0.4), (sx * 0.57, sy * 0.57, 1.24)], 0.04, 'cream', sides=5) for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1)))]
part(tag(centred(join('chute', canopy, *straps)), outline=0.04))


# ── Templates: the meteor ────────────────────────────────────────────────────
# A dark rock with craters that glow, and the fire it trails. The game tumbles the rock and points the fire
# back along the way it came.
stone = rock('meteor_stone', 0.75, 'meteor', seed=7, rough=0.2, detail=2, smooth=40)
craters = []
for index, (x, y, z, size) in enumerate([(0.5, -0.4, 0.3, 0.36), (-0.45, -0.5, -0.2, 0.32), (0.1, 0.55, 0.45, 0.34), (-0.3, 0.3, -0.6, 0.36), (0.55, 0.35, -0.3, 0.28), (-0.6, 0.0, 0.42, 0.28), (0.05, -0.66, -0.4, 0.26)]):
    reach = 0.83 - size
    craters.append(ball('meteor_crater_%d' % index, size, 'ember', at=(x * reach / 0.7, y * reach / 0.7, z * reach / 0.7), detail=2))
heat = tag(centred(join('meteor_heat', *craters)), glow=1.9, outline=0, shadow=False)
tag(stone, outline=0.06)
part(group('meteor', stone, heat))
blaze = tag(lathe('fire_blaze', [(0, -0.1), (0.7, 0.3), (0.7, 0.85), (0.5, 1.7), (0.24, 2.6), (0, 3.4)], 'ember', sides=10, smooth=70), glow=1.6, outline=0, shadow=False)
core = tag(lathe('fire_core', [(0, 0.5), (0.4, 0.95), (0.34, 1.7), (0.14, 2.8), (0, 3.8)], 'emberHot', at=(0.0, -0.32, 0), sides=8, smooth=70), glow=2.0, outline=0, shadow=False)
part(group('meteor_fire', blaze, core))


# ── Templates: the capsule machine ───────────────────────────────────────────
# A gacha machine as a toy: a red body on a gold foot, a glass globe full of capsules, a gold cap. Its lever
# and the capsule it gives are templates of their own, because the game moves them. It stands on the origin
# and faces the camera (low Y).
foot = box('gacha_foot', (1.76, 1.54, 0.26), 'gold', at=(0, 0, 0.13), bevel=0.09)
body = box('gacha_box', (1.54, 1.34, 1.16), 'danger', at=(0, 0, 0.8), bevel=0.16, segments=3)
collar = lathe('gacha_collar', [(0, 1.32), (0.84, 1.32), (0.93, 1.43), (0.87, 1.56), (0.7, 1.6), (0, 1.6)], 'gold', sides=24)
panel = box('gacha_panel', (1.12, 0.12, 0.6), 'cream', at=(0, -0.66, 0.98), bevel=0.06)
dial = cylinder('gacha_dial', 0.2, 0.16, 'gold', at=(-0.26, -0.76, 0.98), rot=(90, 0, 0), sides=14)
grip = box('gacha_grip', (0.38, 0.1, 0.1), 'ink', at=(-0.26, -0.85, 0.98), rot=(0, 30, 0), bevel=0.03)
slot_plate = box('gacha_slot_plate', (0.26, 0.1, 0.4), 'steel', at=(0.3, -0.72, 0.98), bevel=0.05)
slot = box('gacha_slot', (0.08, 0.06, 0.24), 'ink', at=(0.3, -0.77, 0.98), bevel=0.01)
mouth = box('gacha_mouth', (0.66, 0.2, 0.3), 'ink', at=(0, -0.62, 0.46), bevel=0.05)
tray = box('gacha_tray', (0.8, 0.32, 0.1), 'gold', at=(0, -0.77, 0.3), bevel=0.04)
cap = lathe('gacha_cap', [(0, 2.9), (0.52, 2.9), (0.57, 2.98), (0.47, 3.15), (0.22, 3.27), (0, 3.29)], 'gold', sides=20)
finial = ball('gacha_finial', 0.16, 'danger', at=(0, 0, 3.4))
# Capsules heaped in the globe, in the colours of what the machine gives.
heap = []
for index, color in enumerate(['tierRare', 'gold', 'tierCursed', 'tierCursedAccent', 'danger', 'tierRare', 'gold', 'tierCursed']):
    angle = index / 8 * math.pi * 2
    heap.append(ball('gacha_ball_%d' % index, 0.22, color, at=(math.sin(angle) * 0.44, math.cos(angle) * 0.44, 1.8 + (index % 2) * 0.3)))
heap.append(ball('gacha_ball_top_a', 0.22, 'tierCursedAccent', at=(-0.12, -0.05, 2.22)))
heap.append(ball('gacha_ball_top_b', 0.22, 'danger', at=(0.2, 0.12, 1.9)))
shell = tag(join('gacha_body', foot, body, collar, panel, dial, grip, slot_plate, slot, mouth, tray, cap, finial, *heap), outline=0.05)
# The globe is two balls: the far wall, seen from inside, so the globe is pale and not a dark hole; and the
# glass in front, which the game makes see-through. The glass's outline is what rings the globe.
GLOBE = Vector((0, 0, 2.2))
back = tag(ball('gacha_glass_back', 0.83, 'glassBack', at=GLOBE, detail=3), outline=0, shadow=False)
back.data.flip_normals()
glass = tag(ball('gacha_glass', 0.85, 'glass', at=GLOBE, detail=3), outline=0.05)
# The shine on the glass, the way a sticker draws it: a curved stroke and a dot, up and to the left.
def on_globe(turn, lift):
    turn, lift = math.radians(turn), math.radians(lift)
    return tuple(GLOBE + Vector((-math.sin(turn) * math.cos(lift), -math.cos(turn) * math.cos(lift), math.sin(lift))) * 0.86)
shine = pipe('gacha_shine', [on_globe(38 - step * 3, 22 + step * 7) for step in range(6)], 0.05, 'white', sides=6)
dot = ball('gacha_shine_dot', 0.06, 'white', at=on_globe(42, 8), detail=1)
glint = tag(join('gacha_glint', shine, dot), outline=0, shadow=False)
part(group('gacha', shell, back, glass, glint))

# The lever: its pivot is the origin, and the game tips it over to the right.
hub = cylinder('lever_hub', 0.17, 0.34, 'gold', at=(-0.06, 0, 0), rot=(0, 90, 0), sides=12)
arm = pipe('lever_arm', [(0, 0, 0), (0, 0, 0.82)], 0.07, 'ink', sides=8)
knob = ball('lever_knob', 0.21, 'gold', at=(0, 0, 0.95))
part(tag(centred(join('gacha_lever', hub, arm, knob)), outline=0.045))

# The capsule: the game tints its top half as it cracks from grey to gold to rainbow.
top = lathe('capsule_top', [(0.42, 0.0), (0.405, 0.11), (0.36, 0.215), (0.3, 0.295), (0.21, 0.365), (0.11, 0.405), (0, 0.42)], 'steel', sides=16, smooth=60)
bottom = lathe('capsule_bottom', [(0, -0.42), (0.11, -0.405), (0.21, -0.365), (0.3, -0.295), (0.36, -0.215), (0.405, -0.11), (0.42, 0.0)], 'white', sides=16, smooth=60)
band = lathe('capsule_band', [(0.4, -0.06), (0.455, -0.06), (0.455, 0.06), (0.4, 0.06)], 'ink', sides=16)
part(tag(centred(join('gacha_capsule', top, bottom, band)), outline=0.045))


# ── Templates: the slot machine round the reels ──────────────────────────────
# The three reels over a pet's head are the game's own (they carry pictures). This is the case they spin in:
# it faces the camera (low Y), and its window is the origin.
plate = box('reels_back', (1.74, 0.12, 0.66), 'ink', at=(0, 0.36, 0), bevel=0.03)
bars = [box('reels_bar_%d' % i, (1.98, 0.74, 0.16), 'gold', at=(0, 0.06, side * 0.41), bevel=0.06) for i, side in enumerate((-1, 1))]
posts = [box('reels_post_%d' % i, (0.16, 0.74, 0.98), 'gold', at=(side * 0.91, 0.06, 0), bevel=0.06) for i, side in enumerate((-1, 1))]
lamp = ball('reels_lamp', 0.12, 'danger', at=(0, 0.06, 0.54))
part(tag(centred(join('reels', plate, *bars, *posts, lamp)), outline=0.04, shadow=False))
