---
name: ryme-context-graph
description: |
  Production-grade codebase Context Graph for AI agents. Indexes entire codebase into a queryable graph (files, symbols, imports, calls, domains), keeps it live as you code, and forces reuse of existing functions before creating new ones. Router for /graphcontext · /feature · /build · /refract. Works with any tech stack + any agent (OpenCode, Claude Code, Cursor, Windsurf, Copilot, Codex). Use when starting any project, adding a feature, or refactoring.
---

# Ryme Context Graph — Production-Grade Codebase Intelligence

> One graph to rule all agents. Index once, reason forever. Every edit reads the graph, reuses what exists, and writes back what changed.

## Iron Laws (non-negotiable)

These apply to **every** task, every agent, every session. If you violate them you are "gaying" — producing slop, duplicates, drift.

1. **READ the graph before any code.** Before you write a single line, read `.ryme-skill/graph/context.md` + `.ryme-skill/graph/manifest.json`. If the graph does not exist, run `/graphcontext` first. No exceptions.
2. **SEARCH before you create.** Before creating any function / component / endpoint / schema / util, query the graph: `node scripts/ryme-graph.mjs --query "<name or intent>"` and `Grep` the graph's `nodes.json`. If a reusable symbol exists, reuse it. Duplication is a bug.
3. **WRITE back after every edit.** After any file creation / edit / move / delete, update the graph: `node scripts/ryme-graph.mjs --update` or incremental write to `.ryme-skill/graph/nodes.json` + `edges.json`. The graph must never go stale within a session.
4. **USE the graph for planning.** Feature scoping, build scaffolding, and refactor proposals MUST cite graph nodes (file:line) as evidence. Vague plans without graph refs are rejected.

## What it gives you

```
.ryme-skill/
  config.json                 # tech stack + project meta
  graph/
    manifest.json             # version, counts, last indexed, duration
    techstack.json            # detected stack, frameworks, DB, infra
    nodes.json                # files → symbols (functions, classes, exports, routes)
    edges.json                # imports, calls, extends, uses
    modules.json              # domain boundaries (auth, billing, api, ui...)
    context.md                # token-optimized Repo Map for agents (always read this)
    impact.json               # blast-radius + coupling for /refract
    changelog.md              # auto-log of graph updates
```

This is **not** vector RAG. It is a structural AST graph: who imports whom, who calls whom, who owns what domain. Queries are deterministic, not fuzzy.

## Supported Tech Stacks & Frameworks

Detection is automatic via `scripts/ryme-graph.mjs --detect`. No config required, but you can pin in `.ryme-skill/config.json`.

| Layer | Detected signals |
|-------|-----------------|
| **Languages** | JS/TS, JSX/TSX, Python, Go, Rust, Java, Kotlin, PHP, Ruby, C#, Swift, Dart, Elixir, Vue, Svelte, Astro, MDX |
| **Frontend** | React, Next.js, Nuxt, Vue, SvelteKit, Astro, Remix, Solid, Angular — via `package.json` deps + file conventions |
| **Backend** | Express, Fastify, Hono, Nest, Django, FastAPI, Flask, Gin, Echo, Fiber, Rails, Laravel, Spring, Actix |
| **DB / ORM** | Prisma, Drizzle, TypeORM, Sequelize, Mongoose, SQLAlchemy, GORM, Diesel |
| **Infra** | Docker, Compose, K8s, Terraform, Vercel, Fly, Netlify, Supabase, Firebase, AWS CDK |

Unknown stack = generic parser fallback (still indexes symbols + imports). You will never be blocked by stack choice.

## Mandatory Agent Protocol (every task from A to Z)

