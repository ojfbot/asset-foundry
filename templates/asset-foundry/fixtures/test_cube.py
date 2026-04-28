# Trivial unit cube — Phase 1 portability proof for a second target.
# Exercises the §4.4 Python contract: deterministic seed, fresh scene, named root,
# tri budget, glTF export, FOUNDRY_SUMMARY line.
import bpy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _lib import (  # noqa: E402
    parse_argv, fresh_scene, parent_to_named_root,
    make_unlit_vertex_color_material, assign_vertex_colors,
    flat_shade, export_and_summarise,
)

ASSET_ID = "test_cube"
OUT_PATH, _ = parse_argv()
fresh_scene(ASSET_ID)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
cube = bpy.context.active_object
cube.name = "cube_mesh"

assign_vertex_colors(cube.data, (0.53, 0.53, 0.53, 1.0))  # sRGB ≈ #888888
mat = make_unlit_vertex_color_material("debug_grey")
cube.data.materials.append(mat)

flat_shade(cube)
parent_to_named_root(ASSET_ID, [cube])
export_and_summarise(ASSET_ID, OUT_PATH, cube)
