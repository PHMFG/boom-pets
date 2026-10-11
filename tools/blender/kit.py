# The modelling kit for Boom Pets. A map's script (tools/blender/maps/<map>.py) builds its props with
# these, and `pnpm models <map>` runs it in Blender and exports apps/web/public/models/maps/<map>.glb.
#
# THE LOOK: chunky toys. Few polygons, fat bevels, no thin parts, nothing realistic. One flat colour
# per piece. The game shades everything in three flat tones and draws a dark outline round it, so what
# reads on screen is the SILHOUETTE: make shapes bold and a little too big, not detailed.
#
# AXES: X is right, Y is AWAY from the camera (the back of the map), Z is up. One unit is one metre;
# a pet is about 1 m wide and 1.3 m tall. The floor the pets walk on has its top at Z = 0.
# In the game that is x = X, y = Z, z = -Y (the exporter turns it).
#
# COLOURS: a colour is the NAME of a key of the map's palette (`maps.<map>` in
# apps/web/src/shared/tokens.ts) or of the game's shared `colors`. The game paints each piece from the
# tokens by that name, so a model never carries a colour of its own. An unknown name stops the build.
#
# WHAT THE GAME DOES WITH THE FILE (apps/web/src/host/render/models.ts):
#   - everything is drawn where it stands, except objects passed to `part()`, which are templates the
#     map's code clones and places itself (a bomb, a piece of food, a flame);
#   - `tag(obj, outline=..)` sets how thick its outline is in metres (0 for none), `glow=1.6` draws it
#     flat and brighter than white so it blooms (fire, lava, lamps), `shadow=False` stops it casting;
#   - every animation made with `spin`, `sway`, `bob` or `key` plays in a loop.
import math
import os
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

PALETTE = {}
MAP = ''
_guides = []


# ── Scene ───────────────────────────────────────────────────────────────────

def begin(name, palette):
    """Empties the scene. Called by the build before a map's script runs."""
    global PALETTE, MAP
    PALETTE = dict(palette)
    MAP = name
    _guides.clear()
    for blocks in (bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.actions,
                   bpy.data.cameras, bpy.data.lights, bpy.data.collections, bpy.data.images):
        for block in list(blocks):
            blocks.remove(block)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.render.fps = 30


