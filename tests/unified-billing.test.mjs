import test from "node:test";
import assert from "node:assert/strict";
import { allocateWeighted, calculateLine, calculatePeriod } from "../fee-engine.mjs";
import { calculateSelection, serializeSelection, hydrateSelection, countPeriodLines, getGroupMethod, applyGroupRule } from "../unified-billing-core.mjs";

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


test("Default divides the full bill by section A days, ignoring hidden legacy unchecked flags",()=>{
 const groups=[group("water","Cold water",true,[
  fee("w","Cold water",350000,"days",{a:{included:false},b:{included:true}}),
  fee("x","Drainage and wastewater",50000,"days",{a:{included:false}})
 ])];
 const out=calculateSelection(groups,residents,day);
 assert.equal(out.valid,true);
 assert.equal(out.total,400000);
 assert.deepEqual(out.breakdown.map(x=>x.amount),[200000,133333,66667]);
 const snapshot=serializeSelection(groups,out.lines);
 assert.ok(snapshot.every(x=>!Object.values(x.people).some(p=>p.included===false)));
 assert.deepEqual(snapshot.map(x=>x.method),["days","days"]);
});

test("One equal-sharing rule selects residents once for all subfees",()=>{
 const groups=[{...group("management","Management",true,[
  fee("indoor","Indoor",101,"equal"),fee("outdoor","Outdoor",29,"equal")]),
  people:{a:{included:true},b:{included:false},c:{included:true}}}];
 const calculated=calculateSelection(groups,residents,day);
 assert.equal(calculated.valid,true);
 assert.equal(calculated.total,130);
 assert.deepEqual(calculated.breakdown.map(x=>[x.resident_id,x.amount]),[["a",65],["c",65]]);
 const snapshot=serializeSelection(groups,calculated.lines);
 assert.ok(snapshot.every(item=>item.group_people.b.included===false));
});

test("Quantity belongs to the whole bill and allocates two separate items exactly",()=>{
 const groups=[{...group("parking","Parking",true,[
  fee("motorcycle","Bike",99991,"quantity"),fee("parking-extra","Additional",11,"quantity")]),
  people:{a:{quantity:2},b:{quantity:1},c:{quantity:0}}}];
 const result=calculateSelection(groups,residents,day);
 assert.equal(result.valid,true);assert.equal(result.total,100002);
 assert.deepEqual(result.breakdown.map(x=>x.amount),[66668,33334]);
 const snapshot=serializeSelection(groups,result.lines);
 assert.equal(snapshot.reduce((s,x)=>s+x.allocations.reduce((a,p)=>a+p.share,0),0),100002);
 assert.ok(snapshot.every(x=>x.people.a.quantity===2));
});

test("Manual whole-bill amounts are split across subfees without losing any đồng",()=>{
 const groups=[{...group("water","Cold water",true,[
  fee("w","Cold water",350000,"manual"),
  fee("x","Drainage and wastewater",50000,"manual")]),
  people:{a:{manual:250001},b:{manual:100000},c:{manual:49999}}}];
 const result=calculateSelection(groups,residents,day);
 assert.equal(result.valid,true);assert.equal(result.total,400000);
 assert.deepEqual(result.breakdown.map(p=>p.amount),[250001,100000,49999]);
 const snapshots=serializeSelection(groups,result.lines);
 assert.deepEqual(snapshots.map(x=>x.allocations.reduce((sum,p)=>sum+p.share,0)),[350000,50000]);
 assert.equal(snapshots.reduce((sum,x)=>sum+Object.values(x.people).reduce((a,p)=>a+(p.manual||0),0),0),400000);
 const hydrated=hydrateSelection(snapshots);
 assert.deepEqual(hydrated[0].people,groups[0].people);
 assert.deepEqual(calculateSelection(hydrated,residents,day).breakdown.map(p=>p.amount),[250001,100000,49999]);
});

test("Switching to Default removes invisible old exclusions but retains subfee amounts",()=>{
 const grp=group("water","Cold water",true,[fee("w","Water",50000,"equal",{a:{included:false}})]);
 grp.people={a:{included:false}};
 assert.equal(getGroupMethod(grp),"equal");
 applyGroupRule(grp,"days");
 assert.equal(getGroupMethod(grp),"days");
 assert.equal(grp.fees[0].amount,50000);
 assert.equal("included" in grp.fees[0].people.a,false);
 assert.deepEqual(grp.people,{});
 assert.equal(calculateSelection([grp],residents,day).total,50000);
});

test("Historic mixed-rule rows retain their original rules until the user chooses a new method",()=>{
 const historic=[
  {id:"one",name:"Water",category_id:"water",category_name:"Cold water",method:"days",amount:180000,people:{}},
  {id:"two",name:"Service",category_id:"water",category_name:"Cold water",method:"equal",amount:60000,people:{}}
 ];
 const hydrated=hydrateSelection(historic);
 assert.equal(getGroupMethod(hydrated[0]),"mixed");
 const preserved=calculateSelection(hydrated,residents,day);
 assert.equal(preserved.valid,true);
 assert.equal(preserved.total,240000);
 const copy=hydrateSelection(historic,true);
 assert.equal(getGroupMethod(copy[0]),"mixed");
 assert.deepEqual(copy[0].fees.map(x=>x.amount),[0,0]);
 applyGroupRule(copy[0],"days");
 assert.equal(getGroupMethod(copy[0]),"days");
});


test("Whole-bill manual shares must match the exact sum of every charge",()=>{
 const groups=[{...group("water","Cold water",true,[
  fee("w","Water",350000,"manual"),fee("x","Service",50000,"manual")]),
  people:{a:{manual:100000},b:{manual:100000},c:{manual:100000}}}];
 const result=calculateSelection(groups,residents,day);
 assert.equal(result.valid,false);
 assert.match(result.error,/Manual shares must match/i);
});
