---
name: feature
description: |
  Turn a vague feature prompt into a production-ready, graph-grounded spec AND optionally implement it via an agentic loop. Asks 8 discovery questions (goal, resources, behavior, dependencies, acceptance, etc.) with recommendations drawn from the Context Graph, then spawns parallel subagents that build, test, and iterate until the demo passes. Use when the user says "/feature add X".
---

# /feature — Graph-Grounded Feature Discovery + Agentic Build Loop

> Prompt → spec → swarm → shipped. The graph tells agents what exists, the loop tells them when they're done.

## Preconditions

- `.ryme-skill/graph/context.md` must exist and be fresh **in the working directory** (project root, not skill dir). If not:

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
mkdir -p .ryme-skill/graph  ```

- Load the graph (mandatory):

  ```bash
  cat .ryme-skill/graph/context.md
  cat .ryme-skill/graph/techstack.json
  cat .ryme-skill/graph/modules.json
  cat .ryme-skill/graph/manifest.json | head -n 20
  ```

Do not proceed without reading those. You need to know what exists before you ask what to build.

## Input

```
/feature add real-time chat with presence
/feature Stripe billing with webhooks
/feature just a one-line idea -- implement now
```

Capture `$ARG` as raw prompt. Flags: if user adds `--spec-only` stop after spec; if `--build` or prompt contains "implement/build/ship" jump into loop. Default: ask.

## Phase 1 — Graph Recon (auto, no questions yet)

Run BEFORE you ask the user anything:

```bash
# find indexer — ALWAYS prefers project-local copy (no external access needed)
# Graph itself is ALWAYS in the working directory: ./.ryme-skill/graph (not in the skill dir)
IDX=""
for p in \
  "./.ryme-skills/scripts/ryme-graph.mjs" \
  "./ryme-skills/scripts/ryme-graph.mjs" \
  "./scripts/ryme-graph.mjs" \
  "$HOME/.config/opencode/skills/ryme-context-graph/scripts/ryme-graph.mjs" \
  "$HOME/.config/opencode/skills/graphcontext/scripts/ryme-graph.mjs" \
  "./node_modules/.bin/ryme-graph" ; do
  [ -f "$p" ] && IDX="$p" && break
done
# fallback: search inside working directory only (maxdepth 4, no external)
if [ -z "$IDX" ]; then IDX=$(find . -maxdepth 4 -name "ryme-graph.mjs" -type f 2>/dev/null | head -1); fi
echo "IDX=$IDX"
ls -la "$IDX" 2>&1 | head -1

# 1) feature-adjacent code
node "$IDX" --query "<keyword1>" --out .ryme-skill/graph 2>&1 | head -n 30
node "$IDX" --query "<keyword2>" --out .ryme-skill/graph 2>&1 | head -n 30

# 2) who owns that domain?
cat .ryme-skill/graph/modules.json | head -n 80

# 3) hubs / orphans
cat .ryme-skill/graph/impact.json | head -n 80

