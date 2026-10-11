# The winner's stage, set up on the brawl's platform at night once the last round is over. The camera circles
# it, so it has no back: everything is built in the round, low near the podium and taller toward the corners,
# where nothing can come between the camera and a pet. It is dressed for a gala, in gold, cream and velvet:
# the bright colours on this stage are the players' own.
# The podium's steps, the crown, the lamps and the cannons are templates: the game places and moves them.
import glob
import os

from kit import *

HALF = 8.0
CORNER = 6.6
STEPS = {1: 1.5, 2: 1.0, 3: 0.6}

guide_floor(HALF * 2, HALF * 2)
for spot in ((0, 0, 1.5), (-1.9, 0, 1.0), (1.9, 0, 0.6), (-5.7, -1.0, 0)):
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
tag(box('runner', (2.3, 4.2, 0.018), 'velvet', at=(0, -5.9, 0.009), bevel=0), outline=0, shadow=False)
for index, side in enumerate((-1, 1)):
    tag(box('runner_edge_%d' % index, (0.2, 3.95, 0.024), 'gold', at=(side * 1.15, -6.03, 0.012), bevel=0), outline=0, shadow=False)


# ── The corners: lamp towers, and bunting strung between them ────────────────
foot = box('tower_foot', (1.0, 1.0, 0.3), 'truss', at=(0, 0, 0.15), bevel=0.1)
post = cylinder('tower_post', 0.2, 3.3, 'truss', at=(0, 0, 1.95), sides=10)
bands = [lathe('tower_band_%d' % index, [(0.16, z - 0.09), (0.27, z - 0.09), (0.29, z), (0.27, z + 0.09), (0.16, z + 0.09)], 'gold', sides=10) for index, z in enumerate((0.55, 1.7, 2.85))]
head = lathe('tower_head', [(0, 3.5), (0.34, 3.5), (0.38, 3.58), (0.3, 3.7), (0.14, 3.76), (0, 3.76)], 'gold', sides=12)
tower = tag(place(centred(join('tower_a', foot, post, *bands, head)), at=(-CORNER, CORNER, 0)), outline=0.05)
for index, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, -1))):
    copy(tower, 'tower_%s' % 'bcd'[index], at=(sx * CORNER, sy * CORNER, 0))

rope_points = arc((-CORNER, CORNER, 3.5), (CORNER, CORNER, 3.5), -1.15, steps=14)
rope = pipe('bunting_rope', rope_points, 0.04, 'truss', sides=5)
flags = []
for index in range(1, 14):
    a, b = Vector(rope_points[index - 1]), Vector(rope_points[index])
    middle = (a + b) / 2
    lean = math.degrees(math.atan2(b.z - a.z, b.x - a.x))
    flags.append(slab('bunting_flag_%d' % index, [(-0.3, 0.02), (0, -0.66), (0.3, 0.02)], 0.06, ('gold', 'cream', 'velvet')[index % 3], at=(middle.x, middle.y, middle.z - 0.02), rot=(90, lean * 0.6, 0), bevel=0.02))
bunting = tag(join('bunting_a', rope, *flags), outline=0.035, shadow=False)
for index in range(1, 4):
    copy(bunting, 'bunting_%s' % 'abcd'[index], at=(0, 0, 0), rot=(0, 0, index * 90))


