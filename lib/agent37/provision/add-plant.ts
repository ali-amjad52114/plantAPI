/// <reference types="node" />
// S4/W1 "Add plant": one REAL Agent37 instance per plant from the plantapi-agent template, skills synced to
// ~/plantapi/skills, row in Supabase `plants` (name, agent37_instance_id). removePlant() undoes both.
//
//   npx tsx lib/agent37/provision/add-plant.ts --live add --name "Test Plant"
//   npx tsx lib/agent37/provision/add-plant.ts --live remove --id <plants.id>
//
// Env (load with `set -a; . ./.env; set +a`): AGENT37_API_KEY, AGENT37_BASE_URL?, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, MONID_API_KEY? (passed to the instance env so `monid` is authenticated).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type Agent37Config,
  type ApiRequest,
  type Instance,
  Agent37ApiError,
  AGENT37_API_DEFAULT,
  assertNotProtected,
  createInstance,
  deleteInstance,
  getInstance,
  send,
} from "./templates";

export const PLANT_TEMPLATE = "plantapi-agent";
export const PLANT_BUDGET_USD = 1;
export const SKILLS_DIR_REMOTE = "/home/node/plantapi/skills";
const SKILLS_DIR_LOCAL = resolve(process.cwd(), "agent/skills");

export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  truncated?: boolean;
}

export interface PlantRow {
  id: string;
  name: string;
  agent37_instance_id: string | null;
  created_at?: string;
}

export interface AddPlantResult {
  plant: PlantRow;
  instance: Instance;
  skillsUploaded: string[];
}

// ---------- config ----------

export function agent37Config(): Agent37Config {
  const apiKey = process.env.AGENT37_API_KEY;
  if (!apiKey) throw new Error("AGENT37_API_KEY not set (load .env)");
  return { apiKey, baseUrl: process.env.AGENT37_BASE_URL || undefined };
}

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (load .env)");
  return createClient(url, key, { auth: { persistSession: false } });
}

function apiBase(cfg: Agent37Config): string {
  return (cfg.baseUrl ?? AGENT37_API_DEFAULT).replace(/\/+$/, "");
}

// ---------- instance exec / files (REAL) ----------

export async function execOn(cfg: Agent37Config, id: string, command: string, user?: "root"): Promise<ExecResult> {
  const req: ApiRequest = {
    method: "POST",
    url: `${apiBase(cfg)}/instances/${id}/exec`,
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    json: user ? { command, user } : { command },
  };
  return send<ExecResult>(req);
}

/** Instance plane PUT /v1/files/content (raw body, mkdir -p on the server side). */
export async function putFile(cfg: Agent37Config, id: string, path: string, body: Uint8Array): Promise<void> {
  const url = `https://${id}.agent37.app/v1/files/content?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "X-Agent37-Key": cfg.apiKey, "Content-Type": "application/octet-stream" },
    body: body,
  } as RequestInit);
  if (!res.ok) throw new Error(`PUT files/content ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function listLocal(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel)).sort()) {
    if (e.startsWith(".")) continue;
    const r = rel ? `${rel}/${e}` : e;
    if (statSync(join(dir, r)).isDirectory()) out.push(...listLocal(dir, r));
    else out.push(r);
  }
  return out;
}

/** "Sync": ensure ~/plantapi/skills exists and upload agent/skills/** into it when that dir exists locally. */
export async function syncSkills(cfg: Agent37Config, id: string, localDir = SKILLS_DIR_LOCAL): Promise<string[]> {
  const mk = await execOn(cfg, id, `mkdir -p ${SKILLS_DIR_REMOTE} && test -d ${SKILLS_DIR_REMOTE}`);
  if (mk.exit_code !== 0) throw new Error(`mkdir skills failed: ${mk.stderr.slice(0, 300)}`);
  let files: string[] = [];
  try {
    files = statSync(localDir).isDirectory() ? listLocal(localDir) : [];
  } catch {
    files = [];
  }
  for (const f of files) await putFile(cfg, id, `${SKILLS_DIR_REMOTE}/${f}`, readFileSync(join(localDir, f)));
  return files;
}

