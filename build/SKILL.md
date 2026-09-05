---
name: build
description: |
  Initialize a new production-ready project from zero via an agentic loop. Asks 8+3 discovery questions (stack/auth/DB/deploy + goal/resources/behavior/scope/deps/schema/acceptance/rollout), searches the web for 2026 best-practice, then spawns parallel subagents that scaffold, wire, and iterate until pnpm build + graph verify are green. Use for greenfield repos.
---

# /build — Greenfield Project Scaffolder (graph-first, swarm-until-green)

> You are a production-grade application engineer. You do not produce toy starters. Every build has auth, DB, graph, and a deploy path before you call it "done" — and you loop with a swarm until it is green.

> **Stuck? Quick recovery:** If `npx create-next-app` hangs, use `timeout 60` or skip to manual `mkdir src`. If discovery questions stall, use `Recommended` defaults. If swarm hangs, check `cat .ryme-skill/loops/build-*.jsonl | tail` — if no progress, escalate. Each subagent 90s timeout, main loop 5 iters max. For quick scaffold without swarm, do single-pass then `pnpm build` manually.

## Preconditions

- This is **greenfield**. If `.ryme-skill/graph/` already exists with >10 files, confirm:

  > This repo already has code. Did you mean `/feature` instead of `/build`? (Build will scaffold alongside it; feature will extend it.)

  Proceed only after explicit confirmation.

- Locate indexer — graph is ALWAYS in working directory (./.ryme-skill/graph):

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
  ```

## Input

```
/build SaaS starter with Next.js + Supabase, billing via Stripe
/build realtime dashboard for IoT with Go + Postgres
/build just make me a blog --swarm
```

Capture `$ARG` as seed prompt. If empty, ask goal from scratch.

## Phase 1 — Discovery (8 questions + 3 build Qs)

You ask **8+3**. The 8 are identical to `/feature` (Goal, Resources, Behavior, Scope, Dependencies, Data & Schema, Acceptance, Rollout). The 3 extras come first:

### B1 — Stack & Framework
`Which stack should we use? I can recommend based on what you want to build and what's current in 2026.`
- MUST `WebSearch` before recommending if prompt not explicit. Search: "best stack for <goal> 2026", official frameworks.
- A) **Next.js 15 + Supabase (Recommended for SaaS/dashboard, Auth+Realtime+Postgres, Vercel)**; B) Go+Fiber/Echo+Postgres (high-concurrency); C) Python FastAPI+Postgres (AI-heavy); D) Rails/Laravel/Elixir only if hinted. Also ask monorepo vs single app. Cite links.

### B2 — Auth & Users
`How should auth work — who signs up, how, what roles?`
- A) Supabase Auth / Auth.js / Clerk email+OAuth, roles user/admin (Recommended); B) Custom JWT; C) SSO later.

### B3 — Data, DB, and Deploy
`Where does data live, and where does the app run?`
- Recommend DB (Postgres/Supabase/Mongo/PlanetScale) + deploy (Vercel/Fly/Render/Docker) + ORM (Prisma/Drizzle/SQLAlchemy/GORM) based on B1. Cite web. Never hallucinate.

Then continue with 8 feature Qs, interpreted for greenfield:

- **Resources (Q2):** "what templates/references to seed from?" (create-next-app, create-t3-app, golang-migrate). WebSearch for minimal production reference.
- **Dependencies (Q5):** "What external services from day one?" (Stripe, Resend, Supabase Realtime…)
- **Acceptance (Q7):** For new project, acceptance = `pnpm build && pnpm test` green + seed demo account works.

All 11 follow `/feature` contract: Recommended with evidence (web link/template rationale), Why-it-matters, wait before next (but **never wait forever** — if no answer in 60s, use Recommended and note `auto-chosen`, continue. Max 3 min for all 11, then synthesize from prompt+graph). Shortcut: if prompt already answers, confirm: "Got it — stack is Next.js+Supabase (from prompt). Keep it?"

## Phase 2 — Blueprint (before you write files)

Write `.ryme-skill/specs/_build-<slug>.md`:

```markdown
# Build: <Goal> — Blueprint
> Stack: Next.js 15 + Supabase + Prisma — Deploy: Vercel+Supabase
> Web refs: <3 links you fetched>
## Stack rationale
## Modules (from day one)
- `src/auth/` — Supabase Auth wrapper, middleware `verify_session`
- `src/db/` — Prisma schema + client singleton
- `src/api/` — route handlers with Zod
- `src/features/<core>/` — domain from goal
- `src/lib/` — shared utils (once per domain, never duplicate)
- `src/components/` — UI (if frontend)
## Files to scaffold (list every file with purpose)
- `package.json` — deps + scripts
- `src/app/layout.tsx` — shell
...
## Schema (first migration)
## Auth flow
## Deploy path (Env, migrations, seed, health)
## Acceptance
- `pnpm install && pnpm build && pnpm test` green
- Demo: sign in as seed → see dashboard → trigger core feature → row in DB
## Out of scope (V1)
```

