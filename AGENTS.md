# AGENTS — Ryme Context Graph

This file is for AI agents that read `AGENTS.md` (OpenCode, Cursor, Codex, Factory, etc.)

## Ryme Context Graph — Mandatory Protocol

> This repo uses a live Context Graph at `./.ryme-skill/graph/`. Every agent MUST follow this.

### Before any code task (read — 2k tokens max)

1. Ensure the graph exists: if `./.ryme-skill/graph/context.md` is missing or stale (`manifest.json.generatedAt` older than `git diff` or >7 days), run:

   ```
   node ./ryme-skills/scripts/ryme-graph.mjs --init --out ./.ryme-skill/graph
   # fallback: node ./.ryme-skills/scripts/ryme-graph.mjs --init --out ./.ryme-skill/graph
   # fallback: node $HOME/.config/opencode/skills/ryme-context-graph/scripts/ryme-graph.mjs --init --out ./.ryme-skill/graph
   ```

2. Read `./.ryme-skill/graph/context.md` (~1.2k tokens)
3. Read `./.ryme-skill/graph/techstack.json`
4. Read `./.ryme-skill/graph/modules.json` if task spans >1 file

### Before creating ANY symbol

```
node ./ryme-skills/scripts/ryme-graph.mjs --query "<intent>" --out ./.ryme-skill/graph
node ./ryme-skills/scripts/ryme-graph.mjs --callers "<symbol>" --out ./.ryme-skill/graph
grep -i "<name>" ./.ryme-skill/graph/nodes.json
```

If a reusable symbol exists, reuse it. Duplication is a bug.

### After any edit (same turn)

```
node ./ryme-skills/scripts/ryme-graph.mjs --update --out ./.ryme-skill/graph
```

### Commands

- `/graphcontext` — reindex entire repo
- `/feature <prompt>` — 8-question discovery → spec at `./.ryme-skill/specs/<slug>.md`
- `/build <prompt>` — scaffold greenfield + first graph
- `/refract` — graph-guided refactor (alias `/refactor`)

See `SKILL.md` for the full Iron Laws.
