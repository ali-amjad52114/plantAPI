/// <reference types="node" />
// D1 (S4) CLI: build the PlantAPI Agent37 templates and run the live-view test.
// Default is --dry-run: packs the build contexts locally and prints the exact requests. No network at all.
//
//   npx tsx lib/agent37/provision/build-templates.ts                      # dry-run, both templates + live-view plan
//   npx tsx lib/agent37/provision/build-templates.ts --live build [--only plantapi-agent|hermes-vnc-desktop]
//   npx tsx lib/agent37/provision/build-templates.ts --live live-view     # create 1 vnc instance (auto-sleep, $1), print view URL
//   npx tsx lib/agent37/provision/build-templates.ts --live delete --id <instanceId>
//
// Secrets come from env (AGENT37_API_KEY, AGENT37_BASE_URL); load .env with `set -a; . ./.env; set +a`.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  type Agent37Config,
  type ApiRequest,
  type CreateInstanceOptions,
  buildLogsRequest,
  buildTemplate,
  createBuildRequest,
  createInstance,
  createInstanceRequest,
  deleteInstance,
  deleteInstanceRequest,
  getLiveViewUrl,
  getTemplate,
  getTemplateRequest,
  redactUrl,
  signedUrlRequest,
  startBuildRequest,
  uploadContextRequest,
  VNC_PORT,
} from "./templates";

const IMAGE_DIR = resolve(process.cwd(), "agent/image");

export const TEMPLATES = [
  { name: "plantapi-agent", dir: "plantapi-agent", defaultPort: 3737, description: "PlantAPI: Hermes + Monid CLI + ~/plantapi/skills" },
  { name: "hermes-vnc-desktop", dir: "hermes-vnc-desktop", defaultPort: 3737, description: "Hermes + noVNC live desktop on 6901" },
] as const;

/** The one live-view test instance allowed by the plan: auto-sleep, $1 managed budget, deleted after. */
export const LIVE_VIEW_INSTANCE: CreateInstanceOptions = {
  template: "hermes-vnc-desktop",
  autoSleep: true,
  idleTimeoutSeconds: 300,
  budgetUsd: 1,
  name: "plantapi-liveview-test",
  metadata: { project: "plantapi", purpose: "d1-live-view-test", delete_after: "true" },
};

// ---------- build context packing (ustar + gzip, no deps) ----------

const SKIP = new Set([".git", ".env", "node_modules"]);
const TEXT_LF = (f: string) => f === "Dockerfile" || f.endsWith(".sh") || f === ".dockerignore";

function listFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel)).sort()) {
    if (SKIP.has(e) || e.endsWith(".env")) continue;
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(join(dir, r)).isDirectory()) out.push(...listFiles(dir, r));
    else out.push(r);
  }
  return out;
}

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, "0") + "\0";
}

function tarHeader(name: string, size: number, mode: number): Uint8Array {
  if (Buffer.byteLength(name) > 100) throw new Error(`path too long for ustar: ${name}`);
  const h = Buffer.alloc(512);
  h.write(name, 0, "utf8");
  h.write(octal(mode, 8), 100);
  h.write(octal(1000, 8), 108); // uid (node)
  h.write(octal(1000, 8), 116); // gid
  h.write(octal(size, 12), 124);
  h.write(octal(0, 12), 136); // fixed mtime -> reproducible context
  h.write("        ", 148); // checksum placeholder
  h.write("0", 156); // regular file
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

export function packContext(dir: string): { gz: Uint8Array; files: { path: string; bytes: number }[]; sha256: string } {
  const files = listFiles(dir);
  if (!files.includes("Dockerfile")) throw new Error(`${dir}: no Dockerfile at root`);
  const parts: Uint8Array[] = [];
  const listed: { path: string; bytes: number }[] = [];
  for (const f of files) {
    let data: Buffer = readFileSync(join(dir, f));
    const base = f.split("/").pop()!;
    if (TEXT_LF(base)) data = Buffer.from(data.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    const mode = base.endsWith(".sh") ? 0o755 : 0o644;
    parts.push(tarHeader(f, data.length, mode), data);
    const pad = (512 - (data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad));
    listed.push({ path: f, bytes: data.length });
  }
  parts.push(Buffer.alloc(1024));
  const gz = gzipSync(Buffer.concat(parts), { level: 9 });
  return { gz, files: listed, sha256: createHash("sha256").update(gz).digest("hex") };
}

// ---------- printing ----------

function show(step: string, req: ApiRequest): string {
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k, k.toLowerCase() === "authorization" ? "Bearer $AGENT37_API_KEY" : v]),
  );
  const lines = [`${step}  ${req.method} ${req.url.startsWith("<") ? req.url : redactUrl(req.url)}`];
  if (Object.keys(headers).length) lines.push(`    headers: ${JSON.stringify(headers)}`);
  if (req.json !== undefined) lines.push(`    body: ${JSON.stringify(redactEnv(req.json))}`);
  if (req.raw) lines.push(`    body: <${req.raw.byteLength} bytes gzipped tar>`);
  if (req.note) lines.push(`    note: ${req.note}`);
  return lines.join("\n");
}

