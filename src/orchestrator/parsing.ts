// Pull Python source out of a Claude reply that may include fences and prose.
// AssetSculptor's prompt asks for one fenced block, but parsers should be charitable.
const FENCE = /```(?:python|py)?\s*\n([\s\S]*?)```/m;

export function extractFencedPython(text: string): string {
  const match = FENCE.exec(text);
  if (match && match[1]) return match[1].trim();
  // No fence — assume the whole reply is python (matches the "no commentary" instruction).
  if (/(\bimport\s+bpy\b|\bbpy\.ops\b)/.test(text)) return text.trim();
  throw new Error("AssetSculptor reply did not contain a python script");
}

// Fixture and AssetSculptor scripts both prefix the JSON line with FOUNDRY_SUMMARY
// so the parser can find it amid Blender's chatty stdout.
const SUMMARY_PREFIX = /^FOUNDRY_SUMMARY (\{.*\})\s*$/m;
const JSON_LINE_FALLBACK = /\{[^{}]*?"asset_id"[^{}]*?\}/m;

export function extractSummaryJson(stdout: string): unknown {
  const match = SUMMARY_PREFIX.exec(stdout) ?? JSON_LINE_FALLBACK.exec(stdout);
  if (!match) throw new Error(`bpy stdout missing JSON summary line:\n${stdout}`);
  return JSON.parse(match[1] ?? match[0]);
}
