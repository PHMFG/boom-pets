# Cor Certa: a dance floor floating in space. The game draws the floor itself (sixteen patches, each with its
# fruit), the band under it that takes the called colour and the fruit that pops up over each corner's
# speakers. This is everything round it: the stage under the floor, and a ring of hover pods carrying the
# speakers, the DJ's desk, the lights and the mirror ball, with a planet, a moon and a rocket far below.
#
# Every piece floats on a pod of its own, with nothing between the pods and the floor: whoever drops with a
# patch has to be seen falling past it into nothing. The camera looks down from the front, so what
# stands at the sides may be tall, the back is kept low enough to stay in the picture and the front lower still.
#
# The game stands a crowd here: dancers on the two pods under the lights and the mirror ball, the DJ on a
# riser behind the desk, and someone in the flying saucer. It also takes hold of what this file marks with
# `calls()`: those lights go the colour that is called. And it plays everything here faster wave by wave.
#
# The round's timer sits over the top middle of the picture, so what matters of the DJ's desk (its two
# turntables, its two meters) stands to either side of the middle. Between rounds the camera comes down low
# and looks across the stage: what it finds beyond is a giant planet, which the camera of a round never sees.
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


def calls(obj):
    """Marks a light that takes the called colour: the game finds it by this."""
    obj['calls'] = True
    return obj


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
        # Nothing is under a pod for its shadow to fall on.
        return tag(inked(join('dish', bowl, ring('lip', radius, 0.11, 'trim', at=(0, 0, -0.1), sides=24, around=6))), shadow=False)
    halo = again('halo_%g' % radius, name + '_halo', lambda: calls(lit(ring('halo', radius + 0.04, 0.07, 'neon', sides=24, around=6))))
    return [again('pod_%g' % radius, name + '_pod', dish), place(halo, at=(0, 0, -0.3))]


def woofer(name, radius, at, pair=0.0):
    """
    A speaker cone facing the front: a pale surround, a dark cone, a pale cap. One piece, so it can thump.
    With `pair`, it is two of them that far to each side, thumping as one.
    """
    def cones():
        pieces = []
        for x in ((-pair, pair) if pair else (0,)):
            pieces.append(ring('surround', radius * 0.87, radius * 0.14, 'cone', at=(x, 0, 0), sides=18, around=6))
            pieces.append(cylinder('paper', radius * 0.8, 0.08, 'coneDark', at=(x, 0, 0), sides=18))
            pieces.append(ball('cap', radius * 0.34, 'cone', at=(x, 0, 0.03), scale=(1, 1, 0.55), detail=2))
        return tag(inked(join('woofer', *pieces)), shadow=False)
    return place(again('woofer_%g_%g' % (radius, pair), name, cones), at=at, rot=(90, 0, 0))


def cabinet(size, z):
    """One speaker box with its bottom at `z`, facing the front: the box, and the dark cloth its cones sit in."""
    width, depth, height = size
    shell = box('cabinet', size, 'speaker', at=(0, 0, z + height / 2), bevel=0.16)
    cloth = box('cloth', (width - 0.4, 0.16, height - 0.4), 'base', at=(0, -depth / 2 + 0.02, z + height / 2), bevel=0.06, segments=1)
    return [shell, cloth]


def note(double, color='cone'):
    """A music note drawn flat: one with a flag, or two joined by a beam."""
    def head(x, y):
        lean = 0.35
        points = [(x + math.cos(angle) * 0.36 * math.cos(lean) - math.sin(angle) * 0.25 * math.sin(lean), y + math.cos(angle) * 0.36 * math.sin(lean) + math.sin(angle) * 0.25 * math.cos(lean))
                  for angle in [2 * math.pi * step / 10 for step in range(10)]]
        return slab('head', points, 0.2, color, bevel=0)
    if double:
        pieces = [head(0, 0), head(1.0, 0.2), box('stem', (0.16, 1.25, 0.2), color, at=(0.3, 0.66, 0), bevel=0),
                  box('stem', (0.16, 1.25, 0.2), color, at=(1.3, 0.86, 0), bevel=0),
                  slab('beam', [(0.22, 1.02), (1.38, 1.24), (1.38, 1.56), (0.22, 1.34)], 0.2, color, bevel=0)]
    else:
        pieces = [head(0, 0), box('stem', (0.16, 1.3, 0.2), color, at=(0.3, 0.68, 0), bevel=0),
                  slab('flag', [(0.3, 0.86), (0.82, 0.5), (0.9, 0.72), (0.38, 1.33)], 0.2, color, bevel=0)]
    return join('note', *pieces)


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
# The floor has a rail round it, which the game draws (it takes the called colour): nobody walks off this stage.
# These are the rail's corner posts, lower at the front.
for x in (-1, 1):
    for y, top in ((-1, 0.4), (1, 0.6)):
        frame.append(box('rim_post', (0.56, 0.56, top + 1.0), 'trim', at=(x * (EDGE + 0.3), y * (EDGE + 0.3), (top - 1.0) / 2), bevel=0.14))
