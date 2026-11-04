import test from "node:test";
import assert from "node:assert/strict";
import { allocateWeighted, calculateLine, calculatePeriod } from "../fee-engine.mjs";
import { calculateSelection, serializeSelection, hydrateSelection, countPeriodLines } from "../unified-billing-core.mjs";

const residents=[{id:"a",name:"An",days:30},{id:"b",name:"Bình",days:20},{id:"c",name:"Cường",days:10}];
const day=r=>r.days;
const fee=(id,name,amount,method,people={})=>({id,name,amount,method,people});
const group=(id,name,enabled,fees)=>({id,name,enabled,fees});

test("weighted day allocation is exact down to the đồng",()=>{
 const result=allocateWeighted(900001,[{id:"a",weight:30},{id:"b",weight:20},{id:"c",weight:10}]);
 assert.deepEqual(result.map(x=>x.share),[450001,300000,150000]);
 assert.equal(result.reduce((s,x)=>s+x.share,0),900001);
});

test("grouped cold-water and wastewater charges aggregate per resident",()=>{
 const groups=[group("water","Cold water",true,[
  fee("w","Cold water",180000,"days"),
  fee("d","Drainage and wastewater treatment (XLNT)",60000,"days")
 ])];
 const result=calculateSelection(groups,residents,day);
 assert.equal(result.valid,true);
 assert.equal(result.total,240000);
 assert.deepEqual(result.breakdown.map(x=>x.amount),[120000,80000,40000]);
});

test("disabled bill remains in saved snapshot but contributes zero",()=>{
 const groups=[
  group("electric","Electricity",true,[fee("e","Electricity",900000,"days")]),
  group("water","Cold water",false,[fee("w","Cold water",180000,"days"),fee("d","Drainage and wastewater treatment (XLNT)",60000,"days")])
 ];
 const calc=calculateSelection(groups,residents,day);
 assert.equal(calc.valid,true);assert.equal(calc.total,900000);
 const payload=serializeSelection(groups,calc.lines);
 assert.equal(payload.length,3);
 assert.equal(payload.reduce((s,x)=>s+x.amount,0),900000);
 assert.deepEqual(payload.filter(x=>!x.enabled).map(x=>[x.amount,x.original_amount,x.allocations.length]),[[0,180000,0],[0,60000,0]]);
 const restored=hydrateSelection(payload);
 assert.equal(restored[1].enabled,false);
 assert.deepEqual(restored[1].fees.map(x=>x.amount),[180000,60000]);
 restored[1].enabled=true;
 assert.equal(calculateSelection(restored,residents,day).total,1140000);
});

test("per-fee methods are independent and excluded residents pay zero",()=>{
 const groups=[
  group("mgmt","Management fees",true,[fee("inside","Indoor management",300000,"equal",{c:{included:false}})]),
  group("parking","Motorcycle parking",true,[fee("cars","Motorcycle parking",90000,"quantity",{a:{quantity:2},b:{quantity:1},c:{quantity:0}})])
 ];
 const calc=calculateSelection(groups,residents,day);
 assert.equal(calc.valid,true);assert.equal(calc.total,390000);
 assert.deepEqual(calc.breakdown.map(p=>p.amount),[210000,180000]);
});

test("manual allocation rejects a mismatch",()=>{
 const bad=calculateLine(fee("x","Manual fee",50000,"manual",{a:{manual:20000},b:{manual:10000}}),residents,day);
 assert.equal(bad.valid,false);
});

test("copying previous period clears amounts without changing names or methods",()=>{
 const groups=[group("custom:demo","Cleaning fee",true,[fee("s","Cleaning",50000,"equal")])];
 const p=serializeSelection(groups,calculateSelection(groups,residents,day).lines);
 const copy=hydrateSelection(p,true);
 assert.equal(copy[0].fees[0].amount,0);
 assert.equal(copy[0].fees[0].name,"Cleaning");
 assert.equal(copy[0].fees[0].method,"equal");
});

test("no selected positive fees is invalid; 30-line limit can be checked",()=>{
 const groups=[group("water","Cold water",false,[fee("x","Cold water",30000,"days")])];
 assert.equal(calculateSelection(groups,residents,day).valid,false);
 assert.equal(countPeriodLines(groups),1);
});

test("zero quantity means the resident does not pay parking",()=>{
 const calc=calculatePeriod([fee("p","Parking",50000,"quantity",{a:{quantity:0},b:{quantity:1},c:{quantity:0}})],residents,day);
 assert.equal(calc.valid,true);
 assert.deepEqual(calc.breakdown.map(x=>x.amount),[50000]);
 assert.deepEqual(calc.breakdown.map(x=>x.resident_id),["b"]);
});
