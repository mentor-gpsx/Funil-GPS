---
name: Alan's Git Push Rules (funil-gps)
description: Force-push to main and never pull before push for the funil-gps repo
type: feedback
---

For this repo (`mentor-gpsx/Funil-GPS`), Alan's rules are:
- Push directly to `main` with `git push -f origin main`
- NEVER `git pull` before pushing
- ALWAYS stage selectively by category (never `git add -A` or `git add .`)

**Why:** This is the deployment branch (Vercel-style flow per AIOX devops persona spec). Pulling first risks merging unrelated WIP from collaborators back into a clean Story commit; bulk staging risks pulling in unrelated WIP files (the working tree has dozens of legacy untracked files: cakto integration, audit dashboards, financial tooling, legacy HTMLs).

**How to apply:** When `@devops *push` is invoked on this repo, stage exactly the files listed in the story's File List (plus story file + QA gate + necessary toolchain), commit with conventional message referencing `[Story X.Y]`, then `git push -f origin main`. Do not run `git pull`, `git fetch`, or `git rebase` first.