# ── Behind the podium: the cup, and balloons ─────────────────────────────────
# They stand well back from the podium. The camera circles close, and anything tall near the middle would
# pass in front of the winner once a turn.
TROPHY = (0, 5.5, 0)
pedestal = lathe('trophy_pedestal', [(0, 0), (0.66, 0), (0.7, 0.1), (0.54, 0.2), (0.5, 0.62), (0.62, 0.72), (0.62, 0.82), (0, 0.82)], 'trim', sides=16)
sash = lathe('trophy_sash', [(0.5, 0.3), (0.56, 0.3), (0.56, 0.54), (0.5, 0.54)], 'velvet', sides=16)
tag(place(join('trophy_stand', pedestal, sash), at=TROPHY), outline=0.045)
cup = lathe('trophy_bowl', [(0, 0.82), (0.36, 0.82), (0.38, 0.92), (0.14, 1.02), (0.11, 1.26), (0.2, 1.36), (0.5, 1.58), (0.64, 1.95), (0.68, 2.34), (0.6, 2.36), (0.56, 2.0), (0.44, 1.72), (0, 1.62)], 'gold', sides=18)
ears = [ring('trophy_ear_%d' % index, 0.27, 0.075, 'gold', at=(side * 0.78, 0, 1.96), rot=(90, 0, 0), sides=14, around=6) for index, side in enumerate((-1, 1))]
emblem = [star('trophy_star_%d' % index, 0.2, 0.1, 0.08, 'cream', at=(0, side * 0.62, 1.98), rot=(90, 0, 0 if side < 0 else 180)) for index, side in enumerate((-1, 1))]
tag(spin(place(join('trophy_cup', cup, *ears, *emblem), at=TROPHY), seconds=9), outline=0.045)


def bunch(name, at, turn, seconds):
    """Three balloons on strings tied to a weight on the floor. The weight is the origin, so swaying it sways them all."""
    weight = box(name + '_weight', (0.34, 0.34, 0.24), 'gold', at=(0, 0, 0.12), bevel=0.06)
    pieces = [weight]
    for index, (x, y, z, color) in enumerate(((-0.42, 0.1, 2.5, 'gold'), (0.4, -0.12, 2.95, 'cream'), (0.05, 0.3, 3.5, 'velvet'))):
        pieces.append(lathe('%s_balloon_%d' % (name, index), [(0, -0.56), (0.08, -0.5), (0.12, -0.42), (0.34, -0.12), (0.44, 0.2), (0.38, 0.5), (0.2, 0.66), (0, 0.7)], color, at=(x, y, z), sides=12, smooth=60))
        pieces.append(pipe('%s_string_%d' % (name, index), [(0, 0, 0.2), (x * 0.5, y * 0.5, z * 0.5), (x, y, z - 0.5)], 0.03, 'truss', sides=4))
    return tag(sway(place(centred(join(name, *pieces)), at=at, rot=(0, 0, turn)), degrees=5, seconds=seconds, axis=0), outline=0.04, shadow=False)


bunch('balloons_left', (-4.3, 4.3, 0), 20, 3.4)
bunch('balloons_right', (4.3, 4.3, 0), 200, 4.1)


# ── Templates: the podium's steps ────────────────────────────────────────────
# Each is a moulded block with a white lip and foot. Its number is on a plate that leans against its foot,
# front and back, tilted up at the camera, and as big for third place as for first. The block alone (`step`)
# takes its player's colour when the place is revealed; the plate stays cream, so the number reads on any
# colour. A step stands on the origin and is as wide and as tall as the game says.
SLOPE = math.degrees(math.atan2(0.44, 0.42))
for place_, height in STEPS.items():
    name = 'step_%d' % place_
    block = box(name + '_block', (1.7, 1.7, height - 0.1), 'step', at=(0, 0, (height - 0.1) / 2), bevel=0.1)
    lip = box(name + '_lip', (1.84, 1.84, 0.16), 'step', at=(0, 0, height - 0.08), bevel=0.07)
    belt = box(name + '_belt', (1.76, 1.76, 0.08), 'trim', at=(0, 0, height - 0.2), bevel=0.03)
    skirt = box(name + '_skirt', (1.84, 1.84, 0.14), 'trim', at=(0, 0, 0.07), bevel=0.05)
    plates, numbers = [], []
    for index, (facing, turn) in enumerate(((-1, 0), (1, 180))):
        # The middle of the leaning face, and the way it faces.
        face = Vector((0, facing * (0.9 + 0.22), 0.31))
        out = Vector((0, facing * 0.42, 0.44)).normalized()
        plates += [
            slab('%s_wedge_%d' % (name, index), [(0, 0), (0.44, 0), (0.44, 0.1), (0, 0.52)], 1.24, 'gold', at=(0, facing * 0.9, 0), rot=(90, 0, -90 if facing < 0 else 90), bevel=0.03),
            box('%s_plate_%d' % (name, index), (1.04, 0.5, 0.05), 'plaque', at=tuple(face + out * 0.01), rot=(SLOPE, 0, turn), bevel=0.02),
        ]
        numbers.append(letter('%s_number_%d' % (name, index), str(place_), 0.42, 0.03, 'ink', at=tuple(face + out * 0.04), rot=(SLOPE, 0, turn)))
    body = tag(centred(join(name + '_body', block, lip, belt, skirt, *plates)), outline=0.045)
    # The numbers are ink already: an outline would only fatten them shut.
    digits = tag(centred(join(name + '_numbers', *numbers)), outline=0, shadow=False)
    part(group(name, body, digits))


