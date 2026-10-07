// D1 (S4): Agent37 template builds, instance provisioning and live view.
// REAL API only (https://www.agent37.com/docs/agents-api/templates, instances, desktop, urls).
// Every call is split into a pure request builder (`*Request`) and `send()`, so the dry-run CLI can print the
// exact requests without touching the network and without inventing responses.

export const AGENT37_API_DEFAULT = "https://api.agent37.com/v1";
/** Port where the hermes-vnc-desktop template serves noVNC. */
export const VNC_PORT = 6901;
/** The shared plant instance. Provisioning code must never modify or delete it. */
export const PROTECTED_INSTANCE_IDS: readonly string[] = ["pfd5d7eukw"];

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  /** JSON body (serialized by send) */
  json?: unknown;
  /** Raw body (template context upload) */
  raw?: Uint8Array;
  /** Human note for dry-run output */
  note?: string;
}

export interface Agent37Config {
  apiKey: string;
  baseUrl?: string; // defaults to AGENT37_API_DEFAULT; AGENT37_BASE_URL in .env already ends in /v1
}

export class Agent37ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly request: string,
  ) {
    super(`${request} -> ${status} ${code}: ${message}`);
    this.name = "Agent37ApiError";
  }
}

// ---------- types (fields per docs; only what we read) ----------

export interface Template {
  name: string;
  scope?: "system" | "workspace";
  image_ref?: string | null;
  image_digest?: string | null;
  default_port?: number | null;
  revision?: number;
  description?: string | null;
}

export type BuildStatus = "created" | "building" | "ingesting" | "succeeded" | "failed";

export interface TemplateBuild {
  id: string;
  name: string;
  status: BuildStatus;
  upload_url?: string; // bearer credential: never log
  expires_at?: number;
  max_bytes?: number;
  template?: { name: string; revision: number; image_digest: string };
  error?: { code: string; message: string };
  created?: number;
  started?: number;
  finished?: number;
}

export interface TemplateBuildLogs extends TemplateBuild {
  offset: number;
  data: string;
}

export interface Instance {
  id: string;
  status: string;
  template: string;
  url?: string;
  auto_sleep?: boolean;
  idle_timeout_seconds?: number;
  resources?: { cpu: number; memory: number; disk: number };
  template_revision?: number;
  [k: string]: unknown;
}

export interface CreateInstanceOptions {
  template: string;
  autoSleep: boolean;
  /** Managed-usage ceiling in USD (LLM/Brave/Composio). Sent as budget.monthly_cap_micros. Compute bills separately. */
  budgetUsd: number;
  idleTimeoutSeconds?: number;
  name?: string;
  metadata?: Record<string, string>;
  /** Container env vars. Values are secrets in practice: never printed by the dry-run. */
  env?: Record<string, string>;
  resources?: { cpu: number; memory: number; disk?: number };
}

export interface LiveView {
  instanceId: string;
  /** Open in a top-level tab (not an iframe). Token grants full control. */
  vncUrl: string;
  /** For an embedded noVNC RFB client. */
  wsUrl: string;
  expiresInSeconds: number;
}

// ---------- request builders (pure) ----------

function base(cfg: Agent37Config): string {
  return (cfg.baseUrl ?? AGENT37_API_DEFAULT).replace(/\/+$/, "");
}

