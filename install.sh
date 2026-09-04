#!/usr/bin/env bash
set -euo pipefail

# Ryme Context Graph — installer
# Usage:
#   ./install.sh              # local: symlinks into .claude/skills + .agents/skills, registers opencode path hint
#   ./install.sh --global     # global: copies into ~/.config/opencode/skills/*

ROOT="$(cd "$(dirname "$0")" && pwd)"
# Graph is ALWAYS in the working directory (project root), not in the skill dir.
# All --out paths are "$WORK_ROOT/.ryme-skill/graph" where WORK_ROOT is `git rev-parse --show-toplevel` or pwd.
GLOBAL=0
if [[ "${1:-}" == "--global" ]]; then GLOBAL=1; fi

echo "Ryme Context Graph — install (ROOT=$ROOT GLOBAL=$GLOBAL)"

# ── local (repo) mode: symlinks for Claude/Cursor/Agents ──
install_local() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  echo "Repo root: $repo_root"

  # ensure we're inside repo_root or use ROOT's parent if ROOT is inside repo
  mkdir -p "$repo_root/.claude/skills" "$repo_root/.agents/skills" "$repo_root/.cursor/skills" "$repo_root/.windsurf/skills" "$repo_root/.opencode/skills" "$repo_root/.codex/skills" 2>/dev/null || true

  # guard: don't self-link when running inside the skill repo itself
  if [[ "$repo_root" == "$ROOT" ]]; then
    echo "You are inside the skill source ($ROOT) — skipping local symlink self-install."
    echo "To install globally: bash $ROOT/install.sh --global"
    echo "To install into a project: bash $ROOT/install.sh  (run from the TARGET project dir, or set repo_root manually)"
    echo "Example: (cd /path/to/my-project && bash $ROOT/install.sh)"
    return 0
  fi

  for skill in graphcontext feature build refract refactor refractor ryme-context-graph; do
    SRC="$ROOT"
    [[ "$skill" != "ryme-context-graph" ]] && SRC="$ROOT/$skill"
    # refract/refactor/refractor share same source — canonical is refract
    if [[ "$skill" == "refactor" || "$skill" == "refractor" ]]; then SRC="$ROOT/refract"; fi
    for dest in "$repo_root/.claude/skills/$skill" "$repo_root/.agents/skills/$skill" "$repo_root/.cursor/skills/$skill" "$repo_root/.windsurf/skills/$skill" "$repo_root/.opencode/skills/$skill" "$repo_root/.codex/skills/$skill"; do
      mkdir -p "$(dirname "$dest")"
      if [[ -L "$dest" || -d "$dest" ]]; then rm -rf "$dest"; fi
      ln -sf "$SRC" "$dest"
      echo "  linked $dest -> $SRC"
    done
  done

  # opencode: add skills path hint (don't overwrite)
  if [[ -f "$repo_root/opencode.jsonc" ]]; then
    echo "opencode.jsonc exists — add manually:"
    echo '  "skills": { "paths": ["./.ryme-skills"] }  // or ["./ryme-skills"] depending on where you cloned'
  elif [[ -f "$repo_root/opencode.json" ]]; then
    echo "opencode.json exists — add manually: \"skills\": { \"paths\": [\"./.ryme-skills\"] }"
  else
    echo "No opencode.json(c) — OpenCode will also discover via .claude/skills and .agents/skills if configured for external skills"
  fi

  # expose indexer on PATH via .ryme-skills alias
  if [[ ! -d "$repo_root/.ryme-skills" && "$ROOT" != "$repo_root/.ryme-skills" && "$ROOT" != "$repo_root/ryme-skills" ]]; then
    echo "Tip: copy or symlink the skill dir into your repo:"
    echo "  cp -r $ROOT $repo_root/.ryme-skills"
  fi

  echo ""
  echo "Local install done. Next:"
  echo "  node $ROOT/scripts/ryme-graph.mjs --init --root $repo_root --out $repo_root/.ryme-skill/graph"
}

