# Helper invoked at Blender startup to import a .glb and set up a friendly
# inspection scene. Path comes from BEAVER_INSPECT_GLB env var.
#
# bpy.context.screen is None during --python startup, so the import runs
# immediately but the viewport tweaks are deferred via app.timers until the
# GUI is alive.
import bpy, os, sys

path = os.environ.get("BEAVER_INSPECT_GLB")
if not path:
    print("BEAVER_INSPECT_GLB not set; nothing to import")
    sys.exit(0)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
print(f"BEAVER_INSPECTING {path}")


def configure_viewport():
    screen = bpy.context.screen
    if screen is None:
        return 0.1  # try again in 0.1s
    for area in screen.areas:
        if area.type != "VIEW_3D":
            continue
        for space in area.spaces:
            if space.type == "VIEW_3D":
                space.shading.type = "MATERIAL"
                try:
                    space.shading.studio_light = "forest.exr"
                except Exception:
                    pass  # studio light name varies between Blender versions
        try:
            with bpy.context.temp_override(area=area):
                bpy.ops.view3d.view_all(center=True)
        except Exception as exc:
            print(f"viewport frame skipped: {exc}")
    return None  # done


bpy.app.timers.register(configure_viewport, first_interval=0.2)
