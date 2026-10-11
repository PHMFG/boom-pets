# Cor Certa: a dance floor floating in space. The game draws the floor itself (sixteen patches, each with its
# fruit), the band under it that takes the called colour and the fruit that pops up over each corner's
# speakers. This is everything round it: the stage under the floor, and a ring of hover pods carrying the
# speakers, the DJ's desk, the lights and the mirror ball, with a planet, a moon and a rocket far below.
#
# Every piece floats on a pod of its own, with nothing between the pods and the floor: whoever steps off
# the floor has to be seen falling past it into nothing. The camera looks down from the front, so what
# stands at the sides may be tall, the back is kept low enough to stay in the picture and the front lower still.
import math

from kit import *

# The floor: sixteen patches of three metres. Its top is Z = 0, and its tiles are a metre deep.
SIDE = 12.0
EDGE = SIDE / 2
# Flat things that should be seen face on lean back this far: the camera looks down at 52 degrees.
FACING = 38
# Nothing here moves fast, so its motion is written down 12 times a second instead of 30: the file is a third the size.
FPS = 12
bpy.context.scene.render.fps = FPS

guide_floor(width=SIDE, depth=SIDE)
for spot in ((-3, 2, 0), (2.5, -3, 0), (4.6, 4.6, 0)):
    guide_pet(spot)


def lit(obj, glow=1.5):
    """Something that shines: no outline, no shadow."""
    return tag(obj, glow=glow, outline=0, shadow=False)


def inked(obj, outline=0.05):
    return tag(obj, outline=outline)


def paced(seconds):
    """The nearest length that ends on a written frame, so a loop closes without a jump."""
    return max(1, round(seconds * FPS)) / FPS


def grounded(obj):
    """
    Gives a piece the scene's origin for its own. A joined piece is otherwise held by wherever its first part
    happened to be, and turned as that part was: this makes it something to place by its foot, or to hinge where it was built.
    """
    obj.data.transform(obj.matrix_basis)
    obj.matrix_basis = Matrix()
    return obj


shapes = {}


def again(kind, name, make):
    """
    One shape for everything of a kind: the first is made, the rest are copies of it, which add nothing to the file.
    `make` builds it round the origin; whoever asks puts it in its place.
    """
    if kind in shapes:
        return copy(shapes[kind], name, at=(0, 0, 0), rot=(0, 0, 0), scale=1)
    shapes[kind] = made = grounded(make())
    made.name = name
    return made


def beat(obj, seconds, swell=0.12, late=0.0):
    """A thump: a quick swell and a slower settle, once every `seconds`, starting `late` seconds in (half of it at most)."""
    x, y, z = obj.scale
    rest, big = (x, y, z), (x * (1 + swell), y * (1 + swell), z * (1 + swell))
    frames = [(late, rest), (late + seconds / 6, big), (late + seconds / 2, rest), (seconds, rest)]
    return key(obj, 'scale', frames if late == 0 else [(0, rest)] + frames)


def pod(name, radius):
    """A hover platform, its top at Z = 0: a dark dish with a pale lip and a line of light round it."""
    def dish():
        bowl = lathe('dish', [(0, -1.1), (radius * 0.28, -1.1), (radius * 0.4, -0.72), (radius * 0.92, -0.44), (radius, -0.24),
                              (radius, -0.05), (radius - 0.06, 0), (0, 0)], 'base', sides=24)
        return inked(join('dish', bowl, ring('lip', radius, 0.11, 'trim', at=(0, 0, -0.1), sides=24, around=6)))
    halo = again('halo_%g' % radius, name + '_halo', lambda: lit(ring('halo', radius + 0.04, 0.07, 'neon', sides=24, around=6)))
    return [again('pod_%g' % radius, name + '_pod', dish), place(halo, at=(0, 0, -0.3))]


def woofer(name, radius, at):
    """A speaker cone facing the front: a pale surround, a dark cone, a pale cap. One piece, so it can thump."""
    def cone():
        surround = ring('surround', radius * 0.87, radius * 0.14, 'cone', sides=18, around=6)
        paper = cylinder('paper', radius * 0.8, 0.08, 'coneDark', sides=18)
        cap = ball('cap', radius * 0.34, 'cone', at=(0, 0, 0.03), scale=(1, 1, 0.55), detail=2)
        return inked(join('woofer', surround, paper, cap))
    return place(again('woofer_%g' % radius, name, cone), at=at, rot=(90, 0, 0))


