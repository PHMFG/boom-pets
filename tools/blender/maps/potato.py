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

# ── Templates the game places itself ─────────────────────────────────────────
# A flame: a teardrop. The game stands them round the pan and makes them flicker.
part(tag(lathe('flame', [(0, 0), (0.42, 0.12), (0.5, 0.42), (0.36, 0.86), (0.14, 1.3), (0, 1.55)], 'flame', sides=8, smooth=70), glow=1.5, outline=0, shadow=False))
part(tag(lathe('flame_hot', [(0, 0), (0.28, 0.1), (0.33, 0.34), (0.22, 0.7), (0.08, 1.0), (0, 1.15)], 'flameHot', sides=8, smooth=70), glow=1.7, outline=0, shadow=False))

# The bomb: a fat black ball with a collar where the fuse goes in, and a glint. The fuse and its spark are the game's.
shell = ball('shell', 0.4, 'bomb', detail=3)
collar = lathe('collar', [(0, 0.33), (0.17, 0.33), (0.19, 0.4), (0.15, 0.5), (0, 0.5)], 'grip', sides=12)
glint = ball('glint', 0.09, 'white', at=(-0.15, -0.3, 0.17))
part(tag(join('bomb', shell, collar, glint), outline=0.045))