tag(join('stage', *frame), outline=0.05, shadow=False)

# Footlights all the way round, on the ledge. The game turns them the called colour.
bulbs = []
RUN = EDGE + 0.68
for index in range(10):
    along = -RUN + index * RUN * 2 / 10
    for x, y in ((along, -RUN), (RUN, along), (-along, RUN), (-RUN, -along)):
        bulbs.append(lathe('bulb_%d' % len(bulbs), [(0.17, 0), (0.15, 0.09), (0.08, 0.15), (0, 0.17)], 'bulb', at=(x, y, -1.03), sides=10, smooth=70))
calls(lit(join('footlights', *bulbs), glow=1.4))

# Three engines under the front edge, where the camera can see them burn.
for index, x in enumerate((-4.3, 0, 4.3)):
    bell = again('engine', 'engine_%d' % index, lambda: tag(lathe('engine', [(0, -1.0), (0.78, -1.05), (0.92, -1.05), (0.6, -0.45), (0.5, 0), (0, 0)], 'trim', sides=14), outline=0.05, shadow=False))
    place(bell, at=(x, -EDGE - 0.45, -2.7))
    fire = again('engine_fire', 'engine_fire_%d' % index, lambda: lit(lathe('engine_fire', [(0, -2.0), (0.3, -1.3), (0.62, -0.5), (0.66, 0), (0, 0)], 'flame', sides=10, smooth=70), glow=1.6))
    throb(place(fire, at=(x, -EDGE - 0.45, -3.7)), 0.14, paced(0.62 + index * 0.09))

# ── Four stacks of speakers ──────────────────────────────────────────────────
# They stand down the two sides, beside the floor and not behind or in front of it: that is where the camera of a
# round still has them, and the fruit the game hangs over each, in the picture. The back two are tall and flown
# low; the front two are one box and a horn, so nothing toward the front stands high. They all face the front,
# turned a little toward the middle, and each stack thumps at its own pace: never more than 2.6 beats a second.
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
        pieces.append(beat(woofer(name + '_highs', 0.28, (0, -0.8, 2.3), pair=0.46), pace, 0.13, late=pace / 2))
    # Where the game hangs the called fruit: it rides with the pod, sitting right on the top box so that it is low
    # enough to stay in the picture.
    sign = bpy.data.objects.new('sign_%d' % index, None)
    bpy.context.scene.collection.objects.link(sign)
    sign.location = (0, 0, (3.5 if tall else 2.75) + 1.15)
    holder = group(name, *pieces, *pod(name, 1.75), sign, at=(x, y, z), rot=(0, 0, 14 if x < 0 else -14))
    return bob(holder, 0.16, paced(3.4 + index * 0.45))


stack(0, -9.0, 5.9, -2.8, True, 0.5)
stack(1, 9.0, 5.9, -2.8, True, 0.6)
stack(2, -8.9, -2.6, -2.4, False, 0.55)
stack(3, 8.9, -2.6, -2.4, False, 0.65)

