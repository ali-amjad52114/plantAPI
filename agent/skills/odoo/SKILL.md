# Odoo skill (ERP) — stock lookup, block/unblock Crushing Line 2

Odoo 20.0+e at `$ODOO_URL` (DB `$ODOO_DB`). Use the JSON-2 API. Never print `$ODOO_API_KEY`.
Writes are allowed ONLY on work centre `Crushing Line 2` (id 1, code CL2). Retry a failing call at most 2 times, then report the error.

Every call:

```bash
curl -s -X POST "$ODOO_URL/json/2/<model>/<method>" \
  -H "Authorization: bearer $ODOO_API_KEY" -H "X-Odoo-Database: $ODOO_DB" \
  -H "Content-Type: application/json" -d '<json body>'
```

## 1. Stock lookup (LC1D09BD)
`product.product/search_read` body:
`{"domain":[["default_code","=","LC1D09BD"]],"fields":["id","name","qty_available"],"limit":1}`
→ `internal_stock = qty_available`, `odoo_product_id = id` (currently product 1, qty 0).

## 2. Is Crushing Line 2 blocked?
`mrp.workcenter/search_read` `{"domain":[["name","=","Crushing Line 2"]],"fields":["id","working_state"]}` → `working_state` is `"blocked"` or `"normal"`.
Open block records: `mrp.workcenter.productivity/search_read`
`{"domain":[["workcenter_id","=",1],["date_end","=",false],["loss_type","!=","productive"]],"fields":["id","loss_id","description"]}`

## 3. Block Crushing Line 2 (ERP role)
Skip if step 2 already shows an open block (reuse its id). Otherwise:
1. Loss id: `mrp.workcenter.productivity.loss/search_read` `{"domain":[["name","=","Equipment Failure"]],"fields":["id"]}` (id 2).
2. `mrp.workcenter.productivity/create`
   `{"vals_list":[{"workcenter_id":1,"loss_id":2,"description":"PlantAPI: CV-104 contactor failure - line blocked pending repair"}]}` → returns `[<id>]`.
3. Re-run step 2; `working_state` must be `"blocked"`.
Report `odoo_block_ref = "mrp.workcenter.productivity:<id>"`.

## 4. Unblock Crushing Line 2 (Verification role)
`mrp.workcenter.button_unblock` is NOT available over JSON-2 (404). Instead close the open records from step 2:
`mrp.workcenter.productivity/write` `{"ids":[<open ids>],"vals":{"date_end":"<UTC now, YYYY-MM-DD HH:MM:SS>"}}` → `true`.
Re-run step 2; `working_state` must be `"normal"` and no open records → `odoo_unblocked = true`.

Backend re-check: `lib/tools/odoo.ts` (`odoo.stock`, `odoo.workcenterBlocked`). Smoke: `scripts/smoke-odoo.ts`.
