# Ground patch for the pond_meadow biome. 24×24 subdivided plane, 30u radius,
# vertex-colored gentle mottle of grass tones, low-amplitude noise displacement.
import bpy
import bmesh
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_vertex_color_material, assign_per_face_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "ground_pond_meadow"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)
random.seed(1729)

GRASS_DARK = (0.20, 0.36, 0.21, 1.0)
GRASS_MID = (0.29, 0.48, 0.27, 1.0)
GRASS_LIGHT = (0.42, 0.61, 0.34, 1.0)


def add_ground():
    mesh = bpy.data.meshes.new("ground_mesh")
    obj = bpy.data.objects.new("ground", mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    size = 30.0
    n = 24  # 24×24 quads → 1152 tris (under tri_budget 1200)
    step = size / n
    half = size / 2

    grid = [[None] * (n + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        for j in range(n + 1):
            x = -half + i * step
            y = -half + j * step
            # gentle elevation noise — falls off near the edges so the patch has shape
            edge_falloff = 1.0 - max(abs(x) / half, abs(y) / half)
            z = (random.random() - 0.5) * 0.18 * edge_falloff
            grid[i][j] = bm.verts.new((x, y, z))

    for i in range(n):
        for j in range(n):
            bm.faces.new([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]])

    bm.to_mesh(mesh)
    bm.free()

    def pick(face_idx, _face):
        # Mottle: pick a grass tone with subtle bias toward mid-green.
        roll = random.random()
        if roll < 0.55:
            return GRASS_MID
        if roll < 0.80:
            return GRASS_DARK
        return GRASS_LIGHT

    assign_per_face_vertex_colors(mesh, pick)
    return obj


ground = add_ground()
parent_to_named_root(ASSET_ID, [ground])
flat_shade(ground)

mat = make_unlit_vertex_color_material("ground_unlit_vc")
ground.data.materials.append(mat)

export_and_summarise(ASSET_ID, OUT_PATH, ground)
