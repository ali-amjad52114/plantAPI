# D2 InstaCloud governance — resume notes

Last update 2026-10-07 ~15:10 PDT (prep mode). No live policy, branch, service or project was changed.
Only read-only insta commands were run (status, policy get, project/branch/service list, billing, --help).

## Done
- CLI fixed: `insta --version` = 0.1.21 (the earlier MODULE_NOT_FOUND was the mid-auto-update).
- `policy-current.json` — live policy: **mode `full_access`, no rules, no protected branches**;
  every action (incl. `project.delete`) resolves to allow. No secrets in it.
- `POLICY_PLAN.md` — lead commands, action→decision table, scale-vs-403 analysis + fallback.
- `lib/infra/governance-demo.ts` — default dry run (read-only policy check + planned commands);
  `--live` runs ALLOW/APPROVE/DENY via child_process `insta --agent …`, parses real decision +
  approval id, prints table, writes `evidence-<ts>.json`. Double policy guard (before any mutation and
  before `project delete`). Never run `--live` by D2.
- `dry-run.txt` — current output: guard **WOULD ABORT** (full_access, main unprotected).
- Typecheck: file is clean (added `/// <reference types="node" />`; the repo-wide tsconfig lacks node
  types under TS 7 — `lib/contracts/interfaces.ts` etc. still show TS2591, not D2's to fix).

## Facts
- Org tier **free** → `compute scale` will 403 at the plan gate; ordering vs the policy gate is not
  documented. Demo falls back to `project rename PlantAPI` (project.update → approve; no-op body).
- Services on main: `postgres/db`, `compute/app`. Branches: `main` only.

## Lead commands (human terminal)
```
insta agent policy set branch-specific
insta agent policy protect-branch main
npx tsx lib/infra/governance-demo.ts           # guard must say PASS
npx tsx lib/infra/governance-demo.ts --live
insta agent approvals deny <id> ; insta branch delete analysis-<ts>   # cleanup
```

## Next
- After the lead switches the policy: re-run dry run, snapshot `policy-governed.json`, lead runs `--live`,
  commit the evidence file, append the 5-line report to `docs/HANDOFF.md` (lead-owned file).