def _rgb(name):
    value = PALETTE[name].lstrip('#')
    # sRGB to linear, which is what Blender's colours are.
    def linear(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (linear(value[0:2]), linear(value[2:4]), linear(value[4:6]), 1.0)


def mat(name):
    """The material for a palette colour. Its name is what the game reads."""
    if name not in PALETTE:
        raise KeyError('"%s" is not a colour of this map. Add it to maps.%s in apps/web/src/shared/tokens.ts, or use one of: %s'
                       % (name, MAP, ' '.join(sorted(PALETTE))))
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.diffuse_color = _rgb(name)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = _rgb(name)
        shader.inputs['Roughness'].default_value = 1.0
    return material


def _finish_mesh(name, bm, color, at, rot, smooth):
    """Turns a bmesh into an object: smooth where it curves, sharp where it turns more than `smooth` degrees."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    limit = math.radians(smooth)
    for edge in bm.edges:
        edge.smooth = len(edge.link_faces) == 2 and edge.calc_face_angle(0) < limit
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat(color))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = Euler([math.radians(angle) for angle in rot])
    return obj


# ── Shapes ──────────────────────────────────────────────────────────────────
# Every shape takes: a name, its measures, a colour name, `at` (where its CENTRE goes, unless said
# otherwise) and `rot` (degrees round X, Y, Z).

def box(name, size, color, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.08, segments=2, smooth=40):
    """A block `size` = (x, y, z) with rounded edges. `bevel` is the radius of the rounding in metres."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * size[0], vert.co.y * size[1], vert.co.z * size[2]))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, min(size) * 0.49), segments=segments, affect='EDGES', profile=0.5)
    return _finish_mesh(name, bm, color, at, rot, smooth)


def cylinder(name, radius, height, color, at=(0, 0, 0), rot=(0, 0, 0), top=None, sides=20, bevel=0.0, smooth=40):
    """Stands on Z. `top` is the radius at the top if it differs (0 makes a cone). `bevel` rounds the rims."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius if top is None else top, depth=height)
    if bevel > 0:
        rims = [edge for edge in bm.edges if abs(edge.verts[0].co.z - edge.verts[1].co.z) < 1e-5]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, affect='EDGES', profile=0.5)
    return _finish_mesh(name, bm, color, at, rot, smooth)


def cone(name, radius, height, color, at=(0, 0, 0), rot=(0, 0, 0), sides=16, smooth=40):
    return cylinder(name, radius, height, color, at, rot, top=0.0, sides=sides, smooth=smooth)


def ball(name, radius, color, at=(0, 0, 0), scale=(1, 1, 1), detail=2, rot=(0, 0, 0), smooth=60):
    """A sphere made of triangles. `detail` 1 is faceted like a gem, 2 is round, 3 is very round. `scale` squashes it."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=radius)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x * scale[0], vert.co.y * scale[1], vert.co.z * scale[2]))
    return _finish_mesh(name, bm, color, at, rot, smooth)


def rock(name, radius, color, at=(0, 0, 0), seed=0, rough=0.28, scale=(1, 1, 1), detail=1, rot=(0, 0, 0), smooth=25):
    """A lumpy boulder: a low sphere with every corner pushed in or out. Also good for bushes and clouds (`smooth=80`)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=radius)
    for vert in bm.verts:
        push = 1 + rng.uniform(-rough, rough)
        vert.co = Vector((vert.co.x * scale[0] * push, vert.co.y * scale[1] * push, vert.co.z * scale[2] * push))
    return _finish_mesh(name, bm, color, at, rot, smooth)


def lathe(name, profile, color, at=(0, 0, 0), rot=(0, 0, 0), sides=24, smooth=40):
    """
    Spins a profile round Z: pots, pans, vases, trees, domes, bombs, mushrooms.
    `profile` is a list of (radius, z) from bottom to top. Start and end at radius 0 to close the ends.
    """
    bm = bmesh.new()
    rings = []
    for radius, z in profile:
        if radius <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((math.cos(2 * math.pi * i / sides) * radius, math.sin(2 * math.pi * i / sides) * radius, z)) for i in range(sides)])
    for lower, upper in zip(rings, rings[1:]):
        for i in range(sides):
            a, b = lower[i % len(lower)], lower[(i + 1) % len(lower)]
            c, d = upper[(i + 1) % len(upper)], upper[i % len(upper)]
            corners = []
            for vert in (a, b, c, d):
                if vert not in corners:
                    corners.append(vert)
            if len(corners) >= 3:
                bm.faces.new(corners)
    return _finish_mesh(name, bm, color, at, rot, smooth)


def slab(name, outline, height, color, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.05, smooth=40):
    """
    A flat shape with thickness: `outline` is a list of (x, y) corners, drawn counter-clockwise, lying on the
    floor; it is `height` thick, centred on Z. Stand it up with rot=(90, 0, 0). Flags, leaves, stars, signs, arches.
    """
    bm = bmesh.new()
    lower = [bm.verts.new((x, y, -height / 2)) for x, y in outline]
    face = bm.faces.new(lower)
    made = bmesh.ops.extrude_face_region(bm, geom=[face])
    for vert in [item for item in made['geom'] if isinstance(item, bmesh.types.BMVert)]:
        vert.co.z += height
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, height * 0.45), segments=2, affect='EDGES', profile=0.5)
    return _finish_mesh(name, bm, color, at, rot, smooth)


def pipe(name, points, radius, color, sides=8, closed=False, at=(0, 0, 0), rot=(0, 0, 0), smooth=50):
    """A tube through `points` (x, y, z): rails, handles, ropes, arches, stems. Keep `radius` 0.06 or more: thin parts vanish."""
    bm = bmesh.new()
    path = [Vector(point) for point in points]
    count = len(path)
    rings = []
    for index, here in enumerate(path):
        before = path[index - 1] if (index > 0 or closed) else here
        after = path[(index + 1) % count] if (index < count - 1 or closed) else here
        along = (after - before).normalized() if (after - before).length > 1e-6 else Vector((0, 0, 1))
        side = along.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = along.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(along).normalized()
        rings.append([bm.verts.new(here + (side * math.cos(2 * math.pi * i / sides) + up * math.sin(2 * math.pi * i / sides)) * radius) for i in range(sides)])
    for index in range(count if closed else count - 1):
        lower, upper = rings[index], rings[(index + 1) % count]
        for i in range(sides):
            bm.faces.new((lower[i], lower[(i + 1) % sides], upper[(i + 1) % sides], upper[i]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return _finish_mesh(name, bm, color, at, rot, smooth)


def ring(name, radius, thickness, color, at=(0, 0, 0), rot=(0, 0, 0), sides=28, around=8, smooth=60):
    """A doughnut lying flat: `radius` to the middle of the tube, `thickness` the tube's own radius."""
    points = [(math.cos(2 * math.pi * i / sides) * radius, math.sin(2 * math.pi * i / sides) * radius, 0) for i in range(sides)]
    return pipe(name, points, thickness, color, sides=around, closed=True, at=at, rot=rot, smooth=smooth)


def arc(start, end, lift, steps=8):
    """Points along an arch from `start` to `end` that rises `lift` in the middle: for `pipe`."""
    a, b = Vector(start), Vector(end)
    return [tuple(a.lerp(b, i / steps) + Vector((0, 0, math.sin(math.pi * i / steps) * lift))) for i in range(steps + 1)]


# ── Putting things together ─────────────────────────────────────────────────

def join(name, *objects):
    """Makes one object out of several. Each piece keeps its colour. The first piece's place becomes the object's origin."""
    first = objects[0]
    with bpy.context.temp_override(active_object=first, selected_editable_objects=list(objects), selected_objects=list(objects)):
        bpy.ops.object.join()
    first.name = name
    first.data.name = name
    return first


def copy(obj, name, at=None, rot=None, scale=None):
    """Another one of the same. Copies share their shape, so a hundred of them cost one."""
    twin = bpy.data.objects.new(name, obj.data)
    bpy.context.scene.collection.objects.link(twin)
    twin.location = obj.location if at is None else at
    twin.rotation_euler = obj.rotation_euler if rot is None else Euler([math.radians(angle) for angle in rot])
    twin.scale = obj.scale if scale is None else ((scale, scale, scale) if isinstance(scale, (int, float)) else scale)
    for key in obj.keys():
        twin[key] = obj[key]
    return twin


def place(obj, at=None, rot=None, scale=None):
    """Moves, turns or resizes something already made. Returns it."""
    if at is not None:
        obj.location = at
    if rot is not None:
        obj.rotation_euler = Euler([math.radians(angle) for angle in rot])
    if scale is not None:
        obj.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return obj


def group(name, *objects, at=(0, 0, 0), rot=(0, 0, 0)):
    """An empty that holds the others: move it and they all move. Children keep their places relative to it."""
    holder = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(holder)
    for obj in objects:
        obj.parent = holder
    holder.location = at
    holder.rotation_euler = Euler([math.radians(angle) for angle in rot])
    return holder


def tag(obj, outline=None, glow=None, shadow=None):
    """Tells the game how to draw it: outline thickness in metres (0 for none), a glow of 1.3 to 2.5, whether it casts a shadow."""
    targets = [obj] + list(obj.children_recursive)
    for target in targets:
        if outline is not None:
            target['outline'] = float(outline)
        if glow is not None:
            target['glow'] = float(glow)
        if shadow is not None:
            target['shadow'] = bool(shadow)
    return obj


def part(obj):
    """Marks a template: the game does not draw it where it stands, the map's code clones it. Build it round the origin."""
    obj.name = 'part_' + obj.name
    obj['part'] = True
    return obj


def guide_floor(width=None, depth=None, radius=None, color='white', show=True):
    """
    The floor the pets walk on, for the pictures only: it is never exported. Give a width and depth, or a radius.
    The game draws the real floor as tiles. Where a map models its own floor (a pan), pass show=False:
    the pictures are still framed on it, but it is not drawn over yours.
    """
    if radius is not None:
        floor = cylinder('guide_floor', radius, 0.5, color, at=(0, 0, -0.25), sides=48)
    else:
        floor = box('guide_floor', (width, depth, 0.5), color, at=(0, 0, -0.25), bevel=0)
    floor.hide_render = not show
    _guides.append(floor)
    return floor


def guide_pet(at=(0, 0, 0), color='ink'):
    """A block the size of a pet (1 m wide, 1.3 m tall), for the pictures only: stand a few about to judge sizes."""
    pet = box('guide_pet', (1.0, 1.0, 1.3), color, at=(at[0], at[1], at[2] + 0.65), bevel=0.2)
    _guides.append(pet)
    return pet


# ── Motion ──────────────────────────────────────────────────────────────────
# Every animation loops for ever in the game. Give each moving thing its own pace.

def key(obj, prop, frames, linear=False):
    """Keyframes for 'location', 'rotation_euler' (radians) or 'scale': `frames` is a list of (second, (x, y, z))."""
    fps = bpy.context.scene.render.fps
    for second, value in frames:
        setattr(obj, prop, value)
        obj.keyframe_insert(prop, frame=1 + second * fps)
    last = 1 + max(second for second, _ in frames) * fps
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end, int(math.ceil(last)))
    if linear:
        _each_curve(obj, lambda point: setattr(point, 'interpolation', 'LINEAR'))
    return obj


