# Graph Schema

All JSON is written to `.ryme-skill/graph/`. Schemas are deliberately loose (allow unknown fields) so future `impact.json` / `ranked.json` can extend without breaking consumers.

## manifest.json

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-09-04T12:00:00.000Z",
  "root": ".",
  "fileCount": 342,
  "symbolCount": 1840,
  "edgeCount": 612,
  "moduleCount": 8,
  "techstackPrimary": "TypeScript",
  "durationMs": 1234,
  "incremental": false,
  "changed": 0
}
```

## techstack.json

```json
{
  "primary": "TypeScript",
  "languages": { "TypeScript": 240, "JavaScript": 60 },
  "frameworks": ["Next.js", "Prisma"],
  "databases": ["Supabase"],
  "orm": ["Prisma"],
  "infra": ["Vercel", "Docker"],
  "signals": ["package.json: next", "prisma/schema.prisma"],
  "confidence": 0.82
}
```

## nodes.json — Array<Node>

```ts
type Node = {
  file: string;          // rel from repo root, e.g. "src/auth/middleware.ts"
  ext: string;           // ".ts"
  lines: number;
  hash: string;          // sha1[0:12] of content for incremental
  symbols: Symbol[];
  imports: Import[];
  exports: string[];     // inferred (contains "export")
}

type Symbol = {
  kind: "function" | "class" | "interface" | "type" | "enum" | "const" | "let" | "struct" | "route" | "route-handler" | "type";
  name: string;          // e.g. "verify_token" or "GET /api/users"
  line: number;          // 1-indexed
}

type Import = {
  from: string;          // raw import string, e.g. "./utils" or "react" or "crate::auth"
  line: number;
  type: "import" | "require" | "dynamic" | "re-export" | "use" | "using";
}
```

## edges.json — Array<Edge>

```ts
type Edge = {
  from: string;          // source file
  to: string;            // raw import target (resolved when relative, otherwise package name)
  kind: "import" | "require" | "use";
  line: number;
}
```

External edges (`to = "react"`) are kept — filter by `!nodes.some(n => n.file === e.to)` to get externals.

## modules.json — Array<Module>

```ts
type Module = {
  name: string;          // "auth", "billing", "api", "root", "scripts"
  files: string[];       // sorted
  fileCount: number;
  dependencies: string[];// modules this one imports from
  entry: string | null;  // shortest path in module (heuristic entry)
}
```

Domain mapping heuristic (see `scripts/ryme-graph.mjs:buildModules`):

- `src/auth/*` → `auth`
- `src/features/chat/*` → `chat` (unwraps `features/`)
- `packages/api/*` → `api`
- `<root>/foo/*` → `foo` (top-level dir)
- Root files → `root`

## ranked.json — Array<Ranked>

```ts
type Ranked = {
  file: string;
  score: number;         // inbound*3 + symbols*0.5 + lines*0.01
  inbound: number;       // fan-in
  lines: number;
  symbolCount: number;
}
```

Sorted desc by score. Used to cap `context.md` at ~1.2k tokens.

## context.md

Token-budget Repo Map for agents. **You must read this, not nodes.json, on every task.** It contains:

- How to query (CLI examples)
- Module list (top 20)
- Top-ranked files with key symbols + imports
- Conventions

Full truth is in `nodes.json`/`edges.json` — query, don't paste.

## impact.json

```json
{
  "generatedAt": "2026-09-04T12:00:00.000Z",
  "orphans": ["src/legacy/old.ts"],
  "hubs": [{ "file": "src/lib/db.ts", "inbound": 34 }],
  "mostConnectedModule": "api",
  "notes": "orphans = zero fan-in (maybe leaf/entry). hubs = high fan-in (change with care)."
}
```

Used by `/refract`.

## ranked.json

Derived from `nodes + edges`. Low-cost way to find hubs without scanning `edges.json`.

## changelog.md

Append-only:

```
# Graph Changelog

- 2026-09-04T12:00:00.000Z — 342 files, 1840 syms, 612 edges (1234ms)
- 2026-09-04T12:05:00.000Z — feature spec: chat — chat
```

## Consumption patterns

```bash
# find all auth-related files
jq '[.[] | select(.file | contains("auth"))] | .[].file' .ryme-skill/graph/nodes.json

# who imports src/lib/db.ts ?
jq --arg f "src/lib/db.ts" '[.[] | select(.to == $f) | .from] | unique' .ryme-skill/graph/edges.json

# duplicate symbol names
jq -r '.[].symbols[].name' .ryme-skill/graph/nodes.json | sort | uniq -c | sort -rn | head

# module fan-out
jq '.[] | "\(.name): \(.dependencies|join(", "))"' .ryme-skill/graph/modules.json
```
