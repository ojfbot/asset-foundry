# Hand-scripted bpy fixture for the Phase 0 spike (offline AssetSculptor path).
# §4.4 contract: deterministic seed, fresh scene, named root, glTF export,
# FOUNDRY_SUMMARY stdout line.
import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_vertex_color_material, assign_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "birch_sapling"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)

BARK_COLOR = (0.91, 0.89, 0.86, 1.0)   # warm bark white
LEAF_COLOR = (0.29, 0.54, 0.29, 1.0)   # forest green


def add_trunk():
    mesh = bpy.data.meshes.new("trunk_mesh")
    obj = bpy.data.objects.new("trunk", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    segments = 6
    sides = 6
    height = 1.6
    base_r = 0.05
    top_r = 0.025

    rings = []
    for s in range(segments + 1):
        t = s / segments
        z = t * height
        r = base_r * (1 - t) + top_r * t
        sway = 0.04 * math.sin(t * math.pi)
        ring = []
        for i in range(sides):
            theta = (i / sides) * math.tau
            x = math.cos(theta) * r + sway
            y = math.sin(theta) * r
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)

    bm.verts.ensure_lookup_table()
    for s in range(segments):
        a, b = rings[s], rings[s + 1]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new([a[i], a[j], b[j], b[i]])
    bm.faces.new(rings[-1])  # cap
    bm.to_mesh(mesh)
    bm.free()
    assign_vertex_colors(mesh, BARK_COLOR)
    return obj


def add_foliage():
    mesh = bpy.data.meshes.new("foliage_mesh")
    obj = bpy.data.objects.new("foliage", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    top_z = 1.55
    for i in range(4):
        ang = (i / 4) * math.tau + 0.3
        radius = 0.42
        height = 0.55 + random.random() * 0.1
        tip = Vector((0.0, 0.0, top_z + height))
        left = Vector((math.cos(ang + 0.6) * radius, math.sin(ang + 0.6) * radius, top_z + 0.05))
        right = Vector((math.cos(ang - 0.6) * radius, math.sin(ang - 0.6) * radius, top_z + 0.05))
        bm.faces.new([bm.verts.new(left), bm.verts.new(right), bm.verts.new(tip)])
    bm.to_mesh(mesh)
    bm.free()
    assign_vertex_colors(mesh, LEAF_COLOR)
    return obj


trunk = add_trunk()
foliage = add_foliage()
parent_to_named_root(ASSET_ID, [trunk, foliage])
flat_shade(trunk, foliage)

mat = make_unlit_vertex_color_material("birch_unlit_vc")
trunk.data.materials.append(mat)
foliage.data.materials.append(mat)

export_and_summarise(ASSET_ID, OUT_PATH, trunk, foliage)
