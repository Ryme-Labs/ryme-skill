# Feature — Canonical 8 Questions

Copy-pasted from `feature/SKILL.md` for reference. Each question has a Recommended option that cites graph + web.

| # | Question | What you recommend with |
|---|----------|------------------------|
| 1 | **Goal** — What does the user gain, as a completed action? | Concrete user story; cite fan-in if it hinges on existing infra |
| 2 | **Resources** — What existing resources will it reuse/extend? | `--query` hits + `modules.json` owner |
| 3 | **Behavior** — Walk through a happy-path flow + error branches | Route/handler patterns from `nodes.json` |
| 4 | **Scope / Non-Goals** — What is explicitly OUT of V1? | Tight V1 vs V2 split |
| 5 | **Dependencies** — Which modules/services/external APIs does it touch? | `modules.json` deps + `edges.json` fan-in |
| 6 | **Data & Schema** — What is stored, related to what? | Existing `schema.prisma` / migrations |
| 7 | **Acceptance** — Demo script + minimum automated check? | Two-browser demo + integration test |
| 8 | **Rollout** — Perf budget, scale, flags, rollout? | Web source for external service limits |

Build adds B1–B3: **Stack, Auth, Data+Deploy** before these 8.

Template for each question's brief:

```
D<N> — <Question title>
Recommended: A) ... because <graph file:line or web link>
Why it matters: <one line>
Options:
  A) <recommended> ✅ pro (≥40 chars) ✅ pro ❌ con
  B) <alt>         ✅ ... ❌ ...
  C) <alt>         ✅ ... ❌ ...
```

Store answers and synthesize `.ryme-skill/specs/<slug>.md` per `feature/SKILL.md` Phase 3.
