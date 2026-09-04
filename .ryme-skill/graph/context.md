# Ryme Context Graph — Repo Map

> Generated 2026-09-04T12:56:59.055Z · 19 files · 44 symbols · 6 edges · primary: JavaScript
> Tech: generic · ORM: none · Infra: none
> Read this file FIRST before any code task. Do not grep blind — query .ryme-skill/graph/nodes.json & edges.json instead.

## How to use
- Search symbols: `node scripts/ryme-graph.mjs --query "auth"`
- Who calls X: `node scripts/ryme-graph.mjs --callers "verify_token"`
- Imports for a slice: `node scripts/ryme-graph.mjs --imports "src/api/*"`
- File details: `node scripts/ryme-graph.mjs --path "src/auth/middleware.ts"`
- After edits: `node scripts/ryme-graph.mjs --update`

## Modules (10)
- **root** — 6 files, deps: none — e.g. `SKILL.md`
- **references** — 3 files, deps: none — e.g. `references/graph-schema.md`
- **templates** — 2 files, deps: none — e.g. `templates/build-questions.md`
- **scripts** — 2 files, deps: none — e.g. `scripts/mcp-server.mjs`
- **refractor** — 1 files, deps: none — e.g. `refractor/SKILL.md`
- **refract** — 1 files, deps: none — e.g. `refract/SKILL.md`
- **refactor** — 1 files, deps: none — e.g. `refactor/SKILL.md`
- **graphcontext** — 1 files, deps: none — e.g. `graphcontext/SKILL.md`
- **feature** — 1 files, deps: none — e.g. `feature/SKILL.md`
- **build** — 1 files, deps: none — e.g. `build/SKILL.md`

## Top-ranked files (PageRank by import fan-in)

- `scripts/ryme-graph.mjs` — 1156 LOC, 32 syms, fan-in 0 — function:help, function:resolveRootOut, function:loadGitignore, function:ignoredByGitignore, function:globToRegExp, function:walk — imports: fs, path, crypto
- `scripts/mcp-server.mjs` — 253 LOC, 10 syms, fan-in 0 — function:loadJson, function:loadGraph, function:toolQueryGraph, function:toolGetNode, function:toolGetCallers, function:toolGetNeighbors — imports: fs, path
- `feature/SKILL.md` — 328 LOC, 1 syms, fan-in 0 — function:formatDate
- `refractor/SKILL.md` — 338 LOC, 0 syms, fan-in 0 — no exports
- `refract/SKILL.md` — 338 LOC, 0 syms, fan-in 0 — no exports
- `refactor/SKILL.md` — 338 LOC, 0 syms, fan-in 0 — no exports
- `build/SKILL.md` — 274 LOC, 1 syms, fan-in 0 — function:formatDate
- `SKILL.md` — 206 LOC, 0 syms, fan-in 0 — no exports
- `graphcontext/SKILL.md` — 188 LOC, 0 syms, fan-in 0 — no exports
- `references/graph-schema.md` — 166 LOC, 0 syms, fan-in 0 — no exports
- `README.md` — 130 LOC, 0 syms, fan-in 0 — no exports
- `install.sh` — 129 LOC, 0 syms, fan-in 0 — no exports
- `references/techstack-matrix.md` — 103 LOC, 0 syms, fan-in 0 — no exports
- `references/agent-protocol.md` — 78 LOC, 0 syms, fan-in 0 — no exports
- `AGENTS.md` — 47 LOC, 0 syms, fan-in 0 — no exports
- `CLAUDE.md` — 47 LOC, 0 syms, fan-in 0 — no exports
- `package.json` — 37 LOC, 0 syms, fan-in 0 — no exports
- `templates/feature-questions.md` — 31 LOC, 0 syms, fan-in 0 — no exports
- `templates/build-questions.md` — 13 LOC, 0 syms, fan-in 0 — no exports

## Conventions
- Import boundaries: check modules.json dependencies before cross-module imports
- Reuse before create: grep nodes.json for existing util before writing a new one
- Update graph after edits: --update

---
*Full graph: nodes.json (44 symbols), edges.json (6 edges). Query, don't brute-force read.*