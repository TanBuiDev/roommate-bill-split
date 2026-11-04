import { calculatePeriod, METHODS } from "./fee-engine.mjs";

/* Apartment-scoped templates and multi-fee periods. No timers, subscriptions or automatic sync. */
const SYSTEM_TEMPLATES = [
  {id:"system:apartment",name:"Apartment fees",fees:[
    ["Cold water","days"],["Wastewater service","days"],["Indoor management","equal"],
    ["Outdoor management","equal"],["Building committee fee","equal"],
    ["Building committee operations","equal"],["Motorcycle parking","quantity"]
  ]},
  {id:"system:rental",name:"Rental house",fees:[
    ["Electricity","days"],["Water","days"],["Internet","equal"],["Rent","equal"],["Cleaning","equal"]
  ]},
  {id:"system:living",name:"Shared living costs",fees:[
    ["Groceries","equal"],["Shared supplies","equal"],["Cleaning","equal"],["Other expenses","manual"]
  ]}
];
const byId=id=>document.getElementById(id);
const node=(tag,className,text)=>{
  const v=document.createElement(tag);
  if(className)v.className=className;
  if(text!==undefined)v.textContent=text;
  return v;
};
const uuid=()=>crypto.randomUUID();
const deepCopy=x=>JSON.parse(JSON.stringify(x));
const stripNumber=value=>String(value||"").replace(/\D/g,"").replace(/^0+(?=\d)/,"").slice(0,13);
const formatNumber=value=>Number(value||0).toLocaleString("vi-VN");

