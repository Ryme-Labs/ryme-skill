---
name: refractor
description: |
  Refactor / reorganize / improve the ENTIRE codebase via an agentic loop. Uses the Context Graph's impact.json + edges to build a Debt Ledger, then spawns parallel subagents per stage/m per module, verifies with build+graph each loop, and iterates until verify is healthy. Supports /refract, /refactor, /refractor — same swarm. Works on any stack.
---

# /refract — Graph-Guided Refactor Swarm (rewrite, organize, improve until clean)

> Refactor without a map is vandalism. Refactor without a loop is half-done. This skill reads `impact.json`, hunts real debt, and ships staged parallel moves until the graph says healthy.

Aliases: `/refract`, `/refactor`, `/refractor`, `/reorganize` — all same skill. (Folder `refract` is canonical; `refactor`/`refractor` are symlinks.)

## Preconditions

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
mkdir -p .ryme-skill/graphif [ ! -f .ryme-skill/graph/context.md ]; then
  echo "No graph — building..."
  node "$IDX" --init --root . --out .ryme-skill/graph 2>&1 | tail -n 20
else
  node "$IDX" --verify --out .ryme-skill/graph 2>&1 | head -n 60
  node "$IDX" --update --root . --out .ryme-skill/graph 2>&1 | tail -n 10
fi

cat .ryme-skill/graph/context.md | head -n 100
cat .ryme-skill/graph/impact.json
cat .ryme-skill/graph/modules.json | head -n 100
cat .ryme-skill/graph/techstack.json
```

Also:

```bash
cat .ryme-skill/graph/manifest.json | head -n 20
ls -la src 2>&1 | head -n 30 || ls -la . 2>&1 | head -n 40
```

Do not refactor blind. If you skip graph read, you will move the wrong thing.

## Phase 1 — Diagnose (evidence, not vibes)

Run and record numbers you cite later:

```bash
# 1) health
node "$IDX" --stats --out .ryme-skill/graph 2>&1 | head -n 40
node "$IDX" --verify --out .ryme-skill/graph 2>&1 | head -n 80

# 2) coupling
cat .ryme-skill/graph/modules.json
cat .ryme-skill/graph/impact.json

# 3) duplication
grep -o '"name":"[^"]*"' .ryme-skill/graph/nodes.json | sort | uniq -c | sort -rn | head -n 20

# 4) huge files & orphans
cat .ryme-skill/graph/impact.json | grep -A 100 orphans
cat .ryme-skill/graph/ranked.json | head -n 30