install_global() {
  local base="$HOME/.config/opencode/skills"
  mkdir -p "$base"
  for skill in ryme-context-graph graphcontext feature build refract; do
    local src
    if [[ "$skill" == "ryme-context-graph" ]]; then src="$ROOT"; else src="$ROOT/$skill"; fi
    local dest="$base/$skill"
    echo "Installing $skill -> $dest"
    rm -rf "$dest"
    cp -r "$src" "$dest"
    # for main skill, strip nested subskill dirs that were copied from ROOT (they duplicate top-level skills)
    if [[ "$skill" == "ryme-context-graph" ]]; then
      rm -rf "$dest/graphcontext" "$dest/feature" "$dest/build" "$dest/refract" "$dest/refactor" "$dest/refractor"
    fi
    # ensure SKILL.md is present
    if [[ ! -f "$dest/SKILL.md" ]]; then echo "WARN: $dest missing SKILL.md"; fi
  done
  # also copy scripts into each dest? global ryme-context-graph already has them
  mkdir -p "$base/ryme-context-graph/scripts"
  cp -r "$ROOT/scripts"/* "$base/ryme-context-graph/scripts/" 2>/dev/null || true
  for skill in graphcontext feature build refract; do
    mkdir -p "$base/$skill/scripts"
    cp "$ROOT/scripts/ryme-graph.mjs" "$base/$skill/scripts/" 2>/dev/null || true
    cp "$ROOT/scripts/mcp-server.mjs" "$base/$skill/scripts/" 2>/dev/null || true
  done
  # refractor/refactor alias dirs — ensure they exist for older global installs
  for alias in refactor refractor; do
    mkdir -p "$base/$alias/scripts"
    cp "$ROOT/scripts/ryme-graph.mjs" "$base/$alias/scripts/" 2>/dev/null || true
    cp "$ROOT/scripts/mcp-server.mjs" "$base/$alias/scripts/" 2>/dev/null || true
    # copy SKILL.md from canonical refract so alias has correct name
    if [[ -f "$ROOT/$alias/SKILL.md" ]]; then cp "$ROOT/$alias/SKILL.md" "$base/$alias/SKILL.md" 2>/dev/null || true
    else cp "$ROOT/refract/SKILL.md" "$base/$alias/SKILL.md" 2>/dev/null; sed -i "s/name: refract/name: $alias/" "$base/$alias/SKILL.md" 2>/dev/null || true
    fi
  done

  # Claude + universal global
  mkdir -p "$HOME/.claude/skills" "$HOME/.agents/skills" "$HOME/.cursor/skills" "$HOME/.windsurf/skills" "$HOME/.codex/skills" "$HOME/.opencode/skills" 2>/dev/null || true
  for skill in graphcontext feature build refract refactor refractor; do
    SRC="$base/$skill"
    if [[ "$skill" == "refactor" || "$skill" == "refractor" ]]; then SRC="$base/refract"; fi
    for d in "$HOME/.claude/skills/$skill" "$HOME/.agents/skills/$skill" "$HOME/.cursor/skills/$skill" "$HOME/.windsurf/skills/$skill" "$HOME/.codex/skills/$skill" "$HOME/.opencode/skills/$skill"; do
      ln -sf "$SRC" "$d" 2>/dev/null || true
    done
    echo "  linked $skill -> global"
  done
  for d in "$HOME/.claude/skills/ryme-context-graph" "$HOME/.agents/skills/ryme-context-graph" "$HOME/.cursor/skills/ryme-context-graph" "$HOME/.windsurf/skills/ryme-context-graph" "$HOME/.codex/skills/ryme-context-graph" "$HOME/.opencode/skills/ryme-context-graph"; do
    ln -sf "$base/ryme-context-graph" "$d" 2>/dev/null || true
  done

  echo ""
  echo "Global install done. Skills available as:"
  echo "  ryme-context-graph, graphcontext, feature, build, refract (+ aliases: refactor, refractor)"
  echo "All skills run in agentic loops: they spawn parallel subagents and iterate until green."
  echo "Restart your agent (OpenCode / Claude Code) to pick them up."
  echo "Test:"
  echo "  node $base/ryme-context-graph/scripts/ryme-graph.mjs --help"
}

if [[ $GLOBAL -eq 1 ]]; then
  install_global
  # also update local if this project already has a local install (symlink or copy exists)
  _cur_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  if [ -d "$_cur_root/.claude/skills/graphcontext" ] || [ -d "$_cur_root/.agents/skills/graphcontext" ] || [ -d "$_cur_root/.ryme-skills" ] || [ -d "$_cur_root/ryme-skills" ]; then
    echo ""
    echo "Detected existing local install in $_cur_root — updating it as well..."
    install_local
  fi
else
  install_local
  # also update global if it already exists (so both stay in sync)
  if [ -d "$HOME/.config/opencode/skills/ryme-context-graph" ] || [ -d "$HOME/.config/opencode/skills/graphcontext" ]; then
    echo ""
    echo "Detected existing global install — updating it as well..."
    install_global
  fi
fi
