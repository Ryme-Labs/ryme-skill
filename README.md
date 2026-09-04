# ryme-skill

# Ryme Context Graph — Production-Grade Codebase Intelligence

> One graph to rule all agents. Index once, reason forever.

**Ryme Context Graph** turns any codebase into a live, queryable **Context Graph** that every AI agent must use — from first file read to last commit. It kills the grep-loop, prevents duplicate utils, and keeps the map fresh as you code.

- **Zero deps** — single `node` script, no DB, no API key
- **Any stack** — JS/TS, Python, Go, Rust, Java, PHP, Ruby, C#, Swift, Dart, Elixir, Vue/Svelte/Astro
- **Any agent** — OpenCode, Claude Code, Cursor, Windsurf, Copilot CLI, Codex, Gemini
- **Live** — the graph updates on every edit (same turn, no drift)

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](./package.json)
[![Skills](https://img.shields.io/badge/skills-graphcontext%20%7C%20feature%20%7C%20build%20%7C%20refract-orange)](./SKILL.md)

### ⚡ One-line Install (curl)

```bash
# Local (current project) — copies to ./.ryme-skills + links to .claude/.agents
curl -fsSL https://raw.githubusercontent.com/Ryme-Labs/ryme-skill/main/install.sh | bash

# Global (all projects) — installs to ~/.config/opencode/skills/
curl -fsSL https://raw.githubusercontent.com/Ryme-Labs/ryme-skill/main/install.sh | bash -s -- --global

# Or with wget
wget -qO- https://raw.githubusercontent.com/Ryme-Labs/ryme-skill/main/install.sh | bash
```

> `install.sh` auto-detects existing installs and updates both global+local, migrates old `.ryme` → `.ryme-skill` graph path.

---

## Commands

| Command | What it does |
|---------|--------------|
| `/graphcontext` | Full or incremental index of the entire repo into `./.ryme-skill/graph/` (symbols, import edges, modules, PageRank) |
| `/feature` | Turns `add Stripe billing` into a graph-grounded spec via 8 discovery questions + recommendations |
| `/build` | Scaffolds a new production-ready project (asks stack/auth/DB/deploy, searches the web for best practice, writes first graph) |
| `/refract` | Graph-guided refactor: `impact.json` → staged, safe moves (dedup, split huge files, cut coupling) |

Every command **reads the graph before it writes code** and **updates the graph after**.

## The Graph

```
.ryme-skill/
  config.json              # stack + project meta
  graph/
    manifest.json          # version, counts, duration
    techstack.json         # detected stack (frameworks, DB, infra)
    nodes.json             # files → symbols (functions, classes, routes...)
    edges.json             # imports (file → file + external)
    modules.json           # domain boundaries (auth, billing, api...)
    ranked.json            # PageRank by fan-in
    context.md             # 1.2k-token Repo Map — agents read this FIRST
    impact.json            # orphans, hubs, coupling (for /refract)
    changelog.md           # append-only log
```

This is **not** vector RAG. It is a deterministic AST graph: who imports whom, who owns what.

## Quick start

```bash
# 1) Add the skill to your repo
git clone https://github.com/RymeLabs/ryme-skills ./ryme-skills-tmp
cp -r ./ryme-skills-tmp .ryme-skills && rm -rf ./ryme-skills-tmp
# or: git submodule add https://github.com/RymeLabs/ryme-skills .ryme-skills

# 2) Register for your agent
# OpenCode — add to opencode.jsonc:  "skills": { "paths": ["./.ryme-skills"] }
# Claude Code — ln -s ../.ryme-skills .claude/skills/ryme-context-graph
# Cursor/Windsurf — ln -s ../.ryme-skills .agents/skills/ryme-context-graph

# 3) Index
node .ryme-skills/scripts/ryme-graph.mjs --init
cat .ryme-skill/graph/context.md   # the map your agent will read
```

Or global install (all repos):

```bash
./.ryme-skills/install.sh --global
```

## How agents use it (every task, A to Z)

```
1. Read .ryme-skill/graph/context.md + techstack.json + modules.json
2. Query before creating:
   node scripts/ryme-graph.mjs --query "auth middleware"
   node scripts/ryme-graph.mjs --callers "verify_token"
3. Plan with evidence: cite file:line you will reuse, modules you will touch, edges you will add
4. Edit (reuse, don't duplicate)
5. Update: node scripts/ryme-graph.mjs --update  (same turn)
6. Verify: node scripts/ryme-graph.mjs --verify
```

If you skip 1–2 you are guessing. Guessing in production is not engineering.

## Documentation

- `SKILL.md` — main router + Iron Laws
- `graphcontext/SKILL.md` — indexer workflow
- `feature/SKILL.md` — 8 discovery questions
- `build/SKILL.md` — greenfield scaffolder
- `refract/SKILL.md` — graph-guided refactor
- `references/graph-schema.md` — JSON schemas
- `references/techstack-matrix.md` — detection table
- `references/agent-protocol.md` — copy-paste for system prompts
- `scripts/ryme-graph.mjs` — the indexer (read it — single file)

## Why not just grep / RAG?

From the 2026 frontier (CodeCompass, Augment Context Engine, Meta's pre-computed engine):

- **Grep burns 30–60% of turn budget** on navigation before any edit.
- **Bigger windows don't fix salience** — the critical file is semantically distant (Navigation Paradox, arXiv 2602.20048).
- **A weaker model + great context beats a stronger model + poor context** (Augment, Feb 2026 — up to 80% quality lift via MCP).
- **Session amnesia** — every new conversation rediscovers the same structure.

A graph replaces 8–12 reads with one query. It is the org chart for your codebase.

## Stack detection

Auto-detected via config + file conventions. Override in `.ryme-skill/config.json` if needed.

| Layer | Signals |
|-------|---------|
| Frontend | React, Next.js, Nuxt, Vue, SvelteKit, Astro, Remix, Solid, Angular |
| Backend | Express, Fastify, Hono, Nest, Django, FastAPI, Flask, Gin, Echo, Fiber, Rails, Laravel, Spring, Actix |
| DB/ORM | Prisma, Drizzle, TypeORM, Mongoose, SQLAlchemy, GORM, Diesel |
| Infra | Docker, Compose, K8s, Vercel, Fly, Netlify, Supabase, Firebase |

Unknown stack = generic parser fallback (still indexes).

## Web search policy

When building or implementing a feature you don't know, **search first**. The skills explicitly allow and encourage `WebSearch`/`WebFetch` for library choice, SDK shapes, and 2026 best practice. Cite links in the spec. Never hallucinate SDKs.

## License

MIT — see `LICENSE` (add one). Built for [Ryme Labs](https://ryme.app).

---

**Install it, run `/graphcontext`, then never code without the graph again.**

---

## 🔥 Trending Keywords (2026) — AI × Code Intelligence × Graph

> Added for discoverability — this repo sits at the intersection of the most starred 2026 trends.

**Core — Codebase Intelligence (2026 frontier):**
`codebase-intelligence` `repository-understanding` `repository-intelligence` `repo-grokking` `code-graph` `ast-parsing` `tree-sitter` `code-knowledge-graph` `context-graph` `context-engineering` `precomputed-context` `semantic-search` `vector-embeddings` `turbopuffer` `code-embeddings` `graph-navigation` `pagerank` `repo-map` `architectural-coverage` `navigation-paradox` `hidden-dependency` `shadow-tech-debt` `tribal-knowledge` `multi-agent-knowledge-extraction`

**Agents — Agentic Coding (Anthropic 2026 Report, 60% of work uses AI, 0–20% fully delegated):**
`ai-coding-agents` `agentic-coding` `agentic-ai` `ai-agents` `coding-agents` `claude-code` `cursor` `codex` `opencode` `windsurf` `copilot` `gemini-cli` `junie` `codex-cli` `openai-codex` `anthropic-claude` `multi-agent` `agent-teams` `agent-orchestration` `hierarchical-agents` `long-running-agents` `vibe-coding` `ai-pair-programming` `human-in-the-loop` `sdlc-automation`

**Platform — Skills & MCP (Model Context Protocol):**
`claude-skills` `opencode-skills` `cursor-skills` `agent-skills` `mcp` `mcp-server` `model-context-protocol` `llm-tools` `ai-assistants` `agent-framework` `open-source-agents` `self-hosted` `local-ai` `modular-agents` `skill-routing` `slash-commands` `graphcontext` `feature-spec` `build-scaffolder` `refactor-swarm`

**Stack — Universal Tech Graph:**
`typescript` `javascript` `python` `go` `rust` `java` `php` `ruby` `csharp` `swift` `dart` `elixir` `react` `nextjs` `nuxt` `vue` `sveltekit` `astro` `remix` `solid` `angular` `express` `fastify` `hono` `nestjs` `django` `fastapi` `flask` `gin` `echo` `fiber` `rails` `laravel` `spring` `actix` `prisma` `drizzle` `typeorm` `mongoose` `sqlalchemy` `gorm` `docker` `kubernetes` `vercel` `supabase` `firebase`

**GitHub Trending 2026 — Top AI Repos (OSSInsight, Fungies, FindaRepo):**
`github-trending` `ossinsight` `top-ai-repos` `ai-agents` `llm-tools` `mcp-servers` `coding-agents` `rag-frameworks` `inference-engines` `vector-databases` `vibe-coding` `ai-assistants` `langflow` `dify` `flowise` `metagpt` `crewai` `autogen` `goose` `open-swe` `qwen-code` `plandex` `bytebot` `nanobrowser` `steel-browser` `nemo-agent-toolkit` `localagi`

**SEO — Knowledge Graph (Google 500B facts, 5B entities):**
`knowledge-graph` `knowledge-graph-seo` `entity-seo` `entity-optimization` `ai-search` `ai-overviews` `knowledge-panels` `schema-org` `structured-data` `semantic-search` `entity-first-seo` `conversational-search` `zero-click` `semantic-relationships` `topical-maps`

---

## 📦 Keywords for Package Managers & Topics

```
context-graph, codebase-intelligence, ai-agents, opencode, claude-code, cursor, windsurf, copilot, codex, gemini, knowledge-graph, ast, repo-map, tree-sitter, mcp, mcp-server, agentic-coding, vibe-coding, multi-agent, codebase-understanding, repository-intelligence, precomputed-context, graph-navigation, shadow-tech-debt, developer-tools, llm-tools, coding-agents, rag, vector-db, self-hosted, open-source, typescript, python, go, rust, nextjs, supabase, prisma, drizzle
```

Add as GitHub Topics: `ai-agents` `codebase-intelligence` `context-graph` `knowledge-graph` `mcp` `mcp-server` `claude-code` `opencode` `cursor` `windsurf` `ast` `tree-sitter` `agentic-coding` `vibe-coding` `repository-intelligence` `rag` `vector-database` `self-hosted` `open-source`

---

## 🔗 References (2026)

- Codebase Intelligence: How AI Agents Navigate Large Repos (Zylos, 2026-04-19)
- Anthropic 2026 Agentic Coding Trends Report (8 trends: SDLC collapse, agent teams, long-running agents)
- Augment Context Engine MCP (80% quality lift), Meta Pre-Computed Context Engine (40% fewer tool calls)
- JetBrains Shadow Tech Debt, Cursor Merkle-tree incremental indexing, Aider RepoMap PageRank
- Graphify, CodeCompass (99.4% ACS on hidden-dependency), AtCode, Code-Knowledge-Graph
