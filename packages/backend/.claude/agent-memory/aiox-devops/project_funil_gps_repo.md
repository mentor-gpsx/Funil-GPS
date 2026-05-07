---
name: Funil-GPS repo layout & push policy
description: Repo location, remote, push convention, and Story 1.x commit pattern for the Funil-GPS ERP backend
type: project
---

Funil-GPS ERP backend monorepo at `C:\Users\venda\Documents\funil-gps`.

- **Remote:** `https://github.com/mentor-gpsx/Funil-GPS.git`
- **Branch:** `main` (single-branch flow, no feature branches in this project)
- **Push command:** `git push -f origin main` (Vercel-deployed; force push is the established pattern per Alan's rule)
- **Backend cwd:** `packages/backend/` — all `npm test`, `tsc`, etc. run from here
- **Migrations:** `packages/db/migrations/` (numbered 001-007 so far)
- **Stories:** `docs/stories/` (e.g. `1.5-audit-logging-immutability.md`)
- **QA gates:** `docs/qa/gates/` (e.g. `1.5-audit-logging-immutability.yml`)

**Why:** The repo has many uncommitted untracked legacy files (HTML dashboards, JSON dumps, old api/ JS files) that are NOT part of the ERP rebuild. Story commits must stage selectively by exact path — `git add -A` would pollute the commit with hundreds of unrelated files.

**How to apply:** When pushing a Story 1.x commit, only stage the exact files listed in the story's File List. Verify with `git status --short | grep "^[AM]"` that staged set matches story scope before committing. Commit message format: `feat: <summary> [Story X.Y]` with bullet list of capabilities and explicit "Files:" section listing paths.

**Pre-existing TS errors:** `tsc --noEmit` reports errors in `accounts/` and `entries/` modules (Stories 1.2/1.3) — those are pre-existing and NOT a blocker for new story pushes. Verify new story files compile clean by filtering: `tsc --noEmit 2>&1 | grep <story-path>`.