# ── Templates: the crown ─────────────────────────────────────────────────────
band = lathe('crown_band', [(0.33, 0), (0.41, 0), (0.43, 0.06), (0.42, 0.22), (0.38, 0.26), (0.33, 0.24)], 'gold', sides=20)
cushion = ball('crown_cushion', 0.34, 'velvet', at=(0, 0, 0.2), scale=(1, 1, 0.62))
spikes, jewels = [], []
for index in range(5):
    turn = index / 5 * math.pi * 2
    x, y = math.sin(turn) * 0.37, math.cos(turn) * 0.37
    spikes.append(cone('crown_spike_%d' % index, 0.13, 0.34, 'gold', at=(x, y, 0.4), sides=8))
    spikes.append(ball('crown_pearl_%d' % index, 0.075, 'cream', at=(x, y, 0.6), detail=1))
    between = turn + math.pi / 5
    jewels.append(ball('crown_jewel_%d' % index, 0.075, 'velvet' if index % 2 else 'tierRare', at=(math.sin(between) * 0.42, math.cos(between) * 0.42, 0.13), detail=1))
part(tag(place(join('crown', band, cushion, *spikes, *jewels), scale=0.88), outline=0.04))


# ── Templates: a stage lamp ──────────────────────────────────────────────────
# It sits on a tower and the game aims it. Its pivot is the origin and it shines toward the camera (low Y).
can = centred(lathe('lamp_can', [(0, -0.42), (0.26, -0.42), (0.34, -0.3), (0.4, 0.3), (0.47, 0.38), (0.47, 0.46), (0.36, 0.46), (0.36, 0.36), (0, 0.36)], 'truss', rot=(90, 0, 0), sides=14))
rim = centred(lathe('lamp_rim', [(0.4, 0.3), (0.5, 0.36), (0.5, 0.5), (0.4, 0.5)], 'gold', rot=(90, 0, 0), sides=14))
knuckle = ball('lamp_knuckle', 0.2, 'gold', at=(0, 0.1, -0.3), detail=1)
shell = tag(join('lamp_shell', can, rim, knuckle), outline=0.045)
lens = tag(centred(lathe('lamp_lens', [(0, 0.34), (0.37, 0.34), (0.37, 0.43), (0, 0.45)], 'lamp', rot=(90, 0, 0), sides=14)), glow=1.9, outline=0, shadow=False)
part(group('lamp', shell, lens))

# A footlight for the rim of the rug: a gold cup and a bulb.
cup = tag(lathe('bulb_cup', [(0, 0), (0.17, 0), (0.2, 0.06), (0.16, 0.12), (0, 0.12)], 'gold', sides=10), outline=0, shadow=False)
glass = tag(ball('bulb_glass', 0.15, 'lamp', at=(0, 0, 0.16), scale=(1, 1, 0.9)), glow=1.7, outline=0, shadow=False)
part(group('bulb', cup, glass))


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
barrel = tag(place(join('cannon_barrel', tube, *hoops, lip, knob), at=(0, 0, 0.52), rot=(0, -34, 0)), outline=0.045)
part(group('cannon', carriage, barrel))
