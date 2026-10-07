// Smoke: Fiix via the Agent37 browser (agent-browser) on instance pfd5d7eukw.
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/smoke-fiix.ts [--assignee "ali amjad"] [--keep-open]
// Full run: login -> CV-104 history (all statuses) -> create WO -> assign -> close (unless --keep-open) -> read back.
// Credentials are delivered to the instance as a 0600 file via the exec API; never printed or sent as prompt text.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INSTANCE = "pfd5d7eukw";
const base = (process.env.AGENT37_BASE_URL ?? "https://api.agent37.com").replace(/\/$/, "").replace(/(\/v1)?$/, "/v1");
const key = process.env.AGENT37_API_KEY!;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

async function exec(command: string, timeoutMs = 120_000) {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${base}/instances/${INSTANCE}/exec`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout_ms: timeoutMs }),
      });
      if (!r.ok) throw new Error(`exec HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return (await r.json()) as { exit_code: number; stdout: string; stderr: string };
    } catch (e) { last = e; }
  }
  throw last;
}

const timings: Array<[string, number]> = [];
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now(); try { return await fn(); } finally { timings.push([name, Date.now() - t]); }
}

async function main() {
  const { FIIX_URL, FIIX_USERNAME, FIIX_PASSWORD } = process.env;
  if (!key || !FIIX_URL || !FIIX_USERNAME || !FIIX_PASSWORD) throw new Error("missing AGENT37_API_KEY or FIIX_* env");
  const helper = readFileSync(join(__dirname, "lib", "fiix-browser.sh"), "utf8").split(String.fromCharCode(13)).join("");
  const skill = readFileSync(join(__dirname, "..", "agent", "skills", "fiix", "SKILL.md"), "utf8");

  await step("provision (creds file + helper + skill)", () => exec(
    `umask 077; mkdir -p ~/plantapi/skills/fiix ~/shots; ` +
    `printf '%s\n' 'FIIX_URL=${FIIX_URL}' 'FIIX_USERNAME_B64=${b64(FIIX_USERNAME)}' 'FIIX_PASSWORD_B64=${b64(FIIX_PASSWORD)}' > ~/plantapi/fiix.env; ` +
    `echo ${b64(helper)} | base64 -d > ~/plantapi/fiix-browser.sh; chmod 700 ~/plantapi/fiix-browser.sh; ` +
    `echo ${b64(skill)} | base64 -d > ~/plantapi/skills/fiix/SKILL.md; echo ok`));

  const login = await step("login", () => exec("~/plantapi/fiix-browser.sh login"));
  const loggedIn = login.stdout.includes("macmms.com") || login.stdout.includes("fiix.software/") && !login.stdout.includes("auth.fiix");
  const hist = await step("read CV-104 WO history", () => exec("~/plantapi/fiix-browser.sh history"));
  const summary = `PlantAPI smoke: CV-104 contactor LC1D09BD burned - replace (${new Date().toISOString()})`;
  const created = await step("create WO on CV-104", () => exec(`~/plantapi/fiix-browser.sh create ${JSON.stringify(summary)}`));
  const wo = created.stdout.match(/WO ([0-9A-Za-z-]+)/)?.[1] ?? null;
  const shotPath = `/home/node/shots/fiix-wo-${wo ?? "unknown"}-${Date.now()}.png`;
  const shot = await step("screenshot", () => exec(`~/plantapi/fiix-browser.sh shot ${shotPath}`));
  const verify = await step("verify WO in list", () => exec("~/plantapi/fiix-browser.sh history"));
  const listed = !!wo && verify.stdout.includes(summary.slice(0, 40));

  const argv = process.argv.slice(2);
  const assignee = argv.includes("--assignee") ? argv[argv.indexOf("--assignee") + 1] : "ali amjad";
  const keepOpen = argv.includes("--keep-open");
  let assignedTo: string | null = null, finalStatus: string | null = null, closeShot: string | null = null;
  if (wo) {
    const as = await step(`assign WO to ${assignee}`, () => exec(`~/plantapi/fiix-browser.sh assign ${wo} ${JSON.stringify(assignee)}`));
    assignedTo = as.stdout.match(/assigned_to=(.*)/)?.[1]?.trim() ?? null;
    if (!keepOpen) {
      const cl = await step("close WO", () => exec(`~/plantapi/fiix-browser.sh close ${wo}`));
      finalStatus = cl.stdout.match(/status=(.*)/)?.[1]?.trim() ?? null;
      closeShot = `/home/node/shots/fiix-wo-${wo}-closed-${Date.now()}.png`;
      await step("screenshot closed", () => exec(`~/plantapi/fiix-browser.sh shot ${closeShot}`));
    }
  }
  const all = await step("read history (all statuses)", () => exec("~/plantapi/fiix-browser.sh history"));
  const row = all.stdout.split("\\n").join("\n").split("\n").find((l) => l.replace(/^"/, "").startsWith(`${wo} |`)) ?? null;
  if (!keepOpen && row && /Closed/.test(row)) finalStatus = finalStatus ?? "Closed";

  const pass = loggedIn && !!wo && shot.exit_code === 0 && listed && assignedTo === assignee && (keepOpen || /^Closed/.test(finalStatus ?? ""));
  console.log(pass ? "PASS" : "FAIL");
  console.log(JSON.stringify({ loggedIn, wo_code: wo, listed, assigned_to: assignedTo, final_status: finalStatus, history_row: row,
    screenshot_path: shot.exit_code === 0 ? shotPath : null, closed_screenshot_path: closeShot,
    create_err: created.exit_code ? created.stderr.slice(0, 300) : undefined }, null, 2));
  console.table(timings.map(([s, ms]) => ({ step: s, ms })));
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.log("FAIL", String(e).slice(0, 300)); console.table(timings.map(([s, ms]) => ({ step: s, ms }))); process.exit(1); });
