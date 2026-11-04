import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
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
const nowMonth=()=>{const n=new Date();return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")};
const state={user:null,apts:[],apt:null,owner:false,residents:[],members:[],invitations:[],bills:[],alloc:{},
 shown:new Set(),loadSeq:0,aptSeq:0,pendingLoad:null,dirty:new Map(),writeTimer:0,writeChain:Promise.resolve(),
 draft:{type:"electric",month:nowMonth(),amount:"",start:"",end:""},inviteLink:"",
 loginBusy:false,loginUntil:Number(localStorage.getItem("oghep-login-backoff-v1")||0)};
let toastTimer=0;
function toast(message){
 const t=$("#toast");t.textContent=message;t.classList.add("show");
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),3800);
}
function errorNotice(message,error){if(error)console.error(message,error);toast(message)}
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
 label("#period-days-note",p.valid?p.days+" calendar/billing days":"Check the date range");
 label("#period-label",state.draft.month.slice(5)+"/"+state.draft.month.slice(0,4)+" · "+p.days+" days");
 label("#total",money(state.draft.amount));
 label("#people-label",state.residents.length+" residents");
 const r=split()||[], map=new Map(r.map(x=>[x.id,x]));
 label("#allocated",money(r.reduce((a,b)=>a+b.share,0)));
 for(const resident of state.residents){
  const share=$("#members").querySelector('[data-share-id="'+resident.id+'"]');
  const days=$("#members").querySelector('[data-days-id="'+resident.id+'"]');
  if(share)share.textContent=money(map.get(resident.id)?.share||0);
  if(days)days.textContent=occupiedDays(resident)+" days";
 }
 label("#validation",validateBill());
 $("#save").disabled=!!validateBill();
 $("#copy").disabled=!r.length||!!validateBill();
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
 const items=[...state.dirty.values()];state.dirty.clear();
 state.writeChain=state.writeChain.then(async()=>{
  for(const p of items){
   const {error}=await db.from("apartment_residents").update({
    name:p.name.trim()||"Resident",mode:p.mode,custom_days:p.custom_days,sort_order:p.sort_order
   }).eq("id",p.id).eq("apartment_id",state.apt.id);
   if(error)throw error;
  }
 }).catch(err=>errorNotice("Resident changes were not saved. Please reload.",err));
}
function changedResident(p){
 if(!state.owner)return;
 state.dirty.set(p.id,{...p});
 clearTimeout(state.writeTimer);state.writeTimer=setTimeout(savePendingResidents,650);
}
function renderResidentTable(){
 const body=$("#members");body.replaceChildren();
 label("#member-count",state.residents.length+" residents");
 for(const [index,p] of state.residents.entries()){
  const row=el("tr"),cell=el("td");
  const name=el("input","member-name");name.value=p.name;name.maxLength=70;name.disabled=!state.owner;
  name.setAttribute("aria-label","Resident "+(index+1));
  name.addEventListener("input",()=>{p.name=name.value;changedResident(p)});
  name.addEventListener("blur",()=>{if(!p.name.trim()){p.name="Resident "+(index+1);name.value=p.name;changedResident(p)}});
  cell.append(name);row.append(cell);
  for(let week=1;week<=4;week++){
   const td=el("td"),code="w"+week,btn=el("button","week-choice"+(p.mode===code?" active":""),week+" wk");
   btn.type="button";btn.disabled=!state.owner;btn.setAttribute("aria-pressed",String(p.mode===code));
   btn.setAttribute("aria-label",p.name+": "+week+" weeks");
   btn.addEventListener("click",()=>{p.mode=code;changedResident(p);renderResidentTable()});
   td.append(btn);row.append(td);
  }
  const td=el("td"),input=el("input","day-choice"+(p.mode==="custom"?" active":""));
  input.type="number";input.min="0";input.max=String(billingPeriod().days);input.inputMode="numeric";
  input.placeholder="Days";input.disabled=!state.owner;
  input.value=p.mode==="custom"?String(p.custom_days):"";
  input.setAttribute("aria-label",p.name+": custom days");
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
  const shareTd=el("td"),val=el("strong","person-share","0 ₫"),hint=el("small","person-days","0 days");
  val.dataset.shareId=p.id;hint.dataset.daysId=p.id;shareTd.append(val,hint);row.append(shareTd);
  const delTd=el("td");
  if(state.owner){
   const del=el("button","delete-person","×");del.type="button";del.setAttribute("aria-label","Remove "+p.name);
   del.addEventListener("click",()=>removeResident(p));delTd.append(del);
  }
  row.append(delTd);body.append(row);
 }
 if(!state.residents.length){
  const row=el("tr"),td=el("td","muted","No residents yet. Add one above.");td.colSpan=8;row.append(td);body.append(row);
 }
 renderInviteOptions();renderResult();
}
async function removeResident(p){
 if(!state.owner||!confirm("Remove "+p.name+"? Saved bill snapshots remain intact."))return;
 clearTimeout(state.writeTimer);state.dirty.delete(p.id);
 const {error}=await db.from("apartment_residents").delete().eq("id",p.id).eq("apartment_id",state.apt.id);
 if(error)return errorNotice("Could not remove resident.",error);
 state.residents=state.residents.filter(x=>x.id!==p.id);renderResidentTable();toast("Resident removed.");
}
async function addResident(e){
 e.preventDefault();if(!state.owner)return;
 const input=$("#new-resident-name"),name=input.value.trim();
 if(!name||state.residents.length>=70)return toast("Please enter a name. Maximum 70 residents.");
 if(state.residents.some(x=>x.name.trim().toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi")))return toast("This resident name already exists.");
 const {data,error}=await db.from("apartment_residents").insert({
  apartment_id:state.apt.id,name,mode:"w4",custom_days:0,sort_order:state.residents.length
 }).select("id,apartment_id,user_id,name,mode,custom_days,sort_order").single();
 if(error)return errorNotice("Could not add resident.",error);
 state.residents.push(data);input.value="";renderResidentTable();toast("Resident added.");
}
function renderInviteOptions(){
 const select=$("#invite-resident");select.replaceChildren();
 const empty=el("option",null,"Choose a resident");empty.value="";select.append(empty);
 state.residents.filter(r=>!r.user_id).forEach(r=>{const option=el("option",null,r.name);option.value=r.id;select.append(option)});
}

function renderAccess(){
 const root=$("#member-access"),invites=$("#pending-invitations");root.replaceChildren();invites.replaceChildren();
 if(!state.owner)return;
 for(const m of state.members){
  const r=state.residents.find(x=>x.user_id===m.user_id);
  const known=state.invitations.find(x=>x.accepted_by===m.user_id);
  const line=el("div","access-item");
  line.append(el("span",null,(m.role==="owner"?"You (owner)":r?.name||known?.invited_email||"Linked member")+" · "+m.role));
  if(m.role!=="owner"){
   const remove=el("button","mini","Remove access");
   remove.addEventListener("click",async()=>{
    if(!confirm("Remove this member's apartment access?"))return;
    const {error}=await db.rpc("remove_apartment_member",{p_apartment_id:state.apt.id,p_user_id:m.user_id});
    if(error)return errorNotice("Could not remove member.",error);
    await loadApartment(state.apt.id);
   });
   line.append(remove);
  }
  root.append(line);
 }
 const pending=state.invitations.filter(x=>x.status==="pending"&&new Date(x.expires_at)>new Date());
 if(!pending.length)invites.append(el("p","muted","No pending invitations."));
 for(const invitation of pending){
  const line=el("div","access-item");
  line.append(el("span",null,invitation.invited_email+" · expires "+new Date(invitation.expires_at).toLocaleDateString("en-GB")));
  const revoke=el("button","mini","Revoke");
  revoke.addEventListener("click",async()=>{
   const {error}=await db.rpc("revoke_apartment_invitation",{p_invite_id:invitation.id});
   if(error)return errorNotice("Could not revoke invitation.",error);
   state.invitations=state.invitations.filter(x=>x.id!==invitation.id);
   renderAccess();toast("Invitation revoked.");
  });
  line.append(revoke);invites.append(line);
 }
}
async function refreshInvites(){
 if(!state.owner)return;
 const {data,error}=await db.from("apartment_invitations").select("id,invited_email,status,expires_at,accepted_by").eq("apartment_id",state.apt.id).order("created_at",{ascending:false}).limit(50);
 if(error)return errorNotice("Could not refresh invitations.",error);
 state.invitations=data||[];renderAccess();
}
async function sendInvitation(e){
 e.preventDefault();if(!state.owner)return;
 const email=$("#invite-email").value.trim().toLowerCase();
 const resident=$("#invite-resident").value;
 if(!email||!resident)return toast("Choose a member and their email.");
 const button=$("#send-invite");button.disabled=true;
 try{
  const {data,error}=await db.rpc("create_apartment_invitation",{p_apartment_id:state.apt.id,p_email:email,p_resident_id:resident});
  if(error)throw error;
  const url=SITE+"/?invite="+data.token;
  state.inviteLink=url;
  const {error:mailError}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:url}});
  await refreshInvites();
  $("#invite-email").value="";
  if(mailError){
   show("#invite-fallback",true);
   errorNotice("Invitation created, but email delivery failed. Copy the private link.",mailError);
  }else{
   show("#invite-fallback",false);
   toast("Invitation sign-in email sent. The member can join after accepting.");
  }
 }catch(error){errorNotice("Could not create the invitation.",error)}
 finally{button.disabled=false}
}
function renderAptOptions(){
 const select=$("#apartment-select");select.replaceChildren();
 for(const a of state.apts){const option=el("option",null,a.name+" · "+a.code);option.value=a.id;select.append(option)}
 if(state.apt)select.value=state.apt.id;
}
function renderGate(){
 const root=$("#apartment-list");root.replaceChildren();
 if(state.apts.length)root.append(el("p","muted","Your apartments"));
 for(const a of state.apts){
  const btn=el("button","apartment-choice",a.name+" · "+a.code);
  btn.type="button";btn.addEventListener("click",()=>loadApartment(a.id));
  root.append(btn);
 }
 if(!state.apts.length)root.append(el("p","muted","No apartment yet. Create one to get started."));
 const token=sessionStorage.getItem("oghep-invite");
 show("#invitation-banner",!!token);
 label("#invitation-message","Accept this invitation after signing in with the invited email address.");
}
function showGate(){
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
  toast("You joined "+data.name+".");
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
  label("#sync-chip","Connected");$("#sync-chip").classList.add("connected");
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
async function loadApartment(id){
 const a=state.apts.find(x=>x.id===id);
 if(!a)return showGate();
 const seq=++state.aptSeq;
 state.apt=a;state.owner=a.owner_id===state.user?.id;
 localStorage.setItem("oghep-active:"+state.user.id,a.id);
 const [r,m,b,i]=await Promise.all([
  db.from("apartment_residents").select("id,apartment_id,user_id,name,sort_order,mode,custom_days").eq("apartment_id",id).order("sort_order"),
  db.from("apartment_members").select("user_id,role").eq("apartment_id",id),
  db.from("apartment_bills").select("id,apartment_id,bill_type,bill_month,amount,billing_days,period_start,period_end").eq("apartment_id",id).order("bill_month",{ascending:false}).limit(100),
  state.owner?db.from("apartment_invitations").select("id,invited_email,status,expires_at,accepted_by").eq("apartment_id",id).order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[]})
 ]);
 if(seq!==state.aptSeq)return;
 const err=r.error||m.error||b.error||i.error;
 if(err)return errorNotice("Could not load apartment data.",err);
 state.residents=r.data||[];state.members=m.data||[];state.bills=b.data||[];
 state.invitations=i.data||[];state.alloc={};
 if(state.bills.length){
  const {data,error}=await db.from("apartment_allocations").select("id,bill_id,resident_id,resident_name,days,share,mode,custom_days,status").in("bill_id",state.bills.map(x=>x.id));
  if(error)return errorNotice("Could not load bill allocations.",error);
  for(const item of data||[]){(state.alloc[item.bill_id]??=[]).push(item)}
 }
 if(seq!==state.aptSeq)return;
 label("#apartment-name",a.name);label("#apartment-code",a.code);
 label("#apartment-role",state.owner?"Owner":"Member");
 label("#dashboard-title",a.name);
 renderAptOptions();
 show("#apartment-gate",false);show("#apartment-app",true);
 show("#owner-panel",state.owner);
 for(const id of ["#bill-details-panel","#residents-panel","#summary-panel"])show(id,state.owner);
 if(state.owner)blankDraft();
 renderResidentTable();renderAccess();renderHistory();
}