def cabinet(size, z):
    """One speaker box with its bottom at `z`, facing the front: the box, and the dark cloth its cones sit in."""
    width, depth, height = size
    shell = box('cabinet', size, 'speaker', at=(0, 0, z + height / 2), bevel=0.16)
    cloth = box('cloth', (width - 0.4, 0.16, height - 0.4), 'base', at=(0, -depth / 2 + 0.02, z + height / 2), bevel=0.06, segments=1)
    return [shell, cloth]


def star(name, radius, color='bulb'):
    """A four-pointed glint, lying flat."""
    outline = [(math.cos(math.pi * i / 4) * radius * (1 if i % 2 == 0 else 0.34), math.sin(math.pi * i / 4) * radius * (1 if i % 2 == 0 else 0.34)) for i in range(8)]
    return slab(name, outline, 0.1, color, bevel=0)


# ── The stage under the floor ────────────────────────────────────────────────
# A frame, open in the middle: where patches drop away there is nothing under them but space, and whoever was
# standing there falls clean through. The game's coloured band stands on the frame, and a ledge is left
# outside the band for the footlights.
frame = []
for side in (-1, 1):
    frame.append(box('deck', (SIDE + 2.0, 1.0, 0.9), 'base', at=(0, side * (EDGE + 0.5), -1.47), bevel=0.2))
    frame.append(box('deck', (1.0, SIDE + 0.4, 0.9), 'base', at=(side * (EDGE + 0.5), 0, -1.47), bevel=0.2))
    frame.append(box('keel', (SIDE + 1.3, 0.65, 0.9), 'speaker', at=(0, side * (EDGE + 0.33), -2.3), bevel=0.3))
    frame.append(box('keel', (0.65, SIDE + 0.4, 0.9), 'speaker', at=(side * (EDGE + 0.33), 0, -2.3), bevel=0.3))
tag(join('stage', *frame), outline=0.05, shadow=False)

# Footlights all the way round, on the ledge. The game turns them the called colour.
bulbs = []
RUN = EDGE + 0.68
for index in range(10):
    along = -RUN + index * RUN * 2 / 10
    for x, y in ((along, -RUN), (RUN, along), (-along, RUN), (-RUN, -along)):
        bulbs.append(lathe('bulb_%d' % len(bulbs), [(0.17, 0), (0.15, 0.09), (0.08, 0.15), (0, 0.17)], 'bulb', at=(x, y, -1.03), sides=10, smooth=70))
lit(join('footlights', *bulbs), glow=1.4)

# Three engines under the front edge, where the camera can see them burn.
for index, x in enumerate((-4.3, 0, 4.3)):
    bell = again('engine', 'engine_%d' % index, lambda: tag(lathe('engine', [(0, -1.0), (0.78, -1.05), (0.92, -1.05), (0.6, -0.45), (0.5, 0), (0, 0)], 'trim', sides=14), outline=0.05, shadow=False))
    place(bell, at=(x, -EDGE - 0.45, -2.7))
    fire = again('engine_fire', 'engine_fire_%d' % index, lambda: lit(lathe('engine_fire', [(0, -2.0), (0.3, -1.3), (0.62, -0.5), (0.66, 0), (0, 0)], 'flame', sides=10, smooth=70), glow=1.6))
    throb(place(fire, at=(x, -EDGE - 0.45, -3.7)), 0.14, paced(0.62 + index * 0.09))