def _each_curve(obj, change):
    action = obj.animation_data.action if obj.animation_data else None
    if action is None:
        return
    curves = []
    if hasattr(action, 'fcurves') and len(getattr(action, 'fcurves', [])) > 0:
        curves = list(action.fcurves)
    else:
        for layer in getattr(action, 'layers', []):
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            change(point)


def spin(obj, seconds=4.0, axis=2, turns=1):
    """Turns for ever round one of its own axes (0 X, 1 Y, 2 Z), once every `seconds`."""
    start = tuple(obj.rotation_euler)
    end = list(start)
    end[axis] += math.pi * 2 * turns
    return key(obj, 'rotation_euler', [(0, start), (seconds, tuple(end))], linear=True)


def sway(obj, degrees=8.0, seconds=2.0, axis=1):
    """Rocks to and fro round one of its own axes: a swing, a flag, a tree in the wind."""
    rest = list(obj.rotation_euler)
    def turned(sign):
        value = list(rest)
        value[axis] += math.radians(degrees) * sign
        return tuple(value)
    return key(obj, 'rotation_euler', [(0, turned(-1)), (seconds / 2, turned(1)), (seconds, turned(-1))])


def bob(obj, height=0.2, seconds=2.0):
    """Floats up and down."""
    x, y, z = obj.location
    return key(obj, 'location', [(0, (x, y, z)), (seconds / 2, (x, y, z + height)), (seconds, (x, y, z))])


