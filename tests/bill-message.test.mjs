import test from "node:test";
import assert from "node:assert/strict";
import { formatBillMessage, savedBillGroups, savedResidentDays, displayBillMonth } from "../bill-message.mjs";
import { calculateSelection, serializeSelection } from "../unified-billing-core.mjs";

const vi={
 "BILL FOR MONTH {month}":"HÓA ĐƠN THÁNG {month}",
 "BILL DETAILS":"CHI TIẾT HÓA ĐƠN",
 "PER-RESIDENT AMOUNTS":"TIỀN TỪNG THÀNH VIÊN",
 "GRAND TOTAL":"TỔNG CỘNG",
 "DRAFT — NOT SAVED":"BẢN NHÁP — CHƯA LƯU",
 "Residency days are unavailable for this older saved period.":"Kỳ thanh toán cũ không lưu số ngày ở của từng người.",
 "Apartment":"Căn hộ",
 "{count} days":"{count} ngày"
};
const t=(key,params={})=>(vi[key]||key).replace(/\{(\w+)\}/g,(_,n)=>String(params[n]??"{"+n+"}"));
const money=n=>Number(n).toLocaleString("vi-VN")+" đ";
const options={t,money};

test("multi-bill Vietnamese plaintext shows nested fees, one total, and resident days",()=>{
 const msg=formatBillMessage({
  month:"2026-11",apartment:"S503.1704",
  charges:[
   {name:"Tiền điện",fees:[{name:"Tiền điện",amount:720000}]},
   {name:"Phí nước lạnh",fees:[{name:"Nước lạnh",amount:180000},{name:"Thoát nước, XLNT",amount:60000}]},
   {name:"Phí quản lý",fees:[{name:"Trong nhà",amount:240000},{name:"Ngoài nhà",amount:120000}]},
   {name:"Giữ xe",fees:[{name:"Giữ xe",amount:120000}]}
  ],
  people:[
   {name:"Tấn",days:30,amount:610000},
   {name:"Tiến",days:28,amount:573333},
   {name:"Kiệt",days:14,amount:256667}
  ],total:1440000
 },options);
 assert.ok(msg.startsWith("HÓA ĐƠN THÁNG 11/2026\nCăn hộ: S503.1704"));
 assert.ok(msg.includes("1. Tiền điện: 720.000 đ\n2. Phí nước lạnh: 240.000 đ"));
 assert.ok(msg.includes("   - Nước lạnh: 180.000 đ"));
 assert.ok(msg.includes("   - Thoát nước, XLNT: 60.000 đ"));
 assert.ok(msg.includes("3. Phí quản lý: 360.000 đ"));
 assert.ok(msg.includes("4. Giữ xe: 120.000 đ"));
 assert.ok(msg.includes("1. Tấn (30 ngày): 610.000 đ"));
 assert.ok(msg.includes("2. Tiến (28 ngày): 573.333 đ"));
 assert.ok(msg.includes("3. Kiệt (14 ngày): 256.667 đ"));
 assert.ok(msg.endsWith("TỔNG CỘNG: 1.440.000 đ"));
 assert.equal((msg.match(/Tiền điện: 720.000 đ/g)||[]).length,1,"do not repeat identical subfee");
 assert.equal((msg.match(/TỔNG CỘNG:/g)||[]).length,1);
 assert.ok(!msg.includes("2026-11"));
});

test("saved month grouping excludes unchecked bills even when their original amount is present",()=>{
 const saved=[
  {category_id:"electric",category_name:"Tiền điện",id:"e",name:"Tiền điện",amount:720000,original_amount:720000,enabled:true},
  {category_id:"water",category_name:"Phí nước lạnh",id:"w",name:"Nước lạnh",amount:180000,enabled:true},
  {category_id:"water",category_name:"Phí nước lạnh",id:"x",name:"XLNT",amount:60000,enabled:true},
  {category_id:"parking",category_name:"Giữ xe",id:"p",name:"Giữ xe",amount:0,original_amount:190000,enabled:false}
 ];
 const groups=savedBillGroups(saved);
 assert.equal(groups.length,2);
 assert.deepEqual(groups.map(g=>g.name),["Tiền điện","Phí nước lạnh"]);
 assert.equal(groups[1].fees.length,2);
 const msg=formatBillMessage({month:"2026-11",charges:groups,people:[{name:"Tấn",amount:960000,days:30}],total:960000},options);
 assert.ok(!msg.includes("Giữ xe"));
 assert.ok(msg.includes("TỔNG CỘNG: 960.000 đ"));
});

