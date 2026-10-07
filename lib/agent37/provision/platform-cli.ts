// S4 platform CLI: budget + backups for an Agent37 instance. Dry-run by default (prints requests, no network);
// --live executes against the REAL API. Never prints the API key.
//
//   npx tsx lib/agent37/provision/platform-cli.ts budget get  [--instance <id>] [--live]
//   npx tsx lib/agent37/provision/platform-cli.ts budget set <usd> [--instance <id>] [--live]
//   npx tsx lib/agent37/provision/platform-cli.ts backup create [--label <text>] [--instance <id>] [--live]
//   npx tsx lib/agent37/provision/platform-cli.ts backup list [--instance <id>] [--live]
//
// Instance defaults to $AGENT37_INSTANCE_ID. Load env first: set -a; . ./.env; set +a

import type { Agent37Config, ApiRequest } from "./templates";
import { cfgFromEnv, getBudget, getBudgetRequest, setBudget, setBudgetRequest } from "./budget";
import { createBackupRequest, createCheckpoint, listBackups, listBackupsRequest } from "./backup";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function printRequest(r: ApiRequest): void {
  const headers = Object.fromEntries(
    Object.entries(r.headers).map(([k, v]) => [k, k.toLowerCase() === "authorization" ? "Bearer <AGENT37_API_KEY>" : v]),
  );
  console.log(JSON.stringify({ dryRun: true, method: r.method, url: r.url, headers, json: r.json, note: r.note }, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [group, cmd] = args;
  const live = args.includes("--live");
  const instanceId = flag(args, "--instance") ?? process.env.AGENT37_INSTANCE_ID;
  if (!instanceId) throw new Error("no instance: pass --instance or set AGENT37_INSTANCE_ID");
  const cfg: Agent37Config = live ? cfgFromEnv() : { apiKey: "<AGENT37_API_KEY>", baseUrl: process.env.AGENT37_BASE_URL };

  const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

  if (group === "budget" && cmd === "get") {
    if (!live) return printRequest(getBudgetRequest(cfg, instanceId));
    const b = await getBudget(instanceId, cfg);
    return out({ ...b, raw: undefined, at: new Date().toISOString() });
  }
  if (group === "budget" && cmd === "set") {
    const usd = Number(args[2]);
    if (!Number.isFinite(usd)) throw new Error("usage: budget set <usd>");
    if (!live) {
      printRequest(getBudgetRequest(cfg, instanceId));
      return printRequest(setBudgetRequest(cfg, instanceId, usd));
    }
    const { before, after } = await setBudget(instanceId, usd, cfg);
    return out({
      instanceId,
      capBeforeUsd: before.monthlyCapUsd,
      capAfterUsd: after.monthlyCapUsd,
      spentUsd: after.spentUsd,
      period: after.period,
      revert: `budget set ${before.monthlyCapUsd} --instance ${instanceId} --live`,
      at: new Date().toISOString(),
    });
  }
  if (group === "backup" && cmd === "create") {
    const label = flag(args, "--label") ?? "plantapi-checkpoint";
    if (!live) return printRequest(createBackupRequest(cfg, instanceId));
    return out({ ...(await createCheckpoint(instanceId, label, { cfg })), at: new Date().toISOString() });
  }
  if (group === "backup" && cmd === "list") {
    if (!live) return printRequest(listBackupsRequest(cfg, instanceId));
    const list = await listBackups(instanceId, cfg);
    return out(list.map((b) => ({ ...b, createdIso: new Date(b.created * 1000).toISOString() })));
  }
  throw new Error("usage: platform-cli (budget get|budget set <usd>|backup create [--label x]|backup list) [--instance id] [--live]");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