# 5) real lint/typecheck signals (do not fake)
npm run lint 2>&1 | head -n 60 || pnpm lint 2>&1 | head -n 60 || bun run lint 2>&1 | head -n 60 || echo "no lint"
npm run typecheck 2>&1 | head -n 60 || pnpm typecheck 2>&1 | head -n 60 || tsc --noEmit 2>&1 | head -n 60 || echo "no typecheck"
```

Build a **Debt Ledger** (in memory, then in plan file):

```
ID: R1, R2...
Title: one line
Evidence: file:line + graph fact (fan-in, dup count, coupling, lint error)
Impact: what user sees (build size, bug risk, onboarding cost)
Risk: low / medium / high (hub fan-in + edge count)
Effort: S / M / L (files touched)
Kind: structure | dedup | coupling | types | perf | naming | dead-code
```

Derive from graph + tool output, not generic advice. If graph says healthy, honest answer is "No high-value refactor."

Prioritize:

1. **Dead / orphan code** (`impact.json` orphans) — safe wins
2. **Duplicated utils** (same name >3, Grep confirms near-identical bodies) — reuse opportunity
3. **Huge files** (>600 LOC or >30 symbols) — split by domain
4. **Tight coupling** (module A depends on 5, hub fan-in >20) — extract interface
5. **Misplaced domain code** (billing logic in `auth/`) — move to correct module
6. **Weak types / lint debt** (only if lint/typecheck fails)

Generate 5–12 items. Fewer if small; don't pad.

## Phase 2 — Propose staged moves

Write `.ryme-skill/specs/_refract-<date>.md`:

```markdown
# Refract Plan — <date>
> Graph: .ryme-skill/graph @ <manifest.generatedAt> · <fileCount> files
> Tech: <primary + frameworks>
## Symptoms (what user feels)
## Ledger
| ID | Title | Evidence | Impact | Risk | Effort | Kind |
|----|-------|----------|--------|------|--------|------|
| R1 | Split `src/lib/utils.ts` (420 LOC, 18 utils) | nodes.json: utils.ts 18 syms, fan-in 12 | slow imports, hard to test | med | M | structure |
...
## Stages (ship in order, verify between)
### Stage 1 — Dead code + trivial dedup (low risk)
- Ledger: [R2, R5]
- Files: 3
- Verify: `pnpm build && pnpm test` + `--verify` clean
- Rollback: `git revert HEAD~1`
### Stage 2 — Extract domain module
- Ledger: [R1, R3]
...
## Edges that will change
- `src/lib/utils.ts` → `src/lib/format.ts`, `src/lib/validate.ts` (fan-in 12 will follow)
## Non-goals
## Verification per stage
- Graph: `node $IDX --verify` clean + no new orphans
- Build: `pnpm build` green
- Tests: `pnpm test`
- Manual: <one demo that refactored area still works>
```

Show to user:

> Plan at `.ryme-skill/specs/_refract-<date>.md` — **3 stages, 7 moves, biggest risk is Stage 2 (hub `src/lib/db.ts`)**.
> - **A) Run Stage 1 now (Recommended — low risk, swarm 2 workers)**
> - B) Run all stages in swarm loop until healthy (only if CI green)
> - C) Pick stages to keep/cut
> - D) Do not refactor — graph is healthy

Wait before editing. One-way moves require explicit approval.

## Phase 3 — Agentic Stage Loop (swarm until healthy)

This is the loop that makes `/refract` production-grade. It executes **stage by stage**, each stage via **parallel subagents (one per ledger item)**, and **loops over stages until `verify` is healthy** or `MAX_ROUNDS` hit.

### Loop state

```bash
mkdir -p .ryme-skill/loops
LOOP_ID="refract-$(date +%Y%m%d)-$(date +%s)"
LOOP_LOG=".ryme-skill/loops/$LOOP_ID.jsonl"
STAGE=0; ROUND=0; MAX_ROUNDS=3
echo "{\"round\":0,\"stage\":0,\"plan\":\".ryme-skill/specs/_refract-<date>.md\",\"status\":\"started\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOOP_LOG"
```

The outer loop is over **rounds** (full pass over stages). Inner loop is over **stages** (each stage is parallel swarm). We iterate rounds until ledger drained + verify healthy.

### Outer loop — while not healthy

```bash
while true; do
  ROUND=$((ROUND+1))
  echo "== REFRACT ROUND $ROUND ==" | tee -a "$LOOP_LOG"

  # re-diagnose at round start (graph is fresh from last stage)
  mkdir -p .ryme-skill/tmp && node "$IDX" --verify --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/verify-round-$ROUND.log
  # check healthy?
  if grep -q "Healthy.*no major issues" .ryme-skill/tmp/verify-round-$ROUND.log; then
    echo "Healthy — done in $ROUND rounds" | tee -a "$LOOP_LOG"
    break
  fi
  if [ "$ROUND" -gt "$MAX_ROUNDS" ]; then
    echo "BLOCKED after $MAX_ROUNDS rounds — still not healthy" | tee -a "$LOOP_LOG"
    break
  fi

  # re-build ledger from fresh graph for remaining debt (delta)
  # (main agent: grep dups, huge, orphans again, filter out already-shipped R* from LOOP_LOG)