export function createFeeUI({db,getContext,t,money,toast,errorNotice,confirmAction,nowMonth,onSaved}) {
 let apartmentId=null,owner=false,residents=[],templates=[],periods=[],payments=[];
 let mode="simple",editing=[],expanded=new Set(),pending=false,loaded=false;
 let draft={month:nowMonth(),name:"Apartment fees"};
 let draftSystemNameKey=null;
 const active=()=>getContext().apt?.id===apartmentId;
 const label=(id,text)=>{const x=byId(id);if(x)x.textContent=text};
 const visible=(id,show)=>{const x=byId(id);if(x)x.classList.toggle("hidden",!show)};
 const ownerAccess=()=>active()&&owner;
 const periodDays=()=>{
  const parts=String(draft.month||"").split("-").map(Number);
  return parts.length===2&&parts[0]>=2000&&parts[1]>=1&&parts[1]<=12
   ?new Date(parts[0],parts[1],0).getDate():30;
 };
 const daysForResident=p=>{
  const limit=periodDays();
  if(p.mode==="full")return limit;
  if(p.mode==="custom")return Math.min(limit,Math.max(0,Math.floor(Number(p.custom_days)||0)));
  return Math.min(limit,[1,2,3,4].includes(Number(String(p.mode||"w4").slice(1)))?
    Number(String(p.mode).slice(1))*7:28);
 };
 const calculation=()=>calculatePeriod(editing,residents,daysForResident);
 const formatName=name=>t(name);
 const makeItem=(name="",method="days",data={})=>({
   id:uuid(),name,method:METHODS.includes(method)?method:"days",amount:Number(data.amount)||0,
   people:deepCopy(data.people||{}),
   // Built-in template keys are translated only until the user edits that name.
   systemNameKey:data.systemNameKey||null
 });
 const templateItems=(source,system=false)=>source.map(item=>
   Array.isArray(item)
     ?makeItem(system?t(item[0]):item[0],item[1],{systemNameKey:system?item[0]:null})
     :makeItem(item.name,item.method,item));
 const hasTemplates=()=>templates.length>0;
 const applyItemList=(items,title,systemTitleKey=null)=>{
   if(!ownerAccess())return;
   editing=templateItems(items,!!systemTitleKey);
   draftSystemNameKey=systemTitleKey;
   draft.name=title||t("Apartment fees");
   byId("fee-period-name").value=draft.name;
   renderItems();
 };
 const feeNameField=(labelText,initial,fn,kind="text")=>{
  const wrapper=node("label","field");
  wrapper.append(node("span",null,t(labelText)));
  const input=node("input","control");
  input.type=kind;input.value=initial||"";
  input.addEventListener("input",event=>fn(event.target.value,input));
  wrapper.append(input);
  return {wrapper,input};
 };
 const feeNames=()=>{
  const select=byId("fee-template-select"),selected=select.value;
  select.replaceChildren();
  for(const builtin of SYSTEM_TEMPLATES){
    const option=node("option",null,t(builtin.name));option.value=builtin.id;select.append(option);
  }
  for(const template of templates){
    const option=node("option",null,template.name);option.value="saved:"+template.id;select.append(option);
  }
  if([...select.options].some(option=>option.value===selected))select.value=selected;
  byId("fee-delete-template").classList.toggle("hidden",!select.value.startsWith("saved:"));
 };
 const renderSummary=()=>{
  const result=calculation();
  label("fee-total-value",money(result.total||0));
  label("fee-error",result.valid?"":t(result.error));
  const preview=byId("fee-breakdown-list");
  preview.replaceChildren();
  if(result.valid){
   for(const person of result.breakdown){
    const row=node("div","fee-breakdown-row");
    row.append(node("span",null,person.resident_name),node("strong",null,money(person.amount)));
    preview.append(row);
   }
  }else preview.append(node("p","fee-hint",t("Review your allocations")));
  byId("fee-save-period").disabled=!ownerAccess()||pending||!result.valid;
  byId("fee-share").disabled=!result.valid;
  for(let i=0;i<editing.length;i++){
   const item=editing[i],resultLine=result.lines[i];
   const el=byId("fee-preview-"+item.id);
   if(el){
    if(resultLine?.valid){
     el.textContent=t("{count} residents",{count:resultLine.allocations.length})+
       " · "+money(resultLine.allocations.reduce((s,a)=>s+a.share,0));
    } else if(resultLine?.error)el.textContent=t(resultLine.error);
    else el.textContent=t("Review sharing rules");
   }
  }
 };
 const makePerson=(fee,resident)=>{
  const cfg=fee.people[resident.id] ||= {};
  const row=node("div","fee-person");
  const labelElem=node("label"),name=node("span","fee-person-name",resident.name);
  let input;
  if(fee.method==="days"||fee.method==="equal"){
   input=node("input");input.type="checkbox";input.checked=cfg.included!==false;
   input.addEventListener("change",()=>{cfg.included=input.checked;renderSummary()});
   labelElem.append(input,name);
   row.append(labelElem);
   if(fee.method==="days")row.append(node("small",null,daysForResident(resident)+" "+t("Days").toLowerCase()));
  } else {
   labelElem.append(name);
   row.append(labelElem);
   input=node("input");input.type="number";input.inputMode="numeric";input.min="0";
   input.max=fee.method==="quantity"?"1000":"1000000000000";
   input.step="1";input.value=String(fee.method==="quantity"?(cfg.quantity||0):(cfg.manual||0));
   input.setAttribute("aria-label",resident.name+" · "+t(fee.method==="quantity"?"Quantity":"Amount (VND)"));
   input.addEventListener("input",()=>{
     cfg[fee.method==="quantity"?"quantity":"manual"]=Number(input.value)||0;
     renderSummary();
   });
   row.append(input);
  }
  return row;
 };
 function renderItems(){
  const container=byId("fee-items");container.replaceChildren();
  if(!editing.length)container.append(node("p","muted",t("No fee items. Add one to start.")));
  for(const [index,item] of editing.entries()){
   const card=node("article","fee-item");
   const top=node("div","fee-item-top");
   const name=feeNameField("Fee name",item.name,(value)=>{item.name=value;item.systemNameKey=null;renderSummary()});
   name.input.maxLength=100;
   const amount=feeNameField("Amount (VND)",item.amount?formatNumber(item.amount):"",(value,input)=>{
     const clean=stripNumber(value);
     item.amount=clean?Number(clean):0;
     input.value=clean?formatNumber(clean):"";
     renderSummary();
   });
   amount.input.setAttribute("inputmode","numeric");
   amount.input.placeholder=t("Enter amount");
   const methodField=node("label","field"),methodLabel=node("span",null,t("Sharing rule")),method=node("select","control");
   for(const mode of METHODS){
    const option=node("option",null,t(({days:"By days",equal:"Split equally",quantity:"By quantity",manual:"Manual amounts"})[mode]));
    option.value=mode;method.append(option);
   }
   method.value=item.method;
   method.addEventListener("change",()=>{item.method=method.value;renderItems()});
   methodField.append(methodLabel,method);
   const del=node("button","fee-item-delete",t("Remove"));del.type="button";
   del.addEventListener("click",()=>{editing.splice(index,1);renderItems()});
   top.append(name.wrapper,amount.wrapper,methodField,del);
   const details=node("details","fee-item-details");details.open=index===0;
   const title=node("summary",null,t("Residents and allocation"));details.append(title);
   const hint=node("p","fee-rule-note",t(item.method==="quantity"?
     "Enter the number of vehicles or units for each resident. Zero means excluded.":
     item.method==="manual"?"Enter an exact amount for each resident; the sum must match this fee.":
     "Choose who shares this fee. Day-based rules use the resident's current stay length."));
   const people=node("div","fee-people-list");
   for(const resident of residents)people.append(makePerson(item,resident));
   details.append(hint,people);
   const preview=node("div","fee-item-preview");
   preview.append(node("small",null,t("Fee allocation")),node("strong",null,""));
   const amountDisplay=preview.lastChild;
   amountDisplay.id="fee-preview-"+item.id;
   card.append(top,details,preview);container.append(card);
  }
  renderSummary();
 }
 function renderMode(){
  visible("fee-mode-controls",owner);
  visible("fee-editor",owner&&mode==="multi");
  for(const id of ["bill-details-panel","residents-panel","summary-panel"])
    visible(id,owner&&mode==="simple");
  byId("fee-simple-mode").classList.toggle("active",mode==="simple");
  byId("fee-composite-mode").classList.toggle("active",mode==="multi");
  byId("fee-simple-mode").setAttribute("aria-pressed",String(mode==="simple"));
  byId("fee-composite-mode").setAttribute("aria-pressed",String(mode==="multi"));
 }
 const summarizeText=()=>{
  const result=calculation();if(!result.valid)return "";
  const parts=[draft.name+" · "+draft.month,
    t("Total")+": "+money(result.total),""];
  for(const line of result.lines)parts.push(formatName(line.name)+": "+money(line.amount));
  parts.push("",t("Per-person total")+":");
  for(const entry of result.breakdown)parts.push(entry.resident_name+": "+money(entry.amount));
  return parts.join("\n");
 };
 const copyOrShare=async()=>{
  const value=summarizeText();if(!value)return;
  if(navigator.share){
   try{await navigator.share({title:draft.name,text:value});return}
   catch(err){if(err?.name==="AbortError")return}
  }
  try{await navigator.clipboard.writeText(value);toast("Share unavailable. Breakdown copied instead.")}
  catch(err){errorNotice("Sharing failed. Please try again.",err)}
 };
 const summarizeSavedPeriod=period=>{
  const items=Array.isArray(period.items)?period.items:[];
  if(!items.length)return "";
  const lines=[
   period.name+" · "+period.bill_month,
   t("Total")+": "+money(period.total),
   "",
   ...items.map(item=>t(item.name)+": "+money(item.amount)),
   "",
   t("Per-person total")+":"
  ];
  const payList=payments.filter(pay=>pay.period_id===period.id);
  for(const pay of payList)lines.push(pay.resident_name+": "+money(pay.amount));
  return lines.join("\n");
 };
 const copySavedPeriod=async period=>{
  const value=summarizeSavedPeriod(period);
  if(!value)return toast("Saved bill details unavailable. Refresh history.");
  try{
   await navigator.clipboard.writeText(value);
   toast("Saved bill copied.");
  }catch(err){
   // Some mobile embedded browsers do not support navigator.clipboard.
   const input=document.createElement("textarea");
   input.value=value;input.readOnly=true;
   input.style.position="fixed";input.style.left="-9999px";
   document.body.append(input);input.select();
   let ok=false;
   try{ok=!!document.execCommand?.("copy")}catch{}
   input.remove();
   if(ok)toast("Saved bill copied.");
   else errorNotice("Your browser cannot copy to clipboard.",err);
  }
 };
 const shareSavedPeriod=async period=>{
  const value=summarizeSavedPeriod(period);
  if(!value)return toast("Saved bill details unavailable. Refresh history.");
  if(typeof navigator.share==="function"){
   try{await navigator.share({title:period.name,text:value});return}
   catch(err){if(err?.name==="AbortError")return}
  }
  await copySavedPeriod(period);
 };
 const renderHistory=()=>{
  const root=byId("fee-history");root.replaceChildren();
  if(!periods.length){root.append(node("p","muted",t("No multi-fee periods yet.")));return}
  for(const period of periods){
   const open=expanded.has(period.id);
   const card=node("article","fee-history-card");
   const summary=node("div","fee-history-summary"),left=node("div");
   left.append(node("strong",null,period.name));
   left.append(node("small",null,period.bill_month+" · "+period.items.length+" "+t("fee items")));
   summary.append(left,node("strong",null,money(period.total)));
   const actions=node("div","fee-history-actions");
   const toggle=node("button","mini",t(open?"Hide details":"Details"));toggle.type="button";
   toggle.addEventListener("click",()=>{open?expanded.delete(period.id):expanded.add(period.id);renderHistory()});
   actions.append(toggle);
   const copyButton=node("button","mini",t("Copy bill"));copyButton.type="button";
   copyButton.addEventListener("click",()=>copySavedPeriod(period));
   const shareButton=node("button","mini",t("Share bill"));shareButton.type="button";
   shareButton.addEventListener("click",()=>shareSavedPeriod(period));
   actions.append(copyButton,shareButton);
   if(owner){
    const duplicate=node("button","mini",t("Copy to editor"));duplicate.type="button";
    duplicate.addEventListener("click",()=>{
      mode="multi";renderMode();
      draft.month=nowMonth();draft.name=period.name;
      byId("fee-period-month").value=draft.month;
      byId("fee-period-name").value=draft.name;
      editing=templateItems(period.items);
      draftSystemNameKey=null;
      renderItems();
      toast("Copied. Review amounts and people before saving.");
      byId("fee-editor").scrollIntoView({behavior:"smooth",block:"start"});
    });actions.append(duplicate);
    const remove=node("button","mini red",t("Delete"));remove.type="button";
    remove.addEventListener("click",async()=>{
      if(!await confirmAction({title:"Delete billing period?",
        message:"Delete this period and its payment history? This cannot be undone.",
        confirmText:"Delete bill",cancelText:"Keep bill",tone:"danger"}))return;
      const {error}=await db.rpc("delete_apartment_fee_period",{p_period_id:period.id});
      if(error)return errorNotice("Could not delete the bill.",error);
      periods=periods.filter(p=>p.id!==period.id);
      payments=payments.filter(p=>p.period_id!==period.id);
      expanded.delete(period.id);renderHistory();toast("Bill deleted.");
    });actions.append(remove);
   }
   summary.append(actions);card.append(summary);
   if(open){
    const detail=node("div","fee-history-details");
    for(const fee of period.items||[]){
      const row=node("div","fee-history-charge");
      row.append(node("span",null,t(fee.name)),node("strong",null,money(fee.amount)));
      detail.append(row);
    }
    const payList=payments.filter(p=>p.period_id===period.id);
    for(const pay of payList){
      const row=node("div","fee-history-payment"),info=node("div");
      info.append(node("strong",null,pay.resident_name));
      info.append(node("small",null,money(pay.amount)));
      const individual=node("details","fee-person-breakdown");
      individual.append(node("summary",null,t("View fee details")));
      for(const fee of period.items||[]){
       const share=(fee.allocations||[]).find(allocation=>allocation.resident_id===pay.resident_id)?.share||0;
       if(!share)continue;
       const feeRow=node("div","fee-person-breakdown-row");
       feeRow.append(node("span",null,t(fee.name)),node("strong",null,money(share)));
       individual.append(feeRow);
      }
      info.append(individual);
      const controls=node("div","fee-history-payment-actions");
      const statuses={unpaid:"Unpaid",submitted:"Payment reported",confirmed:"Received"};
      controls.append(node("span","payment-badge "+pay.status,t(statuses[pay.status]||"Unpaid")));
      const linked=residents.find(r=>r.id===pay.resident_id&&r.user_id===getContext().user?.id);
      if(owner&&pay.status==="submitted"){
        const confirm=node("button","mini",t("Confirm receipt"));confirm.type="button";
        confirm.addEventListener("click",async()=>{
          confirm.disabled=true;
          const {data,error}=await db.rpc("confirm_apartment_fee_payment",{p_payment_id:pay.id});
          if(error||data!==true)errorNotice("Could not confirm payment.",error);
          else{pay.status="confirmed";renderHistory();toast("Payment confirmed.")}
          confirm.disabled=false;
        });controls.append(confirm);
      }else if(linked&&!owner&&pay.status==="unpaid"){
        const sent=node("button","mini",t("I have paid"));sent.type="button";
        sent.addEventListener("click",async()=>{
          sent.disabled=true;
          const {data,error}=await db.rpc("report_apartment_fee_payment",{p_payment_id:pay.id});
          if(error||data!==true)errorNotice("Could not report payment.",error);
          else{pay.status="submitted";renderHistory();toast("Payment reported to your apartment owner.")}
          sent.disabled=false;
        });controls.append(sent);
      }
      row.append(info,controls);detail.append(row);
    }
    card.append(detail);
   }
   root.append(card);
  }
 };
 async function load(apartment,ownerFlag,roster){
  if(!apartment)return clear();
  const changed=apartmentId!==apartment;
  apartmentId=apartment;owner=ownerFlag;residents=roster||[];
  if(changed){mode="simple";editing=[];expanded=new Set();draft={month:nowMonth(),name:"Apartment fees"};draftSystemNameKey=null;loaded=false}
  visible("fee-workspace",true);
  renderMode();
  const [periodResult,templateResult]=await Promise.all([
    db.from("apartment_fee_periods").select("id,apartment_id,bill_month,name,items,total,created_at").eq("apartment_id",apartment).order("created_at",{ascending:false}).limit(70),
    owner?db.from("apartment_fee_templates").select("id,apartment_id,name,definition,created_at").eq("apartment_id",apartment).order("name").limit(70):Promise.resolve({data:[]})
  ]);
  if(!active())return;
  if(periodResult.error||templateResult.error){errorNotice("Unable to load multi-fee bills.",periodResult.error||templateResult.error);return}
  periods=periodResult.data||[];templates=templateResult.data||[];
  let fresh=[];
  if(periods.length){
   const {data,error}=await db.from("apartment_fee_payments").select("id,period_id,resident_id,resident_name,amount,status")
     .in("period_id",periods.map(p=>p.id));
   if(error){errorNotice("Unable to load payment statuses.",error);return}
   fresh=data||[];
  }
  if(!active())return;
  payments=fresh;loaded=true;
  feeNames();
  if(!editing.length&&owner)applyItemList(SYSTEM_TEMPLATES[0].fees,t("Apartment fees"),"Apartment fees");
  else if(owner)renderItems();
  byId("fee-period-month").value=draft.month;
  byId("fee-period-name").value=draft.name;
  renderHistory();
 }
 function clear(){
  apartmentId=null;owner=false;residents=[];templates=[];periods=[];payments=[];
  editing=[];mode="simple";loaded=false;
  visible("fee-workspace",false);
 }
 async function savePeriod(){
  if(!ownerAccess()||pending)return;
  const month=byId("fee-period-month").value,name=byId("fee-period-name").value.trim();
  draft.month=month;draft.name=name;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||name.length<2||name.length>100)
   return label("fee-error",t("Enter a month and a period name."));
  const result=calculation();
  if(!result.valid)return label("fee-error",t(result.error));
  if(periods.some(p=>p.bill_month===month&&p.name===name)){
   const yes=await confirmAction({title:"Replace existing billing period?",
     message:"Replacing this period resets previous payment confirmations.",
     confirmText:"Replace bill",cancelText:"Keep existing bill",tone:"danger"});
   if(!yes)return;
  }
  pending=true;renderSummary();
  try{
   const payload=result.lines.map(line=>({
    id:line.id,name:line.name,method:line.method,amount:Number(line.amount),
    people:line.people,allocations:line.allocations
   }));
   const {error}=await db.rpc("save_apartment_fee_period",{
    p_apartment_id:apartmentId,p_month:month,p_name:name,p_items:payload
   });
   if(error)throw error;
   toast("Billing period saved.");
   if(onSaved)await onSaved(apartmentId);
   else await load(apartmentId,owner,getContext().residents);
  }catch(err){errorNotice("Unable to save billing period.",err)}
  finally{pending=false;renderSummary()}
 }
 const saveTemplate=async()=>{
  if(!ownerAccess())return;
  const name=byId("fee-save-template-name").value.trim();
  if(name.length<2||name.length>80)return toast("Enter a template name.");
  if(editing.length<1||editing.length>30)return toast("Add between 1 and 30 fees.");
  const definition=editing.map(item=>({
    name:item.name.trim(),method:item.method,amount:0,
    people:Object.fromEntries(Object.entries(item.people||{}).map(([id,v])=>[id,{
      included:v.included!==false,quantity:Number(v.quantity)||0,manual:0
    }]))
  }));
  if(definition.some(i=>!i.name||i.name.length>100))return toast("Enter a fee name.");
  const existing=templates.find(item=>item.name.toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi"));
  if(existing&&!await confirmAction({title:"Replace saved template?",
    message:"This changes your reusable template, but not existing billing periods.",
    confirmText:"Replace template",cancelText:"Cancel"}))return;
  const data={apartment_id:apartmentId,name,definition,created_by:getContext().user.id};
  const request=existing?
    db.from("apartment_fee_templates").update({definition,updated_at:new Date().toISOString()}).eq("id",existing.id).eq("apartment_id",apartmentId):
    db.from("apartment_fee_templates").insert(data);
  const {error}=await request;
  if(error)return errorNotice("Unable to save template.",error);
  toast("Template saved.");
  await load(apartmentId,owner,residents);
 };
 const removeTemplate=async()=>{
  const selected=byId("fee-template-select").value;
  if(!ownerAccess()||!selected.startsWith("saved:"))return;
  const name=templates.find(v=>"saved:"+v.id===selected)?.name||"";
  const yes=await confirmAction({title:"Delete saved template?",
    message:"Delete "+name+"? Previously saved bills will remain unchanged.",
    confirmText:"Delete template",cancelText:"Cancel",tone:"danger"});
  if(!yes)return;
  const {error}=await db.from("apartment_fee_templates").delete().eq("apartment_id",apartmentId).eq("id",selected.slice(6));
  if(error)return errorNotice("Unable to delete template.",error);
  templates=templates.filter(v=>"saved:"+v.id!==selected);feeNames();toast("Template deleted.");
 };
 function chooseTemplate(){
  if(!ownerAccess())return;
  const selected=byId("fee-template-select").value;
  if(selected.startsWith("system:")){
   const builtin=SYSTEM_TEMPLATES.find(v=>v.id===selected);
   if(builtin)applyItemList(builtin.fees,t(builtin.name),builtin.name);
  } else {
   const chosen=templates.find(v=>"saved:"+v.id===selected);
   if(chosen)applyItemList(chosen.definition,chosen.name);
  }
  byId("fee-save-template-name").value="";
 }
 function duplicatePrevious(){
  if(!periods.length)return toast("No previous billing period to copy.");
  const current=draft.month;
  const prior=periods.filter(p=>p.bill_month<current).sort((a,b)=>b.bill_month.localeCompare(a.bill_month))[0]||periods[0];
  editing=templateItems(prior.items);
  draftSystemNameKey=null;
  draft.name=prior.name;
  byId("fee-period-name").value=draft.name;
  renderItems();toast("Copied. Review amounts and people before saving.");
 }
 function retranslate(){
  if(!apartmentId)return;
  // Only untouched names from built-in templates track the selected UI language.
  for(const item of editing){
   if(item.systemNameKey)item.name=t(item.systemNameKey);
  }
  if(draftSystemNameKey){
   draft.name=t(draftSystemNameKey);
   byId("fee-period-name").value=draft.name;
  }
  feeNames();renderHistory();renderMode();
  if(owner)renderItems();
 }
 // All events are user actions. There is no automatic database refresh.
 byId("fee-simple-mode").addEventListener("click",()=>{mode="simple";renderMode()});
 byId("fee-composite-mode").addEventListener("click",()=>{mode="multi";renderMode()});
 byId("fee-template-select").addEventListener("change",feeNames);
 byId("fee-apply-template").addEventListener("click",chooseTemplate);
 byId("fee-copy-previous").addEventListener("click",duplicatePrevious);
 byId("fee-start-blank").addEventListener("click",()=>applyItemList([["","days"]],t("New billing period")));
 byId("fee-add-item").addEventListener("click",()=>{
  if(!ownerAccess()||editing.length>=30)return toast("Maximum 30 fee items.");
  editing.push(makeItem("","days"));renderItems();
 });
 byId("fee-period-month").addEventListener("change",event=>{draft.month=event.target.value;renderItems()});
 byId("fee-period-name").addEventListener("input",event=>{draft.name=event.target.value;draftSystemNameKey=null});
 byId("fee-share").addEventListener("click",copyOrShare);
 byId("fee-save-period").addEventListener("click",savePeriod);
 byId("fee-save-template").addEventListener("click",saveTemplate);
 byId("fee-delete-template").addEventListener("click",removeTemplate);
 byId("fee-refresh").addEventListener("click",async()=>{
  if(!active())return;
  const button=byId("fee-refresh");button.disabled=true;
  try{await load(apartmentId,owner,getContext().residents);toast("Updated just now.")}
  finally{button.disabled=false}
 });
 visible("fee-workspace",false);
 return {load,clear,retranslate};
}