function renderHistory(){
 const root=$("#history");root.replaceChildren();
 label("#history-count",state.bills.length+" periods");
 if(!state.bills.length){root.append(el("p","muted","No saved bills yet."));return}
 for(const bill of state.bills){
  const allocations=state.alloc[bill.id]||[];
  const panel=el("article","bill"),line=el("div","bill-line"),desc=el("div","bill-desc");
  desc.append(el("strong",null,(types[bill.bill_type]||"Bill")+" · "+bill.bill_month.slice(5)+"/"+bill.bill_month.slice(0,4)));
  desc.append(el("small",null,allocations.length+" residents · "+bill.billing_days+" days"));
  line.append(desc,el("strong","bill-money",money(bill.amount)));panel.append(line);
  const actions=el("div","bill-actions");
  const toggle=el("button","mini",state.shown.has(bill.id)?"Hide details":"Details");
  toggle.addEventListener("click",()=>{state.shown.has(bill.id)?state.shown.delete(bill.id):state.shown.add(bill.id);renderHistory()});
  actions.append(toggle);
  if(state.owner){
   const edit=el("button","mini","Edit");
   edit.addEventListener("click",()=>loadSavedBill(bill));
   const del=el("button","mini red","Delete");
   del.addEventListener("click",()=>deleteBill(bill));actions.append(edit,del);
  }
  panel.append(actions);
  if(state.shown.has(bill.id)){
   const detail=el("div","bill-detail");
   for(const item of allocations){
    const row=el("div","paid-row"),left=el("div"),right=el("div","payment-actions");
    left.append(el("strong",null,item.resident_name+" · "+item.days+" days"));
    left.append(el("small","payment-amount",money(item.share)));
    const statuses={unpaid:"Unpaid",submitted:"Payment reported",confirmed:"Received"};
    right.append(el("span","payment-badge "+item.status,statuses[item.status]||"Unpaid"));
    if(state.owner&&item.status==="submitted"){
     const confirm=el("button","mini","Confirm receipt");
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
     const report=el("button","mini","I have paid");
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
function loadSavedBill(bill){
 if(!state.owner||!confirm("Load this saved bill for editing? Current resident preferences are unchanged."))return;
 state.draft={type:bill.bill_type,month:bill.bill_month,amount:String(bill.amount),start:bill.period_start||"",end:bill.period_end||""};
 setDraft();$("#bill-details-panel").scrollIntoView({behavior:"smooth",block:"start"});
 toast("Bill loaded. Check the current resident list before saving.");
}
async function deleteBill(bill){
 if(!state.owner||!confirm("Delete this bill and its saved payment statuses?"))return;
 const {error}=await db.from("apartment_bills").delete().eq("id",bill.id).eq("apartment_id",state.apt.id);
 if(error)return errorNotice("Could not delete the bill.",error);
 state.bills=state.bills.filter(b=>b.id!==bill.id);delete state.alloc[bill.id];renderHistory();toast("Bill deleted.");
}
async function saveBill(){
 if(!state.owner||validateBill())return;
 clearTimeout(state.writeTimer);savePendingResidents();await state.writeChain;
 const previous=state.bills.find(b=>b.bill_type===state.draft.type&&b.bill_month===state.draft.month);
 if(previous&&!confirm("Overwrite the existing bill for this type and month? Payment statuses will be preserved."))return;
 const period=billingPeriod(),items=split().map(x=>({resident_id:x.id,days:x.days,share:x.share,mode:x.mode,custom_days:x.custom_days}));
 const button=$("#save");button.disabled=true;
 try{
  const {error}=await db.rpc("save_apartment_bill",{
   p_apartment_id:state.apt.id,p_type:state.draft.type,p_month:state.draft.month,
   p_amount:Number(state.draft.amount),p_days:period.days,p_items:items,
   p_start:period.start,p_end:period.end
  });
  if(error)throw error;
  toast("Bill saved successfully.");
  await loadApartment(state.apt.id);
 }catch(err){errorNotice("Could not save bill.",err)}
 finally{renderResult()}
}
async function clipboard(data,message){
 try{await navigator.clipboard.writeText(data);toast(message||"Copied.")}catch{toast("Your browser cannot copy to clipboard.")}
}
function copyBreakdown(){
 const parts=split();if(!parts)return;
 const lines=[types[state.draft.type]+" — "+state.draft.month,
  "Apartment: "+state.apt.name,"Total: "+money(state.draft.amount),
  "Period: "+billingPeriod().days+" days","",
  ...parts.map((p,i)=>(i+1)+". "+p.name+" · "+p.days+" days: "+money(p.share)),
  "","TOTAL: "+money(parts.reduce((s,p)=>s+p.share,0))];
 clipboard(lines.join("\n"),"Breakdown copied.");
}
function refreshLogin(){
 const remain=Math.max(0,Math.ceil((state.loginUntil-Date.now())/1000));
 const btn=$("#login-button");btn.disabled=state.loginBusy||remain>0;
 btn.textContent=state.loginBusy?"Sending...":remain>0?"Try again in "+Math.ceil(remain/60)+" min":"Email me a sign-in link";
 if(remain===0&&state.loginUntil){state.loginUntil=0;localStorage.removeItem("oghep-login-backoff-v1")}
}
setInterval(refreshLogin,1000);
async function login(e){
 e.preventDefault();if(state.loginBusy||Date.now()<state.loginUntil)return;
 const email=$("#email").value.trim();if(!email)return;
 state.loginBusy=true;refreshLogin();label("#authmsg","Sending a sign-in link...");
 try{
  const pending=sessionStorage.getItem("oghep-invite");
  const redirect=pending?SITE+"/?invite="+pending:SITE+"/";
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect}});
  if(error)throw error;
  state.loginUntil=Date.now()+60000;
  label("#authmsg","Check your inbox and spam folder for the sign-in link.");
 }catch(err){
  if(err?.status===429||String(err?.code||"").includes("rate_limit")){
   state.loginUntil=Date.now()+30*60000;
   label("#authmsg","Email sending is temporarily limited. Please try again in 30–60 minutes.");
  }else{label("#authmsg","Could not send the sign-in link. Please try again.");console.error(err)}
 }finally{
  if(state.loginUntil)localStorage.setItem("oghep-login-backoff-v1",String(state.loginUntil));
  state.loginBusy=false;refreshLogin();
 }
}
function signOutView(){
 state.loadSeq++;state.aptSeq++;state.user=null;state.apt=null;state.apts=[];state.owner=false;
 state.residents=[];state.bills=[];state.alloc={};state.dirty.clear();clearTimeout(state.writeTimer);
 show("#loading",false);show("#auth",true);show("#workspace",false);show("#signout",false);
 label("#sync-chip","Signed out");$("#sync-chip").classList.remove("connected");
}
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
$("#add-resident-form").addEventListener("submit",addResident);
$("#invite-form").addEventListener("submit",sendInvitation);
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
$("#save").addEventListener("click",saveBill);
db.auth.onAuthStateChange((event,session)=>{
 if(event==="SIGNED_OUT"){signOutView();return}
 if(event==="SIGNED_IN"&&session?.user)queueMicrotask(()=>loadUser(session.user));
});
db.auth.getSession().then(({data,error})=>{
 if(error){signOutView();errorNotice("Could not verify your session.",error)}
 else if(data.session?.user)loadUser(data.session.user);
 else signOutView();
}).catch(error=>{signOutView();errorNotice("Could not connect to the server.",error)});
