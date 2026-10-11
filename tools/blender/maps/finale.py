# The winner's stage, set up on the brawl's platform at night once the last round is over. The camera stands
# in front of it, low, like an audience, and swings from side to side without ever going behind: so the stage
# has a front and a back. The podium is in the middle, and behind it a backdrop frames whoever stands on it:
# an arch of lights open to the night sky, with a velvet curtain drawn back at each side and, under each
# curtain, two tiers of seats for the audience the game brings.
# Nothing tall stands in front of the podium: from down there it would loom at the edge of the picture.
# It is dressed for a gala, in gold, cream and velvet: the bright colours on this stage are the players' own.
# The podium's steps, the crown, the lamps, the cannons, the cup and the balloons that are let go are
# templates: the game places and moves them.
#
# A piece costs the game one drawing for each colour it has, another for each if it is outlined, and another
# for each if it casts a shadow. The sun is nearly overhead and the camera is in front, so the shadow of
# anything that stands at the back or hangs in the air falls where nobody sees it: those pieces cast none.
import glob
import os

from kit import *

HALF = 8.0
STEPS = {1: 1.5, 2: 1.0, 3: 0.6}
# The backdrop: how far behind the podium it stands, how high its floor is raised, half the width of the arch,
# how high the curtain rods hang and where its outer posts are. The arch is low and wide: its top has to stay
# under the banner at the top of the picture, and its feet outside the three steps.
BACK = 5.0
DAIS = 0.3
ARCH = 3.5
ROD = 3.5
TOWER = 6.9

guide_floor(HALF * 2, HALF * 2)
for spot in ((0, 0, 1.5), (-1.9, 0, 1.0), (1.9, 0, 0.6), (-3.8, 1.7, 0), (3.8, 1.7, 0), (-5.5, 2.6, 0)):
    guide_pet(spot)


# ── Helpers of this map ──────────────────────────────────────────────────────

def game_font():
    """Lilita One, the font of every big word in the game, so the podium's numbers are the HUD's numbers."""
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


def centred(obj):
    """Moves an object's own origin to the middle of the world without moving its shape: the game places a template by that point."""
    obj.data.transform(obj.matrix_basis.copy())
    obj.matrix_basis = Matrix.Identity(4)
    return obj


def star(name, outer, inner, depth, color, at=(0, 0, 0), rot=(0, 0, 0)):
    outline = [(math.sin(math.pi * i / 5) * (outer if i % 2 == 0 else inner), math.cos(math.pi * i / 5) * (outer if i % 2 == 0 else inner)) for i in range(10)]
    return slab(name, list(reversed(outline)), depth, color, at=at, rot=rot, bevel=0.02)


# ── The floor of the stage ───────────────────────────────────────────────────
# A round velvet rug with a gold edge, and a runner from it to the front of the platform. They are a
# finger thick: the rings the game draws on the floor at each reveal must still show over them.
RUG = 3.9
tag(lathe('rug', [(0, 0.0), (RUG, 0.0), (RUG, 0.02), (0, 0.02)], 'velvet', sides=48), outline=0, shadow=False)
tag(lathe('rug_ring', [(RUG - 0.85, 0.0), (RUG - 0.65, 0.0), (RUG - 0.65, 0.023), (RUG - 0.85, 0.023)], 'velvetDark', sides=48), outline=0, shadow=False)
tag(lathe('rug_edge', [(RUG - 0.14, 0.0), (RUG + 0.24, 0.0), (RUG + 0.24, 0.026), (RUG - 0.14, 0.026)], 'gold', sides=48), outline=0, shadow=False)
runner = box('runner', (2.3, 4.2, 0.018), 'velvet', at=(0, -5.9, 0.009), bevel=0)
edges = [box('runner_edge_%d' % index, (0.2, 3.95, 0.024), 'gold', at=(side * 1.15, -6.03, 0.012), bevel=0) for index, side in enumerate((-1, 1))]
tag(join('runner', runner, *edges), outline=0, shadow=False)

# The cups of the footlights round the rug, as one piece. Their bulbs are the game's, which makes them swell in turn.
FOOTLIGHTS = 16
cups = []
for index in range(FOOTLIGHTS):
    turn = (index + 0.5) / FOOTLIGHTS * math.pi * 2
    cups.append(lathe('cup_%d' % index, [(0, 0), (0.17, 0), (0.2, 0.06), (0.16, 0.12), (0, 0.12)], 'gold', at=(math.cos(turn) * (RUG + 0.44), math.sin(turn) * (RUG + 0.44), 0), sides=10))