# ── Speakers at the four corners ─────────────────────────────────────────────
# The back two are tall stacks, flown low so that they and the fruit over them stay in the picture; the front
# two are one box and a horn, so nothing at the front stands high. They all face the front, turned a little
# toward the middle, and each stack thumps at its own pace: never more than 2.6 beats a second.
def stack(index, x, y, z, tall, pace):
    name = 'speakers_%d' % index
    pace = paced(pace)

    def boxes():
        pieces = cabinet((2.3, 1.7, 1.85), 0)
        if tall:
            pieces += cabinet((2.0, 1.5, 1.65), 1.85)
            pieces.append(box('horn', (1.2, 0.2, 0.3), 'cone', at=(0, -0.84, 3.14), bevel=0.1, segments=1))
        else:
            pieces += cabinet((1.9, 1.4, 0.9), 1.85)
        return inked(join('boxes', *pieces))
    pieces = [again('boxes_tall' if tall else 'boxes_low', name + '_boxes', boxes)]
    pieces.append(beat(woofer(name + '_bass', 0.7, (0, -0.95, 0.92)), pace, 0.17))
    if tall:
        pieces.append(beat(woofer(name + '_mid', 0.46, (0, -0.85, 2.5)), pace, 0.13, late=pace / 2))
    else:
        pieces += [beat(woofer('%s_high_%d' % (name, side), 0.28, (side * 0.46, -0.8, 2.3)), pace, 0.13, late=pace / 2) for side in (-1, 1)]
    # Where the game hangs the called fruit: it rides with the pod, sitting right on the top box so that it is low
    # enough to stay in the picture.
    sign = bpy.data.objects.new('sign_%d' % index, None)
    bpy.context.scene.collection.objects.link(sign)
    sign.location = (0, 0, (3.5 if tall else 2.75) + 1.15)
    holder = group(name, *pieces, *pod(name, 2.0), sign, at=(x, y, z), rot=(0, 0, 14 if x < 0 else -14))
    return bob(holder, 0.16, paced(3.4 + index * 0.45))


stack(0, -8.6, 8.1, -3.3, True, 0.5)
stack(1, 8.6, 8.1, -3.3, True, 0.6)
stack(2, -8.6, -7.6, -1.9, False, 0.55)
stack(3, 8.6, -7.6, -1.9, False, 0.65)

# ── The DJ's desk, behind the floor ──────────────────────────────────────────
DESK = 1.9
desk = [
    box('dj_pod', (8.8, 3.2, 0.9), 'base', at=(0, 0, -0.45), bevel=0.3),
    box('dj_lip', (8.9, 3.3, 0.22), 'trim', at=(0, 0, -0.14), bevel=0.1, segments=1),
    box('dj_desk', (6.9, 1.9, DESK), 'speaker', at=(0, 0.2, DESK / 2), bevel=0.2),
    box('dj_front', (6.4, 0.2, 1.5), 'base', at=(0, -0.8, DESK / 2), bevel=0.06, segments=1),
    box('dj_top', (7.1, 2.1, 0.2), 'trim', at=(0, 0.2, DESK), bevel=0.09, segments=1),
]
# The mixer between the decks: knobs, two faders and a row of lamps.
desk.append(box('mixer', (1.5, 1.5, 0.2), 'base', at=(0, 0.2, DESK + 0.16), bevel=0.07, segments=1))
for index, (x, y) in enumerate(((-0.45, 0.6), (0, 0.6), (0.45, 0.6), (-0.45, 0.2), (0.45, 0.2))):
    desk.append(cylinder('knob_%d' % index, 0.13, 0.16, 'cone', at=(x, y + 0.2, DESK + 0.32), sides=8))
for index, x in enumerate((-0.3, 0.3)):
    desk.append(box('fader_%d' % index, (0.2, 0.34, 0.14), 'cone', at=(x, -0.2 + index * 0.16, DESK + 0.3), bevel=0))
# A turntable each side: its plinth, its platter and its arm.
for index, x in enumerate((-2.2, 2.2)):
    desk.append(box('deck_%d' % index, (1.9, 1.7, 0.16), 'base', at=(x, 0.2, DESK + 0.14), bevel=0.06, segments=1))
    desk.append(cylinder('platter_%d' % index, 0.74, 0.1, 'cone', at=(x, 0.2, DESK + 0.24), sides=20))
    desk.append(cylinder('pivot_%d' % index, 0.14, 0.26, 'cone', at=(x + 0.72, 0.8, DESK + 0.32), sides=8))
    desk.append(pipe('arm_%d' % index, [(x + 0.72, 0.8, DESK + 0.44), (x + 0.6, 0.25, DESK + 0.44), (x + 0.34, -0.04, DESK + 0.36)], 0.06, 'cone', sides=6))
