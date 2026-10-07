---
name: monid-supplier-search
description: Find external suppliers (price, lead time, product URL) for a spare part via Monid, preferring RS Components / RS Online. Used by the Materials agent when internal stock is 0.
---

# Monid supplier search (PlantAPI Materials agent)

Search/email/calls to the outside world go **only** through Monid. Real results only: never type a supplier or price yourself. Never buy, add to cart, or check out.

## Setup (run first, every turn)
The Monid CLI is installed on the plant instance at `~/.npm-global/bin/monid` and is already authenticated — it is NOT missing. It is not on the default PATH, so always start with:
```bash
export PATH="$HOME/.npm-global/bin:$PATH"; export NO_COLOR=1
monid whoami   # must say Authenticated; if not, report BLOCKED with the exact output
```
If `monid` still is not found, call it by absolute path: `~/.npm-global/bin/monid`. Never conclude "Monid is not installed" without trying that path.

## Budget
- `monid discover` and `monid inspect` are free.
- One search = `litescrape /google/shopping`, $0.00015/call. Max 1 search per run, retry a failed call at most 2 times.
- Set `NO_COLOR=1` (and `MSYS_NO_PATHCONV=1` on Git Bash, or endpoint paths get mangled).

## Steps
1. Discover (free): `monid discover -q "google shopping product search" -l 5`
   Expect `litescrape /google/shopping` (stable, ~4 s). If it is missing or in outage, take the best verified Google Shopping endpoint from the list and `monid inspect` it before running.
2. Inspect (free, first time only): `monid inspect -p litescrape -e /google/shopping` — input is query params only (`q`, `num`, `gl`, `hl`).
3. Search (paid, one call), RS-targeted query first:
   ```bash
   monid run -p litescrape -e /google/shopping \
     --query '{"q":"<PART> RS Components","num":20,"gl":"us","hl":"en"}' -w 90 -o monid-<PART>.json
   ```
   For LC1D09BD use exactly `"q":"LC1D09BD RS Components"` (proven 2026-10-07 to return RS - America). Do not run a second search; if no RS row, use the best other matching row.
   Then read the result: `cat monid-<PART>.json` (the rows are in `shopping_results[]`).
4. Map `shopping_results[]` to SupplierOption. Keep only rows whose title contains the part number (ignore `-`/spaces/case), that have `extracted_price`, and no `second_hand_condition`:
   - `supplier` = `source` · `part` = the part · `price` = `extracted_price` · `currency` = "USD"
   - `stock` = null (Google Shopping has no stock count; the browser step reads it on the product page)
   - `lead_time` = `delivery` or "unknown" · `url` = `product_link` or null · `source` = "monid"
5. Order: RS rows first (source matches `RS`, `RS Components`, `RS Online`, `RS - America`), then rows with a URL, then lowest price. `recommended_index` = 0.
6. Report `monid_tool: "litescrape /google/shopping"` in MaterialsOutput and log the run cost.

## Output (exactly this JSON, inside MaterialsOutput.suppliers)
```json
[{"supplier":"RS - America","part":"LC1D09BD","price":152.64,"currency":"USD","stock":null,"lead_time":"unknown","url":"https://www.google.com/search?ibp=oshop&...","source":"monid"}]
```
(Example values are from the real 2026-10-07 run; always use the values from your own run.)

## Errors
- `BLOCKED`: workspace budget/run cap — stop and report the `controls` entry; do not retry.
- `FAILED` / non-200: re-inspect, retry at most 2 times, then report the exact error.
- No matching rows: return the error "no priced listing matching <PART>"; do not invent a supplier.

Code equivalent: `lib/tools/monid.ts` → `searchSuppliers(part)`; smoke test `scripts/smoke-monid.ts`.
