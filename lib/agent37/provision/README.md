# lib/agent37/provision: budget + backup (S4) for S1 core and S3 UI

REAL Agent37 hosting API (`https://api.agent37.com/v1`, `Authorization: Bearer $AGENT37_API_KEY`).
All functions default `cfg` to `cfgFromEnv()` (reads `AGENT37_API_KEY`, `AGENT37_BASE_URL`). Server-side only.

## budget.ts
```ts
getBudget(instanceId: string, cfg?: Agent37Config): Promise<Budget>
setBudget(instanceId: string, capUsd: number, cfg?: Agent37Config): Promise<{ before: Budget; after: Budget }>
// throws if capUsd < current month spend

interface Budget {
  instanceId: string;
  monthlyCapUsd: number;      // monthly ceiling, resets each UTC month
  spentUsd: number;           // managed spend this month (LLM, Brave, Composio, Perflo)
  remainingUsd: number;
  creditRemainingUsd: number; // one-time headroom
  period: string;             // "YYYY-MM"
  updatedAt: number;          // epoch s
  raw: BudgetRaw;             // micros as returned by the API
}
```
UI (S3): show `spentUsd / monthlyCapUsd` per plant; cost delta per incident = `spentUsd` after - before.

## backup.ts
```ts
createCheckpoint(instanceId: string, label: string, opts?: { cfg?: Agent37Config; timeoutMs?: number }): Promise<Checkpoint>
listBackups(instanceId: string, cfg?: Agent37Config): Promise<BackupRecord[]>   // newest first

interface BackupRecord { id: string; kind: "manual" | "automatic"; created: number; size_bytes: number }
interface Checkpoint {
  instanceId: string; label: string;
  status: "completed" | "pending" | "rate_limited";
  id?: string;                 // new backup id; on rate_limited = previous manual backup id
  backup?: BackupRecord; previousManual?: BackupRecord; retryAfterSeconds?: number;
  requestedAt: number; durationMs: number;
}
```
S1 core: call `await createCheckpoint(instanceId, \`incident-${id}\`)` before execution and store `id` + `status`
on the incident. It blocks until the backup is done (~20 s for ~260 MB on pfd5d7eukw). It does not throw on
429: `status: "rate_limited"` means the previous manual backup (`id`) is still the latest restore point.

API facts: 1 on-demand backup per instance per 15 min; each one REPLACES the previous manual slot; plus 7
nightly automatic slots. No label field server-side (`label` is ours). Backups are free. This module never
restores or deletes.

## CLI (dry-run by default; `--live` executes)
```
set -a; . ./.env; set +a
npx tsx lib/agent37/provision/platform-cli.ts budget get [--instance id] [--live]
npx tsx lib/agent37/provision/platform-cli.ts budget set <usd> [--instance id] [--live]
npx tsx lib/agent37/provision/platform-cli.ts backup create [--label x] [--instance id] [--live]
npx tsx lib/agent37/provision/platform-cli.ts backup list [--instance id] [--live]
```
Evidence: `infra/evidence/budget-backup.txt`.