dj = [inked(join('dj_booth', *desk))]
dj.append(lit(box('dj_halo', (8.98, 3.38, 0.12), 'neon', at=(0, 0, -0.4), bevel=0)))
dj.append(lit(join('mixer_lamps', *[ball('lamp_%d' % index, 0.09, 'bulb', at=(-0.2 + index * 0.2, 0.36, DESK + 0.28), detail=1) for index in range(3)])))


# The records. Each carries two wedges of shine and a bar across its label, so it can be seen turning.
def record():
    disc = cylinder('record', 0.66, 0.06, 'vinyl', sides=20)
    label = cylinder('label', 0.25, 0.1, 'label', sides=12)
    bar = box('label_bar', (0.42, 0.12, 0.12), 'cone', bevel=0)
    shine = []
    for turn in (20, 200):
        points = [(math.cos(math.radians(turn + step * 12)) * reach, math.sin(math.radians(turn + step * 12)) * reach) for reach, steps in ((0.3, range(4)), (0.62, range(3, -1, -1))) for step in steps]
        shine.append(slab('shine_%d' % turn, points, 0.08, 'vinylShine', bevel=0))
    return inked(join('record', disc, label, bar, *shine), 0.03)


for index, x in enumerate((-2.2, 2.2)):
    dj.append(spin(place(again('record', 'record_%d' % index, record), at=(x, 0.2, DESK + 0.32)), paced(2.2 + index * 0.5), turns=-1))

# A row of bars across the front of the desk, jumping to the music. Each stands on its own foot, so it grows upward.
BARS = 11
for index in range(BARS):
    def level():
        made = box('level', (0.38, 0.1, 1.0), 'neon', bevel=0)
        made.data.transform(Matrix.Translation((0, 0, 0.5)))
        return lit(made, glow=1.1)
    height = 0.45 + 0.8 * abs(math.sin(index * 1.9 + 0.6))
    low = height * (0.3 + 0.25 * ((index * 7) % 5) / 4)
    pace = paced(0.5 + ((index * 5) % 7) * 0.08)
    bar = place(again('level', 'level_%d' % index, level), at=((index - (BARS - 1) / 2) * 0.54, -0.93, 0.32))
    dj.append(key(bar, 'scale', [(0, (1, 1, height)), (pace / 2, (1, 1, low)), (pace, (1, 1, height))]))


# ── Lights ───────────────────────────────────────────────────────────────────
def mast(height):
    """A chunky pole of pale metal with a collar every so often."""
    pieces = [box('mast', (0.44, 0.44, height), 'truss', at=(0, 0, height / 2), bevel=0.1, segments=1)]
    for index in range(int(height / 1.5)):
        pieces.append(box('collar_%d' % index, (0.62, 0.62, 0.22), 'trim', at=(0, 0, 0.3 + index * 1.5), bevel=0.07, segments=1))
    return pieces


def spot(name, at, turn, tilt, sweep, seconds, color='bulb'):
    """
    A spotlight can that pans slowly to and fro. `turn` is where it points (0 is the front) and `tilt` how far
    it looks down. Every can here looks up and out toward whoever is watching, so its lit lens is what the camera sees.
    """
    def can():
        body = lathe('can', [(0, -0.3), (0.26, -0.3), (0.34, -0.16), (0.42, 0.55), (0.46, 0.6), (0.46, 0.7), (0, 0.7)], 'speaker', sides=14)
        return inked(join('can', body, box('yoke', (1.1, 0.22, 0.22), 'truss', at=(0, 0, 0.05), bevel=0.07, segments=1)), 0.045)
    lens = again('lens_' + color, name + '_lens', lambda: lit(cylinder('lens', 0.38, 0.08, color, sides=14), glow=1.6))
    # The can's own Z is where it shines: lean it over to the front, then down.
    aim = group(name + '_aim', again('can', name + '_can', can), place(lens, at=(0, 0, 0.72)), rot=(90 + tilt, 0, 0))
    return sway(group(name, aim, at=at, rot=(0, 0, turn)), sweep, paced(seconds), axis=2)