```
1. Ensure graph exists:
   if not exists .ryme-skill/graph/context.md → invoke /graphcontext

2. Load context (cheap, always):
   Read .ryme-skill/graph/context.md         (≈1k tokens, PageRank of repo)
   Read .ryme-skill/graph/techstack.json
   Read .ryme-skill/graph/modules.json (if planning feature/refactor)

3. Resolve intent → graph queries:
   node scripts/ryme-graph.mjs --query "auth middleware"  # semantic name search
   node scripts/ryme-graph.mjs --callers "verify_token"    # who calls this?
   node scripts/ryme-graph.mjs --imports "src/api/*"       # dependency fan-in/out
   Grep nodes.json for exports matching intent

4. Plan with evidence:
   - Cite 3–10 existing symbols you will reuse or extend
   - Cite modules you will touch + impact via edges.json
   - If greenfield, still cite template modules from reference projects (web search)

5. Implement using graph-guided edits:
   - No duplicate utils: import from existing file:line
   - Follow project's import boundaries (see modules.json)
   - Keep domain cohesion (don't put billing logic in auth)

6. Update graph (same turn as code edit):
   node scripts/ryme-graph.mjs --update
   # or manually append to nodes.json + changelog.md if script unavailable

7. Verify:
   node scripts/ryme-graph.mjs --stats          # sanity
   node scripts/ryme-graph.mjs --verify         # orphan check, cycles, dead code hints
```

If you skip step 1–3 you are guessing. Guessing in production is not engineering.

## Commands

| Command | Skill file | Purpose | Loop? |
|---------|-----------|---------|-------|
| `/graphcontext` | `graphcontext/SKILL.md` | Full or incremental index of entire codebase into `.ryme-skill/graph/`. Run on project open, after large merges, or when graph is missing/stale. | One-shot (no loop — use `--update` per edit) |
| `/feature` | `feature/SKILL.md` | 8-question discovery → spec → **agentic swarm loop** that spawns parallel subagents per slice and iterates until demo + build + verify are green. | **Loop until goal achieved** (max 5 iters, 5 parallel workers/iter) |
| `/build` | `build/SKILL.md` | 11-question blueprint → **swarm scaffold loop** that spawns parallel subagents per module and iterates until build green. | **Loop until green** (max 5 iters) |
| `/refract` | `refract/SKILL.md` | `refactor`/`refractor` aliases. Diagnoses Debt Ledger → staged **swarm refactor loop** per ledger item, iterates until `verify` healthy. | **Loop until healthy** (max 3 rounds, 5 parallel workers/stage) |

Invoke via the Skill tool:
```
Skill({ name: "graphcontext" })  // full re-index
Skill({ name: "feature", args: "add Stripe billing with webhooks" })
Skill({ name: "build", args: "SaaS starter with Next.js + Supabase" })
Skill({ name: "refract" })
```

## Web Search — allowed and encouraged

When building or implementing a feature you do **not** know, search the web first. This is formal policy, not a hack.

- **When to search:** choosing a library, designing an auth flow, payment webhook handling, realtime architecture, unfamiliar stack/framework, or validating best practice 2026.
- **How:** Use `WebSearch` or `WebFetch` before you choose. Prefer: official docs, 2025-2026 engineering blogs, GitHub README of the library you will use.
- **Cite:** In your plan, include 1–3 links you consulted and the decision they drove.
- **Never hallucinate SDKs.** If you have not seen the current API, fetch it.

## Graph Maintenance Contract

- **TTL:** Graph is stale if `manifest.json.lastIndexed` is older than the newest `git diff` or older than 7 days.
- **Auto-update:** Any agent that edits ≥1 tracked file MUST run `--update` before ending its turn.
- **Merge:** On branch merge, re-run `node scripts/ryme-graph.mjs` (full) in CI or locally.
- **Ignore:** Graph respects `.gitignore` + `.ryme-skillignore`. Never index `node_modules`, `.git`, `dist`, `build`, `.next`, `.ryme-skill`, `vendor`.
- **Size budget:** `context.md` is PageRank-capped at ~1.2k tokens. `nodes.json` is the full truth. Do not paste full `nodes.json` into context — query it.

## Agentic Loop Protocol (for /feature, /build, /refract)

Every loop skill follows the same swarm contract:

