---
name: add-prop
description: Add a new prop to manifest/world.yaml and scaffold a matching bpy fixture stub honouring the §4.4 Python contract. Triggers on "add prop", "new asset", "scaffold prop".
---

# /add-prop — Scaffold a new pipeline asset

Arguments: `$ARGUMENTS` — typically `<prop_id>` plus optional `--category=<cat>` and `--biome=<biome_id>`. Default category: `decoration`. Default biome: the first biome in `manifest/world.yaml`.

## Steps

1. **Validate the prop_id**: must match `^[a-z][a-z0-9_]*$` (snake_case). Reject anything else.
2. **Confirm there's no collision**:
   - Check `manifest/world.yaml`'s `props[].id`.
   - Check `fixtures/<prop_id>.py` doesn't already exist.
3. **Append the manifest entry** under `props:` in `manifest/world.yaml`:
   ```yaml
   - id: <prop_id>
     category: <category>            # vegetation | building | rock | water | decoration | terrain | character | sky
     tri_budget: <reasonable>        # 100–1500 typical; ground is the upper end
     variants: 1
     biomes: [<biome_id>]
     style_anchors: [low_poly, flat_shaded, ...]
     materials: [<slot_name>]
     interaction: none
   ```
   Ask the user for tri_budget and style_anchors if not obvious from `prop_id`.
4. **Run `pnpm validate:manifest`** — fail-fast if the Zod schema rejects.
5. **Scaffold the fixture** at `fixtures/<prop_id>.py`. Use this template, filling in the geometry inside `add_<thing>()`:

   ```python
   import bpy, bmesh, math, os, random, sys
   sys.path.insert(0, os.path.dirname(__file__))
   from _lib import (
       parse_argv, fresh_scene, parent_to_named_root,
       make_unlit_vertex_color_material, assign_vertex_colors,
       flat_shade, export_and_summarise,
   )

   ASSET_ID = "<prop_id>"
   OUT_PATH, _ = parse_argv()
   fresh_scene(ASSET_ID)

   COLOUR = (0.5, 0.5, 0.5, 1.0)  # sRGB; _lib linearises

   def add_thing():
       mesh = bpy.data.meshes.new("thing_mesh")
       obj = bpy.data.objects.new("thing", mesh)
       bpy.context.collection.objects.link(obj)
       bm = bmesh.new()
       # ... build geometry here ...
       bm.to_mesh(mesh)
       bm.free()
       assign_vertex_colors(mesh, COLOUR)
       return obj

   thing = add_thing()
   parent_to_named_root(ASSET_ID, [thing])
   flat_shade(thing)

   mat = make_unlit_vertex_color_material("<prop_id>_unlit_vc")
   thing.data.materials.append(mat)

   export_and_summarise(ASSET_ID, OUT_PATH, thing)
   ```

6. **Smoke-test the pipeline**:
   ```bash
   BLENDER_BIN="..." pnpm gen-asset <prop_id>
   ```
   Expect `✓ ... validated (N/M tris)`. If it fails:
   - Tri budget exceeded → reduce subdivisions or tighten geometry.
   - `asset_id` mismatch → the `ASSET_ID` constant in the fixture must match the manifest `id`.
   - Vertex colour absent in the exported `.glb` → confirm `_lib.py` `_activate_color` fired (CLAUDE.md "Blender gotchas").

7. **Refresh this skill's context**: if the new prop introduces a new category or biome, update `decisions/` if there's a decision worth recording (e.g. extending the schema).

## See also

- `manifest/schema.ts` — the Zod schema that defines what's legal.
- `fixtures/_lib.py` — the helpers (`make_unlit_vertex_color_material`, `assign_vertex_colors`, `export_and_summarise`).
- `fixtures/birch_sapling.py`, `fixtures/ground_pond_meadow.py` — reference fixtures of different categories.
- `/audit-budgets` — sanity-check the new prop's tri count after a few iterations.
