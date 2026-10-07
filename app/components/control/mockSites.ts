// Demo-mode copies of the pages agents browse (Fiix CMMS, RS Components). Live mode shows Agent37 screenshots instead.
// Each highlightable element carries data-hl="<key>"; agent events reference it as data.hl.
export interface SiteCtx { triaged: boolean; wo: boolean; closed: boolean; basket: number }

const fx = (body: string) => `<div class="site fx"><div class="s-top"><b>CMMS</b><span>Crushing Plant</span>
  <button class="lnk" data-go="fiix_home">Assets</button><button class="lnk" data-go="fiix_history">Work orders</button>
  <span style="margin-left:auto;font-size:12px">plantapi-agent</span></div><div class="s-body">${body}</div></div>`;
const rs = (c: SiteCtx, body: string) => `<div class="site rs"><div class="s-top"><b style="color:#b01e23">RS Components</b>
  <button class="lnk" data-go="rs_search">Search: LC1D09BD</button><span style="margin-left:auto">Basket (${c.basket})</span></div><div class="s-body">${body}</div></div>`;
const tag = (c: SiteCtx) => (c.triaged && !c.closed ? '<span class="s-tag down">Down</span>' : '<span class="s-tag ok">Running</span>');
const woTag = (c: SiteCtx) => (c.closed ? '<span class="s-tag ok">Closed</span>' : '<span class="s-tag open">Assigned</span>');

