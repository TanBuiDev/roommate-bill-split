import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { confirmAction } from "./ui-modal.mjs";
import { initI18n, t, setLanguage, onLanguageChange, getLocale } from "./i18n/index.mjs";
initI18n();
const SITE="https://oghep.pages.dev";
const SUPA_URL="https://loovjgylbookhouxjkaf.supabase.co";
const SUPA_KEY="sb_publishable_i-HRVZm2rY7SUl1w-iJAdA_KAPi2H8h";
const fromLink=new URL(location.href).searchParams.get("invite");
if(fromLink&&/^[a-f0-9]{64}$/.test(fromLink)){
 sessionStorage.setItem("oghep-invite",fromLink);
 const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete("invite");history.replaceState(null,"",cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);
}
const db=createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const show=(id,on)=>{const x=$(id);if(x)x.classList.toggle("hidden",!on)};
const label=(id,value)=>{const x=$(id);if(x)x.textContent=value};
const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=value;return x};
const fmt=x=>Number(x||0).toLocaleString("vi-VN");
const money=x=>fmt(x)+" ₫";
const types={electric:"Electricity",water:"Water",internet:"Internet",other:"Other"};
const typeName=(code)=>t(types[code]||"Bill");
const nowMonth=()=>{const n=new Date();return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")};
const state={user:null,apts:[],apt:null,owner:false,residents:[],members:[],invitations:[],bills:[],alloc:{},
 shown:new Set(),loadSeq:0,aptSeq:0,pendingLoad:null,dirty:new Map(),writeTimer:0,writeChain:Promise.resolve(),pendingWrites:0,
 draft:{type:"electric",month:nowMonth(),amount:"",start:"",end:""},inviteLink:"",
 loginBusy:false,loginUntil:Number(localStorage.getItem("oghep-login-backoff-v1")||0),authStatus:"",billSaving:false};
let toastTimer=0;
function toast(message){
 const element=$("#toast");element.textContent=t(message);element.classList.add("show");
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove("show"),3800);
}
function errorNotice(message,error){if(error)console.error(message,error);toast(message)}
function authMessage(message){state.authStatus=message;label("#authmsg",t(message))}
const isOwner=()=>state.owner;
const currentAptKey=()=>("oghep-active:"+state.user.id);
function billingPeriod(){
 const [year,month]=state.draft.month.split("-").map(Number);
 const defaultDays=year>=1900&&year<=2100&&month>=1&&month<=12?new Date(year,month,0).getDate():30;
 const start=state.draft.start,end=state.draft.end;
 if(!start&&!end)return {valid:true,days:defaultDays,start:null,end:null};
 if(!start||!end)return {valid:false,days:defaultDays,error:"Provide both start and end dates."};
 const a=Date.parse(start+"T00:00:00Z"),b=Date.parse(end+"T00:00:00Z");
 const days=Math.round((b-a)/86400000)+1;
 if(!Number.isFinite(days)||days<1||days>366)return {valid:false,days:defaultDays,error:"Choose a date range of 1–366 days."};
 return {valid:true,days,start,end};
}
function occupiedDays(p){
 const cap=billingPeriod().days;
 if(p.mode==="custom")return Math.min(cap,Math.max(0,Math.trunc(Number(p.custom_days)||0)));
 const w=Number((p.mode||"w4").slice(1));
 return Math.min(cap,[1,2,3,4].includes(w)?w*7:28);
}
function split(){
 const amount=Number(state.draft.amount);
 if(!Number.isSafeInteger(amount)||amount<=0||!state.residents.length)return null;
 const arr=state.residents.map((p,i)=>({id:p.id,name:p.name,mode:p.mode,custom_days:p.custom_days,days:occupiedDays(p),index:i}));
 const sum=arr.reduce((v,p)=>v+p.days,0);
 if(!sum)return null;
 let allocated=0n;
 const out=arr.map(p=>{
  const n=BigInt(amount)*BigInt(p.days);
  const quotient=n/BigInt(sum);
  allocated+=quotient;
  return {...p,share:Number(quotient),rem:n%BigInt(sum)};
 });
 const remain=Number(BigInt(amount)-allocated);
 const ranking=[...out].sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1);
 for(let i=0;i<remain;i++)ranking[i].share++;
 return out;
}
function validateBill(){
 if(!state.owner)return "Only apartment owners can save bills.";
 if(!Number.isSafeInteger(Number(state.draft.amount))||Number(state.draft.amount)<=0)return "Enter a valid bill amount.";
 const period=billingPeriod();if(!period.valid)return period.error;
 if(!state.residents.length)return "Add at least one resident.";
 if(!split())return "At least one resident must have more than zero days.";
 return "";
}
function renderMoney(){
 const n=$("#bill-amount"),at=n.selectionStart||0;
 const before=n.value.slice(0,at).replace(/\D/g,"").length;
 let raw=n.value.replace(/\D/g,"").replace(/^0+(?=\d)/,"");
 if(raw && BigInt(raw)>BigInt(Number.MAX_SAFE_INTEGER))raw=String(Number.MAX_SAFE_INTEGER);
 state.draft.amount=raw;n.value=raw?fmt(raw):"";
 let pos=0,count=0;
 while(pos<n.value.length&&count<before){if(/\d/.test(n.value[pos]))count++;pos++}
 n.setSelectionRange(pos,pos);
 renderResult();
}
function renderResult(){
 const p=billingPeriod();
 label("#period-days-note",p.valid?t("{count} calendar/billing days",{count:p.days}):t("Check the date range"));
 label("#period-label",state.draft.month.slice(5)+"/"+state.draft.month.slice(0,4)+" · "+t("{count} days",{count:p.days}));
 label("#total",money(state.draft.amount));
 label("#people-label",t("{count} residents",{count:state.residents.length}));
 const r=split()||[], map=new Map(r.map(x=>[x.id,x]));
 label("#allocated",money(r.reduce((a,b)=>a+b.share,0)));
 for(const resident of state.residents){
  const share=$("#members").querySelector('[data-share-id="'+resident.id+'"]');
  const days=$("#members").querySelector('[data-days-id="'+resident.id+'"]');
  if(share)share.textContent=money(map.get(resident.id)?.share||0);
  if(days)days.textContent=t("{count} days",{count:occupiedDays(resident)});
 }
 label("#validation",t(validateBill()));
 $("#save").disabled=state.billSaving||!!validateBill();
 $("#copy").disabled=!r.length||!!validateBill();
 $("#share").disabled=!r.length||!!validateBill();
}
function setDraft(){
 $("#bill-type").value=state.draft.type;
 $("#bill-month").value=state.draft.month;
 $("#bill-amount").value=state.draft.amount?fmt(state.draft.amount):"";
 $("#period-start").value=state.draft.start||"";
 $("#period-end").value=state.draft.end||"";
 $("#advanced-period").open=!!(state.draft.start||state.draft.end);
 renderResult();
}
function blankDraft(){state.draft={type:"electric",month:nowMonth(),amount:"",start:"",end:""};setDraft()}
function savePendingResidents(){
 if(!state.owner||!state.apt||!state.dirty.size)return;
 const items=[...state.dirty.values()],apartmentId=state.apt.id;
 state.dirty.clear();state.pendingWrites++;
 state.writeChain=state.writeChain.then(async()=>{
  for(const p of items){
   const {error}=await db.from("apartment_residents").update({
    name:p.name.trim()||"Resident",mode:p.mode,custom_days:p.custom_days,sort_order:p.sort_order
   }).eq("id",p.id).eq("apartment_id",apartmentId);
   if(error)throw error;
  }
 }).catch(err=>errorNotice("Resident changes were not saved. Please reload.",err))
 .finally(()=>{state.pendingWrites=Math.max(0,state.pendingWrites-1)});
}
function changedResident(p){
 if(!state.owner)return;
 state.dirty.set(p.id,{...p});
 clearTimeout(state.writeTimer);state.writeTimer=setTimeout(savePendingResidents,650);
}
function renderResidentTable(){
 const body=$("#members");body.replaceChildren();
 label("#member-count",t("{count} residents",{count:state.residents.length}));
 for(const [index,p] of state.residents.entries()){
  const row=el("tr"),cell=el("td");
  const name=el("input","member-name");name.value=p.name;name.maxLength=70;name.disabled=!state.owner;
  name.setAttribute("aria-label",t("Resident")+" "+(index+1));
  name.addEventListener("input",()=>{p.name=name.value;changedResident(p);renderHouseholdList()});
  name.addEventListener("blur",()=>{if(!p.name.trim()){p.name=t("Resident")+" "+(index+1);name.value=p.name;changedResident(p)}});
  cell.append(name);row.append(cell);
  for(let week=1;week<=4;week++){
   const td=el("td"),code="w"+week,btn=el("button","week-choice"+(p.mode===code?" active":""),t("{count} wk",{count:week}));
   btn.type="button";btn.disabled=!state.owner;btn.setAttribute("aria-pressed",String(p.mode===code));
   btn.setAttribute("aria-label",p.name+": "+t("{count} weeks",{count:week}));
   btn.addEventListener("click",()=>{p.mode=code;changedResident(p);renderResidentTable()});
   td.append(btn);row.append(td);
  }
  const td=el("td"),input=el("input","day-choice"+(p.mode==="custom"?" active":""));
  input.type="number";input.min="0";input.max=String(billingPeriod().days);input.inputMode="numeric";
  input.placeholder=t("Days");input.disabled=!state.owner;
  input.value=p.mode==="custom"?String(p.custom_days):"";
  input.setAttribute("aria-label",p.name+": "+t("Custom days"));
  input.addEventListener("focus",()=>{
   if(p.mode!=="custom"){
    p.custom_days=occupiedDays(p);p.mode="custom";input.value=String(p.custom_days);
    input.classList.add("active");
    row.querySelectorAll(".week-choice").forEach(b=>{b.classList.remove("active");b.setAttribute("aria-pressed","false")});
    changedResident(p);renderResult();
   }
  });
  input.addEventListener("input",()=>{p.mode="custom";p.custom_days=Math.max(0,Math.min(billingPeriod().days,Math.trunc(Number(input.value))||0));changedResident(p);renderResult()});
  input.addEventListener("change",()=>{input.value=String(p.custom_days)});
  td.append(input);row.append(td);
  const shareTd=el("td"),val=el("strong","person-share","0 ₫"),hint=el("small","person-days",t("0 days"));
  val.dataset.shareId=p.id;hint.dataset.daysId=p.id;hint.textContent=t("0 days");shareTd.append(val,hint);row.append(shareTd);
  const delTd=el("td");
  if(state.owner){
   const del=el("button","delete-person","×");del.type="button";del.setAttribute("aria-label",t("Remove {name}",{name:p.name}));
   del.addEventListener("click",()=>removeResident(p));delTd.append(del);
  }
  row.append(delTd);body.append(row);
 }
 if(!state.residents.length){
  const row=el("tr"),td=el("td","muted",t("No residents yet. Add one above."));td.colSpan=8;row.append(td);body.append(row);
 }
 renderHouseholdList();renderResult();
}
async function removeResident(p){
 if(!state.owner)return;
 const confirmed=await confirmAction({
  title:"Remove resident?",
  message:t("Remove {name} from this apartment? Saved bill snapshots will remain intact.",{name:p.name}),
  confirmText:"Remove resident",
  cancelText:"Keep resident",
  tone:"danger"
 });
 if(!confirmed)return;
 if(p.user_id && state.members.some(m=>m.user_id===p.user_id)){
  toast("Remove access before deleting this resident.");
  return;
 }
 // Revoke pending invitations before removing a resident, preventing orphan invite links.
 for(const invitation of state.invitations.filter(x=>x.resident_id===p.id && x.status==="pending")){
  const result=await db.rpc("revoke_apartment_invitation",{p_invite_id:invitation.id});
  if(result.error){errorNotice("Could not revoke this resident's invitation.",result.error);return}
  invitation.status="revoked";
 }
 clearTimeout(state.writeTimer);state.dirty.delete(p.id);
 const {error}=await db.from("apartment_residents").delete().eq("id",p.id).eq("apartment_id",state.apt.id);
 if(error)return errorNotice("Could not remove resident.",error);
 state.residents=state.residents.filter(x=>x.id!==p.id);renderResidentTable();toast("Resident removed.");
}

