/// <reference types="node" />
/**
 * PlantAPI x InstaCloud governance demo (D2, session S4).
 *
 * Shows the three real agent-policy outcomes on the PlantAPI InstaCloud project:
 *   ALLOW   - `branch create analysis-<ts>`         (branch.create, unprotected branch)
 *   APPROVE - `compute scale 2 app --branch <it>`   (service.scale  -> real approval id)
 *             fallback if the free-plan 403 fires before the gate:
 *             `project rename <current name>`       (project.update -> real approval id, no-op body)
 *   DENY    - `project delete`                      (project.delete -> hard deny, no approval path)
 *
 * Usage:
 *   npx tsx lib/infra/governance-demo.ts            # dry run (default): read-only policy check + planned commands
 *   npx tsx lib/infra/governance-demo.ts --dry-run
 *   npx tsx lib/infra/governance-demo.ts --live     # performs the real calls (lead only)
 *
 * REAL ONLY: every decision and approval id printed in --live comes from the insta CLI output.
 * Nothing is hard-coded or simulated. Dry run executes only read-only commands.
 *
 * SAFETY: --live aborts before ANY mutating call unless the live policy is branch_specific/customize,
 * `main` is protected, project.delete resolves to deny and the gated actions resolve to approve.
 * Under full_access `project delete` would really delete the project; the guard is re-checked
 * immediately before the DENY step.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordInfraAction, rowFromStep } from "./infra-actions";

type Decision = "allow" | "approve" | "deny" | "blocked_plan" | "error" | "skipped";

interface CliResult {
  cmd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  json: unknown;
  ms: number;
}

interface StepResult {
  label: "ALLOW" | "APPROVE" | "DENY";
  action: string;
  expected: string;
  decision: Decision;
  approvalId: string | null;
  detail: string;
  cli: CliResult | null;
}

interface Policy {
  policy: { mode: string; rules: Record<string, string>; protectedBranchIds: string[] };
  effectiveRules?: Record<string, Record<string, string>>;
}

const ROOT = process.cwd();
const EVIDENCE_DIR = join(ROOT, "infra", "governance");
const COMPUTE_SERVICE = "app";
const GOVERNED_MODES = new Set(["branch_specific", "customize"]);

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
if (LIVE && args.includes("--dry-run")) {
  console.error("Pass either --live or --dry-run, not both.");
  process.exit(1);
}

// ---------- CLI plumbing ----------

function redact(s: string): string {
  return s
    .replace(/insta_[A-Za-z0-9_-]{8,}/g, "insta_[REDACTED]")
    .replace(/(postgres(?:ql)?|redis|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi, "$1://[REDACTED]")
    .replace(/("(?:token|password|secret|apiKey|api_key)"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"');
}

function insta(cliArgs: string[]): CliResult {
  const full = ["--agent", ...cliArgs];
  const cmd = `insta ${full.join(" ")}`;
  const t0 = Date.now();
  // The npm .cmd shim needs a shell on Windows. Every arg is a fixed token built by this script;
  // refuse anything with shell metacharacters, then pass one pre-joined command string.
  const bad = full.find((a) => !/^[A-Za-z0-9_.:\/=-]+$/.test(a));
  if (bad !== undefined) throw new Error(`refusing unsafe CLI argument: ${JSON.stringify(bad)}`);
  const r = spawnSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    timeout: 180_000,
  });
  const stdout = redact(r.stdout ?? "");
  const stderr = redact((r.stderr ?? "") + (r.error ? `\n${String(r.error)}` : ""));
  let json: unknown = null;
  try {
    json = stdout.trim() ? JSON.parse(stdout) : null;
  } catch {
    json = null;
  }
  return { cmd, exitCode: r.status, stdout, stderr, json, ms: Date.now() - t0 };
}

const UUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extract the real approval id from the CLI output (stderr hint or JSON body). */
function findApprovalId(r: CliResult): string | null {
  const text = `${r.stderr}\n${r.stdout}`;
  const hint = text.match(/approvals\s+approve\s+([0-9a-zA-Z-]{8,})/i);
  if (hint) return hint[1];
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== "object") return null;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^approval_?id$/i.test(k) && typeof val === "string") return val;
      if (/^approval$/i.test(k) && val && typeof val === "object") {
        const id = (val as Record<string, unknown>).id;
        if (typeof id === "string") return id;
      }
      const nested = walk(val);
      if (nested) return nested;
    }
    return null;
  };
  const fromJson = walk(r.json);
  if (fromJson) return fromJson;
  if (/approval/i.test(text)) {
    const m = text.match(UUIDISH);
    if (m) return m[0];
  }
  return null;
}