# 4) existing routes / schemas / auth patterns
grep -i -E "route|GET|POST|handler|middleware|auth|guard|schema|prisma|drizzle" .ryme-skill/graph/nodes.json | head -n 30
```

Also `WebSearch` when prompt involves unfamiliar stack/library (Stripe webhooks, WebSocket presence, Supabase realtime). Search, don't guess.

Record:

- Reuse candidates: 3–8 existing symbols (file:line) to extend/call
- Domain owner: which module(s) owns the feature
- Dependencies: fan-out modules + external APIs
- Risks: hubs with high fan-in (change with care)

Cite these in every recommendation.

## Phase 2 — The 8 Discovery Questions

Ask exactly 8 (or fewer if prompt/graph already answered). Each has 2–3 recommendation options grounded in graph+web (label Recommended) + "Why it matters". Sequential via `AskUserQuestion` (or prose fallback). Wait per answer.

### Q1 — Goal (what does the user get?)
`What is the user-visible goal? What does a user gain that they could not do before?`
- A) DM with presence + typing (Recommended if graph shows `verify_token` + `socket.ts`)
- B) Channel-based chat ...; C) Minimal send/receive. Cite graph. Why: without crisp goal you build wrong thing well.

### Q2 — Resources (what exists to build on?)
`What existing resources will it reuse/extend? If none, what must be introduced?`
- A) Reuse `src/auth/*`, `src/db/schema.ts` (Recommended — graph fan-in X)
- B) New module `src/features/chat/`; C) External service (Supabase Realtime/Pusher via web search). Why: reuse cuts time.

### Q3 — Behavior (how should it work step-by-step?)
`Walk me through a single happy-path flow, screen/event by event. What happens on error?`
- A) Happy: open → presence → send → optimistic → ack → persist (Recommended)
- B) Polling first, realtime later. Cite route pattern from `nodes.json`.

### Q4 — Scope & Non-Goals (what is NOT this?)
`What is explicitly OUT of scope for V1?`
- A) V1: 1:1 DMs only, no threads/search/uploads; V2: those (Recommended)
- B) Everything at once.

### Q5 — Dependencies & Integrations (what does it touch?)
`Which modules/services/external APIs does it read/write?`
- A) Touches `auth` (read), `realtime` (write), `db` (write) — see `modules.json` (Recommended)
- B) Isolated new table. Cite fan-in of `src/lib/db.ts`.

### Q6 — Data & Schema (what is stored?)
`What new data must be stored? Existing schema relation? Source of truth?`
- A) New table `messages { id, sender_id FK users, thread_id, body, created_at }` + index (Recommended if Postgres/Prisma)
- B) Reuse `events` polymorphic.

### Q7 — Acceptance & Verification (how do we know it works?)
`How will we manually verify end-to-end (demo script), and minimum automated check?`
- A) Demo: two browsers, A sends → B sees <200ms + DB row; test: integration asserts persisted + broadcast (Recommended)
- B) Unit tests only.

### Q8 — Rollout & Constraints (perf, budget, rollout)
`Any perf budget, scale target, or rollout constraint?`
- A) p95 <200ms, 10k concurrent, feature-flagged (Recommended)
- B) Best-effort.

**Contract:** each recommendation cites file:line or web link. If prompt already answers, confirm: "Got it — goal is X. Correct? (Y/n)". Short prompt → ask all 8. Long prompt → skip answered, confirm.

## Phase 3 — Synthesize Spec (graph-grounded)

Write `.ryme-skill/specs/<slug>.md` (kebab-case slug of goal):

```markdown
# Feature: <Goal> — Spec
> Status: draft · Owner: <user> · Date: <iso>
> Graph: .ryme-skill/graph @ <manifest.generatedAt> · primary: <techstack.primary>
## 1. Goal
## 2. Reuse (from graph)
- `src/auth/middleware.ts:12 verify_token` — reuse
## 3. Behavior (happy + error)
## 4. Non-Goals (V1)
## 5. Dependencies (modules + external)
## 6. Data & Schema
## 7. Plan (reuse-first)
- Reuse `foo()` in `bar.ts:line` — don't duplicate
- New files: `src/features/chat/...` (purpose each)
- Edges: new imports from modules.json
## 8. Acceptance
- Demo script (exact steps + expected) + Tests
## 9. Rollout
## 10. Open questions
## Graph Evidence
- Ran queries: --query "chat", --callers "broadcast"
- Web sources: <3 links you fetched>
```

Print path + one-paragraph summary. Then ask:

> Spec is at `.ryme-skill/specs/<slug>.md`. **A) Build it now via agentic loop (Recommended)** · B) Stop at spec · C) Iterate on a section

If B → go to Phase 4a (honest exit). If A or C → continue. If prompt had `--build`/`implement` skip this question and enter loop.

## Phase 4a — Keep the graph honest (spec-only exit)

```bash
echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ) — feature spec: <slug> — $(head -1 .ryme-skill/specs/<slug>.md)" >> .ryme-skill/graph/changelog.md
```

Done. Next: agent reads spec + graph, then `Read → Search graph → Edit → --update` loop.

## Phase 4b — Agentic Build Loop (the “until goal achieved” part)

This is the loop the user asked for. It runs **until the Acceptance demo passes** or `MAX_ITERS` (default 5) is hit. Each iteration spawns **many parallel subagents** via `Task`.

### Loop state (track in memory + on disk)

```bash
mkdir -p .ryme-skill/loops
LOOP_ID="feature-<slug>-$(date +%s)"
LOOP_LOG=".ryme-skill/loops/$LOOP_ID.jsonl"
echo "{\"iter\":0,\"slug\":\"<slug>\",\"status\":\"started\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOOP_LOG"
```

### Iteration recipe (repeat until `goalAchieved == true`)

```bash
# 0) refresh graph (so subagents see latest)
node "$IDX" --update --root . --out .ryme-skill/graph 2>&1 | tail -n 5
```

**1) Plan slices** — main agent splits spec §7 into parallelizable slices (vertical slices, not layers):

Examples for chat:
- Slice A: `db/migration + schema + seed`
- Slice B: `api/routes + validation + auth guard reuse`
- Slice C: `realtime/broadcast + presence`
- Slice D: `ui/components + optimistic update`
- Slice E: `tests/integration + demo script`

Each slice lists: files to create/edit, reuse file:line to import from, acceptance check.

**2) Spawn swarm** — launch one subagent per slice **in parallel** via `Task`:

```js
// pseudocode — use your Task tool
Task({
  description: "feature slice A — schema",
  prompt: `You are slice A of feature <slug>. 
   Spec: .ryme-skill/specs/<slug>.md §2,6,7
   Graph: Read .ryme-skill/graph/context.md + .ryme-skill/graph/modules.json
   Your slice: DB migration + schema (see slice A files)
   Rules: BEFORE creating any symbol, run node $IDX --query "<name>" and Grep nodes.json. Reuse file:line if exists. After edits run node $IDX --update --out .ryme-skill/graph
   Web: If you need Stripe/Prisma/Supabase API shapes, WebFetch official docs first.
   Deliverable: files written, 1-line summary, verification cmd output.
   `,
  subagent_type: "general"
})
// repeat for slices B-E, all in parallel (one Task call per slice in same turn)
```

Use `general` for complex slices (multi-file, needs graph reasoning), `explore` for quick recon slices. Max 5 concurrent subagents per iteration (rate limit).

**3) Collect & integrate** — wait for all subagents:

```bash
# subagents already did --update, but main does a final --init to normalize
node "$IDX" --update --root . --out .ryme-skill/graph 2>&1 | tail -n 5
cat .ryme-skill/graph/manifest.json | head -n 10
```

Resolve conflicts: if two slices edited same file, main agent merges (prefer slice with higher fan-in reuse). De-dupe: `grep -r "function formatDate" src/` → if 2 copies, keep canonical (higher fan-in) and repatch callers.

**4) Verify** — the gate that decides loop exit:

```bash
# graph health
mkdir -p .ryme-skill/tmp && node "$IDX" --verify --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/verify.log
# stack build
pnpm build 2>&1 | tail -n 40 || npm run build 2>&1 | tail -n 40 || bun run build 2>&1 | tail -n 40 || echo "no build script — skipping"
# tests (minimum: the acceptance test from spec §8)
pnpm test 2>&1 | tail -n 60 || npm test 2>&1 | tail -n 60 || bun test 2>&1 | tail -n 60 || echo "no test script"
# demo script from spec §8 — run manually or via subagent
cat .ryme-skill/specs/<slug>.md | grep -A 20 "## 8. Acceptance"
```

**Goal achieved?** `true` iff:
- `build` green
- `verify` has no new errors vs baseline (or `healthy`)
- Demo script steps all pass (subagents reported success)

Append to loop log:

```bash
ITER=$((ITER+1))
echo "{\"iter\":$ITER,\"verify\":\"$(cat .ryme-skill/tmp/verify.log | head -c 200)\",\"build\":\"$BUILD_STATUS\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOOP_LOG"
```

**5) Decide:**

- If achieved → break, go to Phase 5 (handoff)
- Else if `ITER >= MAX_ITERS` (5) → `BLOCKED`: print `LOOP_LOG`, `REASON`, `ATTEMPTED`, `RECOMMENDATION` (per Completion Status Protocol), ask user to narrow scope or approve manual fix
- Else → **iterate**: main agent synthesizes failure reasons (from verify/build/test logs), re-plans slices for next iter (focus on failing slice), loop back to (1). Do not repeat successful slices.

### Loop guarantees

- **Graph-first every iter:** subagents read `context.md` + query before create; main runs `--update` after collect
- **No duplicate drift:** dedupe check each iter
- **Web-allowed:** subagents may `WebSearch`/`WebFetch` for unfamiliar APIs (cite links in their summary)
- **Idempotent:** re-running same slice should be no-op if already done (check file exists + hash)
- **Commit checkpoint per iter (optional):**

```bash
git add -A 2>&1 | head -n 20; git status --short
git commit -m "feat(<slug>): iter $ITER — $(cat .ryme-skill/specs/<slug>.md | head -1) [loop $LOOP_ID]" 2>&1 | tail -n 5 || true
```

### Phase 5 — Handoff & changelog

After loop exits `achieved`:

```bash
echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ) — feature built: <slug> — iters:$ITER loop:$LOOP_ID" >> .ryme-skill/graph/changelog.md
node "$IDX" --init --root . --out .ryme-skill/graph 2>&1 | tail -n 5
```

Print:

```
Feature shipped: <slug> — <goal>
Spec: .ryme-skill/specs/<slug>.md
Loop: .ryme-skill/loops/$LOOP_ID.jsonl ($ITER iters, $N subagents total)
Graph: .ryme-skill/graph/context.md — <M> files · <S> syms · <E> edges
Verify: healthy / Build: green / Tests: green / Demo: passed
Next: /refract if debt crept, or /feature for next slice
```

If loop ended `BLOCKED`, print the `LOOP_LOG` summary and the exact failing check + suggestion, do not claim done.

## Web search policy

When prompt+graph leaves an open choice (which realtime service? billing lib? auth pattern?), you MUST `WebSearch` before recommending. Prefer official docs + 2025–2026 posts. Include links in spec + in each subagent's summary. Never hallucinate SDK shapes.

## Done

You now have both a **graph-grounded spec** and, if requested, a **swarm-built feature** that was verified each loop until the demo passed. All work is indexed — the next `/feature` will see what you just built via `--query`.
