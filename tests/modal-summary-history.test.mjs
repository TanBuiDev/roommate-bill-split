import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const fee=read("unified-fee-ui.mjs");
const layout=read("dashboard-layout.mjs");
const legacy=read("app.mjs");
const style=read("styles.css");
const history=read("history-detail-ui.mjs");

test("B uses an accessible dialog and no always-open bill form",()=>{
 const modal=fee.indexOf('<dialog id="ub-bill-dialog"');
 const form=fee.indexOf('<section id="ub-form"');
 const summary=fee.indexOf('<section class="ub-summary"');
 assert.ok(modal>0&&form>modal&&summary>form);
 assert.ok(fee.includes('aria-labelledby="ub-modal-heading"'));
 assert.ok(fee.includes('billDialog.showModal()')||fee.includes('dlg.showModal()'));
 assert.ok(fee.includes('billDialog.addEventListener("cancel"'));
 assert.ok(!fee.includes('<div class="ub-add-row">\\n   <label'));
});
test("Add and edit use isolated working copies; cancel does not change saved draft",()=>{
 assert.match(fee,/workingGroup=existingGroup\?copy\(existingGroup\):makeGroup\(type\)/);
 const open=fee.slice(fee.indexOf("function openSelectedType()"),fee.indexOf("function commitBill()"));
 assert.ok(!open.includes("groups.push("));
 assert.ok(!open.includes("store();"));
 const cancel=fee.slice(fee.indexOf("function cancelBill()"),fee.indexOf("function commitBill()"));
 assert.ok(cancel.includes("workingGroup=null"));
 assert.ok(!cancel.includes("groups.push"));
 const commit=fee.slice(fee.indexOf("function commitBill()"),fee.indexOf("function renderForm()"));
 assert.match(commit,/groups\.push\(candidate\)/);
 assert.ok(commit.includes("const verdict=calculateSelection([{...candidate,enabled:true}]"));
 assert.ok(commit.includes("idx>=0"));
 assert.ok(commit.includes("dirty=true;store();cancelBill();renderSummary()"));
});
test("C is one card with a single total in the resident breakdown",()=>{
 assert.ok(layout.includes('const totalCard=create("section","bill-summary-card"'));
 assert.ok(layout.includes("totalCard.append(totalHeader,billSummary)"));
 assert.ok(!layout.includes("Only checked bills count toward each resident's share."));
 assert.equal((fee.match(/id="ub-total"/g)||[]).length,1);
 assert.ok(!fee.includes('id="ub-entered"'));
 assert.ok(fee.includes('id="ub-people"'));
 assert.ok(fee.includes('allocated!==totalSelected'));
 assert.ok(fee.includes('el("ub-save").disabled='));
});
test("Three icon-only actions remain side-by-side on mobile",()=>{
 for(const id of ["ub-save","ub-copy-result","ub-share"]){
  assert.equal((fee.match(new RegExp('id="'+id+'"',"g"))||[]).length,1);
  assert.match(fee,new RegExp('id="'+id+'"[^>]+aria-label='));
 }
 assert.ok(style.includes("grid-template-columns:1.35fr 1fr 1fr"));
 assert.ok(style.includes("grid-template-columns:1.25fr 1fr 1fr"));
 assert.ok(fee.includes('class="sr-only">Save monthly settlement'));
});
test("The two history formats use the same rows and details modal",()=>{
 assert.ok(fee.includes('"history-entry fee-history-card"'));
 assert.ok(legacy.includes('"history-entry bill"'));
 assert.ok(fee.includes("openHistoryDetail("));
 assert.ok(legacy.includes("openHistoryDetail("));
 assert.ok(fee.includes("historyMenu(options"));
 assert.ok(legacy.includes("historyMenu(opts"));
 assert.ok(history.includes('root.id="payment-history-dialog"'));
 assert.ok(style.includes(".history-entry-actions"));
 assert.ok(style.includes(".history{display:grid;grid-template-columns:minmax(0,1fr);gap:0}"));
});
test("Payment reporting and confirmation remain available in both detail modals",()=>{
 assert.ok(fee.includes('db.rpc("confirm_apartment_fee_payment"'));
 assert.ok(fee.includes('db.rpc("report_apartment_fee_payment"'));
 assert.ok(legacy.includes('db.rpc("mark_apartment_payment_sent"'));
 assert.ok(legacy.includes('db.from("apartment_allocations").update({status:"confirmed"})'));
 assert.ok(fee.includes("openPeriodDetail(period)"));
 assert.ok(legacy.includes("openLegacyDetail(bill)"));
});
