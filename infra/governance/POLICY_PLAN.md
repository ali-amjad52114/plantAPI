# PlantAPI — InstaCloud agent-policy plan (D2)

Project `PlantAPI` (`5111d812-e645-48ee-8b4d-f9c6c527395b`), org plan **free**, branches: `main` only.
Services on `main`: `postgres/db`, `compute/app` (1 machine).

## Current state (read 2026-10-07 15:03 PDT, `policy-current.json`)

- `mode: full_access`, `rules: {}`, `protectedBranchIds: []` — **nothing is governed yet**.
- Every action resolves to `allow`, **including `project.delete`**. Do not run the demo `--live`
  until the commands below are applied (the script aborts on its own if they are not).

## Commands for the lead (human terminal — NOT `--agent`; an agent cannot change its own policy)

```bash
cd C:/AI/plantapi-platform
insta agent policy set branch-specific
insta agent policy protect-branch main
insta --agent agent policy get --json > infra/governance/policy-governed.json   # confirm
npx tsx lib/infra/governance-demo.ts            # dry run: guard must print "PASS"
npx tsx lib/infra/governance-demo.ts --live     # real ALLOW / APPROVE / DENY + evidence JSON
```

No custom rules are needed: the `branch_specific` defaults already give the wanted mapping. Do not
add `rule set` calls — any rule moves the mode to `customize` (same authorization, more noise).

## Action → decision table (branch_specific defaults, from the live `actionCatalog` + governance docs)

| Demo outcome | Command (agent, `--agent`) | Action | Scope | Decision | What the platform returns |
| --- | --- | --- | --- | --- | --- |
| ALLOW | `branch create analysis-<ts> --json` | `branch.create` | unprotected | allow | exit 0, branch JSON; forks db + app onto the new branch |
| APPROVE | `compute scale 2 app --branch analysis-<ts> --json` | `service.scale` | unprotected | approve | HTTP 202 `approval_required`, exit 2, approval id on stderr — **if** the policy gate runs before the plan gate (see below) |
| APPROVE (fallback) | `project rename PlantAPI --json` | `project.update` | project | approve | exit 2 + approval id; same-name body, so even an approved re-run changes nothing |
| DENY | `project delete --json` | `project.delete` | any | deny (fixed invariant, `editable: false`) | hard deny, no approval path ("every other mode denies it") |
| (fixed) | `agent policy set …` / `protect-branch` | `agent_policy.update`, `branch.protection.update` | — | deny | agent can never widen its own policy |
| (protected) | any write with `--branch main` | — | protected | deny | all classified writes to `main` denied once protected |

## service.scale vs the free-plan 403

- Docs: `compute scale` is **paid plans only (free → 403)**; `PlantAPI`'s org is on the **free** tier.
- The docs do **not** say whether the governance gate is evaluated before the plan check. They say
  compound requests "evaluate every action before any side effect", and MCP notes paid-tier gates
  "surface as structured errors" — ordering is unspecified. Not testable read-only.
- The demo therefore tries `service.scale` first and records the real answer. If the platform
  returns the plan 403 (classified `BLOCKED_PLAN`) instead of an approval, it immediately runs the
  fallback `project rename PlantAPI` (`project.update` → approve under `branch_specific`), which
  works on any plan and is a no-op even if later approved.
- Other approve-gated actions considered: `storage set-access` (needs a storage service — none),
  `cron delete` (needs a cron), `branch delete` (would actually tear down the analysis branch if
  approved). `project rename` to the same name is the lowest-risk option.

## Safety in `lib/infra/governance-demo.ts --live`

1. Reads the policy first; aborts before ANY mutating call unless mode is `branch_specific`/`customize`,
   `main` is in `protectedBranchIds`, `project.delete` resolves to `deny` in all three scopes,
   `branch.create` → allow and `service.scale` → approve.
2. Re-reads the policy immediately before `project delete` and aborts if anything changed.
3. Never approves, never re-runs a gated command, never drops `--agent`.
4. Approval ids and decisions are parsed from real CLI output; evidence (redacted stdout/stderr,
   pending approvals, last 25 audit events) goes to `infra/governance/evidence-<timestamp>.json`.

## Cleanup after `--live` (lead, human terminal)

```bash
insta agent approvals deny <approval-id>     # for each printed id (or approve + re-run once to show the flow)
insta branch delete analysis-<ts>            # removes the forked env
```