/* A single resident workflow: add-only, add-and-invite, or invite an existing name. */
let memberDialogMode="add";
let memberDialogResident=null;
let memberDialogApt=null;
let memberDialogBusy=false;
let memberDialogOrigin=null;

function latestPendingInvite(residentId){
 return state.invitations.find(inv=>
  inv.resident_id===residentId&&inv.status==="pending"&&new Date(inv.expires_at)>new Date()
 )||null;
}
function memberStatus(resident){
 if(resident.user_id)return "joined";
 return latestPendingInvite(resident.id)?"invited":"none";
}
function updateMemberDialogLabels(){
 const selfMode=memberDialogMode==="self";
 const title=selfMode?"Add yourself to the bill":memberDialogMode==="add"?"Add a resident":memberDialogMode==="resend"?"Resend invitation":"Invite resident";
 label("#member-dialog-title",t(title));
 label("#member-dialog-description",t(selfMode
  ?"You're already the apartment owner. Enter the name you want shown on bills; no invitation is needed."
  :memberDialogMode==="add"
  ?"Add someone to your apartment. Email is optional unless you want to invite them."
  :"Send a private invitation link to join your apartment."));
 const submit=$("#member-add-invite"),addOnly=$("#member-add-only");
 submit.textContent=t(selfMode?"Include me in bills":memberDialogMode==="add"?"Add & invite":memberDialogMode==="resend"?"Resend invitation":"Send invitation");
 addOnly.hidden=memberDialogMode!=="add";
 $("#member-name-input").readOnly=memberDialogMode!=="add"&&!selfMode;
 const emailField=$("#member-email-input").closest(".field");
 if(emailField)emailField.classList.toggle("hidden",selfMode);
 $("#member-email-input").readOnly=memberDialogMode==="resend";
 updateMemberFormButtons();
}
function memberFormError(message){
 const node=$("#member-form-error");
 node.textContent=message?t(message):"";
 show("#member-form-error",!!message);
}
function validMemberEmail(email){
 const input=$("#member-email-input");
 return !!email&&email.length<=254&&input.checkValidity()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function updateMemberFormButtons(){
 const name=$("#member-name-input").value.trim();
 const email=$("#member-email-input").value.trim();
 const nameOk=name.length>=1&&name.length<=70;
 $("#member-add-only").disabled=memberDialogBusy||memberDialogMode!=="add"||!nameOk;
 $("#member-add-invite").disabled=memberDialogBusy||!nameOk||(memberDialogMode!=="self"&&!validMemberEmail(email));
 $("#member-dialog-close").disabled=memberDialogBusy;
 $("#member-dialog-cancel").disabled=memberDialogBusy;
}
function openMemberDialog(mode="add",resident=null,invitation=null){
 if(!state.owner||!state.apt)return;
 memberDialogMode=mode;memberDialogResident=resident;memberDialogApt=state.apt.id;
 memberDialogBusy=false;memberDialogOrigin=document.activeElement;
 const dlg=$("#member-form-dialog");
 $("#member-dialog-form").reset();
 $("#member-name-input").value=mode==="self"
  ?(state.user?.user_metadata?.full_name||state.user?.user_metadata?.name||state.user?.email?.split("@")[0]||"").trim().slice(0,70)
  :resident?.name||"";
 $("#member-email-input").value=invitation?.invited_email||"";
 memberFormError("");
 updateMemberDialogLabels();
 if(!dlg.open)dlg.showModal();
 (mode==="add"||mode==="self"?$("#member-name-input"):$("#member-email-input")).focus();
}
function closeMemberDialog(){
 if(memberDialogBusy)return;
 const dlg=$("#member-form-dialog");
 if(dlg.open)dlg.close();
}
function ensureMemberContext(){
 return !!state.owner&&!!state.apt&&state.apt.id===memberDialogApt;
}
function checkMemberForm(needEmail){
 if(!ensureMemberContext())return t("The apartment changed. Please reopen the member form.");
 const name=$("#member-name-input").value.trim();
 const email=$("#member-email-input").value.trim().toLowerCase();
 if(!name||name.length>70)return t("Enter a resident name.");
 if(memberDialogMode==="add"&&state.residents.some(p=>p.name.trim().toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi")))
  return t("This resident name already exists.");
 if(memberDialogMode==="self"&&state.residents.some(p=>p.name.trim().toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi")&&p.user_id))
  return t("This name belongs to a linked resident.");
 if(state.residents.length>=70&&memberDialogMode==="add")return t("Maximum 70 residents per apartment.");
 if(needEmail&&memberDialogMode!=="self"&&!validMemberEmail(email))return t("Enter a valid email address.");
 return "";
}
async function createResident(name){
 const {data,error}=await db.from("apartment_residents").insert({
  apartment_id:state.apt.id,name,mode:"custom",custom_days:4,sort_order:state.residents.length
 }).select("id,apartment_id,user_id,name,mode,custom_days,sort_order").single();
 if(error)throw error;
 state.residents.push(data);
 renderResidentTable();
 return data;
}
async function sendInviteForResident(resident,email){
 const {data,error}=await db.rpc("create_apartment_invitation",{
  p_apartment_id:state.apt.id,p_email:email,p_resident_id:resident.id
 });
 if(error)throw error;
 state.inviteLink=SITE+"/?invite="+data.token;
 const {error:mailError}=await db.auth.signInWithOtp({
  email,options:{emailRedirectTo:state.inviteLink}
 });
 try {
  await refreshInvites();
 } catch(refreshError) {
  // The invitation is already created. Keep an actionable fallback even if list refresh fails.
  console.error("Could not refresh the invitation list",refreshError);
  state.invitations=[
   {id:data.id,resident_id:resident.id,invited_email:email,status:"pending",
    expires_at:new Date(Date.now()+7*86400000).toISOString(),created_at:new Date().toISOString(),accepted_by:null},
   ...state.invitations.filter(x=>!(x.resident_id===resident.id&&x.status==="pending"))
  ];
  renderHouseholdList();
 }
 if(mailError){
  show("#invite-fallback",true);
  errorNotice("Invitation created but email delivery failed. Copy the private invitation link below.",mailError);
 }else{
  show("#invite-fallback",false);
  toast("Invitation email sent successfully.");
 }
 return !mailError;
}
async function memberFormAction(invite){
 if(memberDialogBusy)return;
 const message=checkMemberForm(invite);
 if(message){memberFormError(message);return}
 const name=$("#member-name-input").value.trim();
 const email=$("#member-email-input").value.trim().toLowerCase();
 memberDialogBusy=true;updateMemberFormButtons();
 try{
  let resident=memberDialogResident;
  if(memberDialogMode==="self"){
   const {error}=await db.rpc("add_owner_to_billing",{
    p_apartment_id:state.apt.id,p_name:name
   });
   if(error)throw error;
   memberDialogBusy=false;
   closeMemberDialog();
   await loadApartment(state.apt.id);
   toast("You're included in the bill.");
   return;
  }
  if(memberDialogMode==="add"){
   resident=await createResident(name);
   memberDialogResident=resident;
  }
  if(invite){
   // When adding succeeded but sending failed, retry only the invitation.
   memberDialogMode="invite";
   updateMemberDialogLabels();
   await sendInviteForResident(resident,email);
  }else toast("Resident added.");
  memberDialogBusy=false;
  closeMemberDialog();
 }catch(err){
  console.error("Member workflow failed",err);
  memberFormError(memberDialogMode==="self"?"Could not include the owner in the bill."
   :memberDialogMode==="add"?"Could not add resident. Check the name and try again."
   :"Could not send invitation. The resident remains in your apartment.");
 }finally{
  memberDialogBusy=false;
  updateMemberFormButtons();
 }
}

/* Batch onboarding: names only. Inserted in a single PostgREST statement, with no invitations. */
let bulkDialogBusy=false;
let bulkDialogApartment=null;
let bulkDialogOrigin=null;
function normalizeResidentName(name){
 return name.trim().normalize("NFC").replace(/\s+/g," ");
}
function compareResidentName(name){
 return normalizeResidentName(name).toLocaleLowerCase("vi");
}
function parseBulkNames(input,existing=state.residents){
 const names=String(input||"").split(/[\n,;]+/).map(normalizeResidentName).filter(Boolean);
 if(!names.length)return {names,error:"Enter at least one name."};
 if(names.some(n=>n.length>70))return {names,error:"Names cannot exceed 70 characters."};
 const seen=new Set(),dup=[];
 for(const name of names){
  const key=compareResidentName(name);
  if(seen.has(key))dup.push(name);
  seen.add(key);
 }
 if(dup.length)return {names,error:t("Duplicate names in your list: {names}",{names:dup.join(", ")})};
 const existingNames=new Set(existing.map(p=>compareResidentName(p.name)));
 const duplicates=names.filter(n=>existingNames.has(compareResidentName(n)));
 if(duplicates.length)return {names,error:t("Already in your apartment: {names}",{names:duplicates.join(", ")})};
 const remaining=Math.max(0,70-existing.length);
 if(names.length>remaining)return {names,error:t("Only {remaining} slots are available (maximum 70 residents).",{remaining})};
 return {names,error:""};
}
function bulkValidation(){
 return parseBulkNames($("#bulk-member-names").value);
}
function showBulkError(message){
 const target=$("#bulk-member-error");
 target.textContent=message?t(message):"";
 show("#bulk-member-error",!!message);
}
function renderBulkPreview(){
 const parsed=bulkValidation();
 label("#bulk-member-preview",parsed.names.length&&!parsed.error?t("{count} names ready to add",{count:parsed.names.length}):"");
 showBulkError(parsed.error);
 $("#bulk-member-submit").disabled=bulkDialogBusy||!!parsed.error;
}
function openBulkModal(){
 if(!state.owner||!state.apt)return;
 bulkDialogApartment=state.apt.id;
 bulkDialogOrigin=document.activeElement;
 $("#bulk-member-names").value="";
 bulkDialogBusy=false;
 renderBulkPreview();
 const dialog=$("#bulk-member-dialog");
 if(!dialog.open)dialog.showModal();
 $("#bulk-member-names").focus();
}
function closeBulkModal(){
 if(bulkDialogBusy)return;
 if($("#bulk-member-dialog").open)$("#bulk-member-dialog").close();
}
async function submitBulkMembers(event){
 event.preventDefault();
 if(bulkDialogBusy||!state.owner||state.apt?.id!==bulkDialogApartment)return;
 const result=bulkValidation();
 if(result.error){renderBulkPreview();return}
 bulkDialogBusy=true;renderBulkPreview();
 try{
  const maxOrder=state.residents.reduce((n,r)=>Math.max(n,Number(r.sort_order)||0),-1);
  const payload=result.names.map((name,i)=>({
   apartment_id:bulkDialogApartment,name,mode:"custom",custom_days:4,sort_order:maxOrder+i+1
  }));
  const {data,error}=await db.from("apartment_residents").insert(payload)
   .select("id,apartment_id,user_id,name,sort_order,mode,custom_days");
  if(error)throw error;
  if(state.apt?.id===bulkDialogApartment){
   state.residents.push(...(data||[]));
   state.residents.sort((a,b)=>a.sort_order-b.sort_order);
   renderResidentTable();
  }
  bulkDialogBusy=false;
  closeBulkModal();
  toast(t("Added {count} residents.",{count:result.names.length}));
 }catch(err){
  console.error("Batch resident insertion failed",err);
  showBulkError("Couldn't add residents. No names were added.");
 }finally{
  bulkDialogBusy=false;
  renderBulkPreview();
 }
}

function avatarInitials(name){
 const tokens=(name||"").trim().split(/\s+/).filter(Boolean);
 return (tokens.length>=2?tokens[0][0]+tokens[tokens.length-1][0]:(tokens[0]||"?").slice(0,2)).toLocaleUpperCase("vi");
}
function renderHouseholdList(){
 const root=$("#household-list");
 root.replaceChildren();
 if(!state.owner)return;
 const linkedOwner=state.residents.find(p=>p.user_id===state.user?.id);
 const joined=state.residents.filter(x=>memberStatus(x)==="joined").length;
 const invited=state.residents.filter(x=>memberStatus(x)==="invited").length;
 label("#household-stats",t("{count} residents",{count:state.residents.length})+" · "+
  t("{count} joined",{count:joined})+" · "+t("{count} invited",{count:invited}));
 // Owners are account members immediately after creation, without any invite.
 const ownerName=linkedOwner?.name||state.user?.user_metadata?.full_name||state.user?.email?.split("@")[0]||t("Apartment owner");
 const ownerRow=el("div","household-row household-row--owner");
 const ownerAvatar=el("span","household-avatar",avatarInitials(ownerName));
 ownerAvatar.setAttribute("aria-hidden","true");
 const ownerInfo=el("div","household-person");
 ownerInfo.append(el("strong",null,ownerName));
 ownerInfo.append(el("small",null,state.user?.email||t("Owner account")));
 const ownerBadge=el("span","household-status household-status--joined",t("Owner"));
 const ownerActions=el("div","household-row-actions");
 if(!linkedOwner){
  const addSelf=el("button","mini household-row-action",t("Include me in bills"));
  addSelf.type="button";
  addSelf.addEventListener("click",()=>openMemberDialog("self"));
  ownerActions.append(addSelf);
 }else{
  const removeMe=el("button","mini",t("Exclude me from bills"));
  removeMe.type="button";
  removeMe.addEventListener("click",removeOwnerBilling);
  ownerActions.append(removeMe);
 }
 ownerRow.append(ownerAvatar,ownerInfo,ownerBadge,ownerActions);
 root.append(ownerRow);
 if(!state.residents.length){
  const empty=el("div","household-empty");
  empty.append(el("strong",null,t("No residents yet.")));
  empty.append(el("p",null,t("Add your first resident to start splitting bills.")));
  root.append(empty);return;
 }
 state.residents.filter(p=>p.user_id!==state.user?.id).forEach(resident=>{
  const status=memberStatus(resident),pending=latestPendingInvite(resident.id);
  const row=el("div","household-row");
  const avatar=el("span","household-avatar",avatarInitials(resident.name));
  avatar.setAttribute("aria-hidden","true");
  const details=el("div","household-person");
  details.append(el("strong",null,resident.name));
  const known=state.invitations.find(inv=>inv.accepted_by===resident.user_id);
  details.append(el("small",null,status==="invited"?pending.invited_email:
    status==="joined"?(known?.invited_email||t("Account linked")):t("No email linked")));
  const statusText=status==="joined"?"Joined":status==="invited"?"Invited":"Not invited";
  const badge=el("span","household-status household-status--"+status,t(statusText));
  const actions=el("div","household-row-actions");
  if(status==="joined"){
   const member=state.members.find(m=>m.user_id===resident.user_id);
   if(member&&member.role!=="owner"){
    const remove=el("button","mini",t("Remove access"));
    remove.type="button";
    remove.addEventListener("click",()=>removeMemberAccess(member.user_id));
    actions.append(remove);
   }
  }else{
   const invite=el("button","mini household-row-action",t(status==="invited"?"Resend":"Invite"));
   invite.type="button";
   invite.addEventListener("click",()=>openMemberDialog(status==="invited"?"resend":"invite",resident,pending));
   actions.append(invite);
   if(status==="invited"){
    const revoke=el("button","mini",t("Revoke"));
    revoke.type="button";
    revoke.addEventListener("click",()=>revokeInvite(pending));
    actions.append(revoke);
   }
  }
  row.append(avatar,details,badge,actions);
  root.append(row);
 });
}
async function removeOwnerBilling(){
 if(!state.owner||!state.apt)return;
 const accepted=await confirmAction({
  title:"Stop including yourself in bills?",
  message:"Your apartment owner access will remain active. Saved bills keep their previous amounts.",
  confirmText:"Exclude me",
  cancelText:"Keep me included"
 });
 if(!accepted)return;
 const {error}=await db.rpc("remove_owner_from_billing",{p_apartment_id:state.apt.id});
 if(error){errorNotice("Could not update your billing participation.",error);return}
 await loadApartment(state.apt.id);
 toast("You're no longer included in new bills.");
}

async function removeMemberAccess(userId){
 const confirmed=await confirmAction({
  title:"Remove member access?",
  message:"This person will lose access to the apartment and its bills. Saved bill snapshots are not affected.",
  confirmText:"Remove access",cancelText:"Keep member",tone:"danger"
 });
 if(!confirmed)return;
 const {error}=await db.rpc("remove_apartment_member",{
  p_apartment_id:state.apt.id,p_user_id:userId
 });
 if(error)return errorNotice("Could not remove member.",error);
 await loadApartment(state.apt.id);
 toast("Member access removed.");
}
async function revokeInvite(invitation){
 if(!invitation)return;
 const confirmed=await confirmAction({
  title:"Revoke invitation?",
  message:"This invitation link will stop working. You can send a new invitation later.",
  confirmText:"Revoke invitation",cancelText:"Keep invitation",tone:"danger"
 });
 if(!confirmed)return;
 const {error}=await db.rpc("revoke_apartment_invitation",{p_invite_id:invitation.id});
 if(error)return errorNotice("Could not revoke invitation.",error);
 state.invitations=state.invitations.filter(x=>x.id!==invitation.id);
 renderHouseholdList();
 toast("Invitation revoked.");
}
async function refreshInvites(){
 if(!state.owner)return;
 const {data,error}=await db.from("apartment_invitations")
  .select("id,resident_id,invited_email,status,expires_at,accepted_by,created_at")
  .eq("apartment_id",state.apt.id).order("created_at",{ascending:false}).limit(50);
 if(error)throw error;
 state.invitations=data||[];
 renderHouseholdList();
}
function renderAptOptions(){
 const select=$("#apartment-select");select.replaceChildren();
 for(const a of state.apts){const option=el("option",null,a.name+" · "+a.code);option.value=a.id;select.append(option)}
 if(state.apt)select.value=state.apt.id;
}
function renderGate(){
 const root=$("#apartment-list");root.replaceChildren();
 if(state.apts.length)root.append(el("p","muted",t("Your apartments")));
 for(const a of state.apts){
  const btn=el("button","apartment-choice",a.name+" · "+a.code);
  btn.type="button";btn.addEventListener("click",()=>loadApartment(a.id));
  root.append(btn);
 }
 if(!state.apts.length)root.append(el("p","muted",t("No apartment yet. Create one to get started.")));
 const token=sessionStorage.getItem("oghep-invite");
 show("#invitation-banner",!!token);
 label("#invitation-message",t("Accept this invitation after signing in with the invited email address."));
}
function showGate(){
 stopApartmentWatch();
 state.apt=null;state.owner=false;
 show("#apartment-gate",true);show("#apartment-app",false);renderGate();
}
async function createApartment(e){
 e.preventDefault();
 const button=$("#create-apartment-button"),name=$("#new-apartment-name").value.trim();
 if(name.length<2)return toast("Enter an apartment name.");
 button.disabled=true;
 try{
  const {data,error}=await db.rpc("create_apartment",{p_name:name,p_import_legacy:false});
  if(error)throw error;
  $("#new-apartment-name").value="";
  await loadUser(state.user,true,data.id);
  toast("Apartment created. Share the code as a reference, then invite members.");
 }catch(err){errorNotice("Could not create apartment.",err)}
 finally{button.disabled=false}
}
async function acceptInvite(){
 const token=sessionStorage.getItem("oghep-invite");
 if(!token)return toast("No pending invitation.");
 const button=$("#accept-invite");button.disabled=true;
 try{
  const {data,error}=await db.rpc("accept_apartment_invitation",{p_token:token});
  if(error)throw error;
  sessionStorage.removeItem("oghep-invite");
  await loadUser(state.user,true,data.apartment_id);
  toast(t("You joined {name}.",{name:data.name}));
 }catch(err){errorNotice("Could not accept: sign in with the invited email, or ask for a fresh invitation.",err)}
 finally{button.disabled=false}
}
let loadingUser=null;
async function loadUser(user,force=false,preferred=null){
 if(!user)return;
 if(!force&&loadingUser)return loadingUser;
 if(!force&&state.user?.id===user.id&&state.apt)return;
 const seq=++state.loadSeq;
 const work=(async()=>{
  state.user=user;
  show("#loading",false);show("#auth",false);show("#workspace",true);show("#signout",true);
  label("#sync-chip",t("Connected"));$("#sync-chip").classList.add("connected");
  const a=await db.from("apartments").select("id,code,name,owner_id,created_at").order("created_at",{ascending:false});
  if(seq!==state.loadSeq)return;
  if(a.error)return errorNotice("Could not load apartments.",a.error);
  state.apts=a.data||[];
  renderAptOptions();
  if(sessionStorage.getItem("oghep-invite"))return showGate();
  const id=preferred||localStorage.getItem("oghep-active:"+user.id);
  const apt=state.apts.find(x=>x.id===id)||state.apts[0];
  if(apt)await loadApartment(apt.id);else showGate();
 })();
 loadingUser=work;
 try{await work}finally{if(loadingUser===work)loadingUser=null}
}

/* Live database updates; realtime notifications plus a conservative polling fallback.
   Background refreshes preserve draft amount, month and days being edited. */
let watchedApartment=null;
let apartmentChannel=null;
let apartmentPoller=null;
let apartmentRefreshTimer=null;
let apartmentRefreshBusy=false;
let apartmentRefreshAgain=false;
function stopApartmentWatch(){
 if(apartmentRefreshTimer){clearTimeout(apartmentRefreshTimer);apartmentRefreshTimer=null}
 if(apartmentPoller){clearInterval(apartmentPoller);apartmentPoller=null}
 if(apartmentChannel){db.removeChannel(apartmentChannel);apartmentChannel=null}
 watchedApartment=null;
 apartmentRefreshAgain=false;
}
function watchApartment(id){
 if(watchedApartment===id)return;
 stopApartmentWatch();
 watchedApartment=id;
 const onChange=()=>scheduleApartmentRefresh(450);
 let channel=db.channel("oghep-household:"+id);
 for(const table of ["apartment_allocations","apartment_bills","apartment_residents","apartment_members","apartment_invitations"]){
  // RLS restricts changes to data belonging to the signed-in apartment member.
  channel=channel.on("postgres_changes",{event:"*",schema:"public",table},onChange);
 }
 apartmentChannel=channel.subscribe(status=>{
  if(status==="SUBSCRIBED")scheduleApartmentRefresh(400);
 });
 apartmentPoller=setInterval(()=>{
  if(document.visibilityState!=="hidden")scheduleApartmentRefresh(400);
 },20000);
}
function scheduleApartmentRefresh(delay=400){
 if(!state.user||!watchedApartment||state.apt?.id!==watchedApartment)return;
 clearTimeout(apartmentRefreshTimer);
 apartmentRefreshTimer=setTimeout(async()=>{
  apartmentRefreshTimer=null;
  if(!state.user||state.apt?.id!==watchedApartment)return;
  const editingResident=!!document.activeElement?.closest?.("#members");
  if(state.billSaving||state.dirty.size||state.pendingWrites||bulkDialogBusy||memberDialogBusy||editingResident){
   scheduleApartmentRefresh(1000);
   return;
  }
  if(apartmentRefreshBusy){apartmentRefreshAgain=true;return}
  apartmentRefreshBusy=true;
  const id=watchedApartment;
  try{
   await loadApartment(id,{preserveDraft:true,background:true});
  }catch(err){console.warn("Apartment refresh deferred",err)}
  finally{
   apartmentRefreshBusy=false;
   if(apartmentRefreshAgain){
    apartmentRefreshAgain=false;
    scheduleApartmentRefresh(500);
   }
  }
 },delay);
}
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible")scheduleApartmentRefresh(200);
});
window.addEventListener("focus",()=>scheduleApartmentRefresh(400));

async function loadApartment(id,options={}){
 const a=state.apts.find(x=>x.id===id);
 if(!a)return showGate();
 const isNewApartment=state.apt?.id!==id;
 const seq=++state.aptSeq;
 state.apt=a;state.owner=a.owner_id===state.user?.id;
 localStorage.setItem("oghep-active:"+state.user.id,a.id);
 const [r,m,b,i]=await Promise.all([
  db.from("apartment_residents").select("id,apartment_id,user_id,name,sort_order,mode,custom_days").eq("apartment_id",id).order("sort_order"),
  db.from("apartment_members").select("user_id,role").eq("apartment_id",id),
  db.from("apartment_bills").select("id,apartment_id,bill_type,bill_month,amount,billing_days,period_start,period_end").eq("apartment_id",id).order("bill_month",{ascending:false}).limit(100),
  state.owner?db.from("apartment_invitations").select("id,resident_id,invited_email,status,expires_at,accepted_by,created_at").eq("apartment_id",id).order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[]})
 ]);
 if(seq!==state.aptSeq)return;
 const err=r.error||m.error||b.error||i.error;
 if(err){errorNotice("Could not load apartment data.",err);return false}
 state.residents=r.data||[];state.members=m.data||[];state.bills=b.data||[];
 state.invitations=i.data||[];state.alloc={};
 if(state.bills.length){
  const {data,error}=await db.from("apartment_allocations").select("id,bill_id,resident_id,resident_name,days,share,mode,custom_days,status").in("bill_id",state.bills.map(x=>x.id));
  if(error){errorNotice("Could not load bill allocations.",error);return false}
  for(const item of data||[]){(state.alloc[item.bill_id]??=[]).push(item)}
 }
 if(seq!==state.aptSeq)return;
 label("#apartment-name",a.name);label("#apartment-code",a.code);
 label("#apartment-role",t(state.owner?"Owner":"Member"));
 label("#dashboard-title",a.name);
 renderAptOptions();
 show("#apartment-gate",false);show("#apartment-app",true);
 show("#owner-panel",state.owner);
 for(const id of ["#bill-details-panel","#residents-panel","#summary-panel"])show(id,state.owner);
 if(state.owner&&(isNewApartment||options.resetDraft))blankDraft();
 renderResidentTable();renderHistory();
 watchApartment(id);
 return true;
}

function renderHistory(){
 const root=$("#history");root.replaceChildren();
 label("#history-count",t("{count} periods",{count:state.bills.length}));
 if(!state.bills.length){root.append(el("p","muted",t("No saved bills yet.")));return}
 for(const bill of state.bills){
  const allocations=state.alloc[bill.id]||[];
  const panel=el("article","bill"),line=el("div","bill-line"),desc=el("div","bill-desc");
  desc.append(el("strong",null,typeName(bill.bill_type)+" · "+bill.bill_month.slice(5)+"/"+bill.bill_month.slice(0,4)));
  desc.append(el("small",null,t("{count} residents · {days} days",{count:allocations.length,days:bill.billing_days})));
  line.append(desc,el("strong","bill-money",money(bill.amount)));panel.append(line);
  const actions=el("div","bill-actions");
  const toggle=el("button","mini",t(state.shown.has(bill.id)?"Hide details":"Details"));
  toggle.addEventListener("click",()=>{state.shown.has(bill.id)?state.shown.delete(bill.id):state.shown.add(bill.id);renderHistory()});
  actions.append(toggle);
  if(state.owner){
   const edit=el("button","mini",t("Edit"));
   edit.addEventListener("click",()=>loadSavedBill(bill));
   const del=el("button","mini red",t("Delete"));
   del.addEventListener("click",()=>deleteBill(bill));actions.append(edit,del);
  }
  panel.append(actions);
  if(state.shown.has(bill.id)){
   const detail=el("div","bill-detail");
   for(const item of allocations){
    const row=el("div","paid-row"),left=el("div"),right=el("div","payment-actions");
    left.append(el("strong",null,item.resident_name+" · "+t("{count} days",{count:item.days})));
    left.append(el("small","payment-amount",money(item.share)));
    const statuses={unpaid:"Unpaid",submitted:"Payment reported",confirmed:"Received"};
    right.append(el("span","payment-badge "+item.status,t(statuses[item.status]||"Unpaid")));
    if(state.owner&&item.status==="submitted"){
     const confirm=el("button","mini",t("Confirm receipt"));
     confirm.addEventListener("click",async()=>{
      confirm.disabled=true;
      const {error}=await db.from("apartment_allocations").update({status:"confirmed"}).eq("id",item.id).eq("status","submitted");
      if(error)errorNotice("Could not confirm payment.",error);
      else{item.status="confirmed";renderHistory();toast("Payment confirmed.")}
      confirm.disabled=false;
     });
     right.append(confirm);
    }
    const mine=state.residents.find(r=>r.id===item.resident_id&&r.user_id===state.user?.id);
    if(!state.owner&&mine&&item.status==="unpaid"){
     const report=el("button","mini",t("I have paid"));
     report.addEventListener("click",async()=>{
      report.disabled=true;
      const {error}=await db.rpc("mark_apartment_payment_sent",{p_allocation_id:item.id});
      if(error)errorNotice("Could not report payment.",error);
      else{item.status="submitted";renderHistory();toast("Payment reported to your apartment owner.")}
      report.disabled=false;
     });
     right.append(report);
    }
    row.append(left,right);detail.append(row);
   }
   panel.append(detail);
  }
  root.append(panel);
 }
}
async function loadSavedBill(bill){
 if(!state.owner)return;
 const confirmed=await confirmAction({
  title:"Load saved bill?",
  message:"Load this bill into the editor? Your current resident preferences will stay unchanged.",
  confirmText:"Load bill",
  cancelText:"Cancel"
 });
 if(!confirmed)return;
 state.draft={type:bill.bill_type,month:bill.bill_month,amount:String(bill.amount),start:bill.period_start||"",end:bill.period_end||""};
 setDraft();$("#bill-details-panel").scrollIntoView({behavior:"smooth",block:"start"});
 toast("Bill loaded. Check the current resident list before saving.");
}
async function deleteBill(bill){
 if(!state.owner)return;
 const confirmed=await confirmAction({
  title:"Delete this bill?",
  message:"The bill and its saved payment statuses will be deleted. This cannot be undone.",
  confirmText:"Delete bill",
  cancelText:"Keep bill",
  tone:"danger"
 });
 if(!confirmed)return;
 const {error}=await db.from("apartment_bills").delete().eq("id",bill.id).eq("apartment_id",state.apt.id);
 if(error)return errorNotice("Could not delete the bill.",error);
 state.bills=state.bills.filter(b=>b.id!==bill.id);delete state.alloc[bill.id];renderHistory();toast("Bill deleted.");
}
async function saveBill(){
 if(!state.owner||validateBill())return;
 clearTimeout(state.writeTimer);savePendingResidents();await state.writeChain;
 const previous=state.bills.find(b=>b.bill_type===state.draft.type&&b.bill_month===state.draft.month);
 if(previous){
  const confirmed=await confirmAction({
   title:"Replace existing bill?",
   message:"A bill for this type and month already exists. Replace its amounts? Existing payment statuses will be preserved.",
   confirmText:"Replace bill",
   cancelText:"Keep existing bill"
  });
  if(!confirmed)return;
 }
 const period=billingPeriod(),items=split().map(x=>({resident_id:x.id,days:x.days,share:x.share,mode:x.mode,custom_days:x.custom_days}));
 const button=$("#save");
 state.billSaving=true;button.disabled=true;
 const apartmentId=state.apt.id;
 let saved=false;
 try{
  const {error}=await db.rpc("save_apartment_bill",{
   p_apartment_id:apartmentId,p_type:state.draft.type,p_month:state.draft.month,
   p_amount:Number(state.draft.amount),p_days:period.days,p_items:items,
   p_start:period.start,p_end:period.end
  });
  if(error)throw error;
  saved=true;
  // Bill allocations are snapshots; reset only the current roster after saving.
  const reset=await db.from("apartment_residents")
   .update({mode:"custom",custom_days:4}).eq("apartment_id",apartmentId);
  if(reset.error)errorNotice("Bill saved, but default days could not be restored.",reset.error);
  else toast("Bill saved. Resident days reset to 4 days.");
  if(state.apt?.id===apartmentId){
   if(!reset.error)state.residents.forEach(p=>{p.mode="custom";p.custom_days=4});
   await loadApartment(apartmentId,{resetDraft:true});
  }
 }catch(err){errorNotice(saved?"Unable to refresh. Check your connection.":"Could not save bill.",err)}
 finally{state.billSaving=false;renderResult()}
}
async function clipboard(data,message){
 try{await navigator.clipboard.writeText(data);toast(message||"Copied.")}catch{toast("Your browser cannot copy to clipboard.")}
}
function buildBreakdown(){
 const parts=split();
 if(!parts||!state.apt)return "";
 return [typeName(state.draft.type)+" — "+state.draft.month,
  t("Apartment")+": "+state.apt.name,t("Total")+": "+money(state.draft.amount),
  t("Period")+": "+t("{count} days",{count:billingPeriod().days}),"",
  ...parts.map((p,i)=>(i+1)+". "+p.name+" · "+t("{count} days",{count:p.days})+": "+money(p.share)),
  "",t("TOTAL")+": "+money(parts.reduce((s,p)=>s+p.share,0))].join("\n");
}
function copyBreakdown(){
 const text=buildBreakdown();
 if(text)clipboard(text,"Breakdown copied.");
}
async function shareBreakdown(){
 const summary=buildBreakdown();if(!summary)return;
 if(typeof navigator.share==="function"){
  try{
   await navigator.share({title:"Ở Ghép — "+typeName(state.draft.type),text:summary});
   toast("Breakdown shared.");return;
  }catch(err){
   if(err?.name==="AbortError")return;
   console.warn("Web share failed, falling back to clipboard",err);
  }
 }
 try{
  await navigator.clipboard.writeText(summary);
  toast("Share unavailable. Breakdown copied instead.");
 }catch(err){errorNotice("Sharing failed. Please try again.",err)}
}
function refreshLogin(){
 const remain=Math.max(0,Math.ceil((state.loginUntil-Date.now())/1000));
 const btn=$("#login-button");btn.disabled=state.loginBusy||remain>0;
 btn.textContent=state.loginBusy?t("Sending..."):remain>0?t("Try again in {minutes} min",{minutes:Math.ceil(remain/60)}):t("Email me a sign-in link");
 if(remain===0&&state.loginUntil){state.loginUntil=0;localStorage.removeItem("oghep-login-backoff-v1")}
}
setInterval(refreshLogin,1000);
async function login(e){
 e.preventDefault();if(state.loginBusy||Date.now()<state.loginUntil)return;
 const email=$("#email").value.trim();if(!email)return;
 state.loginBusy=true;refreshLogin();authMessage("Sending a sign-in link...");
 try{
  const pending=sessionStorage.getItem("oghep-invite");
  const redirect=pending?SITE+"/?invite="+pending:SITE+"/";
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
  if(error)throw error;
  state.loginUntil=Date.now()+60000;
  authMessage("Check your inbox and spam folder for the sign-in link.");
 }catch(err){
  if(err?.status===429||String(err?.code||"").includes("rate_limit")){
   state.loginUntil=Date.now()+30*60000;
   authMessage("Email sending is temporarily limited. Please try again in 30–60 minutes.");
  }else{authMessage("Could not send the sign-in link. Please try again.");console.error(err)}
 }finally{
  if(state.loginUntil)localStorage.setItem("oghep-login-backoff-v1",String(state.loginUntil));
  state.loginBusy=false;refreshLogin();
 }
}
function signOutView(){
 stopApartmentWatch();
 state.loadSeq++;state.aptSeq++;state.user=null;state.apt=null;state.apts=[];state.owner=false;
 state.residents=[];state.bills=[];state.alloc={};state.dirty.clear();clearTimeout(state.writeTimer);
 state.authStatus="";label("#authmsg","");
 show("#loading",false);show("#auth",true);show("#workspace",false);show("#signout",false);
 label("#sync-chip",t("Signed out"));$("#sync-chip").classList.remove("connected");
}
// Language changes update the current UI without reloading, switching apartment or changing form values.
$("#lang-vi").addEventListener("click",()=>setLanguage("vi"));
$("#lang-en").addEventListener("click",()=>setLanguage("en"));
onLanguageChange(()=>{
 if(state.authStatus)label("#authmsg",t(state.authStatus));
 const status=state.user?"Connected":"Signed out";
 label("#sync-chip",t(status));
 refreshLogin();
 // All static content and select-option captions are translated by the i18n module.
 if(!state.user)return;
 if(!state.apt){renderGate();return}
 label("#apartment-role",t(state.owner?"Owner":"Member"));
 renderResidentTable();
 if($("#member-form-dialog").open)updateMemberDialogLabels();
 if($("#bulk-member-dialog").open)renderBulkPreview();
 renderHistory();
 renderResult();
});

$("#login-form").addEventListener("submit",login);
$("#signout").addEventListener("click",async()=>{
 const {error}=await db.auth.signOut();
 if(error)errorNotice("Could not sign out.",error);else signOutView();
});
$("#create-apartment-form").addEventListener("submit",createApartment);
$("#accept-invite").addEventListener("click",acceptInvite);
$("#manage-apartments").addEventListener("click",showGate);
$("#apartment-select").addEventListener("change",e=>loadApartment(e.target.value));
$("#copy-code").addEventListener("click",()=>state.apt&&clipboard(state.apt.code,"Apartment code copied."));
$("#open-member-modal").addEventListener("click",()=>openMemberDialog());
$("#open-bulk-modal").addEventListener("click",openBulkModal);
$("#bulk-member-names").addEventListener("input",renderBulkPreview);
$("#bulk-member-form").addEventListener("submit",submitBulkMembers);
$("#bulk-dialog-close").addEventListener("click",closeBulkModal);
$("#bulk-dialog-cancel").addEventListener("click",closeBulkModal);
$("#bulk-member-dialog").addEventListener("cancel",event=>{if(bulkDialogBusy)event.preventDefault()});
$("#bulk-member-dialog").addEventListener("click",event=>{
 const dialog=$("#bulk-member-dialog");if(event.target!==dialog||bulkDialogBusy)return;
 const rect=dialog.getBoundingClientRect();
 if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeBulkModal();
});
$("#bulk-member-dialog").addEventListener("close",()=>{
 if(bulkDialogOrigin?.isConnected)bulkDialogOrigin.focus({preventScroll:true});
 bulkDialogOrigin=null;
});

$("#member-dialog-cancel").addEventListener("click",closeMemberDialog);
$("#member-dialog-close").addEventListener("click",closeMemberDialog);
$("#member-dialog-form").addEventListener("submit",event=>{event.preventDefault();memberFormAction(true)});
$("#member-add-only").addEventListener("click",()=>memberFormAction(false));
for(const id of ["#member-name-input","#member-email-input"]){
 $(id).addEventListener("input",()=>{memberFormError("");updateMemberFormButtons()});
}
$("#member-form-dialog").addEventListener("cancel",event=>{
 if(memberDialogBusy)event.preventDefault();
});
$("#member-form-dialog").addEventListener("click",event=>{
 const dlg=$("#member-form-dialog");if(event.target!==dlg||memberDialogBusy)return;
 const rect=dlg.getBoundingClientRect();
 if(event.clientX<rect.left||event.clientX>rect.right||
    event.clientY<rect.top||event.clientY>rect.bottom)closeMemberDialog();
});
$("#member-form-dialog").addEventListener("close",()=>{
 if(memberDialogOrigin?.isConnected)memberDialogOrigin.focus({preventScroll:true});
 memberDialogOrigin=null;
});
$("#copy-invite-link").addEventListener("click",()=>state.inviteLink&&clipboard(state.inviteLink,"Private invitation link copied."));
$("#bill-type").addEventListener("change",e=>{state.draft.type=e.target.value;renderResult()});
$("#bill-month").addEventListener("change",e=>{
 if(/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){
  state.draft.month=e.target.value;renderResidentTable();
 }
});
$("#bill-amount").addEventListener("input",renderMoney);
for(const input of ["#period-start","#period-end"]){
 $(input).addEventListener("change",e=>{
  if(input==="#period-start")state.draft.start=e.target.value;else state.draft.end=e.target.value;
  renderResidentTable();
 });
}
$("#copy").addEventListener("click",copyBreakdown);
$("#share").addEventListener("click",shareBreakdown);
$("#save").addEventListener("click",saveBill);
$("#refresh-history").addEventListener("click",async()=>{
 if(!state.apt||!state.user)return;
 const button=$("#refresh-history"),id=state.apt.id;
 button.disabled=true;
 try{
  clearTimeout(state.writeTimer);
  savePendingResidents();
  await state.writeChain;
  const ok=await loadApartment(id,{preserveDraft:true});
  if(ok)toast("Updated just now.");
 }catch(err){errorNotice("Unable to refresh. Check your connection.",err)}
 finally{button.disabled=false}
});

db.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){signOutView();return}
 if(event==="SIGNED_IN"&&session?.user)queueMicrotask(()=>loadUser(session.user));
});
db.auth.getSession().then(({data,error})=>{
 if(error){signOutView();errorNotice("Could not verify your session.",error)}
 else if(data.session?.user)loadUser(data.session.user);
 else signOutView();
}).catch(error=>{signOutView();errorNotice("Could not connect to the server.",error)});