# ── The DJ's desk, behind the floor ──────────────────────────────────────────
# Wide and low. A turntable and a meter stand at each end, clear of the timer; the mixer and a sign are in the
# middle, where only the low camera between rounds sees them.
DESK = 1.7
DECKS = 3.2
RISER = 1.4
desk = [
    box('dj_pod', (10.6, 4.4, 0.9), 'base', at=(0, 0.6, -0.45), bevel=0.3),
    box('dj_lip', (10.7, 4.5, 0.22), 'trim', at=(0, 0.6, -0.14), bevel=0.1, segments=1),
    # The game stands the DJ on this, so that it is seen over the desk.
    box('dj_riser', (2.4, 1.3, RISER), 'speaker', at=(0, 1.95, RISER / 2), bevel=0.14),
    box('dj_desk', (9.2, 1.9, DESK), 'speaker', at=(0, 0.2, DESK / 2), bevel=0.2),
    box('dj_front', (8.8, 0.2, 1.36), 'base', at=(0, -0.8, DESK / 2 + 0.02), bevel=0.06, segments=1),
    box('dj_top', (9.4, 2.1, 0.2), 'trim', at=(0, 0.2, DESK), bevel=0.09, segments=1),
]
# The mixer between the decks: knobs, two faders and a row of lamps.
desk.append(box('mixer', (1.6, 1.5, 0.2), 'base', at=(0, 0.2, DESK + 0.16), bevel=0.07, segments=1))
for x, y in ((-0.45, 0.6), (0, 0.6), (0.45, 0.6), (-0.45, 0.2), (0.45, 0.2)):
    desk.append(cylinder('knob', 0.13, 0.16, 'cone', at=(x, y + 0.2, DESK + 0.32), sides=8))
for index, x in enumerate((-0.3, 0.3)):
    desk.append(box('fader', (0.2, 0.34, 0.14), 'cone', at=(x, -0.2 + index * 0.16, DESK + 0.3), bevel=0))
# A turntable at each end: its plinth, its platter and its arm.
for x in (-DECKS, DECKS):
    desk.append(box('deck', (2.3, 1.9, 0.16), 'base', at=(x, 0.2, DESK + 0.14), bevel=0.06, segments=1))
    desk.append(cylinder('platter', 0.9, 0.1, 'cone', at=(x, 0.2, DESK + 0.24), sides=22))
    desk.append(cylinder('pivot', 0.15, 0.26, 'cone', at=(x + 0.88, 0.88, DESK + 0.32), sides=8))
    desk.append(pipe('arm', [(x + 0.88, 0.88, DESK + 0.44), (x + 0.74, 0.3, DESK + 0.44), (x + 0.42, -0.06, DESK + 0.36)], 0.06, 'cone', sides=6))
# A short post at each end of the pod, for a spotlight.
POSTS = 4.95
desk += [box('post', (0.4, 0.4, 1.9), 'truss', at=(x, 0.9, 0.95), bevel=0.1, segments=1) for x in (-POSTS, POSTS)]
dj = [inked(join('dj_booth', *desk))]
dj.append(calls(lit(box('dj_halo', (10.78, 4.58, 0.12), 'neon', at=(0, 0.6, -0.4), bevel=0))))
dj.append(lit(join('mixer_lamps', *[ball('lamp_%d' % index, 0.09, 'bulb', at=(-0.2 + index * 0.2, 0.36, DESK + 0.28), detail=1) for index in range(3)])))


# The records. Each carries two wedges of shine and a bar across its label, so it can be seen turning.
def record():
    disc = cylinder('record', 0.8, 0.06, 'vinyl', sides=22)
    label = cylinder('label', 0.3, 0.1, 'label', sides=12)
    bar = box('label_bar', (0.5, 0.14, 0.12), 'vinylShine', bevel=0)
    shine = []
    for turn in (20, 200):
        points = [(math.cos(math.radians(turn + step * 12)) * reach, math.sin(math.radians(turn + step * 12)) * reach) for reach, steps in ((0.36, range(4)), (0.75, range(3, -1, -1))) for step in steps]
        shine.append(slab('shine_%d' % turn, points, 0.08, 'vinylShine', bevel=0))
    return tag(inked(join('record', disc, label, bar, *shine), 0.03), shadow=False)


for index, x in enumerate((-DECKS, DECKS)):
    dj.append(spin(place(again('record', 'record_%d' % index, record), at=(x, 0.2, DESK + 0.32)), paced(2.2 + index * 0.5), turns=-1))

