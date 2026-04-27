# Pond surface: hexagon-fanned disc, slate-blue translucent vertex colours.
import bpy
import bmesh
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_translucent_vertex_color_material, assign_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "water_pond"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)

WATER_COLOR = (0.36, 0.50, 0.61, 1.0)


def add_water():
    mesh = bpy.data.meshes.new("water_mesh")
    obj = bpy.data.objects.new("water", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    radius = 4.5
    rings = 4
    sides = 18  # 18 wedges × 4 rings = 72 quads = 144 tris

    centre = bm.verts.new((0.0, 0.0, 0.04))  # slightly raised so it doesn't z-fight ground
    rings_v = [[centre]]  # ring 0 is just the centre
    for r in range(1, rings + 1):
        t = r / rings
        ring = []
        for i in range(sides):
            theta = (i / sides) * math.tau
            x = math.cos(theta) * radius * t
            y = math.sin(theta) * radius * t
            ring.append(bm.verts.new((x, y, 0.04)))
        rings_v.append(ring)

    # Centre fan
    inner = rings_v[1]
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new([centre, inner[i], inner[j]])

    # Concentric quad rings
    for r in range(1, rings):
        a = rings_v[r]
        b = rings_v[r + 1]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([a[i], a[j], b[j], b[i]])

    bm.to_mesh(mesh)
    bm.free()
    assign_vertex_colors(mesh, WATER_COLOR)
    return obj


water = add_water()
parent_to_named_root(ASSET_ID, [water])
flat_shade(water)

mat = make_unlit_translucent_vertex_color_material("pond_unlit_translucent", alpha=0.40)
water.data.materials.append(mat)

export_and_summarise(ASSET_ID, OUT_PATH, water)
