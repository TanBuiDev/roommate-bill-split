/* Pure, exact integer fee allocation. No network requests or UI dependencies. */
export const MAX_CHARGE = 1_000_000_000_000;
export const METHODS = ["days", "equal", "quantity", "manual"];

export function allocateWeighted(amount, rows) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_CHARGE) throw Error("Invalid charge amount");
  if (!rows.length) return amount === 0 ? [] : null;
  const weights = rows.map(r => Number(r.weight));
  if (weights.some(v => !Number.isSafeInteger(v) || v < 0 || v > 1000000)) return null;
  const total = weights.reduce((s, n) => s + n, 0);
  if (total <= 0) return amount === 0 ? rows.map(r => ({resident_id:r.id,share:0})) : null;
  const divisor = BigInt(total);
  let used=0n;
  const result=rows.map((r,i) => {
    const product=BigInt(amount)*BigInt(weights[i]);
    const share=product/divisor;
    used+=share;
    return {resident_id:r.id,share:Number(share),rem:product%divisor,index:i};
  });
  const order=[...result].sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1);
  for(let i=0;i<Number(BigInt(amount)-used);i++)order[i].share++;
  return result.map(({resident_id,share})=>({resident_id,share}));
}

export function calculateLine(item,residents,getDays) {
  const amount=Number(item.amount);
  if (!Number.isSafeInteger(amount)||amount<0||amount>MAX_CHARGE)
    return {valid:false,error:"Invalid amount.",allocations:[]};
  if (!METHODS.includes(item.method))return {valid:false,error:"Invalid sharing rule.",allocations:[]};
  if (!String(item.name||"").trim()||String(item.name).length>100)
    return {valid:false,error:"Enter a fee name.",allocations:[]};
  if (amount===0)return {valid:true,error:"",allocations:[]};
  const persons=item.people||{};
  let allocations;
  if(item.method==="manual"){
    allocations=residents.map(r=>({
      resident_id:r.id,
      share:Number(persons[r.id]?.manual||0)
    }));
    if(allocations.some(a=>!Number.isSafeInteger(a.share)||a.share<0||a.share>MAX_CHARGE))
      return {valid:false,error:"Invalid manual amount.",allocations:[]};
    if(allocations.reduce((sum,a)=>sum+a.share,0)!==amount)
      return {valid:false,error:"Manual shares must match the fee amount.",allocations:[]};
  } else {
    const weighted=residents.map(r=>{
      const options=persons[r.id]||{};
      const weight=item.method==="days"?
        (options.included===false?0:getDays(r)):
        item.method==="equal"?(options.included===false?0:1):
        Number(options.quantity||0);
      return {id:r.id,weight};
    });
    allocations=allocateWeighted(amount,weighted);
    if(!allocations)return {valid:false,error:"Choose at least one eligible resident.",allocations:[]};
  }
  return {valid:true,error:"",allocations:allocations.filter(a=>a.share>0)};
}

export function calculatePeriod(items,residents,getDays) {
  if(!Array.isArray(items)||items.length<1||items.length>30)
    return {valid:false,error:"Add between 1 and 30 fees.",lines:[],total:0,breakdown:[]};
  if(!residents.length)return {valid:false,error:"Add residents before splitting charges.",lines:[],total:0,breakdown:[]};
  const breakdown=new Map(residents.map(r=>[r.id,{resident_id:r.id,resident_name:r.name,amount:0}]));
  let total=0;
  const lines=[];
  for(const item of items){
    const row=calculateLine(item,residents,getDays);
    lines.push({...item,...row});
    if(!row.valid)return {valid:false,error:item.name+": "+row.error,lines,total:0,breakdown:[]};
    total+=Number(item.amount);
    if(!Number.isSafeInteger(total)||total>MAX_CHARGE)
      return {valid:false,error:"Total amount is too large.",lines,total:0,breakdown:[]};
    for(const allocation of row.allocations)breakdown.get(allocation.resident_id).amount+=allocation.share;
  }
  if(total===0)return {valid:false,error:"Enter at least one nonzero fee.",lines,total:0,breakdown:[]};
  const people=[...breakdown.values()].filter(r=>r.amount>0);
  if(people.reduce((s,p)=>s+p.amount,0)!==total)
    return {valid:false,error:"Allocation does not match bill total.",lines,total,breakdown:people};
  return {valid:true,error:"",lines,total,breakdown:people};
}