# A meter under each turntable: six bars that jump to the music. Each stands on its own foot, so it grows upward.
BARS = 6
meters = {-1: [], 1: []}
for index in range(BARS * 2):
    def level():
        made = box('level', (0.36, 0.1, 1.0), 'neon', bevel=0)
        made.data.transform(Matrix.Translation((0, 0, 0.5)))
        return calls(lit(made, glow=1.1))
    side, step = (-1, index) if index < BARS else (1, index - BARS)
    height = 0.4 + 0.72 * abs(math.sin(index * 1.9 + 0.6))
    low = height * (0.3 + 0.25 * ((index * 7) % 5) / 4)
    pace = paced(0.5 + ((index * 5) % 7) * 0.08)
    bar = place(again('level', 'level_%d' % index, level), at=(side * (DECKS - (BARS - 1) * 0.25 + step * 0.5), 0, 0))
    meters[side].append(key(bar, 'scale', [(0, (1, 1, height)), (pace / 2, (1, 1, low)), (pace, (1, 1, height))]))
# The game makes a whole meter jump when a colour is called: each hangs on a holder of its own, at its foot.
dj += [group('meter_%d' % index, *meters[side], at=(0, -0.93, 0.3)) for index, side in enumerate((-1, 1))]


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
        return tag(inked(join('can', body, box('yoke', (1.1, 0.22, 0.22), 'truss', at=(0, 0, 0.05), bevel=0.07, segments=1)), 0.045), shadow=False)
    lens = again('lens_' + color, name + '_lens', lambda: calls(lit(cylinder('lens', 0.38, 0.08, color, sides=14), glow=1.6)))
    # The can's own Z is where it shines: lean it over to the front, then down.
    aim = group(name + '_aim', again('can', name + '_can', can), place(lens, at=(0, 0, 0.72)), rot=(90 + tilt, 0, 0))
    return sway(group(name, aim, at=at, rot=(0, 0, turn)), sweep, paced(seconds), axis=2)


# A note for a sign on the middle of the desk's front, lit, and a can on each of the posts at its ends.
dj.append(calls(lit(place(grounded(note(True, 'bulb')), at=(-0.42, -0.95, 0.42), rot=(90, 0, 0), scale=0.62), glow=1.25)))
for index, x in enumerate((-POSTS, POSTS)):
    dj.append(spot('dj_spot_%d' % index, (x, 0.9, 2.2), 0, -22, 30, 6.2 + index * 1.3, color='bulb' if index == 0 else 'neon'))
bob(group('dj', *dj, at=(0, 8.75, -1.85)), 0.1, paced(4.6))

# A dance pod at each side, between the stacks. The game stands dancers on them; a mast rises from each one's
# outer rim, the left with lights and the right holding the mirror ball out over the dancers.
DANCE = dict(radius=2.0, y=1.75, z=-1.5, mast=1.35)

# The left tower: a mast with a bar along the top and two cans that sweep.
tower = mast(5.6)
tower.append(box('tower_bar', (0.36, 3.0, 0.36), 'truss', at=(0, 0, 5.5), bevel=0.1, segments=1))
tower = [inked(join('tower', *tower))]
tower.append(spot('tower_spot_0', (0.1, 1.15, 4.95), 50, -8, 22, 7.0))
tower.append(spot('tower_spot_1', (0.1, -1.15, 4.95), 62, -4, 26, 5.6, color='neon'))
bob(group('lights', group('tower_stand', *tower, at=(-DANCE['mast'], 0.9, 0)), *pod('lights', DANCE['radius']), at=(-9.5, DANCE['y'], DANCE['z'])), 0.14, paced(4.1))

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


rig.append(spin(calls(inked(mirror_ball('mirror_ball', 1.0, (-1.85, 0, 4.15)))), 9.0))
# Glints round it that swell and shrink, each at its own pace.
for index, (x, y, z, size, pace) in enumerate(((-3.0, -0.3, 5.0, 0.42, 2.3), (-0.75, -0.4, 3.5, 0.34, 1.7), (-2.7, -0.5, 3.2, 0.26, 2.9))):
    glint = place(again('glint', 'glint_%d' % index, lambda: calls(lit(star('glint', 1.0), glow=1.8))), at=(x, y, z), rot=(FACING, 0, 0))
    rig.append(key(glint, 'scale', [(0, (size * 0.25,) * 3), (paced(pace) / 2, (size,) * 3), (paced(pace), (size * 0.25,) * 3)]))
