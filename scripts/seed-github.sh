#!/usr/bin/env bash
# seed-github.sh — idempotent seeder for labels, milestones, and issues.
#
# Reads:
#   .github/labels.yml          → gh label create
#   .github/milestones.yml      → gh api repos/.../milestones
#   .github/planning/issues/*.md → gh issue create
#
# Idempotency:
#   - Labels: gh label create --force (updates instead of erroring)
#   - Milestones: skip if title already exists
#   - Issues: skip if title already exists
#
# Requires: gh, python3 (for YAML/markdown parsing — no extra deps)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Sanity: gh authed for this repo's owner? ─────────────────────────────────
gh auth status >/dev/null 2>&1 || { echo "✗ gh not authenticated" ; exit 1; }
REPO_NWO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "▶ seeding $REPO_NWO"

# ── Labels ────────────────────────────────────────────────────────────────────
echo
echo "── Labels"
python3 - <<'PYEOF'
import re, subprocess, sys, pathlib
text = pathlib.Path(".github/labels.yml").read_text()
# Tiny-yaml: parse list of {name, color, description} blocks. No deps.
labels = []
cur = {}
for line in text.splitlines():
    line = line.rstrip()
    if not line or line.lstrip().startswith("#"):
        continue
    if line.startswith("- name:"):
        if cur: labels.append(cur)
        cur = {"name": line.split("- name:", 1)[1].strip()}
    elif line.lstrip().startswith("color:"):
        cur["color"] = line.split("color:", 1)[1].strip().strip('"')
    elif line.lstrip().startswith("description:"):
        cur["description"] = line.split("description:", 1)[1].strip().strip('"')
if cur: labels.append(cur)
for L in labels:
    args = ["gh", "label", "create", L["name"], "--force"]
    if "color" in L: args += ["--color", L["color"]]
    if "description" in L: args += ["--description", L["description"]]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode == 0:
        print(f"  ✓ {L['name']}")
    else:
        print(f"  ✗ {L['name']}: {r.stderr.strip()}", file=sys.stderr)
PYEOF

# ── Milestones ────────────────────────────────────────────────────────────────
echo
echo "── Milestones"
python3 - <<'PYEOF'
import json, subprocess, pathlib
text = pathlib.Path(".github/milestones.yml").read_text()
mss = []
cur = {}
for line in text.splitlines():
    line = line.rstrip()
    if not line or line.lstrip().startswith("#"):
        continue
    if line.startswith("- title:"):
        if cur: mss.append(cur)
        cur = {"title": line.split("- title:", 1)[1].strip().strip('"')}
    elif line.lstrip().startswith("description:"):
        cur["description"] = line.split("description:", 1)[1].strip().strip('"')
if cur: mss.append(cur)
existing = json.loads(subprocess.check_output(
    ["gh", "api", "repos/{owner}/{repo}/milestones?state=all"], text=True))
existing_titles = {m["title"] for m in existing}
for M in mss:
    if M["title"] in existing_titles:
        print(f"  · {M['title']} (exists)")
        continue
    args = ["gh", "api", "-X", "POST", "repos/{owner}/{repo}/milestones",
            "-f", f"title={M['title']}"]
    if "description" in M:
        args += ["-f", f"description={M['description']}"]
    subprocess.run(args, check=True, capture_output=True)
    print(f"  ✓ {M['title']}")
PYEOF

# ── Issues ────────────────────────────────────────────────────────────────────
echo
echo "── Issues"
shopt -s nullglob
filed=0; skipped=0; errored=0
for f in .github/planning/issues/*.md; do
  # Parse frontmatter (labels, milestone) and body.
  python3 - "$f" <<'PYEOF' > /tmp/issue-meta.json
import json, sys, pathlib, re
p = pathlib.Path(sys.argv[1])
raw = p.read_text()
m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.DOTALL)
if not m:
    sys.exit(f"no frontmatter in {p}")
fm, body = m.group(1), m.group(2).lstrip()
labels = []
milestone = None
for line in fm.splitlines():
    line = line.rstrip()
    if line.startswith("labels:"):
        # labels: [a, b, c]
        inner = line.split("labels:", 1)[1].strip()
        if inner.startswith("[") and inner.endswith("]"):
            labels = [s.strip() for s in inner[1:-1].split(",") if s.strip()]
    elif line.startswith("milestone:"):
        milestone = line.split("milestone:", 1)[1].strip().strip('"')
title_m = re.match(r"^# (.+)$", body, re.MULTILINE)
title = title_m.group(1).strip() if title_m else p.stem
# strip the H1 from the body (GitHub renders title separately)
body = re.sub(r"^# .+\n+", "", body, count=1, flags=re.MULTILINE)
print(json.dumps({"title": title, "labels": labels, "milestone": milestone, "body": body}))
PYEOF

  meta=$(cat /tmp/issue-meta.json)
  title=$(echo "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["title"])')
  labels=$(echo "$meta" | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)["labels"]))')
  milestone=$(echo "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["milestone"] or "")')
  body=$(echo "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["body"])')

  # Idempotency: skip if a non-closed issue with this exact title exists.
  existing=$(gh issue list --state all --search "in:title \"$title\"" --json number,title --jq ".[] | select(.title == \"$title\") | .number" | head -1)
  if [[ -n "$existing" ]]; then
    echo "  · #$existing $title (exists)"
    skipped=$((skipped + 1))
    continue
  fi

  args=(gh issue create --title "$title" --body "$body")
  [[ -n "$labels" ]] && args+=(--label "$labels")
  [[ -n "$milestone" ]] && args+=(--milestone "$milestone")
  if "${args[@]}" >/dev/null 2>/tmp/issue-err; then
    echo "  ✓ $title"
    filed=$((filed + 1))
  else
    echo "  ✗ $title — $(cat /tmp/issue-err)" >&2
    errored=$((errored + 1))
  fi
done

echo
echo "Done. filed=$filed skipped=$skipped errored=$errored"
[[ $errored -eq 0 ]]
