# Evidence storage plan (D3, S4)

Evidence = incident photos (`POST /api/incidents`, `POST /api/incidents/:id/complete`) and
agent/browser screenshots (Fiix runs). REAL ONLY: real bucket, real public URLs.

## Options

| | (a) Supabase Storage bucket `evidence` | (b) InstaCloud storage service |
|---|---|---|
| Matches CONTRACTS.md | yes ("Storage bucket `evidence` (public read)") | no (contract change needed) |
| Exists now | **yes** — verified read-only 2026-10-07: `GET $SUPABASE_URL/storage/v1/bucket` → `[{"id":"evidence","public":true,"type":"STANDARD",...}]` HTTP 200 | **no** — `insta service list` shows only `postgres/db`, `compute/app` |
| New cloud resource | none | `insta service add storage evidence` (gated, new resource) |
| New dependency | none (`@supabase/supabase-js` already in package.json) | `@aws-sdk/client-s3` (+ presigner) — new dep, not allowed |
| Env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already in CONTRACTS env list) | 5 extra binds: `BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` |
| Public URL | stable, documented: `.../storage/v1/object/public/evidence/<key>` | only if `storage set-access public`; host from `agent manifest` `publicUrl`, may be absent |
| Realtime UI | same project as `incidents` rows; UI already holds the anon client | separate system |

## Recommendation: (a) Supabase Storage `evidence`

Zero new resources, zero new deps, already matches the contract, bucket already exists and is public.
(b) is rejected: it needs a new service, a new dependency and a contract change.

### Commands for the lead

Nothing to create. Optional verification (read-only, prints no secrets):

```bash
set -a; . ./.env; set +a
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/storage/v1/bucket/evidence"      # expect "public":true
```

If the bucket were ever missing (e.g. new Supabase project), S1 adds an idempotent migration
(`supabase/` is S1-owned):

```sql
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', true)
on conflict (id) do update set public = true;
```

The deployed app needs no extra env beyond `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
(bound by `scripts/deploy-env.sh`).

## How the app uploads (server side only: API routes / worker, service-role key)

```ts
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// key layout: <incident_id>/<kind>-<timestamp>.<ext>   kind = intake | completion | fiix-screenshot
const key = `${incidentId}/intake-${Date.now()}.jpg`;
const { error } = await sb.storage.from("evidence").upload(key, bytes /* Buffer | Blob | File */, {
  contentType: file.type || "image/jpeg",   // always set, else browsers download instead of render
  upsert: false,
});
if (error) throw error;                        // REAL ONLY: surface, never fake a URL
const { data } = sb.storage.from("evidence").getPublicUrl(key);
// data.publicUrl → store on the incident / repair_event / agent_event row
```

- Multipart handler: `const f = (await req.formData()).get("photo") as File;` → `Buffer.from(await f.arrayBuffer())`.
- Screenshots (Fiix browser runs on Agent37): fetch/pull the PNG bytes, upload with `contentType: "image/png"`
  under `<incident_id>/fiix-screenshot-<ts>.png`.
- Browser never uploads directly (no anon write policy needed); browser only renders the public URL.

## URL shape returned

```
https://<SUPABASE_PROJECT_REF>.supabase.co/storage/v1/object/public/evidence/<incident_id>/<kind>-<ts>.<ext>
```

i.e. `${SUPABASE_URL}/storage/v1/object/public/evidence/<key>` — public, no token, permanent
(until the object is deleted). Store the full URL (not just the key) in the DB row so the UI renders
it with a plain `<img src>`.
