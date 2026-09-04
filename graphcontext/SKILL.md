---
name: graphcontext
description: |
  Index the ENTIRE codebase into a live Context Graph (.ryme-skill/graph/). Parses every file into symbols + import edges + modules, ranks by PageRank, and writes context.md for agents. Run at project open, after merges, or when graph is missing/stale. The graph MUST be read before any code task and updated after every edit. Supports any stack.
---

# /graphcontext — Build / Refresh the Codebase Context Graph

> **Agent rule:** You may NOT write, plan, or reason about code without a fresh graph. If `.ryme-skill/graph/context.md` is missing or stale (>7 days or older than `git diff`), you run this skill first. No exceptions.

## Step 0 — Locate the indexer

```bash
# find indexer — ALWAYS prefers project-local copy (no external access needed)
# Graph itself is ALWAYS in the working directory: ./.ryme-skill/graph (not in the skill dir)
IDX=""
for p in \
  "./.ryme-skills/scripts/ryme-graph.mjs" \
  "./ryme-skills/scripts/ryme-graph.mjs" \
  "./.claude/skills/graphcontext/scripts/ryme-graph.mjs" \
  "./.agents/skills/graphcontext/scripts/ryme-graph.mjs" \
  "./.claude/skills/ryme-context-graph/scripts/ryme-graph.mjs" \
  "./scripts/ryme-graph.mjs" \
  "$HOME/.config/opencode/skills/ryme-context-graph/scripts/ryme-graph.mjs" \
  "$HOME/.config/opencode/skills/graphcontext/scripts/ryme-graph.mjs" \
  "./node_modules/.bin/ryme-graph" ; do
  [ -f "$p" ] && IDX="$p" && break
done
# fallback: search inside working directory only (maxdepth 4, no external)
if [ -z "$IDX" ]; then IDX=$(find . -maxdepth 4 -name "ryme-graph.mjs" -type f 2>/dev/null | head -1); fi
echo "IDX=$IDX (graph in working dir: ./.ryme-skill/graph)"
ls -la "$IDX" 2>&1 | head -1
mkdir -p .ryme-skill/graph
If `IDX` is empty, the skill is not installed — tell the user to copy `ryme-skills/` into the repo or run the install step in `ryme-context-graph/SKILL.md`.

## Step 1 — Decide: full vs incremental

```bash
if [ -f .ryme-skill/graph/manifest.json ]; then
  echo "Existing graph found — checking staleness"
  cat .ryme-skill/graph/manifest.json | head -n 20
  # incremental if exists, full if forced or >100 files changed
  node "$IDX" --verify --out .ryme-skill/graph 2>&1 | head -n 30
else
  echo "No graph — will do full --init"
