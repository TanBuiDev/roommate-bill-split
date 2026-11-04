import { METHODS } from "./fee-engine.mjs";
import { calculateSelection, serializeSelection, hydrateSelection, getGroupMethod, applyGroupRule } from "./unified-billing-core.mjs";
import { openHistoryDetail, closeHistoryDetail, historyMenu } from "./history-detail-ui.mjs";
import { formatBillMessage, savedBillGroups, savedResidentDays } from "./bill-message.mjs";

/* Unified monthly billing editor. All mutations are explicit user actions. */
const BUILTINS = [
  {id:"electric",name:"Electricity",fees:[["Electricity","days"]]},
  {id:"water",name:"Cold water",fees:[["Cold water","days"],["Drainage and wastewater treatment (XLNT)","days"]]},
  {id:"management",name:"Management fees",fees:[["Indoor management","equal"],["Outdoor management","equal"]]},
  {id:"committee",name:"Building committee remuneration",fees:[["Building committee remuneration","equal"],["Building committee operating contribution","equal"]]},
  {id:"parking",name:"Motorcycle parking",fees:[["Motorcycle parking","quantity"]]},
  {id:"internet",name:"Internet",fees:[["Internet","equal"]]},
  {id:"rent",name:"Rent",fees:[["Rent","equal"]]},
  {id:"living",name:"Shared living costs",fees:[["Groceries","equal"],["Shared supplies","equal"],["Cleaning","equal"]]}
];
const BILL_NAME="Monthly summary";
const METHODS_LABEL={days:"Default",equal:"Split equally",quantity:"By quantity",manual:"Manual amounts"};
const maxAmount=1000000000000;
const node=(tag,cls,value)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(value!==undefined)element.textContent=value;
  return element;
};
const el=id=>document.getElementById(id);
const fmt=value=>Number(value||0).toLocaleString("vi-VN");
const parseMoney=value=>Math.min(maxAmount,Number(String(value||"").replace(/[^0-9]/g,"").slice(0,13))||0);
const copy=value=>JSON.parse(JSON.stringify(value));
const uuid=()=>crypto.randomUUID();

