# D2 InstaCloud governance — resume notes

Paused by the lead at ~14:50 (started 14:47). No live policy, branch, service or project was changed.

## Done
- Read PLAN.md §2/§8 (wave B, S4 kickoff) and CONTRACTS.md (REAL ONLY, no new cloud resources).
- Loaded the `insta` skill; read `references/governance.md` and the relevant `cli-reference.md` rows.
- `insta --agent status --json` (read-only) in `C:\AI\plantapi-platform`: linked to project
  `5111d812-e645-48ee-8b4d-f9c6c527395b`, branch `main`, prod API. `.insta/agent-session.json` exists.

## Where I stopped
- `insta --agent agent policy get --json` FAILED (not a policy error) with:
  `Error: Cannot find module '...\node-v24.18.1-win-x64\node_modules\insta\dist\index.js'` (MODULE_NOT_FOUND).
  The status call just before it printed "insta 0.1.21 is available (you have 0.1.19)"; the CLI has
  auto-update on by default, so the npm global install was most likely mid-replacement. Fix:
  `npm install -g insta@latest` (or wait and re-run), then `insta --version`.
- No files written yet besides this note: `policy-current.json`, `POLICY_PLAN.md`,
  `lib/infra/governance-demo.ts`, `dry-run.txt` are all still TODO.

## Facts gathered (for the plan)
- Project currently presumed `full_access` (default). Under `full_access`, **`project.delete` is ALLOWED** —
  so the DENY demo is only safe after the lead switches the mode. The demo must read the policy first
  and abort unless mode is `branch_specific`/`customize` and project.delete resolves to deny.
- `branch_specific` defaults (unprotected branches): `branch.create` allow, `service.scale` approve,
  `project.delete` deny, `branch.delete` approve, `storage.delete` approve. So the wanted mapping needs
  no custom rules — just the mode + protected main. `main` is NOT protected automatically.
- `compute scale` is **paid plans only (free → 403)**. Unknown whether the approval gate fires before the
  plan check; verify on resume (if 403 comes first, use another approve-gated action such as
  `service.upgrade`/`project.update` rename, or mark BLOCKED).
- Approvals: gated call returns HTTP 202 / exit 2 with an approval id; human runs
  `insta agent approvals approve <id>`; agent cannot approve itself.

## Commands for the lead (human terminal, NOT --agent) — after reading the policy JSON
```
insta agent policy set branch-specific
insta agent policy protect-branch main
insta --agent agent policy get --json   # confirm mode + protectedBranches + actionCatalog
```

## Next steps
1. Repair CLI, run `insta --agent agent policy get --json` -> `infra/governance/policy-current.json` (strip nothing secret; it has none expected).
2. Write `POLICY_PLAN.md` from the actionCatalog (read it rather than the table above).
3. Write `lib/infra/governance-demo.ts` (child_process; `--dry-run` default prints commands only;
   `--live`: policy check gate -> `branch create analysis-<ts>` (ALLOW) -> `compute scale 2 <svc> --branch analysis-<ts>` (expect exit 2 + approval id) -> `project delete --json` only if policy confirms deny (expect denial)).
4. Run dry-run -> `dry-run.txt`; `npx tsc --noEmit`.

**REAL ONLY:** the demo must show real policy decisions and real approval ids from the live platform —
no hard-coded ids, canned outcomes or simulated denials in the demo path.
