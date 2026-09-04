# Tech Stack Detection Matrix

Detection runs via `node scripts/ryme-graph.mjs --detect`. It is best-effort and file-based; no network.

## How it works

1. **Language counts:** bucket files by `ext` → `.ts/.tsx` → TypeScript, `.py` → Python, etc. Primary = max count.
2. **Config file existence:** `package.json`, `go.mod`, `Cargo.toml`, `composer.json`, `Gemfile`, `pom.xml`, `pubspec.yaml` etc.
3. **Dep inspection:** `package.json` `dependencies` keys, `requirements.txt`/`pyproject.toml` text contains, `go.mod` require, `Cargo.toml` deps, `composer.json` require.

Confidence = `0.3 + frameworks*0.15 + orm*0.1 + languages*0.05` capped at 1.0.

Override in `.ryme-skill/config.json`:

```json
{
  "techstack": {
    "primary": "TypeScript",
    "frameworks": ["Next.js","Prisma"],
    "databases": ["Supabase"],
    "orm": ["Prisma"],
    "infra": ["Vercel"]
  }
}
```

The indexer will merge the pinned value over detected (or skip detection if `.ryme-skill/config.json` has `techstack`).

## Full signal table

| Signal file | Look inside | Maps to |
|-------------|-------------|---------|
| `package.json` dep `next` | `dependencies` | Framework: Next.js |
| `package.json` dep `nuxt` or `nuxt.config.*` | | Nuxt |
| `package.json` dep `vue` | | Vue |
| `package.json` dep `svelte` or `svelte.config.js` | | SvelteKit |
| `package.json` dep `astro` or `astro.config.*` | | Astro |
| `package.json` dep `@remix-run/*` | | Remix |
| `package.json` dep `solid-js` | | Solid |
| `package.json` dep `@angular/core` | | Angular |
| `package.json` dep `react` (fallback) | | React |
| `vite.config.*` exists | | signal: vite |
| `tailwind.config.*` exists | | signal: tailwind |
| `package.json` dep `express` | | Express |
| `package.json` dep `fastify` | | Fastify |
| `package.json` dep `hono` | | Hono |
| `package.json` dep `@nestjs/core` | | NestJS |
| `requirements.txt` / `pyproject.toml` contains `django` | | Django |
| same contains `fastapi` | | FastAPI |
| same contains `flask` | | Flask |
| same contains `sqlalchemy` | | ORM: SQLAlchemy |
| `go.mod` contains `gin-gonic/gin` | | Gin |
| `go.mod` contains `labstack/echo` | | Echo |
| `go.mod` contains `gofiber/fiber` | | Fiber |
| `go.mod` contains `go-chi/chi` | | Chi |
| `Cargo.toml` contains `actix-web` | | Actix |
| `Cargo.toml` contains `rocket` | | Rocket |
| `Cargo.toml` contains `axum` | | Axum |
| `composer.json` contains `laravel` | | Laravel |
| `composer.json` contains `symfony` | | Symfony |
| `Gemfile` contains `rails` | | Rails |
| `Gemfile` contains `sinatra` | | Sinatra |
| `pom.xml` / `build.gradle` contains `spring` | | Spring |
| `package.json` dep `prisma` or `prisma/schema.prisma` | | ORM: Prisma |
| `drizzle.config.*` or dep `drizzle-orm` | | ORM: Drizzle |
| dep `typeorm` | | ORM: TypeORM |
| dep `sequelize` | | ORM: Sequelize |
| dep `mongoose` | | ORM: Mongoose + DB: MongoDB |
| dep `@supabase/supabase-js` | | DB: Supabase |
| dep `firebase` | | DB: Firebase |
| `docker-compose.yml` / `compose.yml` | | Infra: Docker Compose |
| `Dockerfile` | | Infra: Docker |
| `fly.toml` | | Infra: Fly.io |
| `vercel.json` | | Infra: Vercel |
| `netlify.toml` | | Infra: Netlify |
| `k8s/` dir or `infra/` | | Infra: Kubernetes |

## Parser coverage by ext

| Exts | Parser kind | Symbols | Imports |
|------|-------------|---------|---------|
| `.js .mjs .cjs .jsx .ts .tsx .mts .cts .vue .svelte .astro .mdx` | JS/TS regex | `function, class, interface, type, enum, const, arrow, route` | `import, require, import(), re-export` |
| `.py .pyi` | Python regex | `def, class, route` | `import, from X import` |
| `.go` | Go regex | `func, type struct/interface` | `import "pkg"` + block imports |
| `.rs` | Rust regex | `fn, struct, enum` | `use crate::...` |
| `.java .kt .kts` | Java/Kotlin regex | `class/interface/enum/record, methods` | `import ...` |
| `.php` | PHP regex | `function, class` | `use ...` |
| `.rb` | Ruby regex | `def, class` | `require` |
| `.cs` | C# regex | `class` | `using` |
| `.dart .swift .ex .exs` | generic | `func/def/class/struct` | `import/use/alias` |
| other | fallback | `function/def/func` | none |

All parsers are regex-based for zero deps. A future tree-sitter pass can replace them without changing `nodes.json` shape — the graph schema is stable.

## Adding a new stack

1. Add a signal file check in `detectTechstack()` (see `scripts/ryme-graph.mjs` ~line 220).
2. Add its `ext` to `INCLUDE_EXTS` and `langMap` if new language.
3. Add parser branch in `parseFile()` if new symbol/import syntax.
4. Test: `node scripts/ryme-graph.mjs --detect` should list it, and `--init` should produce symbols.

No other files need touching. The four skills are stack-agnostic — they only read `techstack.json`.