def throb(obj, amount=0.12, seconds=1.0):
    """Swells and shrinks: a speaker, a flame, a heart."""
    x, y, z = obj.scale
    grow = 1 + amount
    return key(obj, 'scale', [(0, (x, y, z)), (seconds / 2, (x * grow, y * grow, z * grow)), (seconds, (x, y, z))])


# ── Export and the picture ──────────────────────────────────────────────────

def _is_part(obj):
    while obj is not None:
        if obj.get('part'):
            return True
        obj = obj.parent
    return False


def _bounds(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            low = Vector((min(low.x, world.x), min(low.y, world.y), min(low.z, world.z)))
            high = Vector((max(high.x, world.x), max(high.y, world.y), max(high.z, world.z)))
    return low, high


def _shot(path, centre, span, parts_row):
    scene = bpy.context.scene
    camera = scene.camera
    tilt = math.radians(52)
    distance = span * 1.95
    camera.location = (centre.x, centre.y - math.cos(tilt) * distance, centre.z + math.sin(tilt) * distance)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _pictures(path):
    """
    Two pictures from where the game's camera stands (tilted 52 degrees down, through a narrow lens):
    <map>.png frames the floor the way a round does, and <map>-wide.png shows everything that was built.
    Templates made with `part()` stand in a row in front of the floor, so they are in the pictures too.
    """
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    camera = bpy.data.objects.new('guide_camera', bpy.data.cameras.new('guide_camera'))
    scene.collection.objects.link(camera)
    camera.data.angle = math.radians(32)
    camera.rotation_euler = Euler((math.radians(90) - math.radians(52), 0, 0))
    camera.data.clip_end = 2000
    scene.camera = camera
    sun = bpy.data.objects.new('guide_sun', bpy.data.lights.new('guide_sun', 'SUN'))
    scene.collection.objects.link(sun)
    sun.rotation_euler = Euler((math.radians(40), 0, math.radians(30)))

    seen = [obj for obj in scene.objects if obj.type == 'MESH' and not _is_part(obj)]
    floor = _guides if _guides else seen
    low, high = _bounds(floor)
    parts = [obj for obj in scene.objects if obj.get('part') and obj.parent is None]
    moved = [(obj, tuple(obj.location)) for obj in parts]
    for index, obj in enumerate(parts):
        obj.location = ((low.x + high.x) / 2 + (index - (len(parts) - 1) / 2) * 2.4, low.y - 2.2, 0.0)
    bpy.context.view_layer.update()

    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'MATERIAL'
    shading.show_specular_highlight = False
    shading.show_object_outline = True
    shading.object_outline_color = (0.1, 0.07, 0.19)
    shading.show_shadows = True
    shading.shadow_intensity = 0.25
    shading.show_cavity = False
    scene.display.render_aa = '8'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = 'PNG'
    world = scene.world or bpy.data.worlds.new('guide_world')
    scene.world = world
    world.color = (0.5, 0.62, 0.9)
    scene.frame_set(1)

    centre = (low + high) / 2
    centre.z = 0
    centre.y -= 1.0
    _shot(path, centre, max(high.x - low.x + 5, (high.y - low.y + 6) * 1.6, 8), parts)
    # The wide one is capped, so a ground slab that runs to the horizon does not shrink everything else to dots.
    wide_low, wide_high = _bounds([obj for obj in scene.objects if obj.type == 'MESH'])
    _shot(path[:-4] + '-wide.png', centre, min(max(wide_high.x - wide_low.x + 4, (wide_high.y - wide_low.y + 4) * 1.6, 12), 56), parts)

    for obj, where in moved:
        obj.location = where
    for extra in (camera, sun):
        bpy.data.objects.remove(extra)


def finish(glb, png):
    """Called by the build after a map's script: takes the picture, then writes the file without the guides."""
    scene = bpy.context.scene
    _pictures(png)
    for guide in _guides:
        bpy.data.objects.remove(guide)
    _guides.clear()
    bpy.context.view_layer.update()
    os.makedirs(os.path.dirname(glb), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', export_apply=True, export_yup=True, export_extras=True,
        export_texcoords=False, export_tangents=False, export_materials='EXPORT', export_cameras=False,
        export_lights=False, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_range=False, export_anim_slide_to_zero=True,
    )
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    triangles = 0
    counted = set()
    for obj in meshes:
        if obj.data.name in counted:
            continue
        counted.add(obj.data.name)
        triangles += sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
    used = sorted({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material})
    return {
        'objects': len(scene.objects), 'triangles': triangles, 'bytes': os.path.getsize(glb), 'materials': used,
        'clips': sorted(action.name for action in bpy.data.actions),
    }