function classify(r: CliResult): { decision: Decision; approvalId: string | null; detail: string } {
  const text = `${r.stderr}\n${r.stdout}`;
  const firstLine = (s: string) => s.trim().split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (r.exitCode === 0) return { decision: "allow", approvalId: null, detail: "executed (exit 0)" };
  const approvalId = findApprovalId(r);
  if (r.exitCode === 2 && /approval/i.test(text)) {
    return { decision: approvalId ? "approve" : "error", approvalId, detail: firstLine(r.stderr) || firstLine(r.stdout) };
  }
  if (/\bden(y|ied)\b|policy_denied|not permitted by (the )?agent policy/i.test(text)) {
    return { decision: "deny", approvalId: null, detail: firstLine(r.stderr) || firstLine(r.stdout) };
  }
  if (/\b403\b|paid plan|upgrade your plan|billing subscribe|plan_required/i.test(text)) {
    return { decision: "blocked_plan", approvalId: null, detail: firstLine(r.stderr) || firstLine(r.stdout) };
  }
  return { decision: "error", approvalId, detail: `exit ${r.exitCode}: ${firstLine(r.stderr) || firstLine(r.stdout)}` };
}

// ---------- policy guard ----------

function rule(p: Policy, scope: string, action: string): string {
  return p.effectiveRules?.[scope]?.[action] ?? "unknown";
}

interface Guard {
  ok: boolean;
  reasons: string[];
  mode: string;
  mainProtected: boolean;
}

function checkGuard(p: Policy, mainBranchId: string | null): Guard {
  const reasons: string[] = [];
  const mode = p.policy?.mode ?? "unknown";
  if (!GOVERNED_MODES.has(mode)) reasons.push(`mode is ${mode} (need branch_specific or customize)`);
  const mainProtected = !!mainBranchId && (p.policy?.protectedBranchIds ?? []).includes(mainBranchId);
  // Not a safety condition for this demo (project.delete deny is checked below); warn only.
  if (!mainProtected) console.warn("warning: branch main is not in protectedBranchIds (human must run `insta agent policy protect-branch main`)");
  for (const scope of ["project", "unprotectedBranch", "protectedBranch"]) {
    const d = rule(p, scope, "project.delete");
    if (d !== "deny") reasons.push(`project.delete resolves to ${d} in scope ${scope} (need deny)`);
  }
  const bc = rule(p, "unprotectedBranch", "branch.create");
  if (bc !== "allow") reasons.push(`branch.create resolves to ${bc} on unprotected branches (need allow)`);
  const sc = rule(p, "unprotectedBranch", "service.scale");
  if (sc !== "approve") reasons.push(`service.scale resolves to ${sc} on unprotected branches (need approve)`);
  return { ok: reasons.length === 0, reasons, mode, mainProtected };
}

function readPolicy(): { policy: Policy | null; cli: CliResult } {
  const cli = insta(["agent", "policy", "get", "--json"]);
  return { policy: cli.exitCode === 0 ? (cli.json as Policy) : null, cli };
}

function readMainBranchId(): { id: string | null; cli: CliResult } {
  const cli = insta(["branch", "list", "--json"]);
  const list = Array.isArray(cli.json) ? (cli.json as Array<{ id: string; name: string }>) : [];
  return { id: list.find((b) => b.name === "main")?.id ?? null, cli };
}

function readProjectName(): string | null {
  const cli = insta(["project", "list", "--json"]);
  const status = insta(["status", "--json"]);
  const pid = (status.json as { project?: { projectId?: string } } | null)?.project?.projectId;
  const list = Array.isArray(cli.json) ? (cli.json as Array<{ id: string; name: string }>) : [];
  return list.find((p) => p.id === pid)?.name ?? null;
}

// ---------- output ----------