# Two cans at the ends of the DJ's pod, on short posts.
for index, x in enumerate((-3.95, 3.95)):
    dj.append(inked(again('post', 'dj_post_%d' % index, lambda: box('post', (0.4, 0.4, 1.9), 'truss', bevel=0.1, segments=1))))
    place(dj[-1], at=(x, 0.9, 0.95))
    dj.append(spot('dj_spot_%d' % index, (x, 0.9, 2.2), 0, -22, 30, 6.2 + index * 1.3, color='bulb' if index == 0 else 'neon'))
bob(group('dj', *dj, at=(0, 8.9, -1.25)), 0.1, paced(4.6))

# The left tower: a mast with a bar along the top and two cans that sweep.
tower = mast(5.6)
tower.append(box('tower_bar', (0.36, 3.0, 0.36), 'truss', at=(0, 0, 5.5), bevel=0.1, segments=1))
tower = [inked(join('tower', *tower))]
tower.append(spot('tower_spot_0', (0.1, 1.15, 4.95), 50, -8, 22, 7.0))
tower.append(spot('tower_spot_1', (0.1, -1.15, 4.95), 62, -4, 26, 5.6, color='neon'))
bob(group('lights', *tower, *pod('lights', 1.35), at=(-10.2, 1.6, -1.6)), 0.14, paced(4.1))

# The right tower holds the mirror ball out on an arm, and one can lights it.
rig = mast(6.2)
rig.append(box('rig_arm', (2.6, 0.36, 0.36), 'truss', at=(-1.0, 0, 6.0), bevel=0.1, segments=1))
rig.append(pipe('rig_brace', [(0, 0, 4.7), (-1.5, 0, 5.95)], 0.1, 'truss', sides=6))
rig += [ball('chain_%d' % index, 0.11, 'cone', at=(-1.85, 0, 5.72 - index * 0.2), detail=1, smooth=80) for index in range(3)]
rig = [inked(join('rig', *rig))]