test("saved resident days use immutable JSON snapshot, never current resident table",()=>{
 const items=[{resident_days:{a:30,b:28,c:0}},{resident_days:{a:29,b:28}}];
 assert.deepEqual(savedResidentDays(items),{a:30,b:28,c:0});
 const msg=formatBillMessage({
  month:"2026-11",charges:[{name:"Internet",fees:[{name:"Internet",amount:100000}]}],
  people:[{name:"Tấn",days:savedResidentDays(items).a,amount:100000}],total:100000
 },options);
 assert.ok(msg.includes("Tấn (30 ngày)"));
 assert.ok(!msg.includes("29 ngày"));
});

test("older saved monthly periods lacking day snapshots never fabricate residency days",()=>{
 assert.deepEqual(savedResidentDays([{allocations:[{resident_id:"a",share:30000}]}]),{});
 const msg=formatBillMessage({
  month:"2026-11",charges:[{name:"Tiền điện",fees:[{name:"Tiền điện",amount:50000}]}],
  people:[{name:"Tấn",amount:30000},{name:"Tiến",amount:20000}],total:50000
 },options);
 assert.ok(msg.includes("Tấn: 30.000 đ"));
 assert.ok(msg.includes("Tiến: 20.000 đ"));
 assert.ok(!msg.includes("Tấn (28 ngày)"));
 assert.ok(msg.includes("Kỳ thanh toán cũ không lưu số ngày ở của từng người."));
});

test("single legacy bill uses same readable format and saved day counts",()=>{
 const msg=formatBillMessage({
  month:"2026-11",apartment:"S503.1704",
  charges:[{name:"Tiền điện",fees:[{name:"Tiền điện",amount:1000000}]}],
  people:[{name:"Tấn",days:30,amount:600000},{name:"Tiến",days:28,amount:400000}],
  total:1000000
 },options);
 assert.ok(msg.includes("HÓA ĐƠN THÁNG 11/2026"));
 assert.ok(msg.includes("Tiến (28 ngày): 400.000 đ"));
 assert.equal((msg.match(/Tiền điện: 1.000.000 đ/g)||[]).length,1);
 assert.ok(!msg.includes("Kỳ thanh toán cũ không lưu"));
});

test("new monthly snapshots preserve exact day settings and allocation totals",()=>{
 const residents=[{id:"a",name:"Tấn",days:30},{id:"b",name:"Tiến",days:28}];
 const groups=[
  {id:"electric",name:"Electricity",enabled:true,people:{},fees:[{id:"e",name:"Electricity",method:"days",amount:1000000,people:{}}]},
  {id:"parking",name:"Motorcycle parking",enabled:false,people:{},fees:[{id:"p",name:"Motorcycle parking",method:"quantity",amount:40000,people:{}}]}
 ];
 const calc=calculateSelection(groups,residents,r=>r.days);
 assert.equal(calc.valid,true);
 const snapshot=serializeSelection(groups,calc.lines,{a:30,b:28});
 assert.equal(snapshot.length,2);
 assert.deepEqual(savedResidentDays(snapshot),{a:30,b:28});
 assert.equal(snapshot.reduce((sum,x)=>sum+x.amount,0),1000000);
 assert.equal(snapshot[1].amount,0);
 assert.equal(snapshot[1].original_amount,40000);
 const payments=calc.breakdown.map(x=>({...x,days:savedResidentDays(snapshot)[x.resident_id]}));
 const msg=formatBillMessage({
  month:"2026-11",charges:savedBillGroups(snapshot),
  people:payments.map(p=>({name:p.resident_name,amount:p.amount,days:p.days})),total:calc.total
 },options);
 assert.ok(!msg.includes("Motorcycle parking"));
 assert.ok(msg.includes("Tấn (30 ngày)"));
 assert.ok(msg.includes("Tiến (28 ngày)"));
});

test("different allocation methods do not change the already calculated per-person totals",()=>{
 const msg=formatBillMessage({
  month:"2026-11",
  charges:[{name:"Điện",fees:[{name:"Điện",amount:100000}]},{name:"Giữ xe",fees:[{name:"Giữ xe",amount:50000}]}],
  people:[{name:"A",amount:125000,days:10},{name:"B",amount:25000,days:30}],total:150000
 },options);
 assert.ok(msg.includes("A (10 ngày): 125.000 đ"));
 assert.ok(msg.includes("B (30 ngày): 25.000 đ"));
 assert.ok(msg.endsWith("TỔNG CỘNG: 150.000 đ"));
});

test("calendar month conversion and English fallback",()=>{
 assert.equal(displayBillMonth("2026-11"),"11/2026");
 assert.equal(displayBillMonth("2026-13"),"2026-13");
 const english=formatBillMessage({
  month:"2026-11",charges:[{name:"Electricity",fees:[{name:"Electricity",amount:10}]}],
  people:[{name:"A",days:0,amount:10}],total:10,draft:true
 });
 assert.ok(english.includes("DRAFT — NOT SAVED"));
 assert.ok(english.includes("BILL FOR MONTH 11/2026"));
 assert.ok(english.includes("A (0 days): "));
 assert.ok(english.includes("GRAND TOTAL"));
});
