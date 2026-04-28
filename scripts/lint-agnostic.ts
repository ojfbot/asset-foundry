// Game-agnostic lint rule (ADR-0007). Scans asset-foundry's src/ and scripts/
// for tokens that name content from a specific consumer game. Fails CI when found.
//
// Scope:
//   - identifier names (variable / function / type / interface / parameter)
//   - string literals (including template literals)
//
// Disable directive: place a comment on the line ABOVE the violation, e.g.
//   // foundry-agnostic-disable-next-line: explanation of why this is platform-correct
//
// This script self-disables for FORBIDDEN_TOKENS via the `// foundry-agnostic-...`
// directive below. Adding new tokens does NOT require an ADR; *changing the rule's
// shape* (e.g. expanding to AST-flow analysis) does (per ADR-0007 amendment policy).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

// foundry-agnostic-disable-next-line: this IS the canonical list of forbidden tokens
const FORBIDDEN_TOKENS = [
  // Cozy Beaver vocabulary (ADR-0007 seed list)
  "beaver",
  "cozy",
  "pond",
  "meadow",
  "cattail",
  "lily",
  "dragonfly",
  "bark_white",
  "bark_dark",
  "leaf_green",
  "leaf_gold",
  "stone_grey",
  "sapling",
];

// Directories to scan. Anything outside this list is exempt — game-specific data
// in <target>/asset-foundry/ is allowed to use any vocabulary.
const SCAN_ROOTS = ["src", "scripts"];

// Files exempt from the rule entirely (this file references the tokens by design).
const EXEMPT_FILES = new Set([
  "scripts/lint-agnostic.ts",
]);

const DISABLE_DIRECTIVE = "foundry-agnostic-disable-next-line";

interface Violation {
  file: string;
  line: number;
  column: number;
  token: string;
  context: string;
  kind: "identifier" | "string";
}

function tokenize(text: string): string[] {
  // Decompose snake_case / camelCase / PascalCase into lowercase parts.
  const snakeParts = text.toLowerCase().split(/[_\W]+/).filter(Boolean);
  const camelParts = text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_\W]+/)
    .filter(Boolean);
  return Array.from(new Set([...snakeParts, ...camelParts]));
}

function findTokenIn(text: string, kind: "identifier" | "string"): string[] {
  const hits = new Set<string>();
  if (kind === "identifier") {
    const parts = tokenize(text);
    for (const t of FORBIDDEN_TOKENS) {
      if (parts.includes(t)) hits.add(t);
      // Also catch full snake-case forbidden tokens that span parts
      if (t.includes("_") && text.toLowerCase().includes(t)) hits.add(t);
    }
  } else {
    // string literal: substring match (game vocabulary in a prompt or config string
    // is exactly what we want to forbid)
    const lower = text.toLowerCase();
    for (const t of FORBIDDEN_TOKENS) {
      if (lower.includes(t)) hits.add(t);
    }
  }
  return Array.from(hits);
}

function isLineDisabled(source: string, line: number): boolean {
  // True when the previous line contains the directive. Anything after the
  // directive (typically a colon-prefixed reason) is documentation only.
  const lines = source.split("\n");
  if (line <= 1) return false;
  const prev = lines[line - 2] ?? "";
  return prev.includes(DISABLE_DIRECTIVE);
}

function scanFile(absPath: string, repoRoot: string): Violation[] {
  const rel = relative(repoRoot, absPath);
  if (EXEMPT_FILES.has(rel)) return [];
  const source = readFileSync(absPath, "utf8");
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  function check(text: string, node: ts.Node, kind: "identifier" | "string"): void {
    const hits = findTokenIn(text, kind);
    if (hits.length === 0) return;
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (isLineDisabled(source, line + 1)) return;
    for (const token of hits) {
      violations.push({
        file: rel,
        line: line + 1,
        column: character + 1,
        token,
        kind,
        context: text.length > 60 ? text.slice(0, 57) + "..." : text,
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      check(node.text, node, "identifier");
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      check(node.text, node, "string");
    } else if (ts.isTemplateExpression(node)) {
      check(node.head.text, node.head, "string");
      for (const span of node.templateSpans) {
        check(span.literal.text, span.literal, "string");
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return violations;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (extname(p) === ".ts") {
      out.push(p);
    }
  }
  return out;
}

const repoRoot = process.cwd();
const files: string[] = [];
for (const root of SCAN_ROOTS) {
  walk(join(repoRoot, root), files);
}

let totalViolations = 0;
for (const f of files) {
  const vs = scanFile(f, repoRoot);
  for (const v of vs) {
    console.error(
      `✗ ${v.file}:${v.line}:${v.column}  [${v.kind}] forbidden token "${v.token}"  → ${v.context}`
    );
    totalViolations++;
  }
}

if (totalViolations === 0) {
  console.log(`✓ foundry-agnostic: ${files.length} files clean`);
  process.exit(0);
}

console.error(
  `\n✗ foundry-agnostic: ${totalViolations} violation(s) across ${files.length} file(s).`
);
console.error(
  "Game-specific vocabulary belongs in <target>/asset-foundry/ (per ADR-0006/0007), not in this repo's src/ or scripts/."
);
console.error(
  `If a violation is platform-correct (false positive), add a "// ${DISABLE_DIRECTIVE}: <reason>" comment on the line above.`
);
process.exit(1);
