# STATUS — live board (lead updates in place)

| Session | Folder | Branch | Port | Owns | Time box | State |
|---|---|---|---|---|---|---|
| L lead | C:\AI\agent37 | main | 3000 | contracts, merges, deploy | — | lead prep |
| S1 core | C:\AI\plantapi-core | s/core | 3001 | supabase, lib/agent37, lib/ai, lib/engine, worker, app/api | until 15:15 | S3-axu · first commit merged 14:54; fixing asset lookup |
| S2 tools | C:\AI\plantapi-tools | s/tools | 3002 | agent/skills, lib/tools, scripts/smoke-* | until 15:15 | S4 · roles+Odoo+Monid merged 14:54; Fiix in progress |
| S3 UI | C:\AI\plantapi-ui | s/ui | 3003 | app/(dashboard), app/components | until 15:15 | S2-UI · DONE 14:50, merged |
| S4 platform | C:\AI\plantapi-platform | s/platform | 3004 | agent/image, lib/agent37/provision, lib/infra, infra, app/(admin) | until 15:15 (D3 only) | S5 · Dockerfile+deploy in progress |

Shared quotas: Agent37 instance `pfd5d7eukw` only (no new instances except S4's named ones) · Monid ≤ $0.50/session · OpenAI ≤ $2/session · Supabase project `plantapi` (ref npbcyyudbftyklenxycr), migrations 001–009 S1 only, 020–029 S4.
