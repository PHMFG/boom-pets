# Batata Quente: a frying pan on a stove. The pan's cooking surface is the floor (its top is Z = 0) and
# its rim is the wall, 6 m from the middle. The camera looks down from the front, so the near rim stays low.
import math

from kit import *

RADIUS = 6.0

guide_floor(radius=RADIUS + 0.3, show=False)
for spot in ((-2.5, 1.5, 0), (1.8, -2.2, 0), (3.6, 2.8, 0)):
    guide_pet(spot)

# ── The pan ──────────────────────────────────────────────────────────────────
# The cooking surface: pale, with two wide rings a shade deeper so movement over it can be read.
tag(lathe('surface', [(0, -0.12), (RADIUS + 0.3, -0.12), (RADIUS + 0.3, 0), (0, 0)], 'pan', sides=64), outline=0, shadow=False)
for index, (outer, inner) in enumerate([(RADIUS * 0.78, RADIUS * 0.55), (RADIUS * 0.3, 0)]):
    tag(lathe('groove_%d' % index, [(inner, 0.004), (outer, 0.004), (outer, 0.012), (inner, 0.012)] if inner > 0 else [(0, 0.004), (outer, 0.004), (outer, 0.012), (0, 0.012)],
              'panDark', sides=64), outline=0, shadow=False)

# The body: a low bowl with a fat rolled lip. The lip is the wall, and low enough to hide nobody.
tag(lathe('body', [
    (0, -1.05), (RADIUS - 0.4, -1.05), (RADIUS + 0.25, -0.85), (RADIUS + 0.7, -0.3), (RADIUS + 0.86, 0.12),
    (RADIUS + 0.8, 0.3), (RADIUS + 0.58, 0.36), (RADIUS + 0.36, 0.28), (RADIUS + 0.3, 0.0), (RADIUS + 0.3, -0.1), (0, -0.1),
], 'rim', sides=64, smooth=50), outline=0.05)

# The handle: a long arm to the back right, a fat grip, and the ring it hangs by.
arm = box('arm', (5.2, 1.0, 0.36), 'rim', at=(RADIUS + 3.1, 0, -0.1), bevel=0.14)
grip = box('grip', (3.6, 1.5, 0.66), 'grip', at=(RADIUS + 6.4, 0, -0.06), bevel=0.3, segments=3)
eye = ring('eye', 0.42, 0.13, 'rim', at=(RADIUS + 8.5, 0, -0.06))
rivets = [cylinder('rivet_%d' % i, 0.16, 0.12, 'steel', at=(RADIUS + 0.95 + i * 0.5, 0, 0.1), sides=10) for i in range(2)]
tag(group('handle', arm, grip, eye, *rivets, rot=(0, 0, 32)), outline=0.05)

# ── The stove ────────────────────────────────────────────────────────────────
tag(box('stove', (46, 34, 2.2), 'stove', at=(0, 1, -3.2), bevel=0.5, segments=3), outline=0, shadow=False)
tag(box('back', (46, 2.4, 5), 'stove', at=(0, 19.2, -0.6), bevel=0.5, segments=3), outline=0.06)

# The lit burner under the pan: a dark crown and four cast-iron arms the pan sits on.
tag(lathe('burner', [(0, -2.1), (RADIUS + 0.5, -2.1), (RADIUS + 0.2, -1.55), (RADIUS - 0.6, -1.3), (0, -1.3)], 'burner', sides=40), outline=0.05)
for index in range(4):
    turn = index * 45 + 22.5
    tag(box('grate_%d' % index, (RADIUS * 2 + 5.4, 0.62, 0.42), 'burner', at=(0, 0, -1.22), rot=(0, 0, turn), bevel=0.14), outline=0.05)
    for side in (-1, 1):
        x = math.cos(math.radians(turn)) * (RADIUS + 2.6) * side
        y = math.sin(math.radians(turn)) * (RADIUS + 2.6) * side
        tag(box('foot_%d_%d' % (index, side), (0.62, 0.62, 0.9), 'burner', at=(x, y, -1.65), rot=(0, 0, turn), bevel=0.14), outline=0.05)