function redactEnv(json: unknown): unknown {
  if (json && typeof json === "object" && "env" in (json as Record<string, unknown>)) {
    const j = { ...(json as Record<string, unknown>) };
    j.env = Object.fromEntries(Object.keys(j.env as Record<string, string>).map((k) => [k, "<redacted>"]));
    return j;
  }
  return json;
}

// ---------- commands ----------

function config(live: boolean): Agent37Config {
  const apiKey = process.env.AGENT37_API_KEY ?? "";
  if (live && !apiKey) throw new Error("AGENT37_API_KEY not set (load .env)");
  return { apiKey: apiKey || "<AGENT37_API_KEY>", baseUrl: process.env.AGENT37_BASE_URL || undefined };
}

function dryRun(cfg: Agent37Config, only?: string): void {
  console.log("# D1 dry-run: exact Agent37 requests. NO network calls were made; nothing was created.");
  console.log(`# base: ${(cfg.baseUrl ?? "https://api.agent37.com/v1").replace(/\/+$/, "")}\n`);
  for (const t of TEMPLATES) {
    if (only && t.name !== only) continue;
    const ctx = packContext(join(IMAGE_DIR, t.dir));
    console.log(`## template ${t.name}  (context agent/image/${t.dir}, ${ctx.gz.byteLength} bytes gz, sha256 ${ctx.sha256})`);
    for (const f of ctx.files) console.log(`#   ${f.path} (${f.bytes} B)`);
    console.log(show("0.", getTemplateRequest(cfg, t.name)) + "\n    note: precheck; 404 today (verified read-only)");
    console.log(show("1.", createBuildRequest(cfg, { name: t.name, sizeBytes: ctx.gz.byteLength, defaultPort: t.defaultPort, description: t.description })));
    console.log(show("2.", uploadContextRequest("<upload_url from step 1>", ctx.gz)) + " (no Agent37 key sent; Expect header not sent)");
    console.log(show("3.", startBuildRequest(cfg, "<build.id from step 1>")));
    console.log(show("4.", buildLogsRequest(cfg, "<build.id>", 0)) + "\n    note: poll every 5 s, pass back `offset`, until status succeeded|failed -> template {name, revision, image_digest}");
    console.log("");
  }
  console.log("## live-view test (after hermes-vnc-desktop build succeeds; max 1 instance)");
  console.log(show("5.", createInstanceRequest(cfg, LIVE_VIEW_INSTANCE)) + "\n    note: budget = $1 managed-usage cap; compute is ~$4.76/mo 2vCPU/4GB metered per minute, sleeps after 300 s idle");
  console.log(show("6.", signedUrlRequest(cfg, "<instance.id>", VNC_PORT, 300)) + "\n    note: open https://<id>-6901.agent37.app/vnc.html?a37_token=<token>&autoconnect=1&resize=scale ; screenshot it");
  console.log(show("7.", deleteInstanceRequest(cfg, "<instance.id>")) + "\n    note: delete right after the screenshot; pfd5d7eukw is refused by code");
}

async function liveBuild(cfg: Agent37Config, only?: string): Promise<void> {
  for (const t of TEMPLATES) {
    if (only && t.name !== only) continue;
    const ctx = packContext(join(IMAGE_DIR, t.dir));
    const before = await getTemplate(cfg, t.name);
    console.log(`[${t.name}] existing revision: ${before?.revision ?? "none"}; context ${ctx.gz.byteLength} B sha256 ${ctx.sha256}`);
    const b = await buildTemplate(cfg, {
      name: t.name,
      context: ctx.gz,
      defaultPort: t.defaultPort,
      description: t.description,
      onLog: (s) => process.stdout.write(s),
    });
    console.log(`\n[${t.name}] build ${b.id}: ${b.status}` + (b.template ? ` -> ${b.template.name}@${b.template.revision} ${b.template.image_digest}` : "") + (b.error ? ` error ${b.error.code}: ${b.error.message}` : ""));
    if (b.status !== "succeeded") process.exitCode = 1;
  }
}

async function liveView(cfg: Agent37Config): Promise<void> {
  const inst = await createInstance(cfg, LIVE_VIEW_INSTANCE);
  console.log(`instance ${inst.id} ${inst.status} template=${inst.template} auto_sleep=${inst.auto_sleep}`);
  const lv = await getLiveViewUrl(cfg, inst.id, { ttlSeconds: 300 });
  // The URL carries a short-lived full-control token: printed once for the operator to open, not logged elsewhere.
  console.log(`live view (expires in ${lv.expiresInSeconds}s): ${lv.vncUrl}`);
  console.log(`delete after the screenshot: npx tsx lib/agent37/provision/build-templates.ts --live delete --id ${inst.id}`);
}

async function main(argv: string[]): Promise<void> {
  const live = argv.includes("--live");
  const flag = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const cmd = argv.find((a) => ["build", "live-view", "delete"].includes(a)) ?? "build";
  const cfg = config(live);
  if (!live) return dryRun(cfg, flag("--only"));
  if (cmd === "build") return liveBuild(cfg, flag("--only"));
  if (cmd === "live-view") return liveView(cfg);
  const id = flag("--id");
  if (!id) throw new Error("delete needs --id <instanceId>");
  console.log(JSON.stringify(await deleteInstance(cfg, id)));
}

if (/build-templates.ts$/.test(process.argv[1] ?? "")) main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
