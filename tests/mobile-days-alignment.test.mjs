import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const css=read("styles.css");
const app=read("app.mjs");
const dictionary=read("i18n/dictionary.mjs");

test("mobile custom-day caption is visually hidden, and input remains accessible",()=>{
 assert.match(css, /@media\(max-width:767px\)\s*\{[\s\S]*?#residents-panel\.bill-resident-board .member-table tr td\.custom-days-cell .cell-caption\s*\{\s*display:none!important;/);
 assert.ok(app.includes('input.setAttribute("aria-label",p.name+": "+t("Custom days"))'));
 assert.ok(app.includes('td.append(customCaption,input)'));
});

test("mobile Full period button and day input share exact height and width",()=>{
 const start=css.lastIndexOf("/* Mobile day editor:");
 assert.ok(start>=0);
 const block=css.slice(start);
 assert.ok(block.includes(".full-period-choice,"));
 assert.ok(block.includes(".custom-days-cell .day-choice{"));
 assert.ok(block.includes("width:100%;"));
 assert.ok(block.includes("height:58px;"));
 assert.ok(block.includes("min-height:58px;"));
 assert.ok(block.includes("max-width:none;"));
 assert.ok(block.includes("align-items:stretch;"));
});

test("custom input placeholder is concise on mobile but unchanged on desktop",()=>{
 assert.ok(app.includes('window.matchMedia("(max-width: 767px)").matches?"Enter days":"Days"'));
 assert.ok(dictionary.includes('"Enter days": "Nhập ngày"'));
 assert.ok(dictionary.includes('"Days": "Ngày"'));
 assert.ok(app.includes('input.type="number"'));
 assert.ok(app.includes('input.max=String(billingPeriod().days)'));
});