# The other burners, cold, each with its ring of little teeth.
for index, (x, y, size) in enumerate([(-16.5, 9.5, 3.6), (16.5, 11, 2.9), (-16.5, -9, 2.9)]):
    crown = lathe('cold_%d' % index, [(0, -2.1), (size + 0.3, -2.1), (size, -1.75), (size * 0.55, -1.7), (size * 0.5, -1.85), (0, -1.85)], 'burner', at=(x, y, 0), sides=28)
    teeth = [box('tooth_%d_%d' % (index, i), (0.34, 0.5, 0.3), 'burner',
                 at=(x + math.cos(i * math.pi / 4) * (size - 0.25), y + math.sin(i * math.pi / 4) * (size - 0.25), -1.66), rot=(0, 0, i * 45 + 90), bevel=0.08) for i in range(8)]
    tag(join('cold_burner_%d' % index, crown, *teeth), outline=0.05)

# Knobs along the front edge, each with a pointer; the first is turned up.
for index in range(4):
    x = -9 + index * 6
    dial = lathe('dial_%d' % index, [(0, 0), (1.15, 0), (1.25, 0.25), (1.0, 0.8), (0, 0.8)], 'grip', sides=20)
    pointer = box('pointer_%d' % index, (0.3, 1.5, 0.22), 'steel', at=(0, 0.1, 0.86), bevel=0.08)
    tag(group('knob_%d' % index, dial, pointer, at=(x, -RADIUS - 6.6, -2.1), rot=(0, 0, 130 if index == 1 else -20 + index * 9)), outline=0.05)

# ── Left on the stove ────────────────────────────────────────────────────────
# A wooden spoon.
shaft = pipe('shaft', [(0, 0, 0), (4, 0, 0.1), (8.4, 0, 0.0)], 0.3, 'spoon', sides=10)
bowl = ball('bowl', 1.5, 'spoon', at=(-1.2, 0, 0.0), scale=(1.35, 1.0, 0.36))
tag(group('wooden_spoon', shaft, bowl, at=(-RADIUS - 8.2, -4.6, -1.78), rot=(0, 0, 58)), outline=0.05)

# A pot with a lid on the big cold burner at the back, and steam holes for a face of its own.
pot = lathe('pot', [(0, 0), (2.9, 0), (3.1, 0.3), (3.1, 3.2), (3.3, 3.3), (3.3, 3.6), (0, 3.6)], 'steel', sides=28)
lid = lathe('lid', [(3.4, 3.6), (3.4, 3.8), (2.4, 4.3), (0.9, 4.5), (0, 4.5)], 'grip', sides=28)
lid_knob = ball('lid_knob', 0.5, 'rim', at=(0, 0, 4.8), scale=(1, 1, 0.8))
ears = [box('ear_%d' % i, (1.1, 1.5, 0.4), 'rim', at=(side * 3.5, 0, 2.8), bevel=0.15) for i, side in enumerate((-1, 1))]
tag(group('cooking_pot', pot, lid, lid_knob, *ears, at=(-16.5, 9.5, -1.7), rot=(0, 0, 20)), outline=0.06)

# A salt shaker and a pepper mill at the back right.
shaker = lathe('shaker', [(0, 0), (0.9, 0), (1.0, 0.3), (0.8, 2.0), (0.9, 2.2), (0.9, 2.7), (0.5, 3.0), (0, 3.0)], 'pan', sides=16)
tag(place(shaker, at=(13.5, 13.5, -2.1)), outline=0.05)
mill = lathe('mill', [(0, 0), (1.0, 0), (1.1, 0.4), (0.7, 1.6), (1.0, 2.6), (1.0, 3.2), (0.5, 3.6), (0.7, 4.0), (0.4, 4.4), (0, 4.4)], 'spoon', sides=16)
tag(place(mill, at=(16.6, 14.3, -2.1)), outline=0.05)