fi
```

**Rules:**
- First run in repo → `--init` (full)
- After `git merge` / large refactor → `--init`
- During normal work (few files changed) → `--update`
- If `--verify` reports `Graph stale` or `High orphan ratio` → `--init`

Ask the user only if ambiguous:

> Full re-index (slow, thorough, ~1–3s per 1k files) or incremental update (fast, uses mtime+hash)?

Default: `incremental` if manifest exists, else `full`.

## Step 2 — Run detection (always)

```bash
mkdir -p .ryme-skill/tmp && node "$IDX" --detect --root . 2>&1 | tee .ryme-skill/tmp/ryme-tech.json
cat .ryme-skill/tmp/ryme-tech.json
```

Print the detected primary language + frameworks. If the user has pinned a stack in `.ryme-skill/config.json`, show it and do not override without asking.

**Tech-stack overrides:** If the project uses a stack the detector missed (e.g., private framework, mixed-language monorepo), append to `.ryme-skill/config.json`:

```json
{ "techstack": { "primary": "TypeScript", "frameworks": ["Next.js","Prisma"], "databases": ["Supabase"] } }
```

## Step 3 — Index

### Full

```bash
mkdir -p .ryme-skill/tmp && node "$IDX" --init --root . --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/ryme-index.log
```

### Incremental

```bash
mkdir -p .ryme-skill/tmp && node "$IDX" --update --root . --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/ryme-index.log
```

**What it does:**
- Walks the repo respecting `.gitignore` + `.ryme-skillignore`, skipping `node_modules/.git/dist/.next/.ryme-skill/vendor` etc.
- For every included file (JS/TS/Py/Go/Rust/Java/PHP/Ruby/C#/Swift/Dart/Elixir/Vue/Svelte/Astro + configs) extracts:
  - `symbols`: functions, classes, interfaces, types, enums, routes, components (per-language regex, tree-sitter upgrade path)
  - `imports`: `import` / `require` / `use` / `from X import` + line numbers
  - `hash`: sha1 for incremental
- Builds `edges` (file → file), `modules` (domain grouping), `ranked` (PageRank-ish by fan-in), `impact` (orphans/hubs).
- Writes to `.ryme-skill/graph/`:
  - `manifest.json` — version, counts, duration
  - `techstack.json` — detection result
  - `nodes.json` — per-file symbols + imports
  - `edges.json` — import graph
  - `modules.json` — domain map
  - `ranked.json` — file ranking
  - `context.md` — token-budget Repo Map (~1.2k tokens, always read this)
  - `impact.json` — blast-radius for `/refract`
  - `changelog.md` — append-only log

**Performance:** ~1–3s per 1k files on a laptop. 10k-file repo ~10–20s. No network, no vector DB, no API keys.

## Step 4 — Verify + show

```bash
node "$IDX" --stats --out .ryme-skill/graph 2>&1 | head -n 60
node "$IDX" --verify --out .ryme-skill/graph 2>&1 | head -n 60
echo "--- context.md (first 120 lines) ---"
head -n 120 .ryme-skill/graph/context.md
echo "--- modules ---"
cat .ryme-skill/graph/modules.json | head -n 80
```

Report to the user:

```
Graph ready: 342 files · 1,840 symbols · 612 edges · 8 modules
Primary: TypeScript (Next.js + Prisma + Supabase, confidence 0.82)
Top hubs: src/lib/db.ts (fan-in 34), src/auth/middleware.ts (fan-in 21)
Orphans: 12 (see impact.json)
Context: .ryme-skill/graph/context.md (1.1k tokens) — agents read this first
Verify: healthy / issues: <list if any>
```

## Step 5 — Wire the agent (one-time per repo)

Ensure every future agent turn reads the graph. Append to the repo's agent instructions if not already present.

```bash
# check existing routing
grep -q "Ryme Context Graph" CLAUDE.md 2>/dev/null && echo "CLAUDE.md already wired" || echo "needs wiring"
grep -q "Ryme Context Graph" AGENTS.md 2>/dev/null && echo "AGENTS.md already wired" || echo "needs wiring"
grep -q "Ryme Context Graph" .claude/CLAUDE.md 2>/dev/null && echo ".claude ok" || true
```

If not wired, append:

```markdown
## Ryme Context Graph — Mandatory Protocol

> This repo uses a live Context Graph at `.ryme-skill/graph/`. Every agent MUST follow this.

1. Before any code task: `Read .ryme-skill/graph/context.md` and `Read .ryme-skill/graph/techstack.json`.
2. Before creating ANY symbol: `node scripts/ryme-graph.mjs --query "<intent>"` and check `nodes.json` for duplicates.
3. After any edit: `node scripts/ryme-graph.mjs --update` (same turn, no excuses).
4. For scoping: cite `modules.json` dependencies and `edges.json` fan-in/out.
5. If graph is missing/stale: invoke `/graphcontext` before you continue.

Graph is the source of truth. Grep is the fallback, not the default.
```

Create `CLAUDE.md` if missing, or `AGENTS.md` as fallback. For OpenCode, also ensure `.opencode/skills/` discovery can find `ryme-graph.mjs` (symlink or copy).

## Step 6 — Commit (optional)

```bash
git add .ryme-skill/graph/ CLAUDE.md AGENTS.md 2>/dev/null || true
git status --short
# ask: commit the initial graph? (recommended: yes for team visibility)
```

## Failure modes

| Symptom | Fix |
|---------|-----|
| `IDX empty` | Skill not installed — copy `ryme-skills/` into repo root |
| `Found 0 files` | Check `.gitignore` isn't ignoring everything; check `--root` |
| `High orphan ratio` | Normal for leaf-heavy apps; re-run with `--init` to confirm |
| `No symbols extracted` | Parser coverage low for this stack — graph still useful for file+module map; open an issue with sample file |
| `Graph stale` | `--update` or `--init` |

## Done

You now have a production map of the codebase that every agent will reuse. Next:

- New feature? → `/feature "add <thing>"` (uses this graph to scope)
- New project? → `/build` (creates graph from skeleton)
- Cleanup / migration? → `/refract` (uses `impact.json`)

**Never let the graph go stale.** The agent that edits must be the agent that updates.