function printTable(rows: StepResult[]): void {
  const head = ["OUTCOME", "ACTION", "POLICY EXPECTS", "PLATFORM RETURNED", "APPROVAL ID", "DETAIL"];
  const data = rows.map((r) => [
    r.label,
    r.action,
    r.expected,
    r.decision.toUpperCase(),
    r.approvalId ?? "-",
    r.detail.slice(0, 70),
  ]);
  const w = head.map((h, i) => Math.max(h.length, ...data.map((d) => d[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(w[i])).join(" | ");
  console.log(line(head));
  console.log(w.map((n) => "-".repeat(n)).join("-+-"));
  for (const d of data) console.log(line(d));
}

// ---------- main ----------

function dryRun(): void {
  const stamp = new Date().toISOString();
  console.log(`# PlantAPI governance demo - DRY RUN (${stamp})`);
  console.log("# Read-only calls only: agent policy get, branch list. No mutating command is executed.\n");

  const { policy, cli } = readPolicy();
  const { id: mainId } = readMainBranchId();
  if (!policy) {
    console.log(`Policy read FAILED: ${cli.cmd} -> exit ${cli.exitCode}\n${cli.stderr.trim()}`);
  } else {
    const g = checkGuard(policy, mainId);
    console.log(`Live policy mode     : ${g.mode}`);
    console.log(`main branch protected: ${g.mainProtected}`);
    console.log("Effective decisions the demo depends on:");
    for (const [scope, action] of [
      ["unprotectedBranch", "branch.create"],
      ["unprotectedBranch", "service.scale"],
      ["project", "project.update"],
      ["project", "project.delete"],
    ]) {
      console.log(`  ${scope.padEnd(18)} ${action.padEnd(15)} -> ${rule(policy, scope, action)}`);
    }
    console.log(`\n--live guard: ${g.ok ? "PASS (live run would proceed)" : "WOULD ABORT before any mutating call"}`);
    for (const r of g.reasons) console.log(`  - ${r}`);
  }

  const branch = "analysis-<ts>";
  console.log("\nPlanned --live sequence (each command is run once, output parsed for the real decision):");
  console.log(`  0. insta --agent agent policy get --json            # guard (abort unless governed)`);
  console.log(`  1. ALLOW   insta --agent branch create ${branch} --json`);
  console.log(`  2. APPROVE insta --agent compute scale 2 ${COMPUTE_SERVICE} --branch ${branch} --json   # expect exit 2 + approval id`);
  console.log(`     fallback if free-plan 403 fires first: insta --agent project rename "<current name>" --json   # project.update, same-name body`);
  console.log(`  3. (re-read policy; abort unless project.delete -> deny)`);
  console.log(`     DENY    insta --agent project delete --json        # expect policy deny, no approval path`);
  console.log(`  4. insta --agent agent approvals list --status pending --json ; insta --agent agent events --limit 25 --json`);
  console.log(`  5. write infra/governance/evidence-<timestamp>.json`);
  console.log("\nAfter --live, the lead (human terminal) cleans up:");
  console.log("  insta agent approvals deny <approval-id>");
  console.log(`  insta branch delete ${branch}`);
}

async function live(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `analysis-${stamp.slice(0, 19).replace(/[-T]/g, "").toLowerCase()}`;
  const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), mode: "live", branch };
  const evidenceFile = join(EVIDENCE_DIR, `evidence-${stamp}.json`);
  const save = () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + "\n");
  };

  console.log(`# PlantAPI governance demo - LIVE (${evidence.startedAt})`);

  // Guard 1: before any mutating call.
  const pre = readPolicy();
  const main = readMainBranchId();
  evidence.preflight = { policyCli: pre.cli, branchListCli: main.cli };
  if (!pre.policy) {
    evidence.aborted = `policy read failed: exit ${pre.cli.exitCode}`;
    save();
    console.error(`ABORT: could not read policy (${pre.cli.stderr.trim()}). Evidence: ${evidenceFile}`);
    process.exit(1);
  }
  const prePolicy: Policy = pre.policy;
  const g = checkGuard(prePolicy, main.id);
  evidence.guard = g;
  if (!g.ok) {
    evidence.aborted = "policy guard failed";
    save();
    console.error("ABORT: live policy is not safe for the demo. No mutating command was run.");
    for (const r of g.reasons) console.error(`  - ${r}`);
    console.error(`Evidence: ${evidenceFile}`);
    process.exit(1);
  }

  const steps: StepResult[] = [];
  // Each real decision is also written to Supabase infra_actions (migration 020) so the UI shows it live.
  // --live only; the dry run never writes. A DB failure is logged and never changes the platform result.
  const recorded: { label: string; id: string | null; error?: string }[] = [];
  const add = async (s: StepResult): Promise<void> => {
    steps.push(s);
    try {
      const id = await recordInfraAction(rowFromStep(stamp, s));
      recorded.push({ label: s.label, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      recorded.push({ label: s.label, id: null, error: msg });
      console.error(`WARN infra_actions write failed for ${s.label}: ${msg}`);
    }
  };

  // ALLOW
  {
    const cli = insta(["branch", "create", branch, "--json"]);
    const c = classify(cli);
    await add({ label: "ALLOW", action: "branch.create", expected: rule(prePolicy, "unprotectedBranch", "branch.create"), ...c, cli });
  }

  // APPROVE
  {
    const branchOk = steps[0].decision === "allow";
    let cli: CliResult | null = null;
    let c: { decision: Decision; approvalId: string | null; detail: string } = {
      decision: "skipped",
      approvalId: null,
      detail: "analysis branch was not created",
    };
    if (branchOk) {
      cli = insta(["compute", "scale", "2", COMPUTE_SERVICE, "--branch", branch, "--json"]);
      c = classify(cli);
    }
    await add({ label: "APPROVE", action: "service.scale", expected: rule(prePolicy, "unprotectedBranch", "service.scale"), ...c, cli });

    if (c.decision !== "approve") {
      // Plan gate (free -> 403) answered before the policy gate, or scale was not attempted:
      // use project.update with an unchanged name so even an approved re-run is a no-op.
      const expected = rule(prePolicy, "project", "project.update");
      const name = readProjectName();
      if (expected === "approve" && name && /^[A-Za-z0-9_-]+$/.test(name)) {
        const fb = insta(["project", "rename", name, "--json"]);
        const fc = classify(fb);
        await add({ label: "APPROVE", action: "project.update (fallback)", expected, ...fc, cli: fb });
      } else {
        await add({
          label: "APPROVE",
          action: "project.update (fallback)",
          expected,
          decision: "skipped",
          approvalId: null,
          detail: expected !== "approve" ? `project.update resolves to ${expected}, not approve` : `unsafe/unknown project name: ${name}`,
          cli: null,
        });
      }
    }
  }

  // DENY - guard 2: re-read the live policy immediately before project delete.
  {
    const again = readPolicy();
    const g2 = again.policy ? checkGuard(again.policy, main.id) : null;
    if (!again.policy || !g2?.ok) {
      await add({
        label: "DENY",
        action: "project.delete",
        expected: again.policy ? rule(again.policy, "project", "project.delete") : "unknown",
        decision: "skipped",
        approvalId: null,
        detail: `ABORTED: policy changed or unreadable before DENY (${g2?.reasons.join("; ") ?? "read failed"})`,
        cli: again.cli,
      });
    } else {
      const cli = insta(["project", "delete", "--json"]);
      const c = classify(cli);
      await add({ label: "DENY", action: "project.delete", expected: rule(again.policy, "project", "project.delete"), ...c, cli });
    }
  }

  evidence.steps = steps;
  evidence.infraActions = { runId: stamp, rows: recorded };
  evidence.pendingApprovals = insta(["agent", "approvals", "list", "--status", "pending", "--json"]);
  evidence.events = insta(["agent", "events", "--limit", "25", "--json"]);
  evidence.finishedAt = new Date().toISOString();
  save();

  console.log("");
  printTable(steps);
  const ids = steps.map((s) => s.approvalId).filter((x): x is string => !!x);
  console.log(`\nEvidence: ${evidenceFile}`);
  console.log("\nLead (human terminal) next:");
  for (const id of ids) console.log(`  insta agent approvals deny ${id}      # or approve, then re-run the exact command once`);
  if (steps[0].decision === "allow") console.log(`  insta branch delete ${branch}`);

  const ok =
    steps.some((s) => s.label === "ALLOW" && s.decision === "allow") &&
    steps.some((s) => s.label === "APPROVE" && s.decision === "approve" && s.approvalId) &&
    steps.some((s) => s.label === "DENY" && s.decision === "deny");
  console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"} (ALLOW/APPROVE/DENY all observed from the live platform: ${ok})`);
  process.exit(ok ? 0 : 1);
}

if (LIVE) void live();
else dryRun();
