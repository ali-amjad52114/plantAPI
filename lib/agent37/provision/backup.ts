// S4: on-demand instance backups as pre-execution checkpoints
// (REAL API: https://www.agent37.com/docs/agents-api/instances#backups).
// POST /v1/instances/{id}/backups (no body) blocks until the backup finishes and returns the record (201).
// GET  /v1/instances/{id}/backups -> { data: [...] } newest first: up to 7 automatic + 1 manual.
// Limits: one on-demand backup per instance per 15 min (429 rate_limited + Retry-After); a new on-demand
// backup REPLACES the previous manual slot. The API has no label field: `label` is kept client-side only.
// This module never restores or deletes.

import { Agent37ApiError, send, type Agent37Config, type ApiRequest } from "./templates";
import { apiBase, cfgFromEnv } from "./budget";

export interface BackupRecord {
  id: string;
  kind: "manual" | "automatic";
  created: number; // unix seconds
  size_bytes: number;
}

export type CheckpointStatus = "completed" | "pending" | "rate_limited";

export interface Checkpoint {
  instanceId: string;
  label: string;
  status: CheckpointStatus;
  /** Backup id: the new backup when completed; the previous manual one when rate_limited. */
  id?: string;
  backup?: BackupRecord;
  /** Set when status is rate_limited (from the error message, best effort). */
  retryAfterSeconds?: number;
  /** Most recent manual backup still in place when rate limited (usable as the checkpoint). */
  previousManual?: BackupRecord;
  requestedAt: number; // unix seconds
  durationMs: number;
}

export function listBackupsRequest(cfg: Agent37Config, instanceId: string): ApiRequest {
  return {
    method: "GET",
    url: `${apiBase(cfg)}/instances/${encodeURIComponent(instanceId)}/backups`,
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  };
}

export function createBackupRequest(cfg: Agent37Config, instanceId: string): ApiRequest {
  return {
    method: "POST",
    url: `${apiBase(cfg)}/instances/${encodeURIComponent(instanceId)}/backups`,
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    note: "no body; blocks until the backup completes; max 1 per 15 min per instance; replaces the manual slot",
  };
}

/** GET /v1/instances/{id}/backups (newest first). */
export async function listBackups(instanceId: string, cfg: Agent37Config = cfgFromEnv()): Promise<BackupRecord[]> {
  const r = await send<{ data: BackupRecord[] }>(listBackupsRequest(cfg, instanceId));
  return r.data ?? [];
}

export interface CreateCheckpointOptions {
  cfg?: Agent37Config;
  /** Stop waiting on the POST after this long and look for the backup in the list instead. Default 10 min. */
  timeoutMs?: number;
}

/**
 * Take an on-demand backup before execution. Waits for completion (the API call blocks) and returns
 * {status:"completed", id}. On 429 returns {status:"rate_limited", previousManual, id: previousManual.id}
 * instead of throwing, so the caller can proceed with the previous manual checkpoint. On client timeout
 * returns {status:"pending"} (the backup still lands server-side; check listBackups later).
 * Other API errors throw Agent37ApiError.
 */
export async function createCheckpoint(
  instanceId: string,
  label: string,
  opts: CreateCheckpointOptions = {},
): Promise<Checkpoint> {
  const cfg = opts.cfg ?? cfgFromEnv();
  const t0 = Date.now();
  const requestedAt = Math.floor(t0 / 1000);
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rec = await Promise.race([
      send<BackupRecord>(createBackupRequest(cfg, instanceId)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (rec) {
      return { instanceId, label, status: "completed", id: rec.id, backup: rec, requestedAt, durationMs: Date.now() - t0 };
    }
    const latest = (await listBackups(instanceId, cfg)).find((b) => b.kind === "manual" && b.created >= requestedAt);
    return {
      instanceId,
      label,
      status: latest ? "completed" : "pending",
      id: latest?.id,
      backup: latest,
      requestedAt,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    if (e instanceof Agent37ApiError && e.status === 429) {
      const m = /(\d+)\s*s/.exec(e.message);
      const previousManual = (await listBackups(instanceId, cfg)).find((b) => b.kind === "manual");
      return {
        instanceId,
        label,
        status: "rate_limited",
        retryAfterSeconds: m ? Number(m[1]) : undefined,
        previousManual,
        id: previousManual?.id,
        requestedAt,
        durationMs: Date.now() - t0,
      };
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