function auth(cfg: Agent37Config, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const TEMPLATE_NAME = /^[a-z][a-z0-9-]{1,62}$/;

export function assertTemplateName(name: string): void {
  if (!TEMPLATE_NAME.test(name) || name.startsWith("agent37-")) {
    throw new Error(`invalid workspace template name: ${name}`);
  }
}

export function assertNotProtected(instanceId: string): void {
  if (PROTECTED_INSTANCE_IDS.includes(instanceId)) {
    throw new Error(`refusing to modify protected instance ${instanceId}`);
  }
}

export function getTemplateRequest(cfg: Agent37Config, name: string): ApiRequest {
  return { method: "GET", url: `${base(cfg)}/templates/${encodeURIComponent(name)}`, headers: auth(cfg) };
}

export function createBuildRequest(
  cfg: Agent37Config,
  p: { name: string; sizeBytes: number; defaultPort?: number; description?: string },
): ApiRequest {
  assertTemplateName(p.name);
  if (!Number.isInteger(p.sizeBytes) || p.sizeBytes < 1 || p.sizeBytes > 1_000_000_000) {
    throw new Error(`build context size out of range: ${p.sizeBytes}`);
  }
  const json: Record<string, unknown> = { name: p.name, size_bytes: p.sizeBytes };
  if (p.defaultPort !== undefined) json.default_port = p.defaultPort;
  if (p.description) json.description = p.description;
  return { method: "POST", url: `${base(cfg)}/template-builds`, headers: auth(cfg, true), json };
}

/** Presigned PUT: no Agent37 key goes to this URL. */
export function uploadContextRequest(uploadUrl: string, context: Uint8Array): ApiRequest {
  return { method: "PUT", url: uploadUrl, headers: {}, raw: context, note: "presigned upload_url from create build" };
}

export function startBuildRequest(cfg: Agent37Config, buildId: string): ApiRequest {
  return { method: "POST", url: `${base(cfg)}/template-builds/${buildId}/start`, headers: auth(cfg, true), json: {} };
}

export function getBuildRequest(cfg: Agent37Config, buildId: string): ApiRequest {
  return { method: "GET", url: `${base(cfg)}/template-builds/${buildId}`, headers: auth(cfg) };
}

export function buildLogsRequest(cfg: Agent37Config, buildId: string, offset: number): ApiRequest {
  return { method: "GET", url: `${base(cfg)}/template-builds/${buildId}/logs?offset=${offset}`, headers: auth(cfg) };
}

export function createInstanceRequest(cfg: Agent37Config, o: CreateInstanceOptions): ApiRequest {
  if (!(o.budgetUsd > 0) || o.budgetUsd > 5) throw new Error(`budgetUsd must be in (0, 5]: ${o.budgetUsd}`);
  const json: Record<string, unknown> = {
    template: o.template,
    auto_sleep: o.autoSleep,
    budget: { monthly_cap_micros: Math.round(o.budgetUsd * 1_000_000) },
  };
  if (o.idleTimeoutSeconds !== undefined) json.idle_timeout_seconds = o.idleTimeoutSeconds;
  if (o.name) json.name = o.name;
  if (o.metadata) json.metadata = o.metadata;
  if (o.env) json.env = o.env;
  if (o.resources) json.resources = o.resources;
  return { method: "POST", url: `${base(cfg)}/instances`, headers: auth(cfg, true), json };
}

export function getInstanceRequest(cfg: Agent37Config, id: string): ApiRequest {
  return { method: "GET", url: `${base(cfg)}/instances/${id}`, headers: auth(cfg) };
}

export function deleteInstanceRequest(cfg: Agent37Config, id: string): ApiRequest {
  assertNotProtected(id);
  return { method: "DELETE", url: `${base(cfg)}/instances/${id}`, headers: auth(cfg) };
}

export function signedUrlRequest(cfg: Agent37Config, id: string, port: number, ttlSeconds: number): ApiRequest {
  return {
    method: "POST",
    url: `${base(cfg)}/instances/${id}/signed-url`,
    headers: auth(cfg, true),
    json: { port, ttl_seconds: ttlSeconds },
  };
}

// ---------- transport ----------

export async function send<T>(req: ApiRequest): Promise<T> {
  const init: { method: string; headers: Record<string, string>; body?: string | Uint8Array } = {
    method: req.method,
    headers: req.headers,
  };
  if (req.json !== undefined) init.body = JSON.stringify(req.json);
  else if (req.raw) init.body = req.raw;
  const res = await fetch(req.url, init as RequestInit);
  const text = await res.text();
  const label = `${req.method} ${redactUrl(req.url)}`;
  if (!res.ok) {
    let code = "http_error";
    let message = text.slice(0, 500);
    try {
      const e = JSON.parse(text).error;
      if (e?.code) code = e.code;
      if (e?.message) message = e.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Agent37ApiError(res.status, code, message, label);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Strip query strings (presigned signatures, a37_token) from anything we print. */
export function redactUrl(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const u = new URL(url);
  if (u.searchParams.has("offset")) return `${u.origin}${decodeURI(u.pathname)}?offset=${u.searchParams.get("offset")}`;
  return `${u.origin}${decodeURI(u.pathname)}?<redacted>`;
}

// ---------- high-level operations (REAL network calls) ----------

/** GET /v1/templates/{name}; returns null on 404. */
export async function getTemplate(cfg: Agent37Config, name: string): Promise<Template | null> {
  try {
    return await send<Template>(getTemplateRequest(cfg, name));
  } catch (e) {
    if (e instanceof Agent37ApiError && e.status === 404) return null;
    throw e;
  }
}

export interface BuildTemplateOptions {
  name: string;
  context: Uint8Array; // gzipped tar, Dockerfile at root
  defaultPort?: number;
  description?: string;
  pollMs?: number;
  timeoutMs?: number; // server limit is 45 min
  onLog?: (chunk: string) => void;
}

/** Cloud build: create -> PUT context -> start -> poll logs until succeeded/failed. */
export async function buildTemplate(cfg: Agent37Config, o: BuildTemplateOptions): Promise<TemplateBuild> {
  const created = await send<TemplateBuild>(
    createBuildRequest(cfg, {
      name: o.name,
      sizeBytes: o.context.byteLength,
      defaultPort: o.defaultPort,
      description: o.description,
    }),
  );
  if (!created.upload_url) throw new Error(`build ${created.id}: no upload_url in create response`);
  const up = await fetch(created.upload_url, { method: "PUT", body: o.context } as RequestInit);
  if (!up.ok) throw new Error(`build ${created.id}: context upload failed with HTTP ${up.status}`);
  await send<TemplateBuild>(startBuildRequest(cfg, created.id));

  const pollMs = o.pollMs ?? 5000;
  const deadline = Date.now() + (o.timeoutMs ?? 50 * 60_000);
  let offset = 0;
  for (;;) {
    const b = await send<TemplateBuildLogs>(buildLogsRequest(cfg, created.id, offset));
    if (b.data) o.onLog?.(b.data);
    offset = b.offset ?? offset;
    if (b.status === "succeeded" || b.status === "failed") {
      const { data: _d, offset: _o, ...build } = b;
      return build;
    }
    if (Date.now() > deadline) throw new Error(`build ${created.id}: still ${b.status} after timeout`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** POST /v1/instances. Returns once the instance is running (per docs). */
export async function createInstance(cfg: Agent37Config, o: CreateInstanceOptions): Promise<Instance> {
  return send<Instance>(createInstanceRequest(cfg, o));
}

export async function getInstance(cfg: Agent37Config, id: string): Promise<Instance> {
  return send<Instance>(getInstanceRequest(cfg, id));
}

/** DELETE /v1/instances/{id}. Destructive; refuses the protected plant instance. */
export async function deleteInstance(cfg: Agent37Config, id: string): Promise<{ id: string; deleted: boolean }> {
  return send(deleteInstanceRequest(cfg, id));
}

/** Mint a signed URL for noVNC (port 6901) and turn it into the /vnc.html page URL and the websocket URL. */
export async function getLiveViewUrl(
  cfg: Agent37Config,
  instanceId: string,
  opts: { ttlSeconds?: number; viewOnly?: boolean } = {},
): Promise<LiveView> {
  const ttl = opts.ttlSeconds ?? 60;
  const r = await send<{ url: string }>(signedUrlRequest(cfg, instanceId, VNC_PORT, ttl));
  return toLiveView(instanceId, r.url, ttl, opts.viewOnly ?? false);
}

export function toLiveView(instanceId: string, signedUrl: string, ttl: number, viewOnly: boolean): LiveView {
  const u = new URL(signedUrl);
  const token = u.searchParams.get("a37_token");
  if (!token) throw new Error("signed-url response has no a37_token");
  const page = new URL(`${u.origin}/vnc.html`);
  page.searchParams.set("a37_token", token);
  page.searchParams.set("autoconnect", "1");
  page.searchParams.set("resize", "scale");
  if (viewOnly) page.searchParams.set("view_only", "1");
  return {
    instanceId,
    vncUrl: page.toString(),
    wsUrl: `wss://${u.host}/websockify?a37_token=${encodeURIComponent(token)}`,
    expiresInSeconds: ttl,
  };
}