tag(centred(join('footlight_cups', *cups)), outline=0, shadow=False)


# ── The backdrop ─────────────────────────────────────────────────────────────

def solid(name, bm, color, smooth):
    """Turns a closed bmesh into an object, sharp where it folds more than `smooth` degrees."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    limit = math.radians(smooth)
    for face in bm.faces:
        face.smooth = True
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.calc_face_angle(0) < limit
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def curtain(name, side):
    """
    One velvet curtain, hung from the arch's shoulder to the tower and drawn back to the tower, where it is
    tied: a pleated sheet with a flat back, since nobody ever stands behind it. `side` is -1 for the left one.
    Each pleat is a line from the rod down to the tie and on to the floor.
    """
    columns = 17
    bm = bmesh.new()
    front, back = [], []
    for i in range(columns):
        share = i / (columns - 1)
        top = Vector((2.15 + share * 4.7, ROD - 0.04))
        knee = Vector((top.x * 0.7 + 6.3 * 0.3, 2.2 - share * 0.4))
        tie = Vector((6.0 + share * 0.62, 1.7))
        foot = Vector((5.72 + share * 1.1, DAIS))
        path = [top.lerp(knee, t).lerp(knee.lerp(tie, t), t) for t in (0, 0.18, 0.38, 0.58, 0.8, 1)] + [tie.lerp(foot, t) for t in (0.3, 0.65, 1)]
        pleat = -0.14 if i % 2 else 0.1
        front.append([bm.verts.new((side * point.x, BACK + 0.3 + pleat, point.y)) for point in path])
        back.append([bm.verts.new((side * point.x, BACK + 0.62, point.y)) for point in path])
    rows = len(front[0])
    for i in range(columns - 1):
        for j in range(rows - 1):
            bm.faces.new((front[i][j], front[i + 1][j], front[i + 1][j + 1], front[i][j + 1]))
            bm.faces.new((back[i][j], back[i][j + 1], back[i + 1][j + 1], back[i + 1][j]))
    for i in range(columns - 1):
        for j in (0, rows - 1):
            bm.faces.new((front[i][j], front[i + 1][j], back[i + 1][j], back[i][j]))
    for j in range(rows - 1):
        for i in (0, columns - 1):
            bm.faces.new((front[i][j], front[i][j + 1], back[i][j + 1], back[i][j]))
    return solid(name, bm, 'velvet', 35)


# The floor of the backdrop: a low step along the back of the platform, with a gold edge.
slab_ = box('dais_floor', (HALF * 2 - 0.5, HALF - BACK + 0.25, DAIS), 'plaque', at=(0, (HALF + BACK - 0.75) / 2, DAIS / 2), bevel=0.06)
nosing = box('dais_nosing', (HALF * 2 - 0.4, 0.16, 0.14), 'gold', at=(0, BACK - 0.5, DAIS - 0.05), bevel=0.05)
tag(join('dais', slab_, nosing), outline=0.04, shadow=False)

# The arch: a fat gold hoop on two feet, open to the sky. It is the frame round whoever stands on the podium.
SPRING = DAIS + 1.6
RISE = 2.0
# Each leg leans by a hair: a tube that stands dead upright gets a twist where it starts to bend.
hoop_points = [(-ARCH - 0.002, BACK, DAIS)] + [(-math.cos(math.pi * i / 20) * ARCH, BACK, SPRING + math.sin(math.pi * i / 20) * RISE) for i in range(21)] + [(ARCH + 0.002, BACK, DAIS)]
hoop = pipe('arch_hoop', hoop_points, 0.24, 'gold', sides=10)
feet = [box('arch_foot_%d' % index, (0.9, 0.9, 0.42), 'gold', at=(side * ARCH, BACK, DAIS + 0.21), bevel=0.12) for index, side in enumerate((-1, 1))]
collars = [lathe('arch_collar_%d' % index, [(0.2, -0.1), (0.33, -0.1), (0.35, 0), (0.33, 0.1), (0.2, 0.1)], 'gold', at=(side * ARCH, BACK, SPRING), sides=12) for index, side in enumerate((-1, 1))]
tag(centred(join('arch', hoop, *feet, *collars)), outline=0.05, shadow=False)

# Its bulbs, in three strings that the game lights one after another, so the light runs round the arch.
strings = [[], [], []]
count = 19
for index in range(count):
    turn = math.pi * (index + 0.5) / count
    strings[index % 3].append(ball('arch_bulb_%d' % index, 0.15, 'lamp', at=(-math.cos(turn) * ARCH, BACK - 0.27, SPRING + math.sin(turn) * RISE), detail=1))
for index, bulbs in enumerate(strings):
    tag(centred(join('arch_bulbs_%d' % index, *bulbs)), glow=1.7, outline=0, shadow=False)

# A curtain at each side, on a rod from the arch's shoulder to a tower, with its tie and tassel.
for index, side in enumerate((-1, 1)):
    cloth = curtain('curtain_cloth_%d' % index, side)
    rod = pipe('curtain_rod_%d' % index, [(side * 2.0, BACK + 0.28, ROD + 0.04), (side * (TOWER - 0.1), BACK + 0.28, ROD + 0.04)], 0.12, 'gold', sides=8)
    tie = box('curtain_tie_%d' % index, (1.02, 0.62, 0.22), 'gold', at=(side * 6.3, BACK + 0.36, 1.7), rot=(0, side * 8, 0), bevel=0.08)
    tassel = lathe('curtain_tassel_%d' % index, [(0, -0.42), (0.13, -0.4), (0.15, -0.14), (0.08, -0.06), (0.14, 0.02), (0.1, 0.12), (0, 0.14)], 'gold', at=(side * 5.72, BACK + 0.04, 1.47), sides=8)
    tag(centred(join('curtain_%s' % 'lr'[index], cloth, rod, tie, tassel)), outline=0.045, shadow=False, receive=False)

# The outer posts: a lamp tower at each end of the backdrop. The game puts a lamp on each.
foot = box('tower_foot', (1.0, 1.0, 0.3), 'truss', at=(0, 0, 0.15), bevel=0.1)
post = cylinder('tower_post', 0.2, 3.3, 'truss', at=(0, 0, 1.95), sides=10)
bands = [lathe('tower_band_%d' % index, [(0.16, z - 0.09), (0.27, z - 0.09), (0.29, z), (0.27, z + 0.09), (0.16, z + 0.09)], 'gold', sides=10) for index, z in enumerate((0.55, 1.7, 2.85))]
head = lathe('tower_head', [(0, 3.5), (0.34, 3.5), (0.38, 3.58), (0.3, 3.7), (0.14, 3.76), (0, 3.76)], 'gold', sides=12)
tower = tag(place(centred(join('tower_l', foot, post, *bands, head)), at=(-TOWER, BACK, DAIS)), outline=0.05, shadow=False)
copy(tower, 'tower_r', at=(TOWER, BACK, DAIS))

# The audience's seats: under each curtain and in front of it, two tiers between the arch's foot and the tower.
# The game seats its audience there. They are clear of the arch's opening, which is the winner's.
SEATS = 5.175
tiers = [
    box('seats_low', (2.45, 0.8, 0.7), 'plaque', at=(0, 4.0, 0.35), bevel=0.06),
    box('seats_high', (2.45, 0.86, 1.35), 'plaque', at=(0, 4.8, 0.675), bevel=0.06),
    box('seats_low_face', (2.2, 0.08, 0.42), 'velvet', at=(0, 3.58, 0.31), bevel=0.02),
    box('seats_high_face', (2.2, 0.08, 0.4), 'velvet', at=(0, 4.36, 1.0), bevel=0.02),
    box('seats_low_nosing', (2.52, 0.16, 0.12), 'gold', at=(0, 3.62, 0.66), bevel=0.04),
    box('seats_high_nosing', (2.52, 0.16, 0.12), 'gold', at=(0, 4.4, 1.31), bevel=0.04),
]
seats = tag(place(centred(join('seats_l', *tiers)), at=(-SEATS, 0, 0)), outline=0.04, shadow=False)
copy(seats, 'seats_r', at=(SEATS, 0, 0))


# ── At the sides ─────────────────────────────────────────────────────────────
# On the left, three balloons on strings tied to a weight on the floor. The weight is the origin, so swaying
# it sways them all. The game lets them go when the winner is shown.
weight = box('balloons_weight', (0.34, 0.34, 0.24), 'gold', at=(0, 0, 0.12), bevel=0.06)
pieces = [weight]
BALLOON = [(0, -0.56), (0.08, -0.5), (0.12, -0.42), (0.34, -0.12), (0.44, 0.2), (0.38, 0.5), (0.2, 0.66), (0, 0.7)]
for index, (x, y, z, color) in enumerate(((-0.42, 0.1, 1.9, 'gold'), (0.4, -0.12, 2.3, 'cream'), (0.05, 0.3, 2.75, 'gold'))):
    pieces.append(lathe('balloon_%d' % index, BALLOON, color, at=(x, y, z), sides=12, smooth=60))
    pieces.append(pipe('balloon_string_%d' % index, [(0, 0, 0.2), (x * 0.5, y * 0.5, z * 0.5), (x, y, z - 0.5)], 0.03, 'truss', sides=4))
tag(sway(place(centred(join('balloons', *pieces)), at=(-6.8, 2.9, 0), rot=(0, 0, 20)), degrees=5, seconds=3.4, axis=0), outline=0.04, shadow=False)

# Templates: a balloon let go. For the winner the game lets the bunch go, and the audience lets go a flight of its own.
for color in ('gold', 'cream', 'velvet'):
    part(tag(lathe('balloon_' + color, BALLOON, color, sides=12, smooth=60), outline=0.04, shadow=False))

# Templates: the cup and its stand. The game stands them on the right and turns the cup itself, so it can spin
# it up and lift it off its stand when the winner is shown.
pedestal = lathe('trophy_pedestal', [(0, 0), (0.66, 0), (0.7, 0.1), (0.54, 0.2), (0.5, 0.62), (0.62, 0.72), (0.62, 0.82), (0, 0.82)], 'trim', sides=16)
sash = lathe('trophy_sash', [(0.5, 0.3), (0.56, 0.3), (0.56, 0.54), (0.5, 0.54)], 'velvet', sides=16)
part(tag(join('trophy_stand', pedestal, sash), outline=0.045))
cup = lathe('trophy_bowl', [(0, 0.82), (0.36, 0.82), (0.38, 0.92), (0.14, 1.02), (0.11, 1.26), (0.2, 1.36), (0.5, 1.58), (0.64, 1.95), (0.68, 2.34), (0.6, 2.36), (0.56, 2.0), (0.44, 1.72), (0, 1.62)], 'gold', sides=18)
ears = [ring('trophy_ear_%d' % index, 0.27, 0.075, 'gold', at=(side * 0.78, 0, 1.96), rot=(90, 0, 0), sides=14, around=6) for index, side in enumerate((-1, 1))]
emblem = [star('trophy_star_%d' % index, 0.2, 0.1, 0.08, 'cream', at=(0, side * 0.62, 1.98), rot=(90, 0, 0 if side < 0 else 180)) for index, side in enumerate((-1, 1))]
part(tag(join('trophy_cup', cup, *ears, *emblem), outline=0.045, shadow=False))


# ── Templates: the podium's steps ────────────────────────────────────────────
# Each is a moulded block with a white belt and foot. Its number hangs on a plate from the front of its lip,
# as big for third place as for first, and high: the players' cards cover the bottom of the picture.
# The block alone (`step`) takes its player's colour when the place is revealed; the plate stays cream, so the
# number reads on any colour. A step stands on the origin and is as wide and as tall as the game says.
for place_, height in STEPS.items():
    name = 'step_%d' % place_
    block = box(name + '_block', (1.7, 1.7, height - 0.1), 'step', at=(0, 0, (height - 0.1) / 2), bevel=0.1)
    lip = box(name + '_lip', (1.84, 1.84, 0.16), 'step', at=(0, 0, height - 0.08), bevel=0.07)
    belt = box(name + '_belt', (1.76, 1.76, 0.08), 'trim', at=(0, 0, height - 0.2), bevel=0.03)
    skirt = box(name + '_skirt', (1.84, 1.84, 0.14), 'trim', at=(0, 0, 0.07), bevel=0.05)
    middle = height - 0.31
    frame = box(name + '_plate_edge', (0.92, 0.08, 0.62), 'gold', at=(0, -0.94, middle), bevel=0.03)
    plate = box(name + '_plate', (0.8, 0.08, 0.5), 'plaque', at=(0, -0.97, middle), bevel=0.03)
    body = tag(centred(join(name + '_body', block, lip)), outline=0.045)
    # What is fitted on the block casts no shadow of its own: it stays inside the block's.
    fittings = tag(centred(join(name + '_fittings', belt, skirt, frame, plate)), outline=0.045, shadow=False)
    # The number is ink already: an outline would only fatten it shut.
    digit = tag(centred(letter(name + '_number', str(place_), 0.38, 0.05, 'ink', at=(0, -1.01, middle), rot=(90, 0, 0))), outline=0, shadow=False)
    part(group(name, body, fittings, digit))


# ── Templates: the crown ─────────────────────────────────────────────────────
band = lathe('crown_band', [(0.33, 0), (0.41, 0), (0.43, 0.06), (0.42, 0.22), (0.38, 0.26), (0.33, 0.24)], 'gold', sides=20)
cushion = ball('crown_cushion', 0.34, 'velvet', at=(0, 0, 0.2), scale=(1, 1, 0.62))
spikes, jewels = [], []
for index in range(5):
    turn = index / 5 * math.pi * 2
    x, y = math.sin(turn) * 0.37, math.cos(turn) * 0.37
    spikes.append(cone('crown_spike_%d' % index, 0.14, 0.26, 'gold', at=(x, y, 0.36), sides=8))
    spikes.append(ball('crown_pearl_%d' % index, 0.08, 'cream', at=(x, y, 0.51), detail=1))
    between = turn + math.pi / 5
    jewels.append(ball('crown_jewel_%d' % index, 0.075, 'velvet' if index % 2 else 'tierRare', at=(math.sin(between) * 0.42, math.cos(between) * 0.42, 0.13), detail=1))
part(tag(place(join('crown', band, cushion, *spikes, *jewels), scale=0.88), outline=0.04, shadow=False))


# ── Templates: a stage lamp ──────────────────────────────────────────────────
# It sits on a tower or on the arch and the game aims it. Its pivot is the origin and it shines toward the camera (low Y).
can = centred(lathe('lamp_can', [(0, -0.42), (0.26, -0.42), (0.34, -0.3), (0.4, 0.3), (0.47, 0.38), (0.47, 0.46), (0.36, 0.46), (0.36, 0.36), (0, 0.36)], 'truss', rot=(90, 0, 0), sides=14))
rim = centred(lathe('lamp_rim', [(0.4, 0.3), (0.5, 0.36), (0.5, 0.5), (0.4, 0.5)], 'gold', rot=(90, 0, 0), sides=14))
knuckle = ball('lamp_knuckle', 0.2, 'gold', at=(0, 0.1, -0.3), detail=1)
shell = tag(join('lamp_shell', can, rim, knuckle), outline=0.045, shadow=False)
lens = tag(centred(lathe('lamp_lens', [(0, 0.34), (0.37, 0.34), (0.37, 0.43), (0, 0.45)], 'lamp', rot=(90, 0, 0), sides=14)), glow=1.9, outline=0, shadow=False)
part(group('lamp', shell, lens))

# The bulb of a footlight. The game stands one in each cup round the rug.
part(tag(centred(ball('bulb', 0.15, 'lamp', at=(0, 0, 0.16), scale=(1, 1, 0.9))), glow=1.7, outline=0, shadow=False))


# ── Templates: a confetti cannon ─────────────────────────────────────────────
# A toy cannon on two wheels, pointing up and to the left (low X): the game stands one at each side of the
# podium, where its confetti bursts from. The barrel is a piece of its own, hinged at its breech, so the game
# can kick it back when it fires.
bed = box('cannon_bed', (0.62, 0.7, 0.26), 'truss', at=(0.05, 0, 0.3), bevel=0.08)
wheels = []
for index, side in enumerate((-1, 1)):
    wheels.append(cylinder('cannon_wheel_%d' % index, 0.36, 0.16, 'gold', at=(0.05, side * 0.46, 0.36), rot=(90, 0, 0), sides=14, bevel=0.03))
    wheels.append(cylinder('cannon_hub_%d' % index, 0.13, 0.22, 'truss', at=(0.05, side * 0.46, 0.36), rot=(90, 0, 0), sides=8))
carriage = tag(join('cannon_carriage', bed, *wheels), outline=0.045)
tube = lathe('cannon_tube', [(0, -0.3), (0.26, -0.3), (0.34, -0.16), (0.33, 0.52), (0.4, 0.66), (0.5, 0.94), (0.5, 1.0), (0.4, 1.0), (0.34, 0.72), (0, 0.64)], 'cream', sides=16)
hoops = [lathe('cannon_hoop_%d' % index, [(0.3, z - 0.07), (0.37, z - 0.07), (0.37, z + 0.07), (0.3, z + 0.07)], 'velvet', sides=16) for index, z in enumerate((0.0, 0.4))]
lip = lathe('cannon_lip', [(0.44, 0.9), (0.54, 0.9), (0.54, 1.02), (0.44, 1.02)], 'gold', sides=16)
knob = ball('cannon_knob', 0.14, 'gold', at=(0, 0, -0.36), detail=1)
# Only the tube casts the barrel's shadow: what is fitted on it stays inside that shadow.
fittings = tag(centred(join('cannon_fittings', *hoops, lip, knob)), outline=0.045, shadow=False)
barrel = group('cannon_barrel', tag(tube, outline=0.045), fittings, at=(0, 0, 0.52), rot=(0, -34, 0))
part(group('cannon', carriage, barrel))
