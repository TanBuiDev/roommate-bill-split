import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fee=read("unified-fee-ui.mjs"),app=read("app.mjs");
const style=read("styles.css"),workflow=read(".github/workflows/unified-billing-tests.yml");
const sql=read("security/resource-guardrails.sql"),captcha=read("turnstile-auth.mjs");
const headers=read("_headers");

test("B: bill type is selected outside, not inside the amount-entry dialog",()=>{
 const select=fee.indexOf('id="ub-type"'),dlg=fee.indexOf('id="ub-bill-dialog"');
 assert.ok(select>0&&select<dlg);
 assert.equal((fee.match(/id="ub-type"/g)||[]).length,1);
 assert.ok(fee.includes('<p id="ub-modal-type"'));
 assert.ok(!fee.slice(dlg,fee.indexOf("</dialog>",dlg)).includes('id="ub-type"'));
 assert.ok(fee.includes('selectedType=e.target.value;refreshTypeActions()'));
 assert.ok(fee.includes('groups.some(g=>g.id===selectedType)?"Edit bill":"Add bill"'));
 assert.ok(style.includes('#bill-add-heading #ub-type'));
});
test("Existing bill edit and new bill insert keep isolated modal drafts",()=>{
 assert.ok(fee.includes('workingGroup=existingGroup?copy(existingGroup):makeGroup(type)'));
 assert.ok(fee.includes('const idx=groups.findIndex(g=>g.id===candidate.id)'));
 assert.ok(fee.includes('if(idx<0){const next=catalog().find('));
 assert.ok(fee.includes('workingGroup=null;editing=null;originalWorking=""'));
});
test("Abuse controls live in private schema and are enforced by DB triggers",()=>{
 assert.ok(sql.includes('app_private.request_quotas'));
 assert.ok(sql.includes('on conflict(action_key,principal,bucket_epoch) do update'));
 assert.ok(sql.includes("revoke all on app_private.request_quotas from public, anon, authenticated"));
 for(const x of ["oghep_guard_apartment_creation","oghep_guard_invitation_creation","oghep_guard_period_write","oghep_guard_fee_template_write","oghep_guard_legacy_bill_write"])assert.ok(sql.includes(x));
 assert.ok(sql.includes("perform app_private.consume_quota('apartment:create',v_uid::text,3,86400)"));
 assert.ok(sql.includes("perform app_private.consume_quota('invite:apartment',new.apartment_id::text,5,3600)"));
 assert.ok(sql.includes("v_action:='period:save'"));
 assert.ok(sql.includes("if found then return v_period; end if"));
});
test("Email OTP operations request a Turnstile token without exposing the private secret",()=>{
 assert.match(captcha,/TURNSTILE_SITE_KEY="0x/);
 assert.ok(!captcha.includes("TURNSTILE_SECRET"));
 assert.ok(captcha.includes('execution:"execute"'));
 assert.equal((app.match(/getEmailCaptchaToken\(\)/g)||[]).length,2);
 assert.ok(app.includes('...(captchaToken?{captchaToken}:{})'));
 assert.ok(!app.includes("service_role"));
});
test("GitHub CI skips docs-only deployments and cancels obsolete PR tests",()=>{
 assert.ok(workflow.includes("cancel-in-progress: "+String.fromCharCode(36)+"{{ github.event_name == 'pull_request' }}"));
 assert.ok(workflow.includes("paths:"));
 assert.ok(workflow.includes("needs.test.outputs.site_changed == 'true'"));
 assert.ok(workflow.includes("Skip outdated main commits"));
 assert.ok(workflow.includes("group: oghep-production"));
 assert.ok(workflow.includes("cp index.html styles.css ./*.mjs _headers dist/"));
 assert.ok(workflow.includes("Verify published commit"));
});
test("Cloudflare Pages security headers do not break external authentication scripts",()=>{
 for(const x of ["X-Content-Type-Options: nosniff","X-Frame-Options: DENY","Referrer-Policy: strict-origin-when-cross-origin","frame-ancestors 'none'","Cache-Control: no-store"])assert.ok(headers.includes(x));
 assert.ok(!headers.includes("script-src 'self'"));
});
test("Save avoids unchanged resident preferences",()=>{
 assert.ok(app.includes('const needsReset=state.apt?.id===apartmentId'));
 assert.ok(app.includes('.or("mode.neq.w4,custom_days.neq.0")'));
});