Show to user: `Blueprint is at .ryme-skill/specs/_build-<slug>.md. Scaffold as drawn, or change a module?` Do not scaffold until confirmed.

## Phase 3 — Agentic Scaffold Loop (swarm until green)

This replaces the old single-pass scaffold. It loops with **parallel subagents** until `verify + build + test` are green.

### Loop state (file-based, not bash vars)

```bash
mkdir -p .ryme-skill/loops .ryme-skill/tmp
LOOP_ID="build-<slug>-$(date +%s)"
LOOP_LOG=".ryme-skill/loops/$LOOP_ID.jsonl"
echo "$LOOP_ID" > .ryme-skill/tmp/current_build_loop
echo "0" > .ryme-skill/tmp/current_build_iter
echo "{\"iter\":0,\"slug\":\"<slug>\",\"stack\":\"<stack>\",\"status\":\"started\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$LOOP_LOG"
echo "LOOP_ID=$LOOP_ID"
MAX_ITERS=5
```

### Iteration recipe (repeat until `goalAchieved`)

**0) Skeleton seed (iter 0 only)** — main agent seeds minimal skeleton if repo empty:

```bash
# Example for Next.js (only if user chose it)
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm 2>&1 | tail -n 20
# For Go: go mod init myapp && go get github.com/gofiber/fiber/v2
# For Python: uv init / pip init …
# If repo already has content, scaffold into subdir ./app/ and do not overwrite.
```

Add **must-have production extras** (main agent, before swarm):
- `.env.example` with every required key (no secrets)
- `README.md` with install→dev→build→test→deploy
- `src/lib/env.ts` (or equiv) validating env at boot (fail fast)
- Auth wiring (placeholder with TODO + issue if not full)
- DB client singleton + first migration + seed script
- `src/lib/api.ts` fetch wrapper with typed errors
- Health check route `/api/health` → `{ok:true}`

Do not add demo junk (todo, counter) unless asked.

**1) Slice the blueprint** — main agent splits blueprint "Files to scaffold" into **parallel slices** (by module, not layer):

Examples:
- Slice A: `package.json + tooling (eslint, tsconfig, tailwind)`
- Slice B: `src/db/` (schema, client, migration, seed)
- Slice C: `src/auth/` (provider, middleware, guards)
- Slice D: `src/api/` + `src/features/<core>/` (routes, services)
- Slice E: `src/components/` + `src/app/` (UI shell)
- Slice F: `tests + health + env + README`

Each slice: files list, purpose, reuse file:line (usually none for greenfield, but check), web refs for SDK shapes.

**2) Spawn swarm** — one `Task` per slice, all in **same turn = parallel**:

