import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync(new URL("../unified-fee-ui.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");

test("last month's template appears by the month picker, ahead of the new bill controls",()=>{
 const copy=ui.indexOf('id="ub-copy-last"');
 const add=ui.indexOf('id="ub-add"');
 const footer=ui.indexOf('class="ub-actions"');
 assert.ok(copy>0&&copy<add&&add<footer);
 assert.equal(ui.match(/id="ub-copy-last"/g)?.length,1);
});
test("single rule is rendered after all subfee input fields",()=>{
 assert.ok(ui.includes('for(const fee of group.fees){'));
 assert.ok(ui.includes('root.append(settings);'));
 assert.ok(ui.includes('const current=getGroupMethod(group);'));
 assert.ok(ui.includes('if(current==="days"){'));
 assert.ok(ui.includes('t("Use the days configured above")'));
 assert.ok(!ui.includes('for(const kind of METHODS){const option=node("option",null,t(METHODS_LABEL[kind]));option.value=kind;select.append(option)}\n   select.value=fee.method'));
});
test("bill copy, share and save all have unique real controls",()=>{
 for(const id of ["ub-save","ub-copy-result","ub-share"])assert.equal(ui.match(new RegExp('id="'+id+'"',"g")).length,1);
 assert.ok(ui.includes('writeClipboard(summarize())'));
 assert.ok(ui.includes('shareText(summarize()'));
 assert.ok(ui.includes('draft:dirty||!existing()'));
 assert.ok(ui.includes('formatBillMessage('));
 assert.ok(ui.includes('const daysByResident=Object.fromEntries(residents.map(r=>[r.id,residentDays(r)]))'));
});
test("dashboard apartment name, role and live count are in one responsive card",()=>{
 assert.ok(html.includes('class="panel apartment-toolbar"'));
 for(const id of ["apartment-name","apartment-code","apartment-role","apartment-resident-count","apartment-select","copy-code","manage-apartments"])
  assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes("apartment-card-head"));
 assert.ok(css.includes("body.app-active .dashboard-head{display:none!important}"));
 assert.ok(css.includes(".apartment-card-main"));
});
