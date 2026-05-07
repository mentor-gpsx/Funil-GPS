---
name: funil-gps Repo Layout & WIP State
description: Multi-package ERP repo with heavy untracked legacy state — selective staging is mandatory
type: project
---

`mentor-gpsx/Funil-GPS` is a multi-tenant ERP being built up via story-driven development. Active package layout:
- `packages/backend/` — NestJS ERP API (auth, journal, COA, billing modules)
- `packages/frontend/` — React UI (auth components, hooks)
- `packages/db/migrations/` — SQL migrations (001-005 so far)
- `supabase/migrations/` — separate Supabase migrations
- `docs/stories/` — Story 1.1, 1.2, 1.3, 1.4, 1.5, 2.1 in flight
- `docs/qa/gates/` — QA gate YAMLs

**Why:** The repo root has ~80+ untracked legacy files (cakto integration, audit dashboards, financial-system HTMLs, README variants, .bat scripts) that predate the ERP rewrite. They are NOT part of the new ERP work and must NOT be swept into Story commits.

**How to apply:** When committing for any Story X.Y, scope `git add` to exactly the paths in the story's File List section. Resist any urge to `git add packages/` or similar broad globs — even those have stale WIP. Use `git diff --cached --name-only | wc -l` to verify the staged count matches what the story declared before committing.