rig.append(spot('rig_spot', (-0.5, -0.1, 2.4), -55, -10, 16, 6.4))
bob(group('mirror', group('rig_stand', *rig, at=(DANCE['mast'], 0.9, 0)), *pod('mirror', DANCE['radius']), at=(9.5, DANCE['y'], DANCE['z'])), 0.14, paced(3.7))


# ── Floating about ───────────────────────────────────────────────────────────
for index, (x, y, z, double, roll, size) in enumerate((
    (-7.3, 9.5, -1.0, False, -12, 0.9), (7.2, 9.6, -0.8, True, 10, 0.9), (-12.2, 8.2, -1.8, True, 12, 1.0),
    (12.3, 8.0, -1.6, False, -14, 1.0), (-12.4, -4.6, -1.4, False, 10, 0.85), (12.0, -4.9, -1.2, True, -8, 0.85),
)):
    drawn = place(again('note_double' if double else 'note_single', 'note_%d' % index, lambda: tag(note(double), outline=0.05, shadow=False)), rot=(0, 0, roll), scale=size)
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

# A giant planet far beyond the back of the stage and below it, banded, with a moon going round. The camera of a
# round looks down too steeply to see it (it stands far enough off that even the widest picture of a round ends
# short of it); the low camera between rounds finds it behind the DJ's desk, and behind whoever won.
GIANT = 21.0
zones = [(-90, -58, 'giantDark'), (-58, -30, 'giant'), (-30, -14, 'giantLight'), (-14, 12, 'giant'), (12, 26, 'giantDark'), (26, 52, 'giant'), (52, 90, 'giantLight')]
bands = []
for low, high, color in zones:
    steps = max(2, round((high - low) / 9))
    turns = [low + (high - low) * step / steps for step in range(steps + 1)]
    bands.append(lathe('giant', [(0, math.copysign(GIANT, turn)) if abs(turn) == 90 else arc_of(turn, GIANT) for turn in turns], color, sides=56, smooth=80))
far_moon = spin(group('giant_moon_orbit', ball('giant_moon', 2.8, 'moon', at=(30, 0, 0), detail=2)), 48)
tag(group('giant', join('giant', *bands), far_moon, at=(5, 100, -32), rot=(16, -12, 0)), outline=0.34, shadow=False, receive=False)

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

# ── Out in the void ──────────────────────────────────────────────────────────
# Clouds of far-off dust and two small worlds, for the low camera between rounds: space is not empty.
dust = [rock('nebula', 34, 'nebula', at=(-70, 150, -40), seed=3, rough=0.22, scale=(1.7, 0.3, 0.6), detail=2, smooth=80),
        rock('nebula', 26, 'nebulaPink', at=(64, 140, -14), seed=5, rough=0.22, scale=(1.5, 0.3, 0.55), detail=2, smooth=80),
        rock('nebula', 22, 'nebulaPink', at=(-20, 130, -64), seed=8, rough=0.25, scale=(1.8, 0.3, 0.45), detail=2, smooth=80),
        rock('nebula', 20, 'nebula', at=(96, 70, -50), seed=9, rough=0.25, scale=(0.6, 1.4, 0.5), detail=2, smooth=80)]
tag(join('nebulae', *dust), glow=1.0, outline=0, shadow=False)
far = [ball('far_world', 5.5, 'fin', at=(50, 90, -30), detail=2), ball('far_moon', 3.2, 'planet', at=(-54, 96, -18), detail=2),
       lathe('far_ring', [(7.2, -0.15), (9.6, -0.15), (9.6, 0.15), (7.2, 0.15), (7.2, -0.15)], 'ring', at=(50, 90, -30), rot=(20, 25, 0), sides=24)]
tag(join('far_worlds', *far), outline=0.3, shadow=False, receive=False)

# A belt of rocks goes slowly round, far under the stage.
rng = random.Random(7)
rocks = []
for index in range(26):
    turn = 2 * math.pi * index / 26 + rng.uniform(-0.08, 0.08)
    reach = 21 + rng.uniform(-1.6, 1.6)
    rocks.append(rock('asteroid', rng.uniform(0.45, 1.1), 'moon' if index % 3 == 0 else 'moonDark', at=(math.cos(turn) * reach, math.sin(turn) * reach, rng.uniform(-0.8, 0.8)), seed=index, rough=0.3, detail=1))
