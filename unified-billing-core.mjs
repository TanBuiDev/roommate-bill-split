import { calculatePeriod } from "./fee-engine.mjs";

/* Pure helpers shared by the browser workflow and automated regression tests. */
export const MAX_PERIOD_LINES=30;
export const countPeriodLines=groups=>groups.reduce((sum,g)=>sum+g.fees.length,0);

export function calculateSelection(groups,residents,getDays){
 const active=groups.filter(group=>group.enabled!==false).flatMap(group=>group.fees.map(fee=>({
  ...fee,amount:Number(fee.amount)||0
 })));
 return calculatePeriod(active,residents,getDays);
}

export function serializeSelection(groups,calculatedLines){
 const allocations=new Map(calculatedLines.map(line=>[line.id,line.allocations]));
 return groups.flatMap(group=>group.fees.map(fee=>({
  id:fee.id,name:fee.name,method:fee.method,
  category_id:group.id,category_name:group.name,enabled:group.enabled!==false,
  amount:group.enabled===false?0:Number(fee.amount)||0,
  original_amount:Number(fee.amount)||0,
  people:fee.people||{},
  allocations:group.enabled===false?[]:(allocations.get(fee.id)||[])
 })));
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
   method:["days","equal","quantity","manual"].includes(item.method)?item.method:"days",
   amount:clearAmounts?0:Number(item.original_amount??item.amount)||0,
   people:JSON.parse(JSON.stringify(item.people||{}))
  });
 });
 return [...result.values()];
}