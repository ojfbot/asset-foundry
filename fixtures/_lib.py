"""Shared helpers for fixture bpy scripts.

Each fixture imports via:
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from _lib import (...)

The helpers below produce materials that Blender's glTF exporter recognises as
KHR_materials_unlit (Emission-only node setup) so vertex colours render
identically in Three.js. See ADR-0004 in beaverGame.
"""
import bpy
import bmesh
import json
import math
import sys
import os
from typing import Iterable, Tuple

Vec4 = Tuple[float, float, float, float]


# ---------------------------------------------------------------------------
# Colour space — fixtures author in sRGB; glTF COLOR_0 is linear by spec.
# Three.js reads it as linear, so we pre-linearise here to avoid washed tones.
# ---------------------------------------------------------------------------

def _srgb_to_linear_channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb_to_linear(rgba: Vec4) -> Vec4:
    return (
        _srgb_to_linear_channel(rgba[0]),
        _srgb_to_linear_channel(rgba[1]),
        _srgb_to_linear_channel(rgba[2]),
        rgba[3],
    )


# ---------------------------------------------------------------------------
# CLI / env helpers
# ---------------------------------------------------------------------------

def parse_argv():
    """Return (out_path, materials_json_path) from argv after the `--` separator."""
    argv = sys.argv
    sep = argv.index("--") if "--" in argv else len(argv)
    extras = argv[sep + 1:]
    out_path = extras[0] if extras else "out.glb"
    mats_path = extras[1] if len(extras) > 1 else None
    return out_path, mats_path


def fresh_scene(asset_id: str) -> None:
    """Deterministic seed + empty scene. Required by §4.4 contract."""
    import random
    random.seed(hash(asset_id) & 0xFFFF)
    bpy.ops.wm.read_factory_settings(use_empty=True)


def parent_to_named_root(asset_id: str, children: Iterable[bpy.types.Object]) -> bpy.types.Object:
    """Create one named Empty root (the §4.4 'one named root object') and
    parent every child to it. The asset_id IS the root name."""
    root = bpy.data.objects.new(asset_id, None)
    bpy.context.collection.objects.link(root)
    for child in children:
        child.parent = root
    return root


# ---------------------------------------------------------------------------
# Materials — Emission-only ⇒ KHR_materials_unlit on export
# ---------------------------------------------------------------------------

def make_unlit_vertex_color_material(name: str) -> bpy.types.Material:
    """Material: Vertex Color (Col layer) → Emission → Output. Blender's glTF
    exporter writes this as KHR_materials_unlit + COLOR_0. Three.js then loads
    a MeshBasicMaterial({vertexColors: true}) automatically."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emission = nt.nodes.new("ShaderNodeEmission")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], emission.inputs["Color"])
    nt.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


def make_unlit_translucent_vertex_color_material(name: str, alpha: float = 0.55) -> bpy.types.Material:
    """Like unlit-vertex-color but mixed with Transparent BSDF for water-style
    translucency. Blender's exporter writes this as KHR_materials_unlit with
    alphaMode = BLEND."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = alpha  # 1.0 = fully opaque emissive
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    emission = nt.nodes.new("ShaderNodeEmission")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], emission.inputs["Color"])
    nt.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emission.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def _activate_color(mesh: bpy.types.Mesh, layer_name: str) -> None:
    """The glTF exporter only writes COLOR_0 if a colour attribute is set as
    active on the mesh. bm.to_mesh leaves active_color unset, so promote here."""
    if layer_name in mesh.color_attributes:
        mesh.color_attributes.active_color = mesh.color_attributes[layer_name]
        try:
            mesh.color_attributes.render_color_index = list(mesh.color_attributes.keys()).index(layer_name)
        except (AttributeError, ValueError):
            pass


def assign_vertex_colors(mesh: bpy.types.Mesh, color: Vec4, layer_name: str = "Col") -> None:
    """Set every loop's `Col` attribute. Caller passes sRGB; we linearise here."""
    lin = srgb_to_linear(color)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    # FLOAT_COLOR domain — Blender's glTF exporter writes this as COLOR_0 reliably
    # in 4.x. The legacy BYTE_COLOR layer is silently dropped by some exporter paths.
    layer = bm.loops.layers.float_color.get(layer_name) or bm.loops.layers.float_color.new(layer_name)
    for face in bm.faces:
        for loop in face.loops:
            loop[layer] = lin
    bm.to_mesh(mesh)
    bm.free()
    _activate_color(mesh, layer_name)


def assign_per_face_vertex_colors(mesh: bpy.types.Mesh, picker, layer_name: str = "Col") -> None:
    """`picker(face_index, face) -> sRGB Vec4`. We linearise per-face."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    # FLOAT_COLOR domain — Blender's glTF exporter writes this as COLOR_0 reliably
    # in 4.x. The legacy BYTE_COLOR layer is silently dropped by some exporter paths.
    layer = bm.loops.layers.float_color.get(layer_name) or bm.loops.layers.float_color.new(layer_name)
    for i, face in enumerate(bm.faces):
        col = picker(i, face)
        lin = srgb_to_linear(col)
        for loop in face.loops:
            loop[layer] = lin
    bm.to_mesh(mesh)
    bm.free()
    _activate_color(mesh, layer_name)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def flat_shade(*objs: bpy.types.Object) -> None:
    for obj in objs:
        if obj.data is None:
            continue
        obj.data.calc_loop_triangles()
        for poly in obj.data.polygons:
            poly.use_smooth = False


def export_and_summarise(asset_id: str, out_path: str, *objs: bpy.types.Object) -> None:
    """glTF export + emit FOUNDRY_SUMMARY line per §4.4."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    # Always select the named root too
    root = bpy.data.objects.get(asset_id)
    if root:
        root.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_colors=True,
        export_materials="EXPORT",
    )

    tri_count = sum(len(o.data.loop_triangles) for o in objs if o.data)
    all_co = [v.co for o in objs if o.data for v in o.data.vertices]
    if all_co:
        xs = [c.x for c in all_co]
        ys = [c.y for c in all_co]
        zs = [c.z for c in all_co]
        bbox = {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}
    else:
        bbox = {"min": [0, 0, 0], "max": [0, 0, 0]}

    material_slots = []
    for o in objs:
        for ms in o.material_slots:
            if ms.material and ms.material.name not in material_slots:
                material_slots.append(ms.material.name)

    print("FOUNDRY_SUMMARY " + json.dumps({
        "asset_id": asset_id,
        "tri_count": tri_count,
        "bounding_box": bbox,
        "material_slots": material_slots,
    }))