def mirror_ball(name, radius, at):
    """A ball of little flat mirrors, light and dark in turn, so its turning shows."""
    rows, sides = 8, 16
    profile = [(max(0.0, math.sin(math.pi * row / rows)) * radius, -math.cos(math.pi * row / rows) * radius) for row in range(rows + 1)]
    profile[0], profile[-1] = (0, -radius), (0, radius)
    made = lathe(name, profile, 'mirror', at=at, sides=sides, smooth=1)
    made.data.materials.append(mat('mirrorDark'))
    for index, polygon in enumerate(made.data.polygons):
        polygon.material_index = (index // sides + index % sides) % 2
    return made


rig.append(spin(inked(mirror_ball('mirror_ball', 1.0, (-1.85, 0, 4.15))), 9.0))
# Glints round it that swell and shrink, each at its own pace.
for index, (x, y, z, size, pace) in enumerate(((-3.0, -0.3, 5.0, 0.42, 2.3), (-0.75, -0.4, 3.5, 0.34, 1.7), (-2.7, -0.5, 3.2, 0.26, 2.9))):
    glint = place(again('glint', 'glint_%d' % index, lambda: lit(star('glint', 1.0), glow=1.8)), at=(x, y, z), rot=(FACING, 0, 0))
    rig.append(key(glint, 'scale', [(0, (size * 0.25,) * 3), (paced(pace) / 2, (size,) * 3), (paced(pace), (size * 0.25,) * 3)]))
rig.append(spot('rig_spot', (-0.5, -0.1, 2.4), -55, -10, 16, 6.4))
bob(group('mirror', *rig, *pod('mirror', 1.35), at=(10.1, -0.4, -1.6)), 0.14, paced(3.7))


# ── Floating about ───────────────────────────────────────────────────────────
def note(double):
    """A music note drawn flat: one with a flag, or two joined by a beam."""
    def head(x, y):
        lean = 0.35
        points = [(x + math.cos(angle) * 0.36 * math.cos(lean) - math.sin(angle) * 0.25 * math.sin(lean), y + math.cos(angle) * 0.36 * math.sin(lean) + math.sin(angle) * 0.25 * math.cos(lean))
                  for angle in [2 * math.pi * step / 10 for step in range(10)]]
        return slab('head', points, 0.2, 'cone', bevel=0)
    if double:
        pieces = [head(0, 0), head(1.0, 0.2), box('stem', (0.16, 1.25, 0.2), 'cone', at=(0.3, 0.66, 0), bevel=0),
                  box('stem', (0.16, 1.25, 0.2), 'cone', at=(1.3, 0.86, 0), bevel=0),
                  slab('beam', [(0.22, 1.02), (1.38, 1.24), (1.38, 1.56), (0.22, 1.34)], 0.2, 'cone', bevel=0)]
    else:
        pieces = [head(0, 0), box('stem', (0.16, 1.3, 0.2), 'cone', at=(0.3, 0.68, 0), bevel=0),
                  slab('flag', [(0.3, 0.86), (0.82, 0.5), (0.9, 0.72), (0.38, 1.33)], 0.2, 'cone', bevel=0)]
    return tag(join('note', *pieces), outline=0.05, shadow=False)


for index, (x, y, z, double, roll, size) in enumerate((
    (-11.9, 5.2, 0.4, True, 12, 1.0), (11.6, 4.6, 0.7, False, -14, 1.0), (-11.4, -3.6, -0.6, False, 10, 0.85),
    (11.9, -3.9, -0.2, True, -8, 0.85), (-6.0, 10.6, -1.4, False, -12, 0.8), (6.1, 10.7, -1.2, True, 10, 0.8),
)):
    drawn = place(again('note_double' if double else 'note_single', 'note_%d' % index, lambda: note(double)), rot=(0, 0, roll), scale=size)
    bob(group('floating_%d' % index, drawn, at=(x, y, z), rot=(FACING, 0, 0)), 0.45, paced(2.6 + (index * 0.7) % 1.9))

# ── Far below ────────────────────────────────────────────────────────────────
# A ringed planet off to the left, with a storm on it and a little moon riding its ring.
GLOBE = 6.0
arc_of = lambda degrees, reach: (math.cos(math.radians(degrees)) * reach, math.sin(math.radians(degrees)) * reach)
globe = ball('planet', GLOBE, 'planet', detail=3)
bands = [lathe('planet_band_%d' % index, [arc_of(low, GLOBE + 0.05), arc_of((low + high) / 2, GLOBE + 0.09), arc_of(high, GLOBE + 0.05)], 'planetBand', sides=28)
         for index, (low, high) in enumerate(((-38, -24), (6, 16), (34, 44)))]
storm = ball('planet_storm', 1.3, 'planetBand', at=(GLOBE - 0.18, 0, -0.8), scale=(0.3, 1.4, 0.8), detail=2)
planet = spin(join('planet', globe, *bands, storm), 40)
hoop = lathe('planet_ring', [(8.0, -0.2), (11.6, -0.2), (11.6, 0.2), (8.0, 0.2), (8.0, -0.2)], 'ring', sides=36)
gap = lathe('planet_ring_gap', [(9.5, 0.18), (10.1, 0.18), (10.1, 0.25), (9.5, 0.25), (9.5, 0.18)], 'ringDark', sides=36)
rider = spin(group('planet_moon_orbit', ball('planet_moon', 0.95, 'moon', at=(13.0, 0, 0), detail=2)), 26)
tag(group('saturn', planet, join('planet_ring', hoop, gap), rider, at=(-23.5, 16, -30), rot=(-22, 14, 0)), outline=0.2, shadow=False)

# A cratered moon to the right.
MOON = 4.0


def crater(name, turn, rise, across):
    """A dark patch on the moon: the cap of a second ball sunk into it, standing just proud of the surface."""
    proud = 0.14
    deep = (2 * MOON * proud + proud ** 2) / (2 * (MOON + proud - math.sqrt(MOON ** 2 - across ** 2)))
    toward = (math.sin(math.radians(turn)) * math.cos(math.radians(rise)), -math.cos(math.radians(turn)) * math.cos(math.radians(rise)), math.sin(math.radians(rise)))
    return ball(name, MOON + proud - deep, 'moonDark', at=tuple(part * deep for part in toward), detail=2)


craters = [crater('crater_%d' % index, turn, rise, across)
           for index, (turn, rise, across) in enumerate(((-20, 40, 1.0), (25, 62, 0.7), (40, 20, 0.6), (-50, 10, 0.8), (150, 50, 0.9), (200, 30, 0.6), (100, 55, 0.7)))]
moon = tag(join('moon', ball('moon', MOON, 'moon', detail=3), *craters), outline=0.16, shadow=False)
spin(place(moon, at=(23, 6, -27)), 36)

# A toy rocket that flies a ring round the stage, below the floor: behind the speakers, past the planet and back.
nose_up = (0, 90, 0)
hull = lathe('rocket', [(0, 0), (0.42, 0.05), (0.62, 0.7), (0.64, 1.5), (0.5, 2.2), (0.3, 2.6), (0, 2.6)], 'rocket', rot=nose_up, sides=14)
nose = lathe('rocket_nose', [(0.52, 2.15), (0.34, 2.7), (0.12, 3.05), (0, 3.1)], 'fin', rot=nose_up, sides=14)
porthole = ring('rocket_window', 0.3, 0.09, 'fin', at=(1.45, 0, 0.6), sides=12, around=6)
glass = lit(cylinder('rocket_glass', 0.28, 0.1, 'neon', at=(1.45, 0, 0.6), sides=12), glow=1.3)
fins = [slab('rocket_fin_%d' % index, [(0, 0.5), (-0.5, 1.25), (0.3, 1.25), (0.95, 0.55)], 0.16, 'fin', rot=(index * 120 + 90, 0, 0), bevel=0) for index in range(3)]
exhaust = lit(lathe('rocket_fire', [(0, -1.5), (0.2, -0.9), (0.4, -0.3), (0.38, 0), (0, 0)], 'flame', rot=nose_up, sides=8, smooth=70), glow=1.7)
throb(exhaust, 0.2, paced(0.5))
ship = group('rocket', tag(join('rocket_body', hull, nose, porthole, *fins), outline=0.07, shadow=False), glass, exhaust)
LOOP, STEPS = 34.0, 48
flight = [(math.cos(2 * math.pi * step / STEPS), math.sin(2 * math.pi * step / STEPS)) for step in range(STEPS + 1)]
key(ship, 'location', [(LOOP * step / STEPS, (c * 15.5, 2.0 + s * 12.5, -7.5 + s * 1.5 + math.sin(4 * math.pi * step / STEPS) * 0.8)) for step, (c, s) in enumerate(flight)], linear=True)
# It points where it is going. The angle is kept running on past a full turn, so it never spins back.
headings = []
for c, s in flight:
    heading = math.atan2(c * 12.5, -s * 15.5)
    while headings and heading < headings[-1] - 1e-6:
        heading += 2 * math.pi
    headings.append(heading)
key(ship, 'rotation_euler', [(LOOP * step / STEPS, (0, 0, heading)) for step, heading in enumerate(headings)], linear=True)

# Stars that twinkle slowly, scattered below and behind.
for index, (x, y, z, size, pace) in enumerate((
    (-17, 2, -9, 0.5, 2.6), (-14.5, -6, -6, 0.36, 3.4), (16.5, -5, -8, 0.5, 2.9), (15, 12, -12, 0.6, 3.8), (-9, 15, -10, 0.5, 2.2),
    (3, 16, -9, 0.42, 3.1), (19, 1, -14, 0.56, 2.4), (-20, 10, -14, 0.6, 3.6), (9.5, 14, -7, 0.36, 2.7), (-15.5, 8.5, -4.5, 0.32, 3.2),
)):
    twinkle = place(again('star', 'star_%d' % index, lambda: lit(star('star', 1.0), glow=1.7)), at=(x, y, z), rot=(FACING, 0, 0))
    key(twinkle, 'scale', [(0, (size * 0.35,) * 3), (paced(pace) / 2, (size,) * 3), (paced(pace), (size * 0.35,) * 3)])
