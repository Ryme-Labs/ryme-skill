# Agent Protocol — Copy-Paste for System Prompts

Paste this into any agent's system prompt / `CLAUDE.md` / `AGENTS.md` / `.cursor/rules` / `Windsurf` Cascade instructions. It enforces the graph without needing a plugin.

```markdown
## Ryme Context Graph — Mandatory Protocol

> This repo uses a live Context Graph at `.ryme-skill/graph/`. Every agent MUST follow this.

### Before any code task (read — 2k tokens max)

1. Ensure the graph exists:
   - If `.ryme-skill/graph/context.md` is missing or stale (`manifest.json.generatedAt` older than `git diff` or >7 days), run:
     ```
     node ./ryme-skills/scripts/ryme-graph.mjs --init --out .ryme-skill/graph
     # fallback: node ./scripts/ryme-graph.mjs --init --out .ryme-skill/graph
     # fallback: node $HOME/.config/opencode/skills/ryme-context-graph/scripts/ryme-graph.mjs --init --out .ryme-skill/graph
     ```
2. Read `.ryme-skill/graph/context.md` (Repo Map, ~1.2k tokens)
3. Read `.ryme-skill/graph/techstack.json` (stack)
4. Read `.ryme-skill/graph/modules.json` (domain map) if the task spans >1 file

Do not grep before you have read the map.

### Before creating ANY symbol (search — deterministic, not fuzzy)

Before you create a function / component / endpoint / schema / util, query the graph:

```
node ./ryme-skills/scripts/ryme-graph.mjs --query "<intent or name>" --out .ryme-skill/graph
node ./ryme-skills/scripts/ryme-graph.mjs --callers "<symbol>" --out .ryme-skill/graph
grep -i "<name>" .ryme-skill/graph/nodes.json
```

If a reusable symbol exists (same name or same intent), **reuse it** (`import` from `file:line`). Creating a duplicate when one exists is a bug. Cite the file:line you reused in your plan.

### After any edit (write back — same turn)

After you create / edit / move / delete any tracked file, update the graph in the same turn:

```
node ./ryme-skills/scripts/ryme-graph.mjs --update --out .ryme-skill/graph
```

If the script is not found, append to `.ryme-skill/graph/changelog.md`:

```
- <iso> — agent edit: <files> — <reason>
```

The graph must never be stale within a session.

### Scoping rules

- Feature scoping: cite `modules.json` dependencies and `edges.json` fan-in/out. "This touches `auth` (read) and `realtime` (write), fan-in of `src/lib/db.ts` is 34 — wrap, don't edit directly."
- Build: check web for current SDK shapes before you choose. Prefer official docs, 2026 posts. Never hallucinate SDK calls.
- Refactor: read `impact.json` (orphans/hubs) first; propose staged moves; never big-bang.

### Commands (invoke via Skill tool or slash)

- `/graphcontext` — reindex entire repo
- `/feature <prompt>` — 8-question discovery → spec at `.ryme-skill/specs/<slug>.md`
- `/build <prompt>` — scaffold greenfield + first graph
- `/refract` — graph-guided refactor (also `/refactor`)

### Violations

- Grepping blind when a graph query would answer it — violation.
- Creating `formatDate` when `src/lib/format.ts:12 formatDate` exists — violation.
- Editing 3 files and not running `--update` — violation (graph drift).
```

## Minimal variant (for tight system prompts)

```
Ryme Graph at .ryme-skill/graph/. Before any code: read context.md. Before creating a symbol: --query it; reuse if exists. After edits: --update same turn. If missing: --init.
```