# ── Somewhere to watch from ──────────────────────────────────────────────────
# Tins standing on the stove round the back and the sides of the pan, their lids about level with it. A
# spectator stands on each (the game puts them on the `seat_*` markers), and the tins hop when the bomb goes off.
STOVE = -2.1


def tin(name, at, height, radius, label):
    """A tin with two rolled rims and a paper label. Its origin is on the stove, under its middle."""
    body = lathe(name + '_body', [(0, 0), (radius, 0), (radius + 0.06, 0.08), (radius + 0.06, 0.2), (radius, 0.26), (radius, height - 0.26), (radius + 0.06, height - 0.2),
                                  (radius + 0.06, height - 0.08), (radius, height), (0, height)], 'steel', sides=20)
    band = lathe(name + '_label', [(radius + 0.02, height * 0.2), (radius + 0.045, height * 0.2), (radius + 0.045, height * 0.8), (radius + 0.02, height * 0.8)], label, sides=20)
    stripe = lathe(name + '_stripe', [(radius + 0.05, height * 0.44), (radius + 0.07, height * 0.44), (radius + 0.07, height * 0.58), (radius + 0.05, height * 0.58)], 'cream', sides=20)
    return tag(place(join(name, body, band, stripe), at=(at[0], at[1], STOVE)), outline=0.05)


# (x, y back, height, radius, label): two behind, one each side at the back, one out to each side.
TINS = [(-3.75, 9.3, 2.5, 0.95, 'labelRust'), (3.75, 9.3, 2.75, 0.9, 'labelTeal'), (-7.1, 7.1, 2.3, 1.0, 'labelTeal'), (-9.9, -1.6, 2.6, 0.9, 'labelRust'), (9.6, 0.9, 2.4, 0.95, 'labelRust')]
for index, (x, y, height, radius, label) in enumerate(TINS):
    tin('tin_%d' % index, (x, y), height, radius, label)
    group('seat_%d' % index, at=(x, y, STOVE + height))
# Two more ride the pan's handle, out past the rim.
for index, along in enumerate((11.4, 13.4)):
    turn = math.radians(32)
    group('seat_%d' % (len(TINS) + index), at=(math.cos(turn) * along, math.sin(turn) * along, 0.28))

# ── A kitchen timer: its hand is the bomb's fuse ─────────────────────────────
# It stands behind the pan to the right, leaning back so its face looks at the camera. The game turns the hand.
timer_body = lathe('timer_body', [(0, -0.5), (1.5, -0.5), (1.62, -0.3), (1.62, 0.1), (1.45, 0.3), (0, 0.3)], 'rim', sides=28)
timer_face = lathe('timer_face', [(0, 0.3), (1.3, 0.3), (1.3, 0.36), (0, 0.36)], 'white', sides=28)
ticks = [box('timer_tick_%d' % index, (0.12, 0.32 if index % 3 == 0 else 0.2, 0.05), 'rim',
             at=(math.sin(index * math.pi / 6) * 1.08, math.cos(index * math.pi / 6) * 1.08, 0.38), rot=(0, 0, -index * 30), bevel=0.02) for index in range(12)]
timer_knob = lathe('timer_knob', [(0, 0.36), (0.26, 0.36), (0.26, 0.5), (0, 0.5)], 'grip', sides=12)
timer_foot = box('timer_foot', (1.6, 0.5, 1.5), 'rim', at=(0, -1.1, -1.0), rot=(-20, 0, 0), bevel=0.15)
timer = group('timer', join('timer_dial', timer_body, timer_face, *ticks, timer_knob), timer_foot, at=(6.6, 9.4, -0.55), rot=(52, 0, 0))
tag(timer, outline=0.05)
# The hand: it points up the face (at twelve) until the game turns it. Its origin is the middle of the dial.
needle = box('timer_needle', (0.2, 1.05, 0.08), 'danger', at=(0, 0.42, 0.44), bevel=0.04)
hub = cylinder('timer_hub', 0.2, 0.1, 'danger', at=(0, 0, 0.44), sides=10)
hand = tag(group('timer_hand', needle, hub, at=(0, 0, 0)), outline=0.035)
hand.parent = timer

