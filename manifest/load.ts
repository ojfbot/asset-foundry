import type { WorldManifest, Prop } from "./schema";

export function findProp(manifest: WorldManifest, id: string): Prop {
  const prop = manifest.props.find((p) => p.id === id);
  if (!prop) throw new Error(`unknown prop id: ${id}`);
  return prop;
}