export function createFeeUI({db,getContext,t,money,toast,errorNotice,confirmAction,nowMonth,onSaved,onMonthChange,onHistoryChanged}){
 let apt=null,owner=false,residents=[],periods=[],templates=[],payments=[];
 let month=nowMonth(),groups=[],selectedType="electric",editing=null,workingGroup=null,originalWorking="",dirty=false,pending=false,loaded=false;
 let reloadSaved=false,shown=new Set(),newType={name:"",fees:[{name:"",method:"days"}]},typeBeingEdited=null;
 const active=()=>apt&&getContext().apt?.id===apt;
 const countFees=()=>groups.reduce((n,g)=>n+g.fees.length,0);
 const daysInMonth=()=>{const [y,m]=month.split("-").map(Number);return new Date(y,m,0).getDate()||30};
 const residentDays=resident=>{
  const cap=daysInMonth();
  if(resident.mode==="full")return cap;
  if(resident.mode==="custom")return Math.max(0,Math.min(cap,Math.floor(Number(resident.custom_days)||0)));
  const w=Number(String(resident.mode||"w4").slice(1));
  return Math.min(cap,[1,2,3,4].includes(w)?w*7:28);
 };
 const userTemplates=()=>templates.map(p=>({
  id:"custom:"+p.id,name:p.name,
  fees:(p.definition||[]).map(f=>[f.name, METHODS.includes(f.method)?f.method:"days"])
 }));
 const catalog=()=>[...BUILTINS,...userTemplates()];
 const categoryName=id=>{
  const type=catalog().find(x=>x.id===id);
  return type ? (id.startsWith("custom:")?type.name:t(type.name)) : id;
 };
 const makeGroup=type=>({
  id:type.id,name:type.name,enabled:true,people:{},
  fees:type.fees.map(([name,method])=>({id:uuid(),name,method,amount:0,people:{}}))
 });
 const displayGroupName=g=>g.id.startsWith("custom:")||g.id.startsWith("legacy:")?g.name:t(g.name);
 const displayFeeName=(f,g)=>g.id.startsWith("custom:")||g.id.startsWith("legacy:")?f.name:t(f.name);
 const sessionKey=()=>apt?"oghep-draft-unified-v1:"+apt+":"+month:"";
 function store(){
  if(!apt||!owner)return;
  try{sessionStorage.setItem(sessionKey(),JSON.stringify(groups));}catch{}
 }
 function forgetDraft(){try{sessionStorage.removeItem(sessionKey());}catch{}}
 const groupTotal=g=>g.fees.reduce((sum,x)=>sum+(Number(x.amount)||0),0);
 const selectedItems=()=>groups.filter(g=>g.enabled).flatMap(g=>g.fees.map(f=>({...f,amount:Number(f.amount)||0})));
 const calculation=()=>calculateSelection(groups,residents,residentDays);
 const existing=()=>periods.find(p=>p.bill_month===month&&p.name===BILL_NAME);
 function restorePeriod(period,clearAmounts=false){return hydrateSelection(period.items||[],clearAmounts);}
 function restoreMonth(){
  editing=null;dirty=false;
  const saved=existing();
  groups=saved?restorePeriod(saved):[];
  if(owner){
   try{
    const data=sessionStorage.getItem(sessionKey());
    if(data){
     const parsed=JSON.parse(data);
     if(Array.isArray(parsed)&&parsed.length<=30&&parsed.every(g=>g&&typeof g.id==="string"&&Array.isArray(g.fees))){
      groups=parsed;dirty=true;
     }
    }
   }catch{}
  }
  renderAll();
 }
 function setVisible(id,yes){el(id)?.classList.toggle("hidden",!yes)}
 const html=String.raw`
  <div class="ub-intro"><div>
    <h4 id="ub-heading">Billing period</h4>
    <p id="ub-caption">Select a month to calculate the full billing period.</p>
   </div><div class="ub-period-tools">
    <label class="field ub-month-label"><span id="ub-month-text">Billing month</span><input class="control" type="month" id="ub-month"></label>
    <button id="ub-copy-last" class="button secondary ub-copy-previous" type="button"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span id="ub-copy-last-label">Use last month's template</span></button>
   </div></div>
  <div class="ub-add-row">
   <label class="field ub-category"><span id="ub-type-label">Bill type</span><select id="ub-type" class="control"></select></label>
   <button type="button" id="ub-add" class="button primary"><span class="ub-add-plus" aria-hidden="true">+</span><span id="ub-add-label">Add bill</span></button>
  </div>
  <div class="ub-category-actions">
   <button type="button" id="ub-new-type" class="mini">+ Create custom bill type</button>
   <button type="button" id="ub-edit-type" class="mini hidden">Edit custom type</button>
   <button type="button" id="ub-delete-type" class="mini red hidden">Delete custom type</button>
  </div>
  <dialog id="ub-bill-dialog" class="ub-bill-dialog" aria-labelledby="ub-modal-heading">
   <div class="ub-bill-dialog-inner">
    <div class="ub-dialog-head">
     <h3 id="ub-modal-heading">Add bill</h3>
     <button id="ub-modal-close" class="mini" type="button" aria-label="Close">×</button>
    </div>
    <p id="ub-modal-type" class="ub-modal-type"></p>
    <section id="ub-form" class="ub-form hidden" aria-labelledby="ub-form-title">
     <h4 id="ub-form-title">Bill details</h4>
     <div id="ub-form-items"></div>
     <div class="ub-form-total"><span id="ub-form-total-label">Bill subtotal</span><strong id="ub-form-amount">0 ₫</strong></div>
     <p class="summary-error" id="ub-bill-error" role="alert"></p>
    </section>
    <div class="ub-bill-footer">
     <button id="ub-cancel" class="button secondary" type="button">Cancel</button>
     <button type="button" id="ub-done" class="button primary">Add to summary</button>
    </div>
   </div>
  </dialog>
  <section class="ub-summary" aria-labelledby="ub-summary-title">
   <div class="ub-summary-head"><h4 id="ub-summary-title">Bills in this period</h4><span id="ub-count" class="tag">0</span></div>
   <p class="muted" id="ub-empty">No bills yet. Choose a bill type above to begin.</p>
   <div id="ub-list" class="ub-list"></div>
   <section class="fee-breakdown" aria-labelledby="ub-people-heading">
    <div class="ub-breakdown-head">
     <h4 id="ub-people-heading">Per-resident breakdown</h4>
     <div class="ub-total-in-breakdown">
      <span id="ub-selected-label">Total amount</span><strong id="ub-total">0 ₫</strong>
     </div>
    </div>
    <div id="ub-people"></div>
   </section>
   <p class="summary-error" id="ub-error" role="alert"></p>
   <div class="ub-actions" role="group" aria-label="Billing actions">
    <button id="ub-save" class="button primary" type="button" title="Save monthly settlement" aria-label="Save monthly settlement"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V4M7 21v-8h10v8"/></svg><span id="ub-save-label" class="sr-only">Save monthly settlement</span></button>
    <button id="ub-copy-result" class="button secondary" type="button" title="Copy bill as message" aria-label="Copy bill as message"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span id="ub-copy-result-label" class="sr-only">Copy bill as message</span></button>
    <button id="ub-share" class="button secondary" type="button" title="Share breakdown" aria-label="Share breakdown"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="m8.3 11 7.4-4.7m-7.4 6.7 7.4 4.7"/></svg><span id="ub-share-label" class="sr-only">Share breakdown</span></button>
   </div>
   <p class="data-note" id="ub-info">Replacing a saved billing period resets its payment statuses.</p>
  </section>
  <dialog id="ub-type-dialog" class="og-modal ub-type-dialog" aria-labelledby="ub-dialog-heading">
   <div class="og-modal__content">
    <div class="ub-dialog-head"><h3 id="ub-dialog-heading">Create bill type</h3><button class="mini" id="ub-type-cancel" type="button">Close</button></div>
    <label class="field"><span id="ub-name-label">Bill type name</span><input id="ub-new-name" class="control" maxlength="80" placeholder="e.g. Cleaning fee"></label>
    <div class="ub-dialog-head"><strong id="ub-subfee-label">Included fee items</strong><button class="mini" id="ub-add-subfee" type="button">+ Add subfee</button></div>
    <div id="ub-type-items"></div>
    <label class="field"><span id="ub-method-label">Default sharing rule</span>
     <select id="ub-new-method" class="control">
       <option value="days">By days</option><option value="equal">Split equally</option>
       <option value="quantity">By quantity</option><option value="manual">Manual amounts</option>
     </select>
    </label>
    <p id="ub-type-error" class="summary-error" role="alert"></p>
    <button class="button primary" type="button" id="ub-type-save">Save bill type</button>
   </div>
  </dialog>`;
 function install(){
  const pane=el("fee-editor");
  pane.innerHTML=html;
  pane.classList.remove("hidden");
  const dialog=el("ub-type-dialog");
  const billDialog=el("ub-bill-dialog");
  document.body.append(dialog,billDialog);
  el("fee-mode-controls").classList.add("hidden");
  el("fee-title").textContent=t("Calculate monthly bills");
  const caption=el("fee-title").nextElementSibling;
  if(caption)caption.textContent=t("Choose days, add bills, and save your monthly settlement.");
  const legacy=el("fee-history")?.closest(".fee-history-wrap");
  if(legacy){
   const h=legacy.querySelector("h4");if(h)h.textContent=t("Monthly settlements");
   const p=legacy.querySelector(".fee-history-head p");if(p)p.textContent=t("Saved periods and payment progress.");
  }
  el("ub-type").addEventListener("change",e=>{selectedType=e.target.value;refreshTypeActions()});
  el("ub-add").addEventListener("click",openSelectedType);
  el("ub-modal-close").addEventListener("click",cancelBill);
  billDialog.addEventListener("cancel",e=>{e.preventDefault();cancelBill()});
  el("ub-new-type").addEventListener("click",()=>openTypeDialog());
  el("ub-edit-type").addEventListener("click",()=>openTypeDialog(selectedType));
  el("ub-delete-type").addEventListener("click",deleteType);
  el("ub-type-cancel").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("cancel",e=>{if(pending)e.preventDefault()});
  el("ub-add-subfee").addEventListener("click",()=>{if(newType.fees.length<12){newType.fees.push({name:"",method:el("ub-new-method").value});renderNewTypeLines()}});
  el("ub-type-save").addEventListener("click",saveType);
  el("ub-new-name").addEventListener("input",e=>{newType.name=e.target.value;el("ub-type-error").textContent=""});
  el("ub-new-method").addEventListener("change",e=>{newType.fees.forEach(f=>f.method=e.target.value)});
  el("ub-cancel").addEventListener("click",cancelBill);
  el("ub-done").addEventListener("click",commitBill);
  el("ub-share").addEventListener("click",shareCurrent);
  el("ub-copy-result").addEventListener("click",()=>writeClipboard(summarize()));
  el("ub-copy-last").addEventListener("click",copyPrevious);
  el("ub-save").addEventListener("click",savePeriod);
  el("fee-refresh").addEventListener("click",async()=>{const b=el("fee-refresh");b.disabled=true;try{await load(apt,owner,getContext().residents);toast(t("Updated just now."))}finally{b.disabled=false}});
  el("ub-month").addEventListener("change",async e=>{
   const next=e.target.value;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(next)){e.target.value=month;return}
   if(dirty&&next!==month){
    const yes=await confirmAction({title:t("Switch billing month?"),message:t("Your unfinished bills stay in this browser session. Continue to another month?"),confirmText:t("Switch month"),cancelText:t("Cancel")});
    if(!yes){e.target.value=month;return}
   }
   month=next;restoreMonth();onMonthChange?.();
  });
  retranslate();
 }
 const previewGroup=g=>{
  const value=groupTotal(g);
  return t("{count} charges",{count:g.fees.length})+" · "+money(value);
 };
 function refreshTypeActions(){
  const isCustom=templates.some(x=>"custom:"+x.id===selectedType);
  setVisible("ub-edit-type",isCustom&&owner);
  setVisible("ub-delete-type",isCustom&&owner);
  el("ub-add-label").textContent=t(groups.some(g=>g.id===selectedType)?"Edit bill":"Add bill");
 }
 function renderCatalog(){
  const select=el("ub-type");const prior=selectedType;
  select.replaceChildren();
  const known=catalog();
  for(const type of known){
   const option=node("option",null,type.id.startsWith("custom:")?type.name:t(type.name));
   option.value=type.id;select.append(option);
  }
  // Preserve access to saved historical categories if their template was deleted.
  const orphan=groups.find(g=>g.id===prior);
  if(orphan&&!known.some(x=>x.id===orphan.id)){
   const option=node("option",null,displayGroupName(orphan));
   option.value=orphan.id;select.append(option);
  }
  if([...select.options].some(x=>x.value===prior))select.value=prior;
  else selectedType=select.options[0]?.value||"electric";
  refreshTypeActions();
 }
 function openSelectedType(){
  if(!owner||!active())return;
  const existingGroup=groups.find(g=>g.id===selectedType);
  const type=catalog().find(x=>x.id===selectedType);
  if(!type&&!existingGroup)return;
  if(!existingGroup&&countFees()+type.fees.length>30)return toast(t("Maximum 30 fee items per period."));
  workingGroup=existingGroup?copy(existingGroup):makeGroup(type);
  editing=workingGroup.id;
  originalWorking=JSON.stringify(workingGroup);
  const editingOld=Boolean(existingGroup);
  el("ub-modal-heading").textContent=t(editingOld?"Edit bill":"Add bill");
  el("ub-done").textContent=t(editingOld?"Save changes":"Add bill");
  el("ub-modal-type").textContent=displayGroupName(workingGroup);
  el("ub-bill-error").textContent="";
  renderCatalog();renderForm();
  const dlg=el("ub-bill-dialog");
  if(!dlg.open)dlg.showModal();
 }
 function cancelBill(){
  workingGroup=null;editing=null;originalWorking="";
  if(el("ub-bill-dialog").open)el("ub-bill-dialog").close();
  renderForm();
 }
 function commitBill(){
  if(!workingGroup||!owner||!active())return;
  const candidate=workingGroup;
  const total=groupTotal(candidate);
  if(total<=0){el("ub-bill-error").textContent=t("Enter an amount greater than zero.");return}
  // Validate an excluded bill as if enabled, without changing its checkbox state.
  const verdict=calculateSelection([{...candidate,enabled:true}],residents,residentDays);
  if(!verdict.valid){
   el("ub-bill-error").textContent=t(verdict.error||"Invalid sharing rule.");
   return;
  }
  const idx=groups.findIndex(g=>g.id===candidate.id);
  if(idx>=0)groups[idx]=candidate;
  else groups.push(candidate);
  dirty=true;store();cancelBill();
  if(idx<0){const next=catalog().find(type=>!groups.some(g=>g.id===type.id));if(next)selectedType=next.id;}
  renderCatalog();renderSummary();
 }
 function renderForm(){
  setVisible("ub-form",Boolean(editing)&&owner);
  const group=workingGroup;
  if(!group)return;
  el("ub-form-title").textContent=displayGroupName(group);
  // Button caption depends on add/edit mode, configured on modal open.
  const root=el("ub-form-items");root.replaceChildren();

  // Each subfee keeps an independent amount, but the sharing rule belongs to
  // the whole bill. No duplicate per-fee rule dropdowns or hidden day ticks.
  for(const fee of group.fees){
   const wrap=node("div","ub-fee-field"),field=node("label","field");
   const caption=node("span",null,displayFeeName(fee,group));
   const amount=node("input","control ub-money-input");
   amount.type="text";amount.inputMode="numeric";amount.value=fee.amount?fmt(fee.amount):"";
   amount.placeholder=t("Enter amount");
   amount.setAttribute("aria-label",displayFeeName(fee,group)+" (VND)");
   amount.addEventListener("input",()=>{
    fee.amount=parseMoney(amount.value);
    amount.value=fee.amount?fmt(fee.amount):"";
    el("ub-bill-error").textContent="";el("ub-form-amount").textContent=money(groupTotal(group));
   });
   field.append(caption,amount);wrap.append(field);root.append(wrap);
  }

  const settings=node("div","ub-group-rule");
  const methodField=node("label","field ub-group-method");
  const ruleLabel=node("span",null,t("One sharing rule for this bill"));
  const select=node("select","control ub-rule-select");
  const current=getGroupMethod(group);
  if(current==="mixed"){
   const old=node("option",null,t("Existing mixed rules (choose to unify)"));
   old.value="mixed";select.append(old);
  }
  for(const kind of METHODS){
   const option=node("option",null,t(METHODS_LABEL[kind]));option.value=kind;select.append(option);
  }
  select.value=current;
  select.addEventListener("change",()=>{
   if(select.value==="mixed")return;
   applyGroupRule(group,select.value);
   renderForm();
  });
  methodField.append(ruleLabel,select);
  settings.append(methodField);

  if(current==="days"){
   const note=node("div","ub-default-note");
   const check=node("span","ub-note-check","✓");
   check.setAttribute("aria-hidden","true");
   const info=node("div","ub-note-content");
   info.append(node("strong",null,t("Use the days configured above")),
    node("small",null,t("Automatically uses section A. Changes to resident days recalculate this bill.")));
   note.append(check,info);settings.append(note);
  }else if(current==="mixed"){
   const note=node("div","ub-legacy-note");
   note.textContent=t("This saved bill used different sharing rules. Select one rule to unify it; the existing saved history remains unchanged.");
   settings.append(note);
  }else{
   const details=node("details","ub-resident-details");
   if(current==="quantity"||current==="manual")details.open=true;
   const title=current==="equal"?
    t("Choose residents for equal sharing"):current==="quantity"?
    t("Enter quantities for each resident"):t("Enter each resident's amount");
   details.append(node("summary",null,title));
   const people=node("div","ub-group-people");
   group.people ||= {};
   for(const resident of residents){
    const cfg=group.people[resident.id] ||= {};
    const person=node("label","ub-person-row");
    person.append(node("span",null,resident.name));
    if(current==="equal"){
     const checkbox=node("input");checkbox.type="checkbox";checkbox.checked=cfg.included!==false;
     checkbox.addEventListener("change",()=>{cfg.included=checkbox.checked});
     person.prepend(checkbox);
    }else{
     const quantity=node("input","control");
     quantity.type="number";quantity.min="0";quantity.max=current==="quantity"?"1000":String(maxAmount);
     quantity.step="1";quantity.inputMode="numeric";
     const key=current==="quantity"?"quantity":"manual";
     quantity.value=String(cfg[key]||0);
     quantity.setAttribute("aria-label",resident.name+" - "+title);
     quantity.addEventListener("input",()=>{cfg[key]=Math.max(0,Number(quantity.value)||0)});
     person.append(quantity);
    }
    people.append(person);
   }
   details.append(people);settings.append(details);
  }
  root.append(settings);
  el("ub-form-amount").textContent=money(groupTotal(group));
 }
 function renderSummary(){
  const list=el("ub-list");list.replaceChildren();
  el("ub-count").textContent=groups.length+" "+t("bills");
  setVisible("ub-empty",groups.length===0);
  for(const group of groups){
   const row=node("div","ub-bill-row");
   const toggle=node("input");toggle.type="checkbox";toggle.checked=group.enabled;
   toggle.setAttribute("aria-label",t("Include")+" "+displayGroupName(group));
   toggle.addEventListener("change",()=>{group.enabled=toggle.checked;dirty=true;store();renderSummary()});
   const title=node("div","ub-bill-description");
   title.append(node("strong",null,displayGroupName(group)),node("small",null,previewGroup(group)));
   const amount=node("strong","ub-bill-amount",money(groupTotal(group)));
   if(!group.enabled)row.classList.add("ub-excluded");
   const edit=node("button","mini",t("Edit"));edit.type="button";
   edit.addEventListener("click",()=>{selectedType=group.id;openSelectedType()});
   const remove=node("button","mini red",t("Remove"));remove.type="button";
   remove.addEventListener("click",async()=>{
    const yes=await confirmAction({title:t("Remove bill from draft?"),message:t("This removes the bill from the current draft only; saved historical bills are not changed."),confirmText:t("Remove"),cancelText:t("Cancel"),tone:"danger"});
    if(!yes)return;
    groups=groups.filter(g=>g!==group);dirty=true;store();renderSummary();
   });
   if(!owner)toggle.disabled=edit.disabled=remove.disabled=true;
   row.append(toggle,title,amount,edit,remove);list.append(row);
  }
  const tooMany=countFees()>30;
  const totalSelected=groups.filter(g=>g.enabled).reduce((sum,g)=>sum+groupTotal(g),0);
  el("ub-total").textContent=money(totalSelected);
  const result=calculation();
  const people=el("ub-people");people.replaceChildren();
  if(result.valid){
   for(const p of result.breakdown){
    const line=node("div","fee-breakdown-row");
    line.append(node("span",null,p.resident_name),node("strong",null,money(p.amount)));
    people.append(line);
   }
  }else people.append(node("p","fee-hint",t("Choose at least one nonzero bill to view the breakdown.")));
  const allocated=result.valid?result.breakdown.reduce((sum,p)=>sum+Number(p.amount||0),0):0;
  const mismatch=result.valid&&allocated!==totalSelected;
  el("ub-error").textContent=tooMany?t("Maximum 30 fee items per period."):mismatch?
   t("Allocated amounts do not match the bill total. Please check the sharing rule."):(result.valid?"":(groups.length?t(result.error):""));
  el("ub-save").disabled=!active()||!owner||pending||tooMany||!result.valid||mismatch;
  el("ub-share").disabled=!result.valid||mismatch;
  el("ub-copy-result").disabled=!result.valid||mismatch;
  refreshTypeActions();
 }
 function renderAll(){
  el("ub-month").value=month;
  renderCatalog();renderSummary();renderHistory();
 }
 function summarize(){
  const result=calculation();if(!result.valid)return "";
  const daysById=new Map(residents.map(r=>[r.id,residentDays(r)]));
  return formatBillMessage({
   month,apartment:getContext().apt?.name||"",
   draft:dirty||!existing(),
   charges:groups.filter(g=>g.enabled).map(g=>({
    name:displayGroupName(g),
    fees:g.fees.map(f=>({name:displayFeeName(f,g),amount:Number(f.amount)||0}))
   })),
   people:result.breakdown.map(p=>({
    id:p.resident_id,name:p.resident_name,amount:p.amount,days:daysById.get(p.resident_id)
   })),
   total:result.total
  },{t});
 }
 async function writeClipboard(textValue){
  if(!textValue)return;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(textValue);else throw Error("Clipboard unavailable");toast(t("Copied."))}
  catch{
   const input=node("textarea");input.value=textValue;input.style.position="fixed";input.style.left="-9999px";
   document.body.append(input);input.select();let ok=false;
   try{ok=!!document.execCommand?.("copy")}catch{}input.remove();
   if(ok)toast(t("Copied."));else toast(t("Copy failed."));
  }
 }
 async function shareText(textValue,name){
  if(!textValue)return;
  if(navigator.share){try{await navigator.share({title:name,text:textValue});return}catch(e){if(e?.name==="AbortError")return}}
  await writeClipboard(textValue);
 }
 async function shareCurrent(){await shareText(summarize(),t("Monthly billing"))}
 function savedText(period){
  const daysById=savedResidentDays(period.items||[]);
  return formatBillMessage({
   month:period.bill_month,apartment:getContext().apt?.name||"",
   charges:savedBillGroups(period.items||[]).map(g=>({
    name:t(g.name),fees:g.fees.map(f=>({name:t(f.name),amount:f.amount}))
   })),
   people:payments.filter(p=>p.period_id===period.id).map(p=>({
    id:p.resident_id,name:p.resident_name,amount:p.amount,
    days:daysById[p.resident_id]
   })),
   total:period.total
  },{t});
 }
 function openPeriodDetail(period){
  const detail=node("div","fee-history-details history-detail-body");
  const charges=node("section","history-detail-section");
  charges.append(node("h4",null,t("Charges")));
  for(const item of period.items||[]){
   const row=node("div","fee-history-charge");
   row.append(node("span",null,(item.enabled===false?t("Excluded")+" · ":"")+t(item.name)),
    node("strong",null,money(item.original_amount??item.amount)));
   charges.append(row);
  }
  detail.append(charges);
  const paySection=node("section","history-detail-section");
  paySection.append(node("h4",null,t("Payment status by resident")));
  for(const pay of payments.filter(x=>x.period_id===period.id)){
   const row=node("div","fee-history-payment"),info=node("div"),controls=node("div","fee-history-payment-actions");
   info.append(node("strong",null,pay.resident_name),node("small",null,money(pay.amount)));
   const byBill=node("details","fee-person-breakdown");
   byBill.append(node("summary",null,t("View fee details")));
   for(const item of period.items||[]){
    const amount=(item.allocations||[]).find(a=>a.resident_id===pay.resident_id)?.share||0;
    if(amount){const line=node("div","fee-person-breakdown-row");line.append(node("span",null,t(item.name)),node("strong",null,money(amount)));byBill.append(line)}
   }
   info.append(byBill);
   const statuses={unpaid:"Unpaid",submitted:"Payment reported",confirmed:"Received"};
   controls.append(node("span","payment-badge "+pay.status,t(statuses[pay.status]||"Unpaid")));
   const linked=residents.find(r=>r.id===pay.resident_id&&r.user_id===getContext().user?.id);
   if(owner&&pay.status==="submitted"){
    const button=node("button","mini",t("Confirm receipt"));button.type="button";
    button.addEventListener("click",async()=>{
     button.disabled=true;
     const {data,error}=await db.rpc("confirm_apartment_fee_payment",{p_payment_id:pay.id});
     if(error||data!==true){errorNotice("Could not confirm payment.",error);button.disabled=false;return}
     pay.status="confirmed";renderHistory();openPeriodDetail(period);toast(t("Payment confirmed."));
    });
    controls.append(button);
   }else if(!owner&&linked&&pay.status==="unpaid"){
    const button=node("button","mini",t("I have paid"));button.type="button";
    button.addEventListener("click",async()=>{
     button.disabled=true;
     const {data,error}=await db.rpc("report_apartment_fee_payment",{p_payment_id:pay.id});
     if(error||data!==true){errorNotice("Could not report payment.",error);button.disabled=false;return}
     pay.status="submitted";renderHistory();openPeriodDetail(period);toast(t("Payment reported to your apartment owner."));
    });
    controls.append(button);
   }
   row.append(info,controls);paySection.append(row);
  }
  detail.append(paySection);
  openHistoryDetail((period.name===BILL_NAME?t("Monthly billing"):period.name)+" · "+period.bill_month,detail,t("Close"));
 }
 function renderHistory(){
  onHistoryChanged?.(periods.length);
  const root=el("fee-history");root.replaceChildren();
  if(!periods.length)return;
  for(const period of periods){
   const article=node("article","history-entry fee-history-card");
   const left=node("div","history-entry-info");
   left.append(node("strong",null,(period.name===BILL_NAME?t("Monthly billing"):period.name)+" · "+period.bill_month),
    node("small",null,(period.items?.length||0)+" "+t("fee items")));
   const amount=node("strong","history-entry-amount",money(period.total));
   const actions=node("div","history-entry-actions");
   const detailBtn=node("button","mini",t("Details"));detailBtn.type="button";
   detailBtn.addEventListener("click",()=>openPeriodDetail(period));
   const copyBtn=node("button","mini",t("Copy bill"));copyBtn.type="button";
   copyBtn.addEventListener("click",()=>writeClipboard(savedText(period)));
   actions.append(detailBtn,copyBtn);
   const options=[{label:t("Share bill"),onClick:()=>shareText(savedText(period),period.name)}];
   if(owner){
    options.push({label:t("Copy to editor"),onClick:()=>{
     month=nowMonth();groups=restorePeriod(period,true);cancelBill();dirty=true;store();renderAll();
     el("fee-editor").scrollIntoView({behavior:"smooth",block:"start"});
    }});
    options.push({label:t("Delete"),destructive:true,onClick:async()=>{
     const yes=await confirmAction({title:t("Delete billing period?"),message:t("This deletes the saved period and payment statuses."),confirmText:t("Delete bill"),cancelText:t("Keep bill"),tone:"danger"});
     if(!yes)return;
     const {error}=await db.rpc("delete_apartment_fee_period",{p_period_id:period.id});
     if(error)return errorNotice("Could not delete the bill.",error);
     closeHistoryDetail();
     periods=periods.filter(p=>p.id!==period.id);
     payments=payments.filter(p=>p.period_id!==period.id);
     renderHistory();
    }});
   }
   actions.append(historyMenu(options,t("More options")));
   article.append(left,amount,actions);
   root.append(article);
  }
 }
 async function copyPrevious(){
  const prior=periods.filter(p=>p.bill_month<month).sort((a,b)=>b.bill_month.localeCompare(a.bill_month))[0];
  if(!prior)return toast(t("No previous billing period to copy."));
  if(dirty&&groups.length){
   const yes=await confirmAction({title:t("Replace current draft?"),message:t("This replaces the current draft with the previous bill structure. Amounts will be cleared."),confirmText:t("Copy structure"),cancelText:t("Cancel")});
   if(!yes)return;
  }
  groups=restorePeriod(prior,true);cancelBill();dirty=true;store();renderAll();
  toast(t("Copied. Enter this month's amounts."));
 }
 async function savePeriod(){
  if(!owner||pending||!active())return;
  const result=calculation();
  if(!result.valid||countFees()>30)return renderSummary();
  const old=existing();
  if(old){
   const confirmed=await confirmAction({title:t("Replace existing billing period?"),message:t("Replacing this period resets previous payment confirmations."),confirmText:t("Replace bill"),cancelText:t("Keep existing bill"),tone:"danger"});
   if(!confirmed)return;
  }
  pending=true;renderSummary();
  const daysByResident=Object.fromEntries(residents.map(r=>[r.id,residentDays(r)]));
  const payload=serializeSelection(groups,result.lines,daysByResident);
  try{
   const {error}=await db.rpc("save_apartment_fee_period",{
    p_apartment_id:apt,p_month:month,p_name:BILL_NAME,p_items:payload
   });
   if(error)throw error;
   forgetDraft();dirty=false;reloadSaved=true;cancelBill();
   toast(t("Monthly settlement saved."));
   if(onSaved)await onSaved(apt);
   else await load(apt,owner,residents);
  }catch(err){reloadSaved=false;errorNotice("Unable to save billing period.",err)}
  finally{pending=false;renderSummary()}
 }
 function openTypeDialog(typeId=null){
  if(!owner)return;
  const source=templates.find(x=>"custom:"+x.id===typeId);
  typeBeingEdited=source?.id||null;
  newType={name:source?.name||"",fees:source?(source.definition||[]).map(x=>({name:x.name,method:x.method||"days"})):[{name:"",method:"days"}]};
  el("ub-dialog-heading").textContent=t(source?"Edit custom bill type":"Create custom bill type");
  el("ub-new-name").value=newType.name;
  const selectedMethod=newType.fees[0]?.method||"days";
  newType.fees.forEach(f=>f.method=selectedMethod);
  el("ub-new-method").value=selectedMethod;
  el("ub-type-error").textContent="";
  renderNewTypeLines();
  el("ub-type-dialog").showModal();
 }
 function renderNewTypeLines(){
  const list=el("ub-type-items");list.replaceChildren();
  newType.fees.forEach((fee,i)=>{
   const row=node("div","ub-type-line"),field=node("input","control"),remove=node("button","mini red",t("Remove"));
   field.placeholder=t("Fee item name");field.maxLength=100;field.value=fee.name;
   field.addEventListener("input",()=>{fee.name=field.value});
   remove.type="button";remove.disabled=newType.fees.length===1;
   remove.addEventListener("click",()=>{newType.fees.splice(i,1);renderNewTypeLines()});
   row.append(field,remove);list.append(row);
  });
 }
 async function saveType(){
  if(!owner||pending)return;
  const name=el("ub-new-name").value.trim(),fees=newType.fees.map(x=>({name:x.name.trim(),method:x.method}));
  const error=el("ub-type-error");
  if(name.length<2||name.length>80)return error.textContent=t("Enter a valid bill type name.");
  if(!fees.length||fees.length>12||fees.some(x=>!x.name||x.name.length>100))return error.textContent=t("Enter each fee item name.");
  if(catalog().some(x=>x.name.toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi")&&x.id!=="custom:"+typeBeingEdited))return error.textContent=t("This bill type already exists.");
  if(fees.some((x,i)=>fees.findIndex(z=>z.name.toLocaleLowerCase("vi")===x.name.toLocaleLowerCase("vi"))!==i))return error.textContent=t("Fee item names must be unique.");
  const data={apartment_id:apt,name,definition:fees.map(x=>({...x,amount:0,bill_type_custom:true})),created_by:getContext().user.id};
  pending=true;el("ub-type-save").disabled=true;
  try{
   const request=typeBeingEdited?
    db.from("apartment_fee_templates").update({name,definition:data.definition,updated_at:new Date().toISOString()}).eq("id",typeBeingEdited).eq("apartment_id",apt).select("id,name,definition").single():
    db.from("apartment_fee_templates").insert(data).select("id,name,definition").single();
   const {data:saved,error:e}=await request;
   if(e)throw e;
   const idx=templates.findIndex(x=>x.id===saved.id);
   if(idx>=0)templates[idx]={...templates[idx],...saved};
   else templates.push(saved);
   selectedType="custom:"+saved.id;
   el("ub-type-dialog").close();renderCatalog();
   if(!typeBeingEdited)openSelectedType();
   toast(t("Custom bill type saved."));
  }catch(e){errorNotice("Could not save bill type.",e);error.textContent=t("Could not save bill type.")}
  finally{pending=false;el("ub-type-save").disabled=false}
 }
 async function deleteType(){
  if(!owner||!selectedType.startsWith("custom:"))return;
  const type=templates.find(x=>"custom:"+x.id===selectedType);
  if(!type)return;
  const yes=await confirmAction({title:t("Delete custom bill type?"),message:t("Previously saved bills are preserved. The type will no longer be available for new bills."),confirmText:t("Delete"),cancelText:t("Cancel"),tone:"danger"});
  if(!yes)return;
  const {error}=await db.from("apartment_fee_templates").delete().eq("id",type.id).eq("apartment_id",apt);
  if(error)return errorNotice("Could not delete bill type.",error);
  templates=templates.filter(x=>x.id!==type.id);selectedType="electric";renderCatalog();toast(t("Custom bill type deleted."));
 }
 async function load(apartment,ownerFlag,roster){
  if(!apartment)return clear();
  const changed=apt!==apartment;
  apt=apartment;owner=ownerFlag;residents=roster||[];
  if(changed){cancelBill();closeHistoryDetail();month=nowMonth();groups=[];editing=null;dirty=false;shown.clear();loaded=false}
  setVisible("fee-workspace",owner);
  setVisible("fee-editor",owner);
  setVisible("fee-mode-controls",false);
  const [p,tpl]=await Promise.all([
   db.from("apartment_fee_periods").select("id,apartment_id,bill_month,name,items,total,created_at").eq("apartment_id",apt).order("created_at",{ascending:false}).limit(100),
   owner?db.from("apartment_fee_templates").select("id,name,definition,created_at").eq("apartment_id",apt).order("name"):Promise.resolve({data:[]})
  ]);
  if(!active())return;
  if(p.error||tpl.error){errorNotice("Unable to load monthly bills.",p.error||tpl.error);return}
  periods=p.data||[];templates=tpl.data||[];
  let fresh=[];
  if(periods.length){
   const {data,error}=await db.from("apartment_fee_payments").select("id,period_id,resident_id,resident_name,amount,status").in("period_id",periods.map(x=>x.id));
   if(error){errorNotice("Unable to load payment statuses.",error);return}
   fresh=data||[];
  }
  if(!active())return;
  payments=fresh;loaded=true;
  if(changed||reloadSaved){reloadSaved=false;restoreMonth()}
  else renderAll();
 }
 function clear(){
  apt=null;owner=false;residents=[];periods=[];templates=[];payments=[];groups=[];dirty=false;cancelBill();closeHistoryDetail();loaded=false;reloadSaved=false;
  setVisible("fee-workspace",false);
 }
 function retranslate(){
  if(!el("ub-heading"))return;
  const keys=[
   ["ub-heading","Billing period"],["ub-caption","Select a month to calculate the full billing period."],
   ["ub-month-text","Billing month"],["ub-type-label","Bill type"],["ub-add-label","Add bill"],["ub-modal-heading","Add bill"],
   ["ub-new-type","+ Create custom bill type"],["ub-edit-type","Edit custom type"],["ub-delete-type","Delete custom type"],
   ["ub-cancel","Cancel"],["ub-form-total-label","Bill subtotal"],
   ["ub-summary-title","Bills in this period"],["ub-empty","No bills yet. Choose a bill type above to begin."],
   ["ub-selected-label","Total amount"],
   ["ub-people-heading","Per-resident breakdown"],["ub-copy-last-label","Use last month's template"],
   ["ub-share-label","Share breakdown"],["ub-save-label","Save monthly settlement"],["ub-copy-result-label","Copy bill as message"],
   ["ub-info","Replacing a saved billing period resets its payment statuses."],
   ["ub-name-label","Bill type name"],["ub-subfee-label","Included fee items"],["ub-method-label","Default sharing rule"],
   ["ub-add-subfee","+ Add subfee"],["ub-type-cancel","Close"],["ub-type-save","Save bill type"]
  ];
  for(const [id,key] of keys){const e=el(id);if(e)e.textContent=t(key)}
  el("ub-modal-close").setAttribute("aria-label",t("Close"));
  for(const [id,key] of [["ub-save","Save monthly settlement"],["ub-copy-result","Copy bill as message"],["ub-share","Share breakdown"]]){
   const e=el(id);if(e){e.setAttribute("aria-label",t(key));e.setAttribute("title",t(key))}
  }
  el("fee-title").textContent=t("Calculate monthly bills");
  const desc=el("fee-title").nextElementSibling;if(desc)desc.textContent=t("Choose days, add bills, and save your monthly settlement.");
  const head=el("fee-history")?.closest(".fee-history-wrap")?.querySelector("h4");
  if(head)head.textContent=t("Monthly settlements");
  const hdesc=el("fee-history")?.closest(".fee-history-wrap")?.querySelector(".fee-history-head p");
  if(hdesc)hdesc.textContent=t("Saved periods and payment progress.");
  const options=el("ub-new-method").options;
  [...options].forEach(o=>o.textContent=t(METHODS_LABEL[o.value]||o.value));
  if(loaded){renderAll();if(workingGroup){el("ub-modal-heading").textContent=t(groups.some(g=>g.id===workingGroup.id)?"Edit bill":"Add bill");el("ub-done").textContent=t(groups.some(g=>g.id===workingGroup.id)?"Save changes":"Add bill");el("ub-modal-type").textContent=displayGroupName(workingGroup);renderForm()}}
 }
 install();
 setVisible("fee-workspace",false);
 return {load,clear,retranslate,getMonth:()=>month,refresh:()=>{renderForm();renderSummary()}};
}