/* One compact plaintext message for draft, saved monthly and legacy bills.
   No recomputation of resident money: caller passes persisted allocations
   or the current validated fee-engine result. */
export const displayBillMonth=value=>{
 const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value||""));
 return match?match[2]+"/"+match[1]:String(value||"");
};

const safeAmount=value=>{
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:0;
};
const safeText=value=>String(value??"").replace(/\s+/g," ").trim();
const displayDays=value=>{
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0&&n<=366?n:null;
};

/* Preserve each parent heading; a sole fee with the SAME title is not
   printed twice. Multi-fee categories always list their nonzero children. */
export function savedBillGroups(items=[]){
 const groups=new Map();
 for(let i=0;i<items.length;i++){
  const item=items[i];
  if(!item||item.enabled===false)continue;
  const amount=safeAmount(item.amount);
  if(amount<=0)continue;
  const key=item.category_id||"legacy:"+String(item.id||item.name||i);
  if(!groups.has(key))groups.set(key,{
   name:safeText(item.category_name||item.name),
   fees:[]
  });
  groups.get(key).fees.push({name:safeText(item.name),amount});
 }
 return [...groups.values()];
}

/* A new monthly period saves the residency-day snapshot in each JSONB item.
   Old periods have no such data, so the formatter intentionally does not
   guess from today's roster or reverse-engineer days from rounded shares. */
export function savedResidentDays(items=[]){
 const days={};
 for(const item of items){
  const snapshot=item?.resident_days;
  if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))continue;
  for(const [id,value] of Object.entries(snapshot)){
   const parsed=displayDays(value);
   if(parsed!==null&&days[id]===undefined)days[id]=parsed;
  }
 }
 return days;
}

export function formatBillMessage({
 month,apartment,charges=[],people=[],total,draft=false
},{
 t=(key,params={})=>key.replace(/\{(\w+)\}/g,(_,k)=>String(params[k]??"{"+k+"}")),
 money=value=>safeAmount(value).toLocaleString("vi-VN")+" đ"
}={}){
 if(!charges.length)return "";
 const label=(key,params)=>t(key,params);
 const lines=[];
 if(draft)lines.push(label("DRAFT — NOT SAVED"),"");
 lines.push(label("BILL FOR MONTH {month}",{month:displayBillMonth(month)}));
 if(safeText(apartment))lines.push(label("Apartment")+": "+safeText(apartment));
 lines.push("",label("BILL DETAILS"));
 let count=0;
 for(const group of charges){
  const fees=(group.fees||[]).filter(f=>safeAmount(f.amount)>0);
  if(!fees.length)continue;
  count++;
  const name=safeText(group.name);
  const amount=fees.reduce((sum,f)=>sum+safeAmount(f.amount),0);
  lines.push(count+". "+name+": "+money(amount));
  if(fees.length>1||safeText(fees[0].name).toLocaleLowerCase()!==name.toLocaleLowerCase()){
   for(const fee of fees)lines.push("   - "+safeText(fee.name)+": "+money(fee.amount));
  }
 }
 lines.push("",label("PER-RESIDENT AMOUNTS"));
 let missingDays=false;
 for(let i=0;i<people.length;i++){
  const person=people[i];
  const days=displayDays(person.days);
  if(days===null)missingDays=true;
  lines.push((i+1)+". "+safeText(person.name)+
   (days!==null?" ("+label("{count} days",{count:days})+")":"")+
   ": "+money(person.amount));
 }
 if(missingDays)lines.push("",label("Residency days are unavailable for this older saved period."));
 lines.push("",label("GRAND TOTAL")+": "+money(total));
 return lines.join("\n");
}