done
```

In practice the LLM main agent does the "while" as iterative Task orchestration (not bash while) — each round the main agent decides to spawn next stage swarm.

### Inner loop — per stage swarm (parallel)

For the **approved stage** (e.g., Stage 1: R2,R5), main agent spawns **one subagent per R**:

```js
// Task per ledger item, all in same turn = parallel
Task({
  description: "refract R2 — remove orphan src/legacy/old.ts",
  prompt: `You are R2 of refract loop $LOOP_ID, Stage $STAGE.
   Plan: .ryme-skill/specs/_refract-<date>.md (Ledger R2)
   Graph: Read .ryme-skill/graph/context.md + .ryme-skill/graph/impact.json + node $IDX --path "src/legacy/old.ts"
   Your ledger item: R2 — <title + evidence + impact + risk>
   Rules: 
   - BEFORE deleting/moving, run node $IDX --callers "<symbol>" and grep -r "from.*old/path" to prove no callers.
   - If callers exist, migrate them first (edit callers, not just delete).
   - Preserve behavior, no feature changes.
   - After edits, run node $IDX --update --out .ryme-skill/graph
   - Report: files touched, callers migrated, verification output.
   Web: Only if migration needs a codemod — WebFetch jscodeshift/ts-morph best practice 2026.
   `,
  subagent_type: "general"  // dedup/structure needs reasoning; use explore only for trivial dead-code
})

Task({
  description: "refract R5 — dedup formatDate",
  prompt: `You are R5 — dedup formatDate.
   Canonical file is highest fan-in: check cat .ryme-skill/graph/ranked.json | grep formatDate or nodes.json counts.
   Migrate callers: node $IDX --callers "formatDate" → edit each caller to import from canonical.
   Delete duplicate only when callersOf(duplicate)==0 and grep -r "formatDate" shows only canonical.
   After edits run node $IDX --update --out .ryme-skill/graph
   `,
  subagent_type: "general"
})
// spawn both in same turn → 2 parallel workers
```

**Max 5 concurrent subagents per stage.** If stage has 6+ ledger items, split into two waves.

**Apply moves one-by-one per subagent**, each subagent does:

```
1. Read graph for its file: node $IDX --path "src/lib/utils.ts"
2. Search callers: node $IDX --callers "formatDate"
3. Read source files (full file)
4. Edit / move / split:
   - Reuse existing symbols — do not duplicate to patch a move
   - Update all import edges in same slice (grep old path, fix each)
   - Preserve behavior
