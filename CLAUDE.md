# CLAUDE — Ryme Context Graph

> This repo uses a live Context Graph at `./.ryme-skill/graph/`. Every Claude Code session MUST follow this.

## Before any code task

1. Ensure graph exists:
   ```bash
   node ./ryme-skills/scripts/ryme-graph.mjs --init --out ./.ryme-skill/graph  # or ./.ryme-skills/scripts/...
   ```
   If `./.ryme-skill/graph/context.md` is missing or `manifest.json.generatedAt` older than `git status` diff or >7 days → run it now.

2. Read `./.ryme-skill/graph/context.md` (Repo Map, ~1.2k tokens) + `./.ryme-skill/graph/techstack.json`

3. For scoping: also read `./.ryme-skill/graph/modules.json`

## Before creating ANY function / component / endpoint

```bash
node ./ryme-skills/scripts/ryme-graph.mjs --query "<intent>" --out ./.ryme-skill/graph
node ./ryme-skills/scripts/ryme-graph.mjs --callers "<symbol>" --out ./.ryme-skill/graph
```

If a reusable symbol exists, reuse it (`import` from `file:line`). Duplication is a bug — cite the file:line you reused.

## After any edit (same turn)

```bash
node ./ryme-skills/scripts/ryme-graph.mjs --update --out ./.ryme-skill/graph
```

## Commands

- `/graphcontext` — reindex
- `/feature <prompt>` — discovery spec
- `/build <prompt>` — scaffold new project
- `/refract` — refactor (`/refactor` alias)

## Skill routing

When the user's request matches a Ryme skill, invoke it via the Skill tool. When in doubt, invoke it.

- Index / graph stale → `graphcontext`
- New feature / capability → `feature`
- New project from zero → `build`
- Cleanup / migration / dedup → `refract`
