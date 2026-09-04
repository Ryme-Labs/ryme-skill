#!/usr/bin/env node
/**
 * Ryme Context Graph — Indexer + Query Engine
 * Zero deps, Node 18+, any stack.
 * Single-file production indexer: scans repo, extracts symbols & edges, writes .ryme-skill/graph/
 *
 * Usage:
 *   node scripts/ryme-graph.mjs --help
 *   node scripts/ryme-graph.mjs --detect
 *   node scripts/ryme-graph.mjs --init [--root .] [--out .ryme-skill/graph]
 *   node scripts/ryme-graph.mjs --update
 *   node scripts/ryme-graph.mjs --stats
 *   node scripts/ryme-graph.mjs --verify
 *   node scripts/ryme-graph.mjs --query "auth"
 *   node scripts/ryme-graph.mjs --callers "verify_token"
 *   node scripts/ryme-graph.mjs --imports "src/api/*"
 *   node scripts/ryme-graph.mjs --path "src/auth/middleware.ts"
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────
const VERSION = "1.0.0";
const DEFAULT_OUT = ".ryme-skill/graph";
const DEFAULT_CONFIG = ".ryme-skill/config.json";
const MAX_FILE_SIZE = 500 * 1024; // 500KB
const CONTEXT_BUDGET_TOKENS = 1200; // target for context.md
const HARD_IGNORE = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", ".next", ".nuxt",
  ".output", "coverage", "vendor", ".venv", "__pycache__", ".ryme-skill", ".ryme",
  ".opencode", ".claude", ".agents", ".cache", ".turbo", "out",
  ".vercel", ".parcel-cache", ".yarn", ".pnp", ".pnpm-store",
  "__tests__/__snapshots__", ".pytest_cache", ".mypy_cache",
  "target", ".gradle", ".idea", ".vscode", "vendor", "tmp", "temp",
  ".DS_Store", ".parcel-cache", "coverage", ".nyc_output"
]);
const HARD_IGNORE_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "uv.lock", "poetry.lock", "Cargo.lock", "composer.lock",
  "Gemfile.lock", "go.sum"
]);
const INCLUDE_EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx",
  ".py", ".pyi",
  ".go",
  ".rs",
  ".java", ".kt", ".kts",
  ".php",
  ".rb",
  ".cs",
  ".swift",
  ".dart",
  ".ex", ".exs",
  ".vue", ".svelte", ".astro", ".mdx", ".md",
  ".json", ".yaml", ".yml", ".toml", ".graphql", ".gql", ".sql", ".sh",
  ".prisma", ".proto"
]);

// ──────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const get = (k, def) => {
  const i = args.indexOf(k);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};

function help() {
  console.log(`
Ryme Context Graph v${VERSION} — indexer & query engine

  --help                          show this
  --detect [--root .]             print detected tech stack (json)
  --init [--root .] [--out .ryme-skill/graph]   full index (creates .ryme-skill/graph/*)
  --update [--root .] [--out .ryme-skill/graph] incremental (only changed files)
  --stats [--out .ryme-skill/graph]      print manifest + counts
  --verify [--out .ryme-skill/graph]     check graph health (orphans, cycles, dead code hints)
  --query "term" [--out .ryme-skill/graph]     search symbols/files by name
  --callers "symbol" [--out .ryme-skill/graph] who imports/calls symbol (approx via edges+text)
  --imports "glob" [--out .ryme-skill/graph]   show import edges matching glob
  --path "file" [--out .ryme-skill/graph]      show symbols for one file

  Env: RYME_ROOT overrides --root, RYME_OUT overrides --out
`);
}

function resolveRootOut() {
  const root = get("--root", process.env.RYME_ROOT || ".");
  const out = get("--out", process.env.RYME_OUT || DEFAULT_OUT);
  return { root: path.resolve(root), out: path.resolve(root, out) };
}

// ──────────────────────────────────────────────────────────────
// Gitignore support (simple)
// ──────────────────────────────────────────────────────────────
function loadGitignore(root) {
  const patterns = [];
  // hard ignores are always applied; gitignore is additive
  for (const f of [".gitignore", ".ryme-skillignore", ".rymeignore"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n");
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      // normalize directory patterns
      if (line.startsWith("/")) line = line.slice(1);
      if (line.endsWith("/")) line = line.slice(0, -1);
      patterns.push(line);
    }
  }
  return patterns;
}

function ignoredByGitignore(relPath, patterns) {
  for (const pat of patterns) {
    // simple glob: * and ** and trailing /*
    // Convert pat to regex: escape, then replace \*\* and \* etc
    const re = globToRegExp(pat);
    if (re.test(relPath)) return true;
    // also test basename for bare patterns like "*.log"
    if (!pat.includes("/")) {
      if (re.test(path.basename(relPath))) return true;
    }
    // prefix match for directory patterns
    if (relPath === pat || relPath.startsWith(pat + "/")) return true;
  }
  return false;
}

function globToRegExp(glob) {
  // minimal: supports * , **, ?, and literal
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("+|}{()[].^$\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

// ──────────────────────────────────────────────────────────────
// File walk
// ──────────────────────────────────────────────────────────────
function walk(root, gitignorePatterns) {
  const files = [];
  const stack = [root];
  const rootAbs = path.resolve(root);

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(rootAbs, abs).replace(/\\/g, "/");
      if (!rel) continue;

      // hard ignore dirs
      const parts = rel.split("/");
      if (parts.some((p) => HARD_IGNORE.has(p))) continue;
      if (HARD_IGNORE_FILES.has(ent.name)) continue;
      if (ignoredByGitignore(rel, gitignorePatterns)) continue;

      if (ent.isDirectory()) {
        // skip hidden dirs except .github?
        if (ent.name.startsWith(".") && ![".github"].includes(ent.name)) {
          // allow .github but not .git etc (already filtered)
          if ([".git", ".hg", ".svn", ".ryme-skill", ".ryme", ".claude", ".agents", ".cache"].includes(ent.name)) continue;
        }
        stack.push(abs);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        // also allow extensionless like Dockerfile, Makefile, go.mod, etc
        const base = path.basename(rel);
        const isSpecial = ["Dockerfile", "Makefile", "go.mod", "Cargo.toml", "pyproject.toml", "Gemfile", "pom.xml", "build.gradle", "composer.json", "pubspec.yaml", "mix.exs", "rebar.config"].includes(base);
        if (!INCLUDE_EXTS.has(ext) && !isSpecial) {
          // still include if it's likely source without ext? skip for now
          // but do include config-like files at top levels
          if (ext === "" && !isSpecial) continue;
          if (!isSpecial && ext !== "") continue;
        }
        // size check
        try {
          const st = fs.statSync(abs);
          if (st.size > MAX_FILE_SIZE) continue;
        } catch { continue; }
        files.push({ abs, rel, ext });
      }
    }
  }
  return files;
}

// ──────────────────────────────────────────────────────────────
// Techstack detection
// ──────────────────────────────────────────────────────────────
function detectTechstack(root, files) {
  const relSet = new Set(files.map((f) => f.rel));
  const readJsonSafe = (rel) => {
    try {
      const txt = fs.readFileSync(path.join(root, rel), "utf8");
      return JSON.parse(txt);
    } catch { return null; }
  };
  const exists = (rel) => relSet.has(rel) || fs.existsSync(path.join(root, rel));
  const deps = {};
  const devDeps = {};

  const pkg = readJsonSafe("package.json");
  if (pkg) {
    Object.assign(deps, pkg.dependencies || {});
    Object.assign(devDeps, pkg.devDependencies || {});
  }

  const stack = {
    primary: "unknown",
    languages: {},
    frameworks: [],
    databases: [],
    orm: [],
    infra: [],
    signals: [],
    confidence: 0,
  };

  // count languages by file ext
  const langMap = {
    ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
    ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
    ".py": "Python", ".pyi": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin",
    ".php": "PHP",
    ".rb": "Ruby",
    ".cs": "C#",
    ".swift": "Swift",
    ".dart": "Dart",
    ".ex": "Elixir", ".exs": "Elixir",
    ".vue": "Vue", ".svelte": "Svelte", ".astro": "Astro"
  };
  for (const f of files) {
    const lang = langMap[f.ext];
    if (lang) stack.languages[lang] = (stack.languages[lang] || 0) + 1;
  }
  // primary by most files (or package.json indicator)
  let maxLang = null, maxN = 0;
  for (const [k, v] of Object.entries(stack.languages)) {
    if (v > maxN) { maxN = v; maxLang = k; }
  }
  if (maxLang) stack.primary = maxLang;

  // frontend frameworks
  const depHas = (name) => deps[name] !== undefined || devDeps[name] !== undefined;
  const anyDepHas = (names) => names.some(depHas);

  if (depHas("next")) { stack.frameworks.push("Next.js"); stack.signals.push("package.json: next"); }
  if (depHas("nuxt") || exists("nuxt.config.ts") || exists("nuxt.config.js")) { stack.frameworks.push("Nuxt"); }
  if (depHas("vue") && !stack.frameworks.includes("Nuxt")) { stack.frameworks.push("Vue"); }
  if (depHas("svelte") || exists("svelte.config.js")) { stack.frameworks.push("SvelteKit"); }
  if (depHas("astro") || exists("astro.config.mjs")) { stack.frameworks.push("Astro"); }
  if (depHas("remix") || depHas("@remix-run/react")) { stack.frameworks.push("Remix"); }
  if (depHas("solid-js")) { stack.frameworks.push("Solid"); }
  if (depHas("@angular/core")) { stack.frameworks.push("Angular"); }
  if (depHas("react") && !stack.frameworks.includes("Next.js") && !stack.frameworks.includes("Remix")) {
    stack.frameworks.push("React");
  }
  if (exists("vite.config.ts") || exists("vite.config.js")) stack.signals.push("vite");
  if (exists("tailwind.config.js") || exists("tailwind.config.ts")) stack.signals.push("tailwind");

  // backend frameworks
  if (depHas("express")) { stack.frameworks.push("Express"); }
  if (depHas("fastify")) { stack.frameworks.push("Fastify"); }
  if (depHas("hono")) { stack.frameworks.push("Hono"); }
  if (depHas("@nestjs/core")) { stack.frameworks.push("NestJS"); }
  if (exists("requirements.txt") || exists("pyproject.toml") || exists("setup.py")) {
    try {
      const req = exists("requirements.txt") ? fs.readFileSync(path.join(root, "requirements.txt"), "utf8").toLowerCase() : "";
      const pyproj = exists("pyproject.toml") ? fs.readFileSync(path.join(root, "pyproject.toml"), "utf8").toLowerCase() : "";
      const blob = req + "\n" + pyproj;
      if (blob.includes("django")) stack.frameworks.push("Django");
      if (blob.includes("fastapi")) stack.frameworks.push("FastAPI");
      if (blob.includes("flask")) stack.frameworks.push("Flask");
      if (blob.includes("sqlalchemy")) stack.orm.push("SQLAlchemy");
      if (blob.includes("prisma")) stack.orm.push("Prisma");
    } catch {}
  }
  // go
  if (exists("go.mod")) {
    const gomod = fs.readFileSync(path.join(root, "go.mod"), "utf8").toLowerCase();
    if (gomod.includes("gin-gonic/gin")) stack.frameworks.push("Gin");
    if (gomod.includes("labstack/echo")) stack.frameworks.push("Echo");
    if (gomod.includes("gofiber/fiber")) stack.frameworks.push("Fiber");
    if (gomod.includes("go-chi/chi")) stack.frameworks.push("Chi");
    stack.signals.push("go.mod");
  }
  // rust
  if (exists("Cargo.toml")) {
    const cargo = fs.readFileSync(path.join(root, "Cargo.toml"), "utf8").toLowerCase();
    if (cargo.includes("actix-web")) stack.frameworks.push("Actix");
    if (cargo.includes("rocket")) stack.frameworks.push("Rocket");
    if (cargo.includes("axum")) stack.frameworks.push("Axum");
    stack.signals.push("Cargo.toml");
  }
  // php
  if (exists("composer.json")) {
    const comp = readJsonSafe("composer.json");
    const req = JSON.stringify(comp || {}).toLowerCase();
    if (req.includes("laravel")) stack.frameworks.push("Laravel");
    if (req.includes("symfony")) stack.frameworks.push("Symfony");
    stack.signals.push("composer.json");
  }
  // ruby
  if (exists("Gemfile")) {
    const gem = fs.readFileSync(path.join(root, "Gemfile"), "utf8").toLowerCase();
    if (gem.includes("rails")) stack.frameworks.push("Rails");
    if (gem.includes("sinatra")) stack.frameworks.push("Sinatra");
  }
  // java
  if (exists("pom.xml") || exists("build.gradle") || exists("build.gradle.kts")) {
    const blob = (exists("pom.xml") ? fs.readFileSync(path.join(root, "pom.xml"), "utf8") : "") +
                 (exists("build.gradle") ? fs.readFileSync(path.join(root, "build.gradle"), "utf8") : "");
    if (blob.toLowerCase().includes("spring")) stack.frameworks.push("Spring");
  }

  // db / orm
  if (depHas("prisma") || exists("prisma/schema.prisma")) stack.orm.push("Prisma");
  if (depHas("drizzle-orm") || exists("drizzle.config.ts")) stack.orm.push("Drizzle");
  if (depHas("typeorm")) stack.orm.push("TypeORM");
  if (depHas("sequelize")) stack.orm.push("Sequelize");
  if (depHas("mongoose")) { stack.databases.push("MongoDB"); stack.orm.push("Mongoose"); }
  if (depHas("@supabase/supabase-js")) stack.databases.push("Supabase");
  if (depHas("firebase")) stack.databases.push("Firebase");
  if (exists("docker-compose.yml") || exists("compose.yml") || exists("docker-compose.yaml")) stack.infra.push("Docker Compose");
  if (exists("Dockerfile")) stack.infra.push("Docker");
  if (exists("fly.toml")) stack.infra.push("Fly.io");
  if (exists("vercel.json")) stack.infra.push("Vercel");
  if (exists("netlify.toml")) stack.infra.push("Netlify");
  if (fs.existsSync(path.join(root, "infra")) || fs.existsSync(path.join(root, "k8s")) || relSet.has("k8s/deployment.yaml")) stack.infra.push("Kubernetes");

  // confidence heuristic
  stack.confidence = Math.min(1, 0.3 + stack.frameworks.length * 0.15 + stack.orm.length * 0.1 + Object.keys(stack.languages).length * 0.05);
  stack.confidence = Math.round(stack.confidence * 100) / 100;

  // dedup
  stack.frameworks = [...new Set(stack.frameworks)];
  stack.databases = [...new Set(stack.databases)];
  stack.orm = [...new Set(stack.orm)];
  stack.infra = [...new Set(stack.infra)];

  return stack;
}

// ──────────────────────────────────────────────────────────────
// Parsers — regex based, per language
// ──────────────────────────────────────────────────────────────
function parseFile(rel, abs, ext, content) {
  const lines = content.split("\n").length;
  const symbols = [];
  const imports = [];
  const exports = [];

  const seenSyms = new Set();
  const addSym = (kind, name, line) => {
    if (!name || name.length > 80) return;
    if (/^[0-9]/.test(name)) return;
    const key = `${kind}:${name}:${line}`;
    if (seenSyms.has(key)) return;
    seenSyms.add(key);
    symbols.push({ kind, name, line });
  };

  // generic helper to find line number
  const lineOf = (idx) => content.slice(0, idx).split("\n").length;

  // ── JS/TS/JSX/TSX/MJS/CJS/Vue/Svelte/Astro
  if ([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".vue", ".svelte", ".astro", ".mdx"].includes(ext)) {
    // imports
    const importRe = /^\s*import\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/gm;
    const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
    const dynamicImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = importRe.exec(content)) !== null) imports.push({ from: m[1], line: lineOf(m.index), type: "import" });
    while ((m = requireRe.exec(content)) !== null) imports.push({ from: m[1], line: lineOf(m.index), type: "require" });
    while ((m = dynamicImportRe.exec(content)) !== null) imports.push({ from: m[1], line: lineOf(m.index), type: "dynamic" });

    // re-exports
    const reExportRe = /export\s+(?:\*\s+from|{\s*[^}]*}\s+from)\s+['"]([^'"]+)['"]/g;
    while ((m = reExportRe.exec(content)) !== null) imports.push({ from: m[1], line: lineOf(m.index), type: "re-export" });

    // symbols
    const patterns = [
      { re: /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "function" },
      { re: /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "function" },
      { re: /export\s+(?:default\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "class" },
      { re: /(?:^|\n)\s*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "class" },
      { re: /export\s+interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "interface" },
      { re: /(?:^|\n)\s*interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "interface" },
      { re: /export\s+type\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "type" },
      { re: /export\s+enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "enum" },
      { re: /(?:^|\n)\s*enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "enum" },
      { re: /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g, kind: "function" }, // const foo = (
      { re: /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g, kind: "const" },
      { re: /export\s+let\s+([A-Za-z_$][A-Za-z0-9_$]*)/g, kind: "let" },
      // arrow / function assigned
      { re: /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, kind: "function" },
      { re: /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*function\b/g, kind: "function" },
      // routes (express/fastify/hono/next)
      { re: /\b(?:app|router|fastify|hono)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/g, kind: "route" },
      { re: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g, kind: "route-handler" },
    ];
    for (const { re, kind } of patterns) {
      re.lastIndex = 0;
      while ((m = re.exec(content)) !== null) {
        const name = m[1];
        if (kind === "route") {
          addSym("route", `${m[1].toUpperCase()} ${m[2]}`, lineOf(m.index));
        } else {
          addSym(kind, name, lineOf(m.index));
          if (content.slice(m.index - 60, m.index).includes("export")) {
            exports.push(name);
          }
        }
      }
    }
    // generic export detection
    const exportNames = content.match(/export\s+(?:default\s+)?(?:{[^}]+}|[A-Za-z_$][A-Za-z0-9_$]*)/g);
    // not needed; already captured

  } else if (ext === ".py" || ext === ".pyi") {
    const impRe = /^\s*(?:from\s+(\S+)\s+import|import\s+([A-Za-z0-9_. ,]+))/gm;
    let m2;
    while ((m2 = impRe.exec(content)) !== null) {
      const from = (m2[1] || m2[2] || "").split(",")[0].trim();
      if (from) imports.push({ from, line: lineOf(m2.index), type: "import" });
    }
    const defRe = /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
    const classRe = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
    while ((m2 = defRe.exec(content)) !== null) addSym("function", m2[1], lineOf(m2.index));
    while ((m2 = classRe.exec(content)) !== null) addSym("class", m2[1], lineOf(m2.index));
    // routes (fastapi/flask)
    const routeRe = /@(?:app|router|blueprint)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    while ((m2 = routeRe.exec(content)) !== null) addSym("route", `${m2[1].toUpperCase()} ${m2[2]}`, lineOf(m2.index));

  } else if (ext === ".go") {
    const impBlockRe = /import\s*\(\s*([\s\S]*?)\)/g;
    let mb;
    while ((mb = impBlockRe.exec(content)) !== null) {
      const block = mb[1];
      const qRe = /"([^"]+)"/g;
      let mq;
      while ((mq = qRe.exec(block)) !== null) imports.push({ from: mq[1], line: lineOf(mb.index), type: "import" });
    }
    const singleImpRe = /^\s*import\s+"([^"]+)"/gm;
    while ((mb = singleImpRe.exec(content)) !== null) imports.push({ from: mb[1], line: lineOf(mb.index), type: "import" });
    const funcRe = /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
    const typeRe = /^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)/gm;
    while ((mb = funcRe.exec(content)) !== null) addSym("function", mb[1], lineOf(mb.index));
    while ((mb = typeRe.exec(content)) !== null) addSym("type", mb[1], lineOf(mb.index));

  } else if (ext === ".rs") {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let mr;
    while ((mr = useRe.exec(content)) !== null) imports.push({ from: mr[1].trim(), line: lineOf(mr.index), type: "use" });
    const fnRe = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    const structRe = /^\s*(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    const enumRe = /^\s*(?:pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    while ((mr = fnRe.exec(content)) !== null) addSym("function", mr[1], lineOf(mr.index));
    while ((mr = structRe.exec(content)) !== null) addSym("struct", mr[1], lineOf(mr.index));
    while ((mr = enumRe.exec(content)) !== null) addSym("enum", mr[1], lineOf(mr.index));

  } else if (ext === ".java" || ext === ".kt" || ext === ".kts") {
    const impRe = /^\s*import\s+([A-Za-z0-9_. *]+);/gm;
    let mj;
    while ((mj = impRe.exec(content)) !== null) imports.push({ from: mj[1].trim(), line: lineOf(mj.index), type: "import" });
    const classRe = /(?:public\s+)?(?:class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    const methRe = /(?:public|private|protected)\s+(?:static\s+)?\w+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    while ((mj = classRe.exec(content)) !== null) addSym("class", mj[1], lineOf(mj.index));
    while ((mj = methRe.exec(content)) !== null) addSym("function", mj[1], lineOf(mj.index));

  } else if (ext === ".php") {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let mp;
    while ((mp = useRe.exec(content)) !== null) imports.push({ from: mp[1].trim(), line: lineOf(mp.index), type: "use" });
    const funcRe = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    const classRe = /class\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((mp = funcRe.exec(content)) !== null) addSym("function", mp[1], lineOf(mp.index));
    while ((mp = classRe.exec(content)) !== null) addSym("class", mp[1], lineOf(mp.index));

  } else if (ext === ".rb") {
    const reqRe = /^\s*(?:require|require_relative)\s+['"]([^'"]+)['"]/gm;
    let mr2;
    while ((mr2 = reqRe.exec(content)) !== null) imports.push({ from: mr2[1], line: lineOf(mr2.index), type: "require" });
    const defRe = /^\s*def\s+([A-Za-z_][A-Za-z0-9_!?]*)/gm;
    const clsRe = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
    while ((mr2 = defRe.exec(content)) !== null) addSym("function", mr2[1], lineOf(mr2.index));
    while ((mr2 = clsRe.exec(content)) !== null) addSym("class", mr2[1], lineOf(mr2.index));

  } else if (ext === ".cs") {
    const usingRe = /^\s*using\s+([^;]+);/gm;
    let mc;
    while ((mc = usingRe.exec(content)) !== null) imports.push({ from: mc[1].trim(), line: lineOf(mc.index), type: "using" });
    const classRe = /class\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((mc = classRe.exec(content)) !== null) addSym("class", mc[1], lineOf(mc.index));

  } else if (ext === ".dart" || ext === ".swift" || ext === ".ex" || ext === ".exs") {
    // generic: look for import/use/alias
    const imRe = /^\s*(?:import|use|alias)\s+([A-Za-z0-9_.\/]+)/gm;
    let mg;
    while ((mg = imRe.exec(content)) !== null) imports.push({ from: mg[1], line: lineOf(mg.index), type: "import" });
    const defRe2 = /(?:func|def|fn|class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((mg = defRe2.exec(content)) !== null) addSym("function", mg[1], lineOf(mg.index));
  } else {
    // fallback: very generic function-ish
    const genRe = /(?:function|def|func|fn)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    let mg;
    while ((mg = genRe.exec(content)) !== null) addSym("function", mg[1], lineOf(mg.index));
  }

  // hash for change detection
  const hash = crypto.createHash("sha1").update(content).digest("hex").slice(0, 12);

  return { rel, abs, ext, lines, symbols, imports, exports, hash };
}

// ──────────────────────────────────────────────────────────────
// Modules heuristics
// ──────────────────────────────────────────────────────────────
function buildModules(nodes, edges) {
  const dirToFiles = new Map();
  for (const n of nodes) {
    let domain = "root";
    const parts = n.file.split("/");
    if (parts.length === 1) {
      domain = "root";
    } else if (parts.length >= 2) {
      const top = parts[0];
      const sec = parts[1];
      if (["src", "app", "lib", "packages", "apps"].includes(top)) {
        domain = sec || top;
        // special: src/features/auth -> auth
        if (top === "src" && parts[2] && ["features", "modules", "domains", "components", "routes"].includes(sec)) {
          domain = parts[2];
        }
        if (top === "packages" || top === "apps") domain = sec;
      } else {
        domain = top;
      }
    } else {
      domain = parts[0] || "root";
    }
    // normalize
    domain = domain.replace(/[^A-Za-z0-9_-]/g, "_") || "root";
    if (!dirToFiles.has(domain)) dirToFiles.set(domain, []);
    dirToFiles.get(domain).push(n.file);
  }

  const modules = [];
  for (const [name, files] of dirToFiles.entries()) {
    // deps: union of edges where from in module and to outside
    const fileSet = new Set(files);
    const deps = new Set();
    for (const e of edges) {
      if (fileSet.has(e.from) && !fileSet.has(e.to)) {
        // to module
        const toMod = [...dirToFiles.entries()].find(([_, fs]) => fs.includes(e.to))?.[0];
        if (toMod && toMod !== name) deps.add(toMod);
      }
    }
    modules.push({
      name,
      files: [...new Set(files)].sort(),
      fileCount: files.length,
      dependencies: [...deps].sort(),
      entry: files.sort((a, b) => a.length - b.length)[0] || null,
    });
  }
  // sort by fileCount desc
  modules.sort((a, b) => b.fileCount - a.fileCount);
  return modules;
}

// ──────────────────────────────────────────────────────────────
// PageRank-ish ranking (inbound count)
// ──────────────────────────────────────────────────────────────
function rankFiles(nodes, edges) {
  const inbound = new Map();
  for (const n of nodes) inbound.set(n.file, 0);
  for (const e of edges) {
    inbound.set(e.to, (inbound.get(e.to) || 0) + 1);
  }
  // score = inbound*3 + symbols*0.5 + lines*0.01
  const ranked = nodes.map((n) => {
    const ib = inbound.get(n.file) || 0;
    const score = ib * 3 + n.symbols.length * 0.5 + n.lines * 0.01;
    return { ...n, inbound: ib, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ──────────────────────────────────────────────────────────────
// Context.md generation
// ──────────────────────────────────────────────────────────────
function generateContextMd(ranked, techstack, modules, manifest) {
  const lines = [];
  lines.push(`# Ryme Context Graph — Repo Map`);
  lines.push(``);
  lines.push(`> Generated ${manifest.generatedAt} · ${manifest.fileCount} files · ${manifest.symbolCount} symbols · ${manifest.edgeCount} edges · primary: ${techstack.primary}`);
  lines.push(`> Tech: ${(techstack.frameworks || []).join(", ") || "generic"} · ORM: ${(techstack.orm || []).join(", ") || "none"} · Infra: ${(techstack.infra || []).join(", ") || "none"}`);
  lines.push(`> Read this file FIRST before any code task. Do not grep blind — query .ryme-skill/graph/nodes.json & edges.json instead.`);
  lines.push(``);
  lines.push(`## How to use`);
  lines.push(`- Search symbols: \`node scripts/ryme-graph.mjs --query "auth"\``);
  lines.push(`- Who calls X: \`node scripts/ryme-graph.mjs --callers "verify_token"\``);
  lines.push(`- Imports for a slice: \`node scripts/ryme-graph.mjs --imports "src/api/*"\``);
  lines.push(`- File details: \`node scripts/ryme-graph.mjs --path "src/auth/middleware.ts"\``);
  lines.push(`- After edits: \`node scripts/ryme-graph.mjs --update\``);
  lines.push(``);
  lines.push(`## Modules (${modules.length})`);
  for (const m of modules.slice(0, 20)) {
    lines.push(`- **${m.name}** — ${m.fileCount} files, deps: ${m.dependencies.join(", ") || "none"} — e.g. \`${m.entry}\``);
  }
  if (modules.length > 20) lines.push(`- … and ${modules.length - 20} more (see modules.json)`);
  lines.push(``);
  lines.push(`## Top-ranked files (PageRank by import fan-in)`);
  lines.push(``);
  let tokenEst = lines.join("\n").length / 4; // approx tokens
  for (const n of ranked) {
    if (tokenEst > CONTEXT_BUDGET_TOKENS) break;
    const symNames = n.symbols.slice(0, 6).map((s) => `${s.kind}:${s.name}`).join(", ");
    const imp = n.imports.slice(0, 3).map((i) => i.from).join(", ");
    const line = `- \`${n.file}\` — ${n.lines} LOC, ${n.symbols.length} syms, fan-in ${n.inbound} — ${symNames || "no exports"}${imp ? ` — imports: ${imp}` : ""}`;
    lines.push(line);
    tokenEst += line.length / 4;
  }
  lines.push(``);
  lines.push(`## Conventions`);
  lines.push(`- Import boundaries: check modules.json dependencies before cross-module imports`);
  lines.push(`- Reuse before create: grep nodes.json for existing util before writing a new one`);
  lines.push(`- Update graph after edits: --update`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Full graph: nodes.json (${manifest.symbolCount} symbols), edges.json (${manifest.edgeCount} edges). Query, don't brute-force read.*`);
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────
// Graph build
// ──────────────────────────────────────────────────────────────
function buildGraph(root, files, techstack) {
  const start = Date.now();
  const nodes = [];
  const edges = [];
  let totalSymbols = 0;

  for (const f of files) {
    let content;
    try {
      content = fs.readFileSync(f.abs, "utf8");
    } catch { continue; }
    // skip binary-ish: contains null bytes
    if (content.includes("\0")) continue;
    const parsed = parseFile(f.rel, f.abs, f.ext, content);
    totalSymbols += parsed.symbols.length;
    nodes.push({
      file: parsed.rel,
      ext: parsed.ext,
      lines: parsed.lines,
      hash: parsed.hash,
      symbols: parsed.symbols,
      imports: parsed.imports,
      exports: parsed.exports,
    });
    // edges from imports: resolve to file if possible (best effort)
    for (const im of parsed.imports) {
      // normalize: only map relative imports to files
      let to = im.from;
      // try to resolve relative import to actual file
      if (to.startsWith(".") || to.startsWith("/")) {
        const baseDir = path.dirname(f.rel);
        let candidate = path.normalize(path.join(baseDir, to)).replace(/\\/g, "/");
        // try adding extensions
        const tries = [candidate, candidate + ".ts", candidate + ".js", candidate + ".tsx", candidate + ".jsx", candidate + "/index.ts", candidate + "/index.js"];
        const found = tries.find((t) => nodes.some((n) => n.file === t) || files.some((x) => x.rel === t));
        // fallback: keep original
        if (found) to = found;
      }
      edges.push({
        from: f.rel,
        to,
        kind: im.type === "use" ? "use" : im.type === "require" ? "require" : "import",
        line: im.line,
      });
    }
  }

  // resolve import edges that point to internal files: map alias @/, ~/ etc
  // For non-relative imports like "react" keep as external edge but mark
  // We keep all edges; consumer can filter external by !filesHas(to)

  const modules = buildModules(nodes, edges);
  const ranked = rankFiles(nodes, edges);

  const manifest = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    root: path.relative(process.cwd(), root) || ".",
    fileCount: nodes.length,
    symbolCount: totalSymbols,
    edgeCount: edges.length,
    moduleCount: modules.length,
    techstackPrimary: techstack.primary,
    durationMs: Date.now() - start,
  };

  return { nodes, edges, modules, ranked, manifest, techstack };
}

function writeGraph(outDir, graph) {
  fs.mkdirSync(outDir, { recursive: true });
  const { nodes, edges, modules, ranked, manifest, techstack } = graph;

  const writeJson = (name, data) => {
    const p = path.join(outDir, name);
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, p);
  };

  writeJson("manifest.json", manifest);
  writeJson("techstack.json", techstack);
  writeJson("nodes.json", nodes);
  writeJson("edges.json", edges);
  writeJson("modules.json", modules);
  writeJson("ranked.json", ranked.map((r) => ({ file: r.file, score: Math.round(r.score * 100) / 100, inbound: r.inbound, lines: r.lines, symbolCount: r.symbols.length })));

  const ctx = generateContextMd(ranked, techstack, modules, manifest);
  fs.writeFileSync(path.join(outDir, "context.md"), ctx, "utf8");

  // impact.json for refract: coupling + orphan hints
  const fileToInbound = new Map();
  for (const n of nodes) fileToInbound.set(n.file, 0);
  for (const e of edges) if (fileToInbound.has(e.to)) fileToInbound.set(e.to, fileToInbound.get(e.to) + 1);
  const orphans = [...fileToInbound.entries()].filter(([, v]) => v === 0).map(([k]) => k).slice(0, 100);
  const maxInbound = Math.max(0, ...[...fileToInbound.values()]);
  const hubs = [...fileToInbound.entries()].filter(([, v]) => v >= Math.max(3, maxInbound * 0.5)).map(([k, v]) => ({ file: k, inbound: v })).sort((a, b) => b.inbound - a.inbound).slice(0, 20);
  const impact = {
    generatedAt: manifest.generatedAt,
    orphans,
    hubs,
    mostConnectedModule: modules[0]?.name || null,
    notes: "orphans = zero fan-in (maybe leaf/entry). hubs = high fan-in (change with care).",
  };
  writeJson("impact.json", impact);

  // changelog
  const changelogPath = path.join(outDir, "changelog.md");
  const entry = `- ${manifest.generatedAt} — ${manifest.fileCount} files, ${manifest.symbolCount} syms, ${manifest.edgeCount} edges (${manifest.durationMs}ms)\n`;
  if (fs.existsSync(changelogPath)) {
    fs.appendFileSync(changelogPath, entry, "utf8");
  } else {
    fs.writeFileSync(changelogPath, `# Graph Changelog\n\n` + entry, "utf8");
  }

  // also write .ryme-skill/config.json if not exists
  const configPath = path.resolve(path.dirname(outDir), "config.json");
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const cfg = {
      version: VERSION,
      createdAt: manifest.generatedAt,
      techstack,
      outDir: path.relative(path.resolve("."), outDir) || ".ryme-skill/graph",
      ignore: [...HARD_IGNORE].slice(0, 10),
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  }
}

// ──────────────────────────────────────────────────────────────
// Incremental
// ──────────────────────────────────────────────────────────────
function incrementalUpdate(root, outDir) {
  const manifestPath = path.join(outDir, "manifest.json");
  const nodesPath = path.join(outDir, "nodes.json");
  if (!fs.existsSync(manifestPath) || !fs.existsSync(nodesPath)) {
    console.log("No existing graph — running full --init");
    return fullInit(root, outDir);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const last = new Date(manifest.generatedAt).getTime();
  // check which files changed since last
  const gitignore = loadGitignore(root);
  const files = walk(root, gitignore);
  const existingNodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const existingByFile = new Map(existingNodes.map((n) => [n.file, n]));

  let changed = 0;
  const freshNodes = [];
  for (const f of files) {
    let mtime = 0;
    try { mtime = fs.statSync(f.abs).mtimeMs; } catch { continue; }
    const existing = existingByFile.get(f.rel);
    // if file is new or mtime newer than manifest, re-parse
    // also check hash fallback
    if (!existing || mtime > last) {
      let content;
      try { content = fs.readFileSync(f.abs, "utf8"); } catch { continue; }
      if (content.includes("\0")) continue;
      const parsed = parseFile(f.rel, f.abs, f.ext, content);
      if (!existing || existing.hash !== parsed.hash) {
        changed++;
        freshNodes.push({
          file: parsed.rel,
          ext: parsed.ext,
          lines: parsed.lines,
          hash: parsed.hash,
          symbols: parsed.symbols,
          imports: parsed.imports,
          exports: parsed.exports,
        });
      } else {
        freshNodes.push(existing);
      }
    } else {
      freshNodes.push(existing);
    }
  }
  // removed files: those in existing but not in walk
  const walkSet = new Set(files.map((f) => f.rel));
  const retained = freshNodes.filter((n) => walkSet.has(n.file));
  const removed = existingNodes.filter((n) => !walkSet.has(n.file)).length;

  if (changed === 0 && removed === 0) {
    console.log(`Graph up to date — ${retained.length} files, no changes since ${manifest.generatedAt}`);
    return;
  }

  console.log(`Incremental: ${changed} changed, ${removed} removed, ${retained.length} total`);

  // rebuild derived structures from retained nodes (need to re-derive edges & modules)
  // Easiest: reuse buildGraph path but with cached files list? We'll synthesize from retained
  // Rebuild edges from retained nodes imports
  const techstack = JSON.parse(fs.readFileSync(path.join(outDir, "techstack.json"), "utf8"));
  const edges = [];
  for (const n of retained) {
    for (const im of n.imports) {
      edges.push({ from: n.file, to: im.from, kind: im.type === "use" ? "use" : "require", line: im.line });
    }
  }
  const modules = buildModules(retained, edges);
  const ranked = rankFiles(retained, edges);
  const newManifest = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    root: manifest.root,
    fileCount: retained.length,
    symbolCount: retained.reduce((a, n) => a + n.symbols.length, 0),
    edgeCount: edges.length,
    moduleCount: modules.length,
    techstackPrimary: techstack.primary,
    durationMs: 0,
    incremental: true,
    changed,
    removed,
  };
  const graph = { nodes: retained, edges, modules, ranked, manifest: newManifest, techstack };
  writeGraph(outDir, graph);
  console.log(`Updated graph — ${newManifest.fileCount} files, ${newManifest.symbolCount} symbols, ${newManifest.edgeCount} edges`);
}

function fullInit(root, outDir) {
  console.log(`Scanning ${root} ...`);
  const gitignore = loadGitignore(root);
  const files = walk(root, gitignore);
  console.log(`Found ${files.length} candidate files (after ignores)`);
  const techstack = detectTechstack(root, files);
  console.log(`Detected: primary=${techstack.primary} frameworks=[${techstack.frameworks.join(", ") || "none"}] confidence=${techstack.confidence}`);
  const graph = buildGraph(root, files, techstack);
  writeGraph(outDir, graph);
  console.log(`Wrote graph → ${outDir}/  (${graph.manifest.fileCount} files, ${graph.manifest.symbolCount} symbols, ${graph.manifest.edgeCount} edges in ${graph.manifest.durationMs}ms)`);
  console.log(`Context: ${outDir}/context.md  (${Math.round(fs.statSync(path.join(outDir, "context.md")).size / 1024)}KB, PageRank budget ${CONTEXT_BUDGET_TOKENS} tokens)`);
  return graph;
}

// ──────────────────────────────────────────────────────────────
// Query helpers
// ──────────────────────────────────────────────────────────────
function loadGraph(outDir) {
  const nodesPath = path.join(outDir, "nodes.json");
  const edgesPath = path.join(outDir, "edges.json");
  const manifestPath = path.join(outDir, "manifest.json");
  if (!fs.existsSync(nodesPath)) {
    console.error(`No graph at ${outDir}/nodes.json — run --init first`);
    process.exit(1);
  }
  const nodes = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  const edges = fs.existsSync(edgesPath) ? JSON.parse(fs.readFileSync(edgesPath, "utf8")) : [];
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const techstack = fs.existsSync(path.join(outDir, "techstack.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "techstack.json"), "utf8")) : {};
  const modules = fs.existsSync(path.join(outDir, "modules.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "modules.json"), "utf8")) : [];
  return { nodes, edges, manifest, techstack, modules };
}

function query(term, outDir) {
  const { nodes, edges } = loadGraph(outDir);
  const q = term.toLowerCase();
  const hits = [];
  for (const n of nodes) {
    const fileHit = n.file.toLowerCase().includes(q);
    const symHits = n.symbols.filter((s) => s.name.toLowerCase().includes(q));
    if (fileHit || symHits.length) {
      hits.push({
        file: n.file,
        lines: n.lines,
        symbols: symHits.length ? symHits : n.symbols.slice(0, 3),
        imports: n.imports.slice(0, 2),
        score: symHits.length * 10 + (fileHit ? 5 : 0),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, 20);
  if (top.length === 0) {
    console.log(`No hits for "${term}" — try broader term or check graph is fresh (--update).`);
    // also suggest fuzzy: show files with similar token
    return;
  }
  console.log(`# Query: "${term}" — ${hits.length} hits (top ${top.length})\n`);
  for (const h of top) {
    console.log(`- ${h.file}:${h.symbols[0]?.line || 1} — ${h.symbols.map((s) => `${s.kind}:${s.name}`).join(", ")} — ${h.lines} LOC`);
  }
  // also show callers via edges: who imports these files
  const hitFiles = new Set(top.map((h) => h.file));
  const callers = edges.filter((e) => hitFiles.has(e.to) || hitFiles.has(e.to.replace(/\.ts$/, "").replace(/\.js$/, "")));
  if (callers.length) {
    console.log(`\n# Imported by (${Math.min(callers.length, 10)} shown):`);
    for (const c of callers.slice(0, 10)) console.log(`  ${c.from} --${c.kind}--> ${c.to}:${c.line}`);
  }
}

function callersOf(sym, outDir) {
  const { nodes, edges } = loadGraph(outDir);
  const q = sym.toLowerCase();
  // 1) find def files
  const defFiles = nodes.filter((n) => n.symbols.some((s) => s.name.toLowerCase() === q)).map((n) => n.file);
  if (defFiles.length === 0) {
    // fallback: substring
    const sub = nodes.filter((n) => n.symbols.some((s) => s.name.toLowerCase().includes(q))).map((n) => n.file);
    if (sub.length === 0) {
      console.log(`No symbol "${sym}" found. Try --query "${sym}" first.`);
      return;
    }
    console.log(`# Symbol "${sym}" not exact — substring matches in: ${sub.slice(0, 5).join(", ")}`);
    defFiles.push(...sub);
  }
  console.log(`# Def: "${sym}" in ${defFiles.join(", ")}\n`);
  const callers = edges.filter((e) => defFiles.some((d) => e.to.includes(d) || d.includes(e.to) || e.to.toLowerCase().includes(q)));
  // also grep for textual callers
  const textCallers = [];
  for (const n of nodes) {
    if (defFiles.includes(n.file)) continue;
    let content;
    try { content = fs.readFileSync(path.join(resolveRootOut().root, n.file), "utf8"); } catch { continue; }
    if (content.toLowerCase().includes(q)) {
      const lines = content.split("\n");
      const hitLines = lines.map((l, i) => ({ l, i: i + 1 })).filter((x) => x.l.toLowerCase().includes(q)).slice(0, 2);
      textCallers.push({ file: n.file, hits: hitLines });
    }
  }
  console.log(`# Imported by (edges): ${callers.length}`);
  for (const c of callers.slice(0, 15)) console.log(`  ${c.from}:${c.line} -> ${c.to} (${c.kind})`);
  console.log(`\n# Textual callers (grep, top 15):`);
  for (const t of textCallers.slice(0, 15)) {
    console.log(`  ${t.file}: ${t.hits.map((h) => `L${h.i}:${h.l.trim().slice(0, 80)}`).join(" | ")}`);
  }
}

function importsFor(globPat, outDir) {
  const { edges } = loadGraph(outDir);
  const re = globToRegExp(globPat);
  const hits = edges.filter((e) => re.test(e.from) || re.test(e.to));
  console.log(`# Imports matching "${globPat}" — ${hits.length} edges\n`);
  for (const h of hits.slice(0, 30)) console.log(`${h.from}:${h.line} --${h.kind}--> ${h.to}`);
  if (hits.length > 30) console.log(`… +${hits.length - 30} more`);
}

function pathInfo(fileRel, outDir, root) {
  const { nodes, edges } = loadGraph(outDir);
  const n = nodes.find((x) => x.file === fileRel || x.file.endsWith(fileRel));
  if (!n) {
    console.log(`No node for "${fileRel}" — try exact rel path from root. Available prefix matches:`);
    const pref = nodes.filter((x) => x.file.includes(fileRel)).slice(0, 10).map((x) => x.file);
    console.log(pref.join("\n") || "(none)");
    return;
  }
  console.log(`# ${n.file} — ${n.lines} LOC — ${n.symbols.length} symbols\n`);
  for (const s of n.symbols) console.log(`  ${s.kind.padEnd(12)} ${s.name} :${s.line}`);
  console.log(`\n# imports (${n.imports.length}):`);
  for (const im of n.imports) console.log(`  ${im.type} "${im.from}" :${im.line}`);
  console.log(`\n# imported by (${edges.filter((e) => e.to === n.file).length}):`);
  for (const e of edges.filter((e) => e.to === n.file).slice(0, 10)) console.log(`  ${e.from}:${e.line}`);
  console.log(`\n# exports: ${n.exports.join(", ") || "(none inferred)"}`);
  // show content snippet for empty symbols?
  if (n.symbols.length === 0) {
    try {
      const content = fs.readFileSync(path.join(root, n.file), "utf8");
      console.log(`\n# first 40 lines (no symbols extracted):\n${content.split("\n").slice(0, 40).join("\n")}`);
    } catch {}
  }
}

function stats(outDir) {
  const { manifest, nodes, edges } = loadGraph(outDir);
  const tech = fs.existsSync(path.join(outDir, "techstack.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "techstack.json"), "utf8")) : {};
  console.log(JSON.stringify({ manifest, techstack: tech, counts: { nodes: nodes.length, edges: edges.length } }, null, 2));
}

function verify(outDir) {
  const { nodes, edges, manifest } = loadGraph(outDir);
  const fileSet = new Set(nodes.map((n) => n.file));
  const issues = [];

  // orphans
  const inbound = new Map();
  for (const n of nodes) inbound.set(n.file, 0);
  for (const e of edges) if (inbound.has(e.to)) inbound.set(e.to, inbound.get(e.to) + 1);
  const orphans = [...inbound.entries()].filter(([, v]) => v === 0).map(([k]) => k);
  if (orphans.length > nodes.length * 0.6) issues.push(`High orphan ratio: ${orphans.length}/${nodes.length} files have zero fan-in (maybe many leaves or missing edges)`);

  // duplicate symbol names
  const nameCounts = new Map();
  for (const n of nodes) for (const s of n.symbols) nameCounts.set(s.name, (nameCounts.get(s.name) || 0) + 1);
  const dups = [...nameCounts.entries()].filter(([, v]) => v > 5).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (dups.length) issues.push(`Duplicate-heavy names: ${dups.map(([k, v]) => `${k} x${v}`).join(", ")} — consider dedup`);

  // huge files
  const huge = nodes.filter((n) => n.lines > 800).sort((a, b) => b.lines - a.lines).slice(0, 3);
  if (huge.length) issues.push(`Huge files (>800 LOC): ${huge.map((h) => `${h.file}:${h.lines}`).join(", ")} — candidate to split`);

  // missing edges for JS/TS barrel files?
  const noSym = nodes.filter((n) => n.symbols.length === 0 && n.lines > 30).length;
  if (noSym > nodes.length * 0.4) issues.push(`Many files with no symbols extracted (${noSym}) — parser coverage may be low; check fallback`);

  // staleness
  const ageMs = Date.now() - new Date(manifest.generatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > 7) issues.push(`Graph stale: ${Math.floor(ageDays)} days since ${manifest.generatedAt} — run --update`);

  console.log(`# Verify — ${nodes.length} files, ${edges.length} edges\n`);
  console.log(`Manifest: ${manifest.generatedAt} · ${manifest.fileCount} files · ${manifest.symbolCount} syms`);
  console.log(`Orphans: ${orphans.length} — ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? ` +${orphans.length - 5} more` : ""}`);
  console.log(`Dups: ${dups.length ? dups.map(([k, v]) => `${k} x${v}`).join(", ") : "none alarming"}`);
  console.log(`Huge: ${huge.length ? huge.map((h) => `${h.file}:${h.lines}`).join(", ") : "none"}`);
  console.log(`No-sym files: ${noSym}`);
  if (issues.length) {
    console.log(`\n# Issues (${issues.length}):`);
    for (const iss of issues) console.log(`  • ${iss}`);
  } else {
    console.log(`\n# Healthy — no major issues`);
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
async function main() {
  if (has("--help") || args.length === 0) {
    help();
    return;
  }
  const { root, out } = resolveRootOut();

  if (has("--detect") || has("--techstack")) {
    const gitignore = loadGitignore(root);
    const files = walk(root, gitignore);
    const tech = detectTechstack(root, files);
    console.log(JSON.stringify(tech, null, 2));
    return;
  }
  if (has("--init") || has("--full")) {
    fullInit(root, out);
    return;
  }
  if (has("--update") || has("--incremental")) {
    incrementalUpdate(root, out);
    return;
  }
  if (has("--stats")) {
    stats(out);
    return;
  }
  if (has("--verify")) {
    verify(out);
    return;
  }
  if (has("--query")) {
    const term = get("--query", "");
    if (!term) { console.error("--query requires a term"); process.exit(1); }
    query(term, out);
    return;
  }
  if (has("--callers")) {
    const sym = get("--callers", "");
    if (!sym) { console.error("--callers requires a symbol"); process.exit(1); }
    callersOf(sym, out);
    return;
  }
  if (has("--imports")) {
    const pat = get("--imports", "");
    if (!pat) { console.error("--imports requires a glob"); process.exit(1); }
    importsFor(pat, out);
    return;
  }
  if (has("--path")) {
    const p = get("--path", "");
    if (!p) { console.error("--path requires a file path"); process.exit(1); }
    pathInfo(p, out, root);
    return;
  }

  console.error(`Unknown args: ${args.join(" ")}`);
  help();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
