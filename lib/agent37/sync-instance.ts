// Pushes what the plant agent needs onto the Agent37 instance: skills, seed files, system env, Monid CLI + login.
// Run: npx tsx lib/agent37/sync-instance.ts   (idempotent; prints names only, never secret values)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "../db/env";

loadEnv();

const HOME = "/home/node";
const ROOT = `${HOME}/plantapi`;
const ENV_KEYS = ["ODOO_URL", "ODOO_DB", "ODOO_API_KEY", "ODOO_MCP_URL", "ODOO_MCP_TOKEN", "MONID_API_KEY", "FIIX_URL", "FIIX_USERNAME", "FIIX_PASSWORD", "PLANTAPI_SCHEDULE_SHEET_ID", "PLANTAPI_CALENDAR_ID"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export type SyncSummary = { files: number; envKeys: string[]; monid: string; ms: number };

/** Idempotent: uploads skills, seed files, plant.env and the Monid login; installs the Monid CLI if missing. Never logs secret values. */
export async function syncInstance(opts: { verbose?: boolean } = {}): Promise<SyncSummary> {
  const t0 = Date.now();
  const { agent37 } = await import("./index");
  const id = process.env.AGENT37_INSTANCE_ID ?? "pfd5d7eukw";

  const uploads: Array<[string, Buffer]> = [];
  const posix = (f: string) => f.split(path.sep).join("/");
  if (existsSync("agent/skills")) for (const f of walk("agent/skills")) uploads.push([`${ROOT}/${posix(f)}`, readFileSync(f)]);
  if (existsSync("seed")) for (const f of walk("seed")) if (!f.includes("photos")) uploads.push([`${ROOT}/${posix(f)}`, readFileSync(f)]);
  // Every PLANTAPI_* setting S2/S4 add (sheet, calendar, notice email, Slack channel …) goes along automatically.
  const envKeys = [...ENV_KEYS, ...Object.keys(process.env).filter((k) => k.startsWith("PLANTAPI_") && !ENV_KEYS.includes(k))].filter((k) => process.env[k]);
  const envText = envKeys.map((k) => `export ${k}=${JSON.stringify(process.env[k])}`).join("\n") + "\n";
  uploads.push([`${ROOT}/plant.env`, Buffer.from(envText)]);
  const monidDir = path.join(os.homedir(), ".config", "monid");
  for (const f of ["config.yaml", "credentials.yaml"]) {
    const p = path.join(monidDir, f);
    if (existsSync(p)) uploads.push([`${HOME}/.config/monid/${f}`, readFileSync(p)]);
  }

  const dirs = [...new Set(uploads.map(([dest]) => path.posix.dirname(dest)))];
  await agent37.exec(id, `mkdir -p ${dirs.map((d) => `'${d}'`).join(" ")}`);
  for (const [dest, buf] of uploads) {
    await agent37.uploadFile(id, dest, buf);
    if (opts.verbose) console.log("uploaded", dest);
  }

  const setup = await agent37.exec(
    id,
    [
      `chmod 600 ${ROOT}/plant.env ${HOME}/.config/monid/credentials.yaml 2>/dev/null`,
      `grep -q 'plantapi/plant.env' ~/.bashrc 2>/dev/null || echo '[ -f ${ROOT}/plant.env ] && . ${ROOT}/plant.env' >> ~/.bashrc`,
      `grep -q 'plantapi/plant.env' ~/.profile 2>/dev/null || echo '[ -f ${ROOT}/plant.env ] && . ${ROOT}/plant.env' >> ~/.profile`,
      `command -v monid >/dev/null || npm i -g @monid-ai/cli@0.1.7 >/tmp/monid-install.log 2>&1`,
      `export PATH="$PATH:$(npm prefix -g)/bin"`,
      `echo $(NO_COLOR=1 monid --version 2>&1 | tail -1)`,
    ].join("; "),
  );
  return { files: uploads.length, envKeys, monid: setup.stdout.trim().replace(/[[0-9;]*m/g, "") || `exit ${setup.exitCode}`, ms: Date.now() - t0 };
}

// CLI: npx tsx lib/agent37/sync-instance.ts
if (/sync-instance\.ts$/.test(process.argv[1] ?? "")) {
  syncInstance({ verbose: true })
    .then((r) => console.log(`synced ${r.files} files to the instance in ${r.ms} ms; env keys: ${r.envKeys.join(", ")}; monid: ${r.monid}`))
    .catch((e) => {
      console.error("FAIL", e);
      process.exit(1);
    });
}
