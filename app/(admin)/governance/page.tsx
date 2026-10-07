// "/governance" — InstaCloud policy decisions recorded in Supabase `infra_actions` (written by S5): ALLOW / APPROVE / DENY with approval ids.
// Columns are read defensively until the contract pins them.
import "@/app/components/control/hmi.css";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const metadata = { title: "PlantAPI · Governance" };

type Row = Record<string, unknown>;
const pick = (r: Row, ...ks: string[]) => { for (const k of ks) if (r[k] != null && r[k] !== "") return String(r[k]); return ""; };

export default async function GovernancePage() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const res = url && key ? await createClient(url, key).from("infra_actions").select("*").order("created_at", { ascending: false }).limit(100) : null;
  const missing = !res || (res.error && /does not exist|schema cache|not find/i.test(res.error.message));
  const rows = (res?.data ?? []) as Row[];
  const count = (v: string) => rows.filter(r => pick(r, "outcome", "decision", "verdict", "platform_returned").toUpperCase() === v).length;

  return (
    <div className="cr">
      <header className="top">
        <Link className="back" href="/">&#8249;&nbsp;SITE</Link>
        <div className="word"><i aria-hidden="true" />PLANTAPI</div>
        <nav><Link href="/plant" style={{ color: "#9aa09b", display: "flex", alignItems: "center", padding: "0 16px", fontWeight: 700, fontSize: 11, letterSpacing: ".1em" }}>PLANT</Link>
          <Link href="/governance" style={{ color: "#fff", display: "flex", alignItems: "center", padding: "0 16px", fontWeight: 700, fontSize: 11, letterSpacing: ".1em" }}>GOVERNANCE</Link></nav>
      </header>
      <main className="wrap">
        <div className="banner"><div className="msg"><span className="m" style={{ fontWeight: 700 }}>
          INSTACLOUD POLICY · {rows.length} ACTIONS · <span className="c-ok">{count("ALLOW")} ALLOW</span> · <span className="c-act">{count("APPROVE")} APPROVE</span> · <span className="c-warn">{count("DENY")} DENY</span></span></div></div>
        <div className="pane">
          <h2>Infrastructure actions <span>infra_actions · newest first</span></h2>
          {missing ? <p className="note act" style={{ margin: 10 }}>The <code>infra_actions</code> table doesn&apos;t exist yet. It appears here as soon as the platform session creates it.</p>
            : res?.error ? <p className="note warn" style={{ margin: 10 }}>{res.error.message}</p>
            : rows.length === 0 ? <p className="dim" style={{ padding: 10, margin: 0 }}>No infrastructure actions recorded yet.</p>
            : <div className="jwrap" style={{ maxHeight: "none" }}><table className="j"><thead><tr><th>TIME</th><th>VERDICT</th><th>WHO</th><th>ACTION</th><th>APPROVAL ID</th><th>EXPECTED</th><th>DETAIL</th></tr></thead>
              <tbody>{rows.map((r, i) => {
                const v = pick(r, "outcome", "decision", "verdict", "platform_returned").toUpperCase();
                const t = pick(r, "created_at");
                const d = pick(r, "detail");
                const who = /^Lead AI/i.test(d) ? "LEAD AI" : /^Human/i.test(d) ? "HUMAN" : /^Agent/i.test(d) || pick(r, "run_id") ? "AGENT" : "—";
                return (<tr key={pick(r, "id") || i}>
                  <td>{t ? new Date(t).toTimeString().slice(0, 5) : ""}</td>
                  <td><span className={"verdict " + v}>{v || "—"}</span></td>
                  <td className={"m " + (who === "LEAD AI" && v === "DENY" ? "c-warn" : "")}>{who}</td>
                  <td>{pick(r, "action", "operation", "command")}</td>
                  <td className="m">{pick(r, "approval_id", "approval")}</td>
                  <td className="m">{pick(r, "policy_expected").toUpperCase()}{/^(allow|approve|deny)$/i.test(pick(r, "platform_returned")) && pick(r, "policy_expected").toLowerCase() !== pick(r, "platform_returned").toLowerCase() ? <span className="c-warn"> ≠ {pick(r, "platform_returned").toUpperCase()}</span> : null}</td>
                  <td>{pick(r, "detail", "reason", "message")}{pick(r, "platform_returned") && !/^(allow|approve|deny)$/i.test(pick(r, "platform_returned")) && <div className="dim" style={{ fontSize: 11 }}>platform: {pick(r, "platform_returned")}</div>}</td>
                </tr>); })}</tbody></table></div>}
        </div>
      </main>
    </div>
  );
}
