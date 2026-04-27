# Inverted icosphere/dome with a vertical gradient: pale dawn-gold near the
# horizon, soft slate-blue at the zenith. Rendered backside-only so it acts as
# a sky cyclorama.
import bpy
import bmesh
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_vertex_color_material, assign_per_face_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "sky_dome"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)

ZENITH = (0.55, 0.65, 0.78, 1.0)   # soft slate
HORIZON = (0.95, 0.86, 0.70, 1.0)  # dawn gold


def lerp(a, b, t):
    return tuple(a[k] * (1 - t) + b[k] * t for k in range(4))


def add_dome():
    mesh = bpy.data.meshes.new("sky_mesh")
    obj = bpy.data.objects.new("sky", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    # UV-style hemisphere, big enough to enclose the world (radius 60u).
    radius = 60.0
    rings = 6      # vertical slices (above horizon)
    sides = 24     # azimuthal segments → 24 × 6 ≈ 288 tris (under 400)

    rings_v = []
    for r in range(rings + 1):
        phi = (r / rings) * (math.pi / 2)  # 0 at horizon, π/2 at zenith
        z = math.sin(phi) * radius
        ring_r = math.cos(phi) * radius
        ring = []
        for i in range(sides):
            theta = (i / sides) * math.tau
            x = math.cos(theta) * ring_r
            y = math.sin(theta) * ring_r
            ring.append(bm.verts.new((x, y, z)))
        rings_v.append(ring)

    # Triangulate inward-facing (so we see the inside surface from below)
    for r in range(rings):
        a = rings_v[r]
        b = rings_v[r + 1]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([a[i], b[i], b[j], a[j]])  # winding: inward

    bm.to_mesh(mesh)
    bm.free()

    # Vertex colour by height (face centroid Z) → gradient
    def pick(face_idx, face):
        zs = [v.co.z for v in face.verts]
        avg_z = sum(zs) / len(zs)
        t = max(0.0, min(1.0, avg_z / radius))
        return lerp(HORIZON, ZENITH, t)

    assign_per_face_vertex_colors(mesh, pick)
    return obj


sky = add_dome()
parent_to_named_root(ASSET_ID, [sky])
flat_shade(sky)

mat = make_unlit_vertex_color_material("sky_unlit_vc")
sky.data.materials.append(mat)

export_and_summarise(ASSET_ID, OUT_PATH, sky)