spin(place(tag(grounded(join('belt', *rocks)), outline=0.08, shadow=False), at=(0, 1, -13)), 90)


# Comets cross behind the stage, each when its own time comes round.
def comet(index, start, end, flight, loop):
    """Across in `flight` seconds, then away until the loop comes round. It swells out of nothing and shrinks back to it."""
    head = ball('comet', 0.7, 'bulb', detail=2)
    tail = lathe('comet_tail', [(0, 0), (0.55, 0.3), (0.3, 2.6), (0, 5.5)], 'neon', rot=(0, -90, 0), sides=8, smooth=70)
    made = lit(grounded(join('comet_%d' % index, head, tail)), glow=1.5)
    dx, dy, dz = (b - a for a, b in zip(start, end))
    # Its tail trails behind it: it is turned to face the way it goes.
    place(made, rot=(0, -math.degrees(math.atan2(dz, math.hypot(dx, dy))), math.degrees(math.atan2(dy, dx))))
    key(made, 'location', [(0, start), (flight, end), (loop, end)], linear=True)
    return key(made, 'scale', [(0, (0.01, 0.01, 0.01)), (flight * 0.15, (1, 1, 1)), (flight * 0.8, (1, 1, 1)), (flight, (0.01, 0.01, 0.01)), (loop, (0.01, 0.01, 0.01))])


comet(0, (-46, 34, -4), (44, 14, -15), 4.5, 13)
comet(1, (40, 46, 2), (-44, 20, -12), 5.5, 21)

# A satellite goes round the other way, turning over as it goes.
sat = [box('satellite', (0.9, 0.7, 0.7), 'cone', bevel=0.12), cylinder('sat_dish', 0.5, 0.2, 'truss', at=(0, 0, 0.5), top=0.15, sides=10)]
sat += [box('sat_panel', (1.5, 0.08, 0.7), 'neon', at=(side * 1.3, 0, 0), bevel=0) for side in (-1, 1)]
sat = spin(place(tag(grounded(join('satellite', *sat)), outline=0.05, shadow=False), at=(15, 0, 0)), paced(9), axis=0)
spin(group('satellite_orbit', sat, at=(0, 2, -4.5)), 44, turns=-1)

# A flying saucer comes up behind the right-hand speakers for a look, hangs there, and sinks away again.
# The game puts someone in it. It never comes as high as the floor.
hull = lathe('saucer', [(0, -0.5), (0.5, -0.5), (1.5, -0.12), (1.7, 0.0), (1.5, 0.12), (0.8, 0.3), (0.7, 0.22), (0, 0.22)], 'cone', sides=18)
hull = tag(grounded(join('saucer_hull', hull, ring('saucer_rim', 0.75, 0.1, 'trim', at=(0, 0, 0.3), sides=14, around=6))), outline=0.05, shadow=False)
lamps = lit(grounded(join('saucer_lamps', *[ball('saucer_lamp', 0.13, 'bulb', at=(math.cos(step * math.pi / 3) * 1.25, math.sin(step * math.pi / 3) * 1.25, -0.2), detail=1) for step in range(6)])), glow=1.6)
PEEK = (11.4, 9.4)
DEEP, LOOKING = -13.0, -2.3
key(group('saucer', hull, spin(lamps, 3)), 'location', [(0, (PEEK[0], PEEK[1], DEEP)), (3, (PEEK[0], PEEK[1], DEEP)), (4.6, (PEEK[0], PEEK[1], LOOKING)), (6.2, (PEEK[0] - 0.3, PEEK[1], LOOKING + 0.25)),
                                                        (7.8, (PEEK[0], PEEK[1], LOOKING)), (9.4, (PEEK[0], PEEK[1], DEEP)), (19, (PEEK[0], PEEK[1], DEEP))])

# A conga line of stars dances round the stage, under the pods: seven of them, up and down by turns.
gems = [lathe('gem', [(0, -size), (size * 0.42, 0), (0, size)], 'bulb', at=(math.cos(turn) * 12.6, math.sin(turn) * 12.6, lift), sides=4, smooth=1)
        for turn, lift, size in [(step * 0.21, 0.45 if step % 2 else -0.45, 0.5 if step % 2 else 0.36) for step in range(7)]]
spin(place(lit(grounded(join('conga', *gems)), glow=1.5), at=(0, 0, -3.9)), 32)