```
LOOP_ID=.ryme-skill/loops/<skill>-<slug>-<ts>.jsonl
MAX_ITERS=5 (feature/build) or 3 rounds (refract)
while not goalAchieved and iter < MAX_ITERS:
  1) refresh graph: node $IDX --update --out .ryme-skill/graph
  2) slice plan into 3-6 parallelizable chunks (by module, not layer)
  3) spawn one subagent per slice IN PARALLEL via Task tool:
     Task({ description: "feature slice B — db", subagent_type: "general",
            prompt: "Slice B: ... Read .ryme-skill/graph/context.md, --query before create, --update after" })
     Max 5 concurrent subagents per iteration.
  4) collect → dedupe (grep for duplicates, keep canonical fan-in) → merge
  5) verify: node $IDX --verify + pnpm build + pnpm test + demo script (from spec)
  6) append to $LOOP_ID.jsonl; if green → break; else re-slice failing parts and iterate
```

Subagents: `general` for complex (multi-file, graph reasoning), `explore` for recon. Each subagent reads `context.md`, runs `--query`/`--callers` before creating, runs `--update` after, and may `WebSearch`/`WebFetch` for SDK shapes (cited). Main agent owns merging, deduping, and the gate. If loop hits `MAX_ITERS` without green, status = `BLOCKED` with `REASON`/`ATTEMPTED`/`RECOMMENDATION`.

All skills live under this single `ryme-skills/` directory — they are the source of truth. The installer just links/copies from here.

## Installation (any agent, any repo) — source is `ryme-skills/`

> **Everything lives in `ryme-skills/`** (this directory). Do not scatter. The installer links/copies FROM here.

### Option A — Drop-in (recommended, zero deps)

```bash
# 1) Copy skill into your target repo
cp -r ~/.config/opencode/skills/ryme-context-graph /path/to/my-project/.ryme-skills
# or git submodule add https://github.com/RymeLabs/ryme-skills .ryme-skills
# or clone: git clone https://github.com/RymeLabs/ryme-skills ryme-skills

# 2) Register for OpenCode (one line) — in target repo
#   Add to opencode.jsonc:  "skills": { "paths": ["./.ryme-skills"] }
#   or: "./ryme-skills" depending on where you put it

# 3) Or run the installer FROM ryme-skills (works with any agent):
bash ryme-skills/install.sh            # from target repo: bash /path/to/ryme-skills/install.sh
# It will symlink into .claude/skills, .agents/skills, .cursor/skills, .windsurf/skills, .opencode/skills, .codex/skills
```

### Option B — Global install (all repos, one command)

```bash
bash ~/.config/opencode/skills/ryme-context-graph/install.sh --global
# installs ryme-context-graph + graphcontext + feature + build + refract (+ aliases refactor, refractor) to ~/.config/opencode/skills/
# also links to ~/.claude/skills etc for Claude/Cursor/Windsurf/Codex
```

No npm install. No DB. No MCP server. Node 18+ is enough. Python 3.10+ fallback exists.

## Quick smoke test

```bash
node .ryme-skills/scripts/ryme-graph.mjs --help
node .ryme-skills/scripts/ryme-graph.mjs --detect      # print tech stack
node .ryme-skills/scripts/ryme-graph.mjs --init         # build .ryme-skill/graph/
cat .ryme-skill/graph/context.md
node .ryme-skills/scripts/ryme-graph.mjs --stats
node .ryme-skills/scripts/ryme-graph.mjs --query "auth"
```

## References

- `references/graph-schema.md` — JSON schemas for nodes/edges/modules
- `references/techstack-matrix.md` — full detection table + heuristics
- `references/agent-protocol.md` — copy-paste checklist for agent system prompts
- `templates/feature-questions.md` — canonical 8-question discovery set
- `templates/build-questions.md` — greenfield questionnaire
- `scripts/ryme-graph.mjs` — indexer + query engine (single file, zero deps)

## Why this exists

- **Session amnesia:** every new agent session starts blind. The graph gives it the org chart on day one.
- **Duplication tax:** without a map, agents recreate `formatDate`, `checkAuth`, `handleWebhook` six times. The graph kills that.
- **Navigation paradox (2026):** bigger context windows do not fix salience — the critical file is semantically distant. The graph traverses edges, not text similarity.
- **Context burn:** grep-loop exploration burns 30–60% of turn budget. One graph query replaces 8–12 reads.

Use the graph for **everything** from A to Z. If you are about to `Grep` for a symbol, you should have queried the graph first.
