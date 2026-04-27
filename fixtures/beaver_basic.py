# Low-poly beaver placeholder. Body capsule + head + flat tail + 4 stub legs.
# ~300 tris. Vertex-coloured browns. Local origin at the centre of the feet, so
# the player can `position.set(x, 0, z)` and the model sits on the ground.
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_vertex_color_material, assign_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "beaver_basic"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)

FUR = (0.45, 0.30, 0.20, 1.0)
BELLY = (0.62, 0.48, 0.36, 1.0)
TAIL = (0.30, 0.22, 0.16, 1.0)


def add_uv_capsule(name, cx, cy, cz, rx, ry, rz, color, sides=8, rings=5):
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    rings_v = []
    for r in range(rings + 1):
        phi = (r / rings) * math.pi - math.pi / 2  # -π/2 (south) → +π/2 (north)
        ring_r = math.cos(phi)
        z_off = math.sin(phi)
        ring = []
        for i in range(sides):
            theta = (i / sides) * math.tau
            x = cx + math.cos(theta) * ring_r * rx
            y = cy + math.sin(theta) * ring_r * ry
            z = cz + z_off * rz
            ring.append(bm.verts.new((x, y, z)))
        rings_v.append(ring)

    for r in range(rings):
        a = rings_v[r]
        b = rings_v[r + 1]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([a[i], a[j], b[j], b[i]])

    bm.to_mesh(mesh)
    bm.free()
    assign_vertex_colors(mesh, color)
    return obj


def add_box(name, cx, cy, cz, sx, sy, sz, color, rot_z=0.0):
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    hx, hy, hz = sx / 2, sy / 2, sz / 2
    pts = [
        (-hx, -hy, -hz), ( hx, -hy, -hz), ( hx,  hy, -hz), (-hx,  hy, -hz),
        (-hx, -hy,  hz), ( hx, -hy,  hz), ( hx,  hy,  hz), (-hx,  hy,  hz),
    ]
    cos_z, sin_z = math.cos(rot_z), math.sin(rot_z)
    rotated = [(p[0] * cos_z - p[1] * sin_z + cx,
                p[0] * sin_z + p[1] * cos_z + cy,
                p[2] + cz) for p in pts]
    vs = [bm.verts.new(p) for p in rotated]
    faces = [
        (0, 1, 2, 3),  # bottom
        (4, 7, 6, 5),  # top
        (0, 4, 5, 1),  # front
        (1, 5, 6, 2),  # right
        (2, 6, 7, 3),  # back
        (3, 7, 4, 0),  # left
    ]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bm.to_mesh(mesh)
    bm.free()
    assign_vertex_colors(mesh, color)
    return obj


# Body — beaver oriented along +Y (forward). Sits at z = leg height (~0.15).
LEG_H = 0.18
body = add_uv_capsule("body", 0.0, 0.0, LEG_H + 0.32, 0.32, 0.55, 0.30, FUR, sides=10, rings=6)

# Belly — slightly lighter underside, slightly inset
belly = add_uv_capsule("belly", 0.0, 0.0, LEG_H + 0.20, 0.28, 0.45, 0.18, BELLY, sides=8, rings=4)

# Head — slightly forward and lower than the body's apex
head = add_uv_capsule("head", 0.0, 0.45, LEG_H + 0.40, 0.22, 0.22, 0.20, FUR, sides=8, rings=5)

# Snout — small box poking out of the head
snout = add_box("snout", 0.0, 0.66, LEG_H + 0.34, 0.14, 0.14, 0.10, BELLY)

# Ears
ear_l = add_box("ear_l", -0.18, 0.40, LEG_H + 0.62, 0.08, 0.08, 0.10, FUR)
ear_r = add_box("ear_r",  0.18, 0.40, LEG_H + 0.62, 0.08, 0.08, 0.10, FUR)

# Tail — flat paddle behind the body
tail = add_box("tail", 0.0, -0.55, LEG_H + 0.20, 0.32, 0.36, 0.06, TAIL)

# Legs — four short cylinders/boxes
legs = []
for sx, sy in [(-0.18, 0.18), (0.18, 0.18), (-0.18, -0.18), (0.18, -0.18)]:
    legs.append(add_box(f"leg_{sx}_{sy}", sx, sy, LEG_H / 2, 0.10, 0.10, LEG_H, FUR))

children = [body, belly, head, snout, ear_l, ear_r, tail, *legs]
parent_to_named_root(ASSET_ID, children)
flat_shade(*children)

mat = make_unlit_vertex_color_material("beaver_unlit_vc")
for child in children:
    child.data.materials.append(mat)

export_and_summarise(ASSET_ID, OUT_PATH, *children)