async function waitRunning(cfg: Agent37Config, id: string, timeoutMs = 10 * 60_000): Promise<Instance> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const i = await getInstance(cfg, id);
    if (i.status === "running") return i;
    if (Date.now() > deadline) throw new Error(`instance ${id} still ${i.status} after ${timeoutMs / 1000}s`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ---------- add / remove ----------

export async function addPlant(p: { name: string }): Promise<AddPlantResult> {
  const name = p.name.trim();
  if (!name) throw new Error("plant name required");
  const cfg = agent37Config();
  const db = supabaseAdmin();
  const env: Record<string, string> = {};
  if (process.env.MONID_API_KEY) env.MONID_API_KEY = process.env.MONID_API_KEY;

  const created = await createInstance(cfg, {
    template: PLANT_TEMPLATE,
    autoSleep: true,
    idleTimeoutSeconds: 300,
    budgetUsd: PLANT_BUDGET_USD,
    name: `plantapi-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plant"}`,
    metadata: { project: "plantapi", plant_name: name },
    env: Object.keys(env).length ? env : undefined,
  });
  try {
    const instance = await waitRunning(cfg, created.id);
    const skillsUploaded = await syncSkills(cfg, instance.id);
    const { data, error } = await db
      .from("plants")
      .insert({ name, agent37_instance_id: instance.id })
      .select()
      .single();
    if (error) throw new Error(`plants insert: ${error.message}`);
    return { plant: data as PlantRow, instance, skillsUploaded };
  } catch (e) {
    // Do not leave an orphan instance billing compute if the plant could not be recorded.
    await deleteInstance(cfg, created.id).catch(() => undefined);
    throw e;
  }
}

/** Delete the plant's Agent37 instance (never the protected one) and its `plants` row. */
export async function removePlant(id: string): Promise<{ plantId: string; instanceId: string | null; instanceDeleted: boolean }> {
  const cfg = agent37Config();
  const db = supabaseAdmin();
  const { data, error } = await db.from("plants").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`plants select: ${error.message}`);
  if (!data) throw new Error(`plant ${id} not found`);
  const row = data as PlantRow;
  let instanceDeleted = false;
  if (row.agent37_instance_id) {
    assertNotProtected(row.agent37_instance_id);
    try {
      instanceDeleted = (await deleteInstance(cfg, row.agent37_instance_id)).deleted;
    } catch (e) {
      if (!(e instanceof Agent37ApiError && e.status === 404)) throw e;
      instanceDeleted = true; // already gone
    }
  }
  const del = await db.from("plants").delete().eq("id", id);
  if (del.error) throw new Error(`plants delete: ${del.error.message}`);
  return { plantId: id, instanceId: row.agent37_instance_id, instanceDeleted };
}

// ---------- CLI ----------

async function main(argv: string[]): Promise<void> {
  const flag = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (!argv.includes("--live")) {
    console.log("add-plant: pass --live to make real calls (add --name <n> | remove --id <plantId>)");
    return;
  }
  if (argv.includes("add")) {
    const r = await addPlant({ name: flag("--name") ?? "" });
    console.log(
      JSON.stringify(
        {
          plant: r.plant,
          instance: { id: r.instance.id, status: r.instance.status, template: r.instance.template, auto_sleep: r.instance.auto_sleep },
          skillsUploaded: r.skillsUploaded,
        },
        null,
        2,
      ),
    );
  } else if (argv.includes("remove")) {
    const id = flag("--id");
    if (!id) throw new Error("remove needs --id <plantId>");
    console.log(JSON.stringify(await removePlant(id)));
  } else {
    throw new Error("usage: --live add --name <n> | --live remove --id <plantId>");
  }
}

if (/add-plant.ts$/.test(process.argv[1] ?? "")) main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