5. Update graph: node $IDX --update --root . --out .ryme-skill/graph
6. Verify slice: node $IDX --verify --out .ryme-skill/graph 2>&1 | head -n 40; pnpm build 2>&1 | tail -n 20
```

**Main agent collects after stage swarm:**

```bash
# all subagents did --update, main normalizes + checks
node "$IDX" --update --root . --out .ryme-skill/graph 2>&1 | tail -n 5
mkdir -p .ryme-skill/tmp && node "$IDX" --verify --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/verify-stage-$STAGE.log
# build gate
mkdir -p .ryme-skill/tmp && pnpm build 2>&1 | tail -n 20 | tee .ryme-skill/tmp/build-stage-$STAGE.log || mkdir -p .ryme-skill/tmp && npm run build 2>&1 | tail -n 20 | tee .ryme-skill/tmp/build-stage-$STAGE.log || true
# test gate
mkdir -p .ryme-skill/tmp && pnpm test 2>&1 | tail -n 40 | tee .ryme-skill/tmp/test-stage-$STAGE.log || npm test 2>&1 | tail -n 40 | tee .ryme-skill/tmp/test-stage-$STAGE.log || echo "no tests"
# check for stale imports
grep -R "from.*old/path" src/ 2>&1 | head -n 20 && echo "STALE IMPORTS FOUND — fixing before next stage" || echo "no stales"
```

**Stage gate:**

- If `verify` clean (or improving: fewer issues than round start) && `build` green && no stales → stage passed → `git add -A && git commit -m "refactor: stage $STAGE — R2,R5 [loop $LOOP_ID]"` → proceed to next stage (spawn next swarm)
- Else if `build` red or new `verify` issues → **revert stage**: `git reset --hard HEAD~1 2>&1 | tail` (if committed) or `git checkout -- .`, log failure to `LOOP_LOG`, re-plan that stage with fewer ledger items (one R per wave), loop again on same stage (retry once, then escalate to user)

Append per stage to loop log:

```bash
echo "{\"round\":$ROUND,\"stage\":$STAGE,\"ledger\":\"R2,R5\",\"verify\":\"$(head -c 200 .ryme-skill/tmp/verify-stage-$STAGE.log)\",\"build\":\"$BUILD_STATUS\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOOP_LOG"
STAGE=$((STAGE+1))
```

Proceed to next stage swarm. When all stages in plan are done, loop back to outer round check (re-diagnose, maybe new ledger items emerged from moves → new round if not healthy).

### Loop exit criteria

- **DONE:** `verify` says `Healthy — no major issues` && `build` green && no stales && dedup check `grep -o '"name":"formatDate"' nodes.json | wc -l` == 1 for every dedup R. Then go to Phase 4.
- **DONE_WITH_CONCERNS:** healthy but with remaining low-risk ledger items the user marked non-goal — list them as `Remaining`.
- **BLOCKED:** after `MAX_ROUNDS` (3) still not healthy, or any stage failed twice. Print `LOOP_LOG`, `REASON` (last failing verify/build), `ATTEMPTED` (stages tried), `RECOMMENDATION` (narrow scope, split huge file differently, cut coupling via interface).

## Phase 4 — Close the loop (post-swarm)

After all stages passed (or blocked):

```bash
node "$IDX" --init --root . --out .ryme-skill/graph 2>&1 | tail -n 10
node "$IDX" --verify --out .ryme-skill/graph 2>&1 | head -n 40
cat .ryme-skill/graph/context.md | head -n 60
```

Changelog:

```bash
echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ) — refract: $(head -1 .ryme-skill/specs/_refract-*.md) — rounds:$ROUND stages:$STAGE files:$M loop:$LOOP_ID" >> .ryme-skill/graph/changelog.md
```

Report:

```
Refract loop complete — $ROUND rounds, $STAGE stages, $M files moved/split, $D duplicates removed
Graph: before 340 files / 1820 syms → after 341 files / 1750 syms (-70 deduped)
Loop log: .ryme-skill/loops/$LOOP_ID.jsonl
Build: green / Tests: green / Verify: healthy (or issues: ...)
Spec: .ryme-skill/specs/_refract-<date>.md
Next: /feature for next capability on a cleaner graph
```

Commit (if not already per stage):

```bash
git add .ryme-skill/specs/_refract-*.md .ryme-skill/graph/ .ryme-skill/loops/$LOOP_ID.jsonl 2>/dev/null || true
git add -A 2>&1 | head -n 20
git status --short
# commit msg: "refactor: loop $LOOP_ID — stages $STAGE rounds $ROUND — graph-guided (R2,R5,R1…)"
```

## Web search (when to use inside refract swarm)

Subagents search only if:
- Migration is stack-specific (Next.js app router, Prisma→Drizzle) — fetch official migration guide before moving files
- Mass import rewrites need a codemod — search jscodeshift/ts-morph best practice 2026

Otherwise, refract is local — web not needed.

## What refract will NOT do in a loop

- Big-bang rewrites ("rewrite everything in Rust") — staged over weeks via multiple loop runs
- Feature work hidden as refactor — log as open question, don't build
- "Fix while we're here" scope creep — stage boundary is enforced per swarm

## Done

A graph-guided refract swarm leaves the codebase:
- Flatter (no 800-LOC files)
- Deduped (one `formatDate`, not six)
- Looser-coupled (modules depend on interfaces, not concrete hubs)
- Map-fresh (`--init` after last round) with a loop log proving each move was verified
```