export const MOCK_PAGES: Record<string, (c: SiteCtx) => string> = {
  fiix_home: c => fx(`<h3>Assets · Crushing Plant</h3><table class="s-tbl"><thead><tr><th>Code</th><th>Name</th><th>Location</th><th>Status</th></tr></thead><tbody>
    <tr data-hl="cv104"><td><button class="lnk" data-go="fiix_asset">CV-104</button></td><td>Conveyor</td><td>Crushing Line 2</td><td>${tag(c)}</td></tr>
    <tr><td>MTR-104</td><td>Conveyor drive motor</td><td>Crushing Line 2</td><td><span class="s-tag ok">Running</span></td></tr>
    <tr><td>MCC-03</td><td>Motor control centre</td><td>Crushing Line 2</td><td><span class="s-tag ok">Running</span></td></tr>
    <tr><td>P-302</td><td>Slurry pump</td><td>Wash plant</td><td><span class="s-tag ok">Running</span></td></tr>
    <tr><td>FV-221</td><td>Feed valve</td><td>Wash plant</td><td><span class="s-tag ok">Running</span></td></tr></tbody></table>`),
  fiix_asset: c => fx(`<span class="s-crumb">Assets › CV-104</span><h3>CV-104 Conveyor</h3>
    <div class="s-tabs"><b>Details</b><button class="lnk" data-go="fiix_history">Work order history</button><button class="lnk" data-go="fiix_new">New work order</button></div>
    <dl class="s-kv"><dt>Status</dt><dd data-hl="status">${tag(c)}</dd><dt>Location</dt><dd>Crushing Line 2</dd><dt>Fed from</dt><dd>MCC-03, breaker 7</dd>
      <dt>Starter</dt><dd>Contactor LC1D09BD (9 A, 24 V dc coil)</dd><dt>Procedure</dt><dd>LOTO-CV104</dd><dt>Criticality</dt><dd>A (stops Line 2)</dd></dl>`),
  fiix_history: c => fx(`<span class="s-crumb">Assets › CV-104 › Work orders</span><h3>Work order history · CV-104</h3>
    <table class="s-tbl"><thead><tr><th>WO</th><th>Date</th><th>Task</th><th>Status</th></tr></thead><tbody data-hl="hist">
    ${c.wo ? `<tr><td><button class="lnk" data-go="fiix_wo">WO-1187</button></td><td>2026-10-07</td><td>Replace burned contactor LC1D09BD</td><td>${woTag(c)}</td></tr>` : ""}
    <tr data-hl="wo1102"><td>WO-1102</td><td>2026-09-02</td><td>Contactor tripped, replaced LC1D09BD</td><td><span class="s-tag ok">Closed</span></td></tr>
    <tr data-hl="wo1031"><td>WO-1031</td><td>2026-07-11</td><td>Contactor welded, replaced LC1D09BD</td><td><span class="s-tag ok">Closed</span></td></tr></tbody></table>`),
  fiix_new: () => fx(`<span class="s-crumb">Work orders › New</span><h3>New work order</h3>
    <div class="s-form">
      <label data-hl="wo_asset">Asset<input value="CV-104 Conveyor" readonly></label>
      <label data-hl="wo_task">Task<input value="Replace burned contactor LC1D09BD" readonly></label>
      <label>Priority<input value="High" readonly></label>
      <label data-hl="wo_who">Assigned to<input value="Sarah Chen" readonly></label>
      <label data-hl="wo_when">Scheduled<input value="2026-10-07 18:00" readonly></label>
      <label>Procedure<input value="LOTO-CV104" readonly></label>
      <button class="s-btn" data-act="create" data-hl="create">Create work order</button></div>`),
  fiix_wo: c => fx(`<span class="s-crumb">Work orders › WO-1187</span><h3>WO-1187 · Replace burned contactor LC1D09BD</h3>
    <dl class="s-kv"><dt>Status</dt><dd data-hl="status">${woTag(c)}</dd><dt>Asset</dt><dd><button class="lnk" data-go="fiix_asset">CV-104 Conveyor</button></dd>
      <dt>Assigned to</dt><dd>Sarah Chen</dd><dt>Scheduled</dt><dd>2026-10-07 18:00–20:00</dd><dt>Procedure</dt><dd>LOTO-CV104</dd><dt>Created by</dt><dd>plantapi-agent (ERP)</dd>
      ${c.closed ? "<dt>Evidence</dt><dd>completion-correct-part.jpg</dd>" : ""}</dl>
    ${c.closed ? "" : '<button class="s-btn" data-act="closewo">Close work order</button>'}`),
  rs_search: c => rs(c, `<h3>3 results for “LC1D09BD”</h3><table class="s-tbl"><tbody>
    <tr data-hl="r1"><td><button class="lnk" data-go="rs_product">Schneider Electric TeSys D LC1D09BD contactor, 24 V dc coil, 3-pole, 9 A</button></td><td><b>$29.49</b></td></tr>
    <tr><td>Schneider Electric TeSys D LC1D09P7 contactor, 230 V ac coil, 3-pole, 9 A</td><td><b>$27.10</b></td></tr>
    <tr><td>Schneider Electric TeSys D LC1D12BD contactor, 24 V dc coil, 3-pole, 12 A</td><td><b>$33.85</b></td></tr></tbody></table>`),
  rs_product: c => rs(c, `<span class="s-crumb">Automation › Contactors › LC1D09BD</span>
    <div class="rs-prod"><div class="rs-img">product image<br>(placeholder)</div>
      <div style="display:grid;gap:8px"><h3>Schneider Electric TeSys D LC1D09BD contactor, 24 V dc coil, 3-pole, 9 A</h3>
        <span class="s-crumb">Mfr. part no. LC1D09BD · example listing</span>
        <div class="rs-price" data-hl="price">$29.49 <small style="font-size:12px;font-weight:400">each, excl. tax</small></div>
        <div data-hl="stock"><b style="color:#1f6e43">In stock: 46</b> · Courier delivery today by 17:00 if ordered before 12:00</div>
        <div><button class="s-btn red" data-act="basket">Add to basket</button></div>
        <span class="s-crumb">PlantAPI reads price and stock here. It never checks out.</span></div></div>`),
  notfound: () => `<div class="site"><div class="bblank">That address isn't part of this demo.</div></div>`,
};
