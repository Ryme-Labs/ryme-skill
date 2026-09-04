#!/usr/bin/env node
/**
 * Ryme Context Graph — MCP Server (optional)
 * Exposes the file-based graph as MCP tools for agents that prefer MCP over file reads.
 * Zero mandatory: the file-based protocol in SKILL.md always works without this.
 *
 * Tools:
 *   - query_graph({ q, limit })            → search symbols/files
 *   - get_node({ file })                    → symbols + imports for one file
 *   - get_callers({ symbol })               → who imports/calls symbol
 *   - get_neighbors({ file, direction })    → import fan-in/out
 *   - get_modules()                         → domain map
 *   - shortest_path({ from, to })           → import path between files
 *   - get_stats()                           → manifest + counts
 *
 * Usage (stdio):
 *   node scripts/mcp-server.mjs --root . --out .ryme-skill/graph
 *
 * Add to Claude Code / Cursor MCP config:
 * {
 *   "mcpServers": {
 *     "ryme-graph": {
 *       "command": "node",
 *       "args": ["./ryme-skills/scripts/mcp-server.mjs", "--root", ".", "--out", ".ryme-skill/graph"]
 *     }
 *   }
 * }
 */

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const get = (k, def) => {
  const i = args.indexOf(k);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const ROOT = path.resolve(get("--root", process.env.RYME_ROOT || "."));
const OUT = path.resolve(ROOT, get("--out", process.env.RYME_OUT || ".ryme-skill/graph"));

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function loadGraph() {
  const nodes = loadJson(path.join(OUT, "nodes.json"), []);
  const edges = loadJson(path.join(OUT, "edges.json"), []);
  const manifest = loadJson(path.join(OUT, "manifest.json"), {});
  const modules = loadJson(path.join(OUT, "modules.json"), []);
  const techstack = loadJson(path.join(OUT, "techstack.json"), {});
  return { nodes, edges, manifest, modules, techstack };
}

// Minimal MCP JSON-RPC over stdio (no deps)
// Implements initialize, tools/list, tools/call

const TOOLS = [
  {
    name: "query_graph",
    description: "Search symbols/files by name or intent (e.g. 'auth', 'verify_token'). Returns top hits with file:line.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string", description: "search term" }, limit: { type: "number", description: "max hits", default: 20 } },
      required: ["q"],
    },
  },
  {
    name: "get_node",
    description: "Get symbols + imports for one file (rel path, e.g. 'src/auth/middleware.ts').",
    inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] },
  },
  {
    name: "get_callers",
    description: "Who imports/calls a symbol (exact name, e.g. 'verify_token'). Returns import edges + textual hits.",
    inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
  },
  {
    name: "get_neighbors",
    description: "Import fan-in/out for a file. direction: 'in' (who imports this) | 'out' (what it imports) | 'both'.",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string" }, direction: { type: "string", enum: ["in", "out", "both"], default: "both" } },
      required: ["file"],
    },
  },
  {
    name: "get_modules",
    description: "Domain/module map — which files belong to which domain and their dependencies.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "shortest_path",
    description: "Shortest import path between two files (BFS on edges). Returns file chain or null if disconnected.",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
  {
    name: "get_stats",
    description: "Graph stats — manifest, techstack, counts.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

function toolQueryGraph(q, limit = 20) {
  const { nodes, edges } = loadGraph();
  const query = String(q || "").toLowerCase();
  const hits = [];
  for (const n of nodes) {
    const fileHit = n.file.toLowerCase().includes(query);
    const symHits = n.symbols.filter((s) => s.name.toLowerCase().includes(query));
    if (fileHit || symHits.length) {
      hits.push({
        file: n.file,
        lines: n.lines,
        symbols: symHits.length ? symHits.slice(0, 5) : n.symbols.slice(0, 3),
        imports: n.imports.slice(0, 2),
        score: symHits.length * 10 + (fileHit ? 5 : 0),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function toolGetNode(file) {
  const { nodes, edges } = loadGraph();
  const n = nodes.find((x) => x.file === file || x.file.endsWith(file));
  if (!n) return { error: `No node for "${file}"` };
  const importedBy = edges.filter((e) => e.to === n.file).map((e) => `${e.from}:${e.line}`);
  return { ...n, importedBy: importedBy.slice(0, 20) };
}

function toolGetCallers(symbol) {
  const { nodes, edges } = loadGraph();
  const q = String(symbol).toLowerCase();
  const defFiles = nodes.filter((n) => n.symbols.some((s) => s.name.toLowerCase() === q)).map((n) => n.file);
  const edgesCallers = edges.filter((e) => defFiles.some((d) => e.to.includes(d) || d.includes(e.to)));
  const textCallers = [];
  for (const n of nodes) {
    if (defFiles.includes(n.file)) continue;
    try {
      const content = fs.readFileSync(path.join(ROOT, n.file), "utf8");
      if (content.toLowerCase().includes(q)) textCallers.push(n.file);
    } catch {}
    if (textCallers.length >= 20) break;
  }
  return { defFiles, importCallers: edgesCallers.slice(0, 20), textCallers: textCallers.slice(0, 20) };
}

function toolGetNeighbors(file, direction = "both") {
  const { edges } = loadGraph();
  const out = edges.filter((e) => e.from === file);
  const inn = edges.filter((e) => e.to === file);
  if (direction === "out") return { file, out, in: [] };
  if (direction === "in") return { file, out: [], in: inn };
  return { file, out, in: inn };
}

function toolShortestPath(from, to) {
  const { edges } = loadGraph();
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === to) return { path, length: path.length - 1 };
    for (const nb of adj.get(last) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push([...path, nb]);
      }
    }
  }
  return { path: null, length: -1, note: "disconnected" };
}

// ── JSON-RPC loop ──
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg);
  }
});

function reply(id, result, error) {
  const payload = { jsonrpc: "2.0", id };
  if (error) payload.error = error;
  else payload.result = result;
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "ryme-context-graph", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    try {
      let data;
      switch (name) {
        case "query_graph": data = toolQueryGraph(args.q, args.limit); break;
        case "get_node": data = toolGetNode(args.file); break;
        case "get_callers": data = toolGetCallers(args.symbol); break;
        case "get_neighbors": data = toolGetNeighbors(args.file, args.direction); break;
        case "get_modules": data = loadGraph().modules; break;
        case "shortest_path": data = toolShortestPath(args.from, args.to); break;
        case "get_stats": {
          const g = loadGraph();
          data = { manifest: g.manifest, techstack: g.techstack, counts: { nodes: g.nodes.length, edges: g.edges.length, modules: g.modules.length } };
          break;
        }
        default: reply(id, null, { code: -32601, message: `unknown tool ${name}` }); return;
      }
      reply(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      reply(id, null, { code: -32000, message: String(e?.message || e) });
    }
    return;
  }
  if (method === "ping") { reply(id, {}); return; }
  reply(id, null, { code: -32601, message: `unknown method ${method}` });
}

// If invoked without MCP (direct run), show help
if (process.stdin.isTTY) {
  console.log(`Ryme MCP server — graph at ${OUT}`);
  console.log(`Tools: ${TOOLS.map((t) => t.name).join(", ")}`);
  console.log(`Run via MCP stdio: node ${process.argv[1]} --root . --out .ryme-skill/graph`);
}
