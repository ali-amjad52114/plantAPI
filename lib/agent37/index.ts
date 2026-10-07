// S1/A2 Agent37 client. Signatures fixed by lib/contracts/interfaces.ts. Real API only.
//
// Endpoints (verified live 2026-10-07 on instance pfd5d7eukw):
//   Control plane  {AGENT37_BASE_URL}=https://api.agent37.com/v1
//     GET  /instances/{id}                      -> { id, status: "sleeping"|..., url, ... }
//     POST /instances/{id}/exec  {command}      -> { exit_code, stdout, stderr, truncated }
//   Instance host  https://{id}.agent37.app/v1  (same Bearer key)
//     POST /responses {input, session_id?, reasoning_effort?, files?}
//          -> { id, session_id, status: "completed", output_text, usage: {input_tokens, output_tokens, cost_usd}, error, ... }
//     GET  /files/content?path=...              -> raw bytes (404 {error:{code:"file_not_found"}})
//     PUT  /files/content?path=...  raw body    -> upload
import type { Agent37Client, Agent37TurnRequest, Agent37TurnResult } from "@/lib/contracts/interfaces";
import type { AgentEvent, SystemName } from "@/lib/contracts/types";

type FetchLike = typeof fetch;

export interface Agent37ClientOptions {
  apiKey?: string;
  baseUrl?: string; // control plane, default AGENT37_BASE_URL or https://api.agent37.com/v1
  instanceHost?: (instanceId: string) => string; // default https://{id}.agent37.app/v1
  turnTimeoutMs?: number; // default 10 min
  fetch?: FetchLike;
}

export class Agent37Error extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "Agent37Error";
  }
}

/** Guess the sponsor/system badge from free text (tool call, command, prompt). */
export function guessSystem(text: string): SystemName {
  const t = text.toLowerCase();
  if (t.includes("fiix")) return "fiix";
  if (t.includes("odoo")) return "odoo";
  if (t.includes("monid")) return "monid" as SystemName;
  if (t.includes("rs-online") || t.includes("rs online")) return "rs";
  return "agent37" as SystemName;
}

function short(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

export function createAgent37Client(opts: Agent37ClientOptions = {}): Agent37Client {
  const f: FetchLike = opts.fetch ?? fetch;
  const key = () => {
    const k = opts.apiKey ?? process.env.AGENT37_API_KEY;
    if (!k) throw new Error("AGENT37_API_KEY is not set");
    return k;
  };
  const base = () => (opts.baseUrl ?? process.env.AGENT37_BASE_URL ?? "https://api.agent37.com/v1").replace(/\/$/, "");
  const host = opts.instanceHost ?? ((id: string) => `https://${id}.agent37.app/v1`);
  const turnTimeoutMs = opts.turnTimeoutMs ?? 10 * 60_000;

  async function call(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 120_000);
    try {
      const res = await f(url, {
        ...init,
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key()}`, ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        let code: string | undefined;
        let msg = `${res.status} ${res.statusText}`;
        try {
          const j = (await res.json()) as { error?: { code?: string; message?: string } };
          code = j.error?.code;
          if (j.error?.message) msg = `${res.status} ${j.error.code}: ${j.error.message}`;
        } catch { /* non-JSON body */ }
        throw new Agent37Error(`Agent37 ${init.method ?? "GET"} ${url.replace(/\?.*/, "")} -> ${msg}`, res.status, code);
      }
      return res;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new Agent37Error(`Agent37 request timed out: ${url.replace(/\?.*/, "")}`, 408, "timeout");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async runTurn(req: Agent37TurnRequest, onEvent: (e: Omit<AgentEvent, "incident_id">) => void): Promise<Agent37TurnResult> {
      const started = Date.now();
      const system = guessSystem(req.input);
      onEvent({
        agent: req.role,
        kind: "status",
        system: "agent37" as SystemName,
        message: `${req.role} agent started on Agent37${req.sessionId ? " (continuing session)" : ""}`,
        data: { instanceId: req.instanceId, sessionId: req.sessionId ?? null },
      });
      const body: Record<string, unknown> = { input: req.input };
      if (req.sessionId) body.session_id = req.sessionId;
      if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
      if (req.files?.length) body.files = req.files;
      try {
        const res = await call(`${host(req.instanceId)}/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          timeoutMs: turnTimeoutMs,
        });
        const j = (await res.json()) as {
          id: string;
          session_id: string;
          status?: string;
          output_text?: string;
          usage?: { input_tokens?: number; output_tokens?: number; cost_usd?: number | null };
          error?: { message?: string } | string | null;
        };
        const durationMs = Date.now() - started;
        if (j.error || (j.status && j.status !== "completed")) {
          const msg = typeof j.error === "string" ? j.error : j.error?.message ?? `status ${j.status}`;
          throw new Agent37Error(`Agent37 turn ${j.id} failed: ${msg}`, 200, "turn_failed");
        }
        const outputText = j.output_text ?? "";
        const costUsd = typeof j.usage?.cost_usd === "number" ? j.usage.cost_usd : null;
        onEvent({
          agent: req.role,
          kind: "output",
          system,
          message: `${req.role} finished in ${(durationMs / 1000).toFixed(1)}s: ${short(outputText, 120)}`,
          data: { responseId: j.id, sessionId: j.session_id, usage: j.usage ?? null, durationMs },
        });
        return { responseId: j.id, sessionId: j.session_id, outputText, costUsd, durationMs };
      } catch (e) {
        onEvent({
          agent: req.role,
          kind: "error",
          system: "agent37" as SystemName,
          message: short(`${req.role} turn failed: ${(e as Error).message}`),
          data: { durationMs: Date.now() - started },
        });
        throw e;
      }
    },

    async uploadFile(instanceId: string, path: string, content: Buffer): Promise<void> {
      await call(`${host(instanceId)}/files/content?path=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(content),
      });
    },

    async readFile(instanceId: string, path: string): Promise<Buffer> {
      const res = await call(`${host(instanceId)}/files/content?path=${encodeURIComponent(path)}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async exec(instanceId: string, command: string, timeoutMs = 120_000) {
      const res = await call(`${base()}/instances/${instanceId}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        timeoutMs,
      });
      const j = (await res.json()) as { exit_code: number; stdout?: string; stderr?: string };
      return { exitCode: j.exit_code, stdout: j.stdout ?? "", stderr: j.stderr ?? "" };
    },
  };
}

export const agent37: Agent37Client = createAgent37Client();