```js
Task({
  command: "build slice B — db for <slug>",
  description: "build slice B — db",
  prompt: `You are slice B of build <slug>.
   Blueprint: .ryme-skill/specs/_build-<slug>.md (Modules + Schema)
   Graph: Read .ryme-skill/graph/context.md if exists (first iter: no graph yet — that's ok). 
   Your slice: src/db/* — schema, client singleton, migration, seed.
   Rules: BEFORE creating any symbol, run node $IDX --query "<name>" and Grep nodes.json if graph exists — reuse if found. After edits, if graph exists run node $IDX --update --out .ryme-skill/graph. 
   Web: WebFetch official docs for Prisma/Drizzle/Supabase SDK shapes before writing — never hallucinate.
   Deliver: files written, 1-line summary, next steps.
   `,
  subagent_type: "general"
})
// repeat for slices A-F in parallel
```

Use `general` for complex slices, `explore` for recon/tooling. Max 3 concurrent per iteration (not 5). Each subagent 90s timeout — if hangs, main continues.

**3) Collect & integrate** — wait for all subagents, then main agent:

```bash
# merge: if two slices edited same file, dedupe (keep slice with more complete content)
# ensure no duplicate utils: grep -r "function formatDate" src/ 2>&1 | head
node "$IDX" --init --root . --out .ryme-skill/graph 2>&1 | tail -n 10  # first graph (iter0) or update
cat .ryme-skill/graph/context.md | head -n 60
```

**4) Verify — the gate:**

```bash
mkdir -p .ryme-skill/tmp && node "$IDX" --verify --out .ryme-skill/graph 2>&1 | tee .ryme-skill/tmp/verify.log
pnpm install 2>&1 | tail -n 20 || npm install 2>&1 | tail -n 20 || bun install 2>&1 | tail -n 20 || true
mkdir -p .ryme-skill/tmp && timeout 60 pnpm build 2>&1 | tail -n 60 | tee .ryme-skill/tmp/build.log || mkdir -p .ryme-skill/tmp && timeout 60 npm run build 2>&1 | tail -n 60 | tee .ryme-skill/tmp/build.log || mkdir -p .ryme-skill/tmp && timeout 60 bun run build 2>&1 | tail -n 60 | tee .ryme-skill/tmp/build.log || echo "no build"
mkdir -p .ryme-skill/tmp && timeout 60 pnpm test 2>&1 | tail -n 60 | tee .ryme-skill/tmp/test.log || timeout 60 npm test 2>&1 | tail -n 60 | tee .ryme-skill/tmp/test.log || echo "no tests"
cat .ryme-skill/specs/_build-<slug>.md | grep -A 20 "## Acceptance"
```

`goalAchieved = true` iff `build` green && `verify` has no new errors vs baseline (or `healthy`) && demo steps (seed user → dashboard → core feature) would pass (subagents reported).

Append to log (file-based ITER):

```bash
ITER=$(cat .ryme-skill/tmp/current_build_iter 2>/dev/null || echo 0)
ITER=$((ITER+1))
echo "$ITER" > .ryme-skill/tmp/current_build_iter
BUILD_STATUS=$(cat .ryme-skill/tmp/build.status 2>/dev/null || echo "unknown")
echo "{\"iter\":$ITER,\"build\":\"$BUILD_STATUS\",\"verify\":\"$(cat .ryme-skill/tmp/verify.log 2>/dev/null | head -c 200 | tr -d '"' | tr '\n' ' ')\",\"files\":$(cat .ryme-skill/graph/manifest.json 2>/dev/null | grep fileCount | grep -o '[0-9]*' || echo 0),\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$LOOP_LOG"
cat "$LOOP_LOG" | tail -n 5
# checkpoint commit per iter
git add -A 2>&1 | head -n 10; git commit -m "build(<slug>): iter $ITER — scaffold [loop $LOOP_ID]" 2>&1 | tail -n 5 || true
```

**5) Decide (with stuck detection):**

- If achieved → break to Phase 4 (handoff)
- Else if `ITER >= 5` → `BLOCKED`: print `LOOP_LOG`, `REASON` (last failing log), `ATTEMPTED`, `RECOMMENDATION`, ask user to narrow scope or approve fix
- Else if last 2 iters have identical `verify.log` (no progress) → `BLOCKED` with `REASON: no progress in 2 iters`
- Else → iterate: main synthesizes failure (from build/verify/test logs), re-slices only failing modules (don't redo green slices), loop back to (1). **Sleep 1s between iters.**

### Guarantees

- **Web-verified every iter:** subagents must `WebFetch` docs for any SDK they touch if unsure
- **Graph-indexed by iter 1:** first graph built right after skeleton; every later iter does `--update`
- **Guardrails per iter:** add `.ryme-skillignore` + `package.json:scripts.graph*` so `npm run graph` always works

## Phase 4 — Wire agent + guardrails (after loop, once green)

```bash
# wire protocol (same as /graphcontext Step 5)
grep -q "Ryme Context Graph" CLAUDE.md 2>/dev/null || cat >> CLAUDE.md <<'MD'
## Ryme Context Graph — Mandatory Protocol
> Read .ryme-skill/graph/context.md before any task, --query before creating, --update after edits.
MD

grep -q "Ryme Context Graph" AGENTS.md 2>/dev/null || cat >> AGENTS.md <<'MD'
## Ryme Context Graph — Mandatory Protocol
> Read .ryme-skill/graph/context.md before any task, --query before creating, --update after edits.
MD
```

Also ensure `package.json` has:

```json
{
  "scripts": {
    "graph": "node ./ryme-skills/scripts/ryme-graph.mjs --update --out .ryme-skill/graph || node ./scripts/ryme-graph.mjs --update --out .ryme-skill/graph || node $HOME/.config/opencode/skills/ryme-context-graph/scripts/ryme-graph.mjs --update --out .ryme-skill/graph",
    "graph:init": "node ./ryme-skills/scripts/ryme-graph.mjs --init --out .ryme-skill/graph || true"
  }
}
```

## Phase 5 — Hand off

```bash
echo "- $(date -u +%Y-%m-%dT%H:%M:%SZ) — build done: <slug> — iters:$ITER loop:$LOOP_ID" >> .ryme-skill/graph/changelog.md
```

Print:

```
Build complete: <stack> · <N> files scaffolded — <ITER> loop iters, <T> subagents total
Graph: .ryme-skill/graph/context.md — <M> files · <S> syms · <E> edges
Blueprint: .ryme-skill/specs/_build-<slug>.md
Loop log: .ryme-skill/loops/$LOOP_ID.jsonl
Next:
  pnpm dev        — run locally
  pnpm test       — verify
  node $IDX --query "auth" — explore graph
  /feature "add <next thing>" — extend
```

If `BLOCKED`, print `LOOP_LOG` summary + exact failing `build.log` snippet + minimal fix, do not claim done.

## Web search contract (critical for /build)

You MUST search before stack/library choice and before writing any SDK init. Include links in blueprint § Web refs and in each subagent summary. If you didn't search, stack choice is unjustified.

## Done

Production-ready skeleton, swarm-built until green, graph-indexed on day one, reuse-first for next features.
