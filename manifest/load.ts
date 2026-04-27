import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { WorldManifestSchema, type WorldManifest, type Prop } from "./schema";

export function loadManifest(path?: string): WorldManifest {
  const p = path ?? join(process.cwd(), "manifest", "world.yaml");
  const raw = yaml.load(readFileSync(p, "utf8"));
  return WorldManifestSchema.parse(raw);
}

export function findProp(manifest: WorldManifest, id: string): Prop {
  const prop = manifest.props.find((p) => p.id === id);
  if (!prop) throw new Error(`unknown prop id: ${id}`);
  return prop;
}
