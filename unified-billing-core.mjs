import { calculateLine, calculatePeriod } from "./fee-engine.mjs";

/* Pure billing-group adapters. Data is persisted as individual fee rows so old
   Supabase snapshots, exact integer sums, and per-fee history remain compatible. */
export const MAX_PERIOD_LINES=30;
export const countPeriodLines=groups=>groups.reduce((sum,g)=>sum+g.fees.length,0);
const RULES=["days","equal","quantity","manual"];
const clone=value=>JSON.parse(JSON.stringify(value||{}));
const allIds=group=>[...new Set(group.fees.flatMap(f=>Object.keys(f.people||{})))];

export function getGroupMethod(group){
 if(group.legacyIndependent)return "mixed";
 const first=group.fees[0]?.method||"days";
 return group.fees.every(f=>f.method===first)?first:"mixed";
}

export function deriveGroupPeople(group,rule=getGroupMethod(group)){
 const config={};
 for(const id of allIds(group)){
  const rows=group.fees.map(f=>f.people?.[id]||{});
  if(rule==="manual")config[id]={manual:rows.reduce((sum,p)=>sum+(Number(p.manual)||0),0)};
  else if(rule==="quantity")config[id]={quantity:Number(rows[0]?.quantity)||0};
  else if(rule==="equal")config[id]={included:rows[0]?.included!==false};
 }
 return config;
}

export function applyGroupRule(group,rule){
 if(!RULES.includes(rule))throw new Error("Unsupported billing rule");
 const prior=getGroupMethod(group);
 if(prior!==rule)group.people={};
 else if(!group.people)group.people=deriveGroupPeople(group,prior);
 group.legacyIndependent=false;
 for(const fee of group.fees)fee.method=rule;
 if(rule==="days"){
  group.people={};
  for(const fee of group.fees){
   for(const p of Object.values(fee.people||{}))delete p.included;
  }
 }
 return group;
}

function legacyParticipationDiffers(group,rule){
 if(group.fees.length<2||rule==="days")return false;
 if(rule==="manual")return true;
 const ids=allIds(group);
 return ids.some(id=>{
  const values=group.fees.map(f=>f.people?.[id]||{});
  const first=rule==="equal"?values[0].included!==false:Number(values[0].quantity)||0;
  return values.slice(1).some(p=>(rule==="equal"?p.included!==false:Number(p.quantity)||0)!==first);
 });
}

/* Split each subfee against the resident's REMAINING group share, so both
   per-fee row totals and the requested group totals balance exactly. */
function distributeGroupTargets(group,residents,targets){
 const ids=residents.map(r=>r.id);
 const remaining=ids.map(id=>BigInt(targets[id]||0));
 const result=[];
 for(const fee of group.fees){
  const amount=Number(fee.amount)||0;
  const sum=remaining.reduce((a,b)=>a+b,0n);
  if(!Number.isSafeInteger(amount)||amount<0||BigInt(amount)>sum)return null;
  const row=remaining.map(weight=>({
   base:sum>0n?BigInt(amount)*weight/sum:0n,
   remainder:sum>0n?BigInt(amount)*weight%sum:0n
  }));
  let unused=BigInt(amount)-row.reduce((s,x)=>s+x.base,0n);
  const order=row.map((x,i)=>({...x,index:i})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(const x of order){
   if(unused===0n)break;
   if(row[x.index].base<remaining[x.index]){row[x.index].base++;unused--}
  }
  if(unused!==0n)return null;
  const people={};
  ids.forEach((id,i)=>{
   remaining[i]-=row[i].base;
   people[id]={manual:Number(row[i].base)};
  });
  result.push({...fee,method:"manual",people});
 }
 return remaining.some(x=>x!==0n)?null:result;
}

export function calculateSelection(groups,residents,getDays){
 const lines=[];
 for(const group of groups.filter(g=>g.enabled!==false)){
  const rule=getGroupMethod(group);
  if(rule==="mixed"){
   lines.push(...group.fees.map(f=>({...f})));
   continue;
  }
  // Existing legacy rows may have no group-level configuration. Derive it
  // without mutating persisted history.
  const people=group.people||deriveGroupPeople(group,rule);
  const amount=group.fees.reduce((sum,f)=>sum+(Number(f.amount)||0),0);
  const basis=calculateLine({id:group.id,name:group.name||"Bill",method:rule,amount,people},residents,getDays);
  if(!basis.valid)return {valid:false,error:basis.error,lines:[],total:0,breakdown:[]};
  const targets=Object.fromEntries(basis.allocations.map(a=>[a.resident_id,a.share]));
  const distributed=distributeGroupTargets(group,residents,targets);
  if(!distributed)return {valid:false,error:"Could not allocate the bill totals.",lines:[],total:0,breakdown:[]};
  lines.push(...distributed);
 }
 const result=calculatePeriod(lines,residents,getDays);
 // Return the original sharing rules for the item snapshot, not the internal
 // manual distribution method used to guarantee group-wide exact totals.
 if(result.valid){
  const byId=new Map(groups.flatMap(g=>g.fees.map(f=>[f.id,f.method])));
  result.lines=result.lines.map(line=>({...line,method:byId.get(line.id)||line.method}));
 }
 return result;
}

export function serializeSelection(groups,calculatedLines){
 const allocations=new Map(calculatedLines.map(line=>[line.id,line.allocations]));
 const calculated=new Map(calculatedLines.map(line=>[line.id,line]));
 return groups.flatMap(group=>group.fees.map(fee=>{
  const standardized=group.people&&!group.legacyIndependent;
  const rule=getGroupMethod(group);
  const source=standardized&&rule==="manual"?
   calculated.get(fee.id)?.people||fee.people:
   standardized&&rule==="days"?{}:
   standardized?group.people:fee.people;
  const snapshot={
   id:fee.id,name:fee.name,method:fee.method,
   category_id:group.id,category_name:group.name,enabled:group.enabled!==false,
   amount:group.enabled===false?0:Number(fee.amount)||0,
   original_amount:Number(fee.amount)||0,
   people:clone(source),
   allocations:group.enabled===false?[]:(allocations.get(fee.id)||[])
  };
  if(standardized)snapshot.group_people=clone(group.people);
  if(fee.method==="days"){
   for(const p of Object.values(snapshot.people))delete p.included;
  }
  return snapshot;
 }));
}

export function hydrateSelection(items,clearAmounts=false){
 const result=new Map();
 (items||[]).forEach((item,index)=>{
  const id=item.category_id||"legacy:"+String(item.id||item.name||index);
  const name=item.category_name||item.name;
  if(!result.has(id))result.set(id,{id,name,enabled:item.enabled!==false,fees:[]});
  const group=result.get(id);
  if(item.enabled===false)group.enabled=false;
  group.fees.push({
   id:item.id||"legacy-item-"+index,
   name:item.name,
   method:RULES.includes(item.method)?item.method:"days",
   amount:clearAmounts?0:Number(item.original_amount??item.amount)||0,
   people:clearAmounts?{}:clone(item.people)
  });
  if(item.group_people&&!clearAmounts)group.people=clone(item.group_people);
 });
 for(const group of result.values()){
  if(clearAmounts){
   group.people={};
   // All old groups can be reused without copying monetary amounts.
   if(getGroupMethod(group)==="mixed")applyGroupRule(group,"days");
   continue;
  }
  if(!group.people){
   const rule=getGroupMethod(group);
   if(rule==="mixed"||legacyParticipationDiffers(group,rule))group.legacyIndependent=true;
   else group.people=deriveGroupPeople(group,rule);
  }
 }
 return [...result.values()];
}