# ── A kettle on the left, coming to the boil ─────────────────────────────────
kettle_body = lathe('kettle_body', [(0, 0), (1.5, 0), (1.75, 0.3), (1.8, 1.0), (1.45, 1.9), (0.75, 2.25), (0, 2.25)], 'cream', sides=24, smooth=60)
kettle_band = lathe('kettle_band', [(1.78, 0.5), (1.84, 0.5), (1.84, 0.8), (1.8, 0.8)], 'labelTeal', sides=24)
kettle_lid = lathe('kettle_lid', [(0.78, 2.22), (0.82, 2.3), (0.5, 2.46), (0, 2.5)], 'labelTeal', sides=16)
kettle_knob = ball('kettle_knob', 0.2, 'rim', at=(0, 0, 2.62))
spout = pipe('kettle_spout', [(1.5, 0, 1.0), (2.2, 0, 1.3), (2.55, 0, 1.95)], 0.22, 'cream', sides=10)
grip = pipe('kettle_grip', arc((-0.9, 0, 2.2), (0.9, 0, 2.2), 0.95, steps=8), 0.14, 'rim', sides=8)
kettle = tag(place(join('kettle', kettle_body, kettle_band, kettle_lid, kettle_knob, spout, grip), at=(-11.6, 5.2, STOVE), rot=(0, 0, -35)), outline=0.05)
# Puffs of steam leave the spout one after another, rise, swell and are gone.
spout_tip = (-11.6 + math.cos(math.radians(-35)) * 2.6, 5.2 + math.sin(math.radians(-35)) * 2.6, STOVE + 2.05)
for index in range(3):
    puff = tag(ball('steam_%d' % index, 0.34, 'white', at=spout_tip, detail=1, smooth=80), outline=0, shadow=False, receive=False)
    start = index * 0.8
    key(puff, 'location', [(0, spout_tip), (start, spout_tip), (start + 2.3, (spout_tip[0] + 0.5, spout_tip[1] - 0.2, spout_tip[2] + 2.4)), (2.4 + 0.8 * 2, (spout_tip[0] + 0.5, spout_tip[1] - 0.2, spout_tip[2] + 2.4))])
    key(puff, 'scale', [(0, (0.01, 0.01, 0.01)), (start, (0.01, 0.01, 0.01)), (start + 0.5, (0.8, 0.8, 0.8)), (start + 1.7, (1.5, 1.5, 1.5)), (start + 2.3, (0.01, 0.01, 0.01)), (2.4 + 0.8 * 2, (0.01, 0.01, 0.01))])

# The pot's lid rattles: something in it is on the boil too.
sway(bpy.data.objects['lid'], degrees=2.5, seconds=0.9, axis=0)

# ── Templates the game places itself ─────────────────────────────────────────
# A flame: a teardrop. The game stands them round the pan and makes them flicker.
part(tag(lathe('flame', [(0, 0), (0.42, 0.12), (0.5, 0.42), (0.36, 0.86), (0.14, 1.3), (0, 1.55)], 'flame', sides=8, smooth=70), glow=1.5, outline=0, shadow=False))
part(tag(lathe('flame_hot', [(0, 0), (0.28, 0.1), (0.33, 0.34), (0.22, 0.7), (0.08, 1.0), (0, 1.15)], 'flameHot', sides=8, smooth=70), glow=1.7, outline=0, shadow=False))

# The bomb: a fat black ball with a collar where the fuse goes in, and a glint. The fuse and its spark are the game's.
shell = ball('shell', 0.4, 'bomb', detail=3)
collar = lathe('collar', [(0, 0.33), (0.17, 0.33), (0.19, 0.4), (0.15, 0.5), (0, 0.5)], 'grip', sides=12)
glint = ball('glint', 0.09, 'white', at=(-0.15, -0.3, 0.17))
part(tag(join('bomb', shell, collar, glint), outline=0.045))
