import {createClient} from "https://esm.sh/@supabase/supabase-js@2.118.0";
const SUPABASE_URL = "https://loovjgylbookhouxjkaf.supabase.co";
const SUPABASE_KEY = "sb_publishable_i-HRVZm2rY7SUl1w-iJAdA_KAPi2H8h";
const db = createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $ = s => document.querySelector(s);
const show = (id,on) => $(id).classList.toggle("hidden",!on);
const money = n => Math.round(n).toLocaleString("vi-VN")+" ₫";
const types = {electric:"Electricity",water:"Water",internet:"Internet",other:"Other"};
const id = () => crypto.randomUUID();
const defaultMemberNames = ["Tấn","Tiến","Thành","Huy","Nhựt","Kiệt","Hậu"];
const now = new Date();
const ym = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
let user = null, people = [], history = [], shown = new Set(), saveTimer, writeQueue=Promise.resolve(), savedIds=new Set(), noticeTimer, authBusy=false;
let draft={type:"electric",month:ym,amount:"",days:30};
function toast(message){const e=$("#toast");e.textContent=message;e.classList.add("show");clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>e.classList.remove("show"),3500)}
function el(tag,cls,value){const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=value;return x}
function readDraft(){try{const v=JSON.parse(localStorage.getItem("oghep-draft:"+user.id));if(v&&types[v.type]&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month)){draft.type=v.type;draft.month=v.month;draft.amount="";draft.days=Number.isInteger(v.days)&&v.days>=1&&v.days<=366?v.days:30}}catch{}}
function writeDraft(){if(user)localStorage.setItem("oghep-draft:"+user.id,JSON.stringify({...draft,amount:""}))}
function days(p){if(p.mode==="full")return draft.days;if(p.mode==="custom")return Math.min(draft.days,Math.max(0,Math.trunc(Number(p.customDays))||0));const w=Number(String(p.mode).slice(1));return Math.min(draft.days,[1,2,3,4].includes(w)?w*7:28)}
function split(){const amount=Number(draft.amount);if(!Number.isSafeInteger(amount)||amount<=0||!people.length)return null;const entries=people.map((p,i)=>({id:p.id,name:p.name.trim()||"Unnamed",days:days(p),mode:p.mode,customDays:p.customDays,index:i}));const totalDays=entries.reduce((s,p)=>s+p.days,0);if(!totalDays)return null;let given=0;const x=entries.map(p=>{const raw=amount*p.days/totalDays;const floor=Math.floor(raw);given+=floor;return {...p,share:floor,remain:raw-floor}});x.sort((a,b)=>b.remain-a.remain||a.index-b.index);for(let i=0;i<amount-given;i++)x[i].share++;return x.sort((a,b)=>a.index-b.index)}
function renderMembers(){const root=$("#members");root.replaceChildren();$("#member-count").textContent=people.length+" residents";
if(!people.length){const tr=el("tr"),td=el("td","muted","No residents yet. Add someone to get started.");td.colSpan=8;tr.append(td);root.append(tr);return}
people.forEach((p,i)=>{const tr=el("tr"),nameTD=el("td"),name=el("input","member-name");name.value=p.name;name.placeholder="Resident name";name.maxLength=70;name.setAttribute("aria-label","Resident name "+(i+1));name.addEventListener("input",e=>{p.name=e.target.value;renderResults();scheduleMembers()});name.addEventListener("blur",()=>{if(!p.name.trim()){p.name="Person "+(i+1);name.value=p.name;renderResults();scheduleMembers()}});nameTD.append(name);tr.append(nameTD);
for(let week=1;week<=4;week++){const td=el("td"),mode="w"+week,btn=el("button","week-choice"+(p.mode===mode?" active":""),week+" wk");btn.type="button";btn.setAttribute("aria-pressed",p.mode===mode?"true":"false");btn.setAttribute("aria-label",p.name+" "+week+" wk");btn.addEventListener("click",()=>{p.mode=mode;renderMembers();renderResults();scheduleMembers()});td.append(btn);tr.append(td)}
const td=el("td"),input=el("input","day-choice"+(p.mode==="custom"?" active":""));input.type="number";input.min="0";input.max=String(draft.days);input.inputMode="numeric";input.placeholder="Days";input.value=p.mode==="custom"?String(p.customDays):"";input.setAttribute("aria-label",p.name+" custom days");
input.addEventListener("focus",()=>{if(p.mode!=="custom"){p.customDays=days(p);p.mode="custom";input.value=String(p.customDays);input.classList.add("active");tr.querySelectorAll(".week-choice").forEach(b=>{b.classList.remove("active");b.setAttribute("aria-pressed","false")});renderResults();scheduleMembers()}});
input.addEventListener("input",e=>{p.mode="custom";const n=Number(e.target.value);p.customDays=Math.max(0,Math.min(draft.days,Number.isFinite(n)?Math.trunc(n):0));renderResults();scheduleMembers()});
input.addEventListener("change",()=>{input.value=String(p.customDays)});
td.append(input);tr.append(td);
const shareTD=el("td"),share=el("strong","person-share","0 ₫"),duration=el("small","person-days","0 days");share.setAttribute("data-share-id",p.id);duration.setAttribute("data-days-id",p.id);shareTD.append(share,duration);tr.append(shareTD);
const deleteTD=el("td"),del=el("button","delete-person","×");del.type="button";del.setAttribute("aria-label","Remove "+p.name);del.addEventListener("click",()=>{if(!confirm("Remove "+p.name+" from the household?"))return;people=people.filter(x=>x.id!==p.id);renderMembers();renderResults();scheduleMembers()});deleteTD.append(del);tr.append(deleteTD);root.append(tr)})}
function renderResults(){const amount=Number(draft.amount)||0;$("#total").textContent=money(amount);$("#period-label").textContent="Period "+draft.month.slice(5)+"/"+draft.month.slice(0,4);$("#people-label").textContent=people.length+" residents";const parts=split(),map=new Map((parts||[]).map(x=>[x.id,x]));
people.forEach(p=>{const e=document.querySelector('[data-share-id="'+p.id+'"]'),f=document.querySelector('[data-days-id="'+p.id+'"]');if(e)e.textContent=money(map.get(p.id)?.share||0);if(f)f.textContent=days(p)+" days"});
$("#allocated").textContent=money(parts?parts.reduce((a,p)=>a+p.share,0):0);
let error="";if(!(Number.isSafeInteger(amount)&&amount>0))error="Enter a valid bill amount.";else if(!people.length)error="Add at least one resident.";else if(!parts)error="At least one resident must have more than 0 days.";else if(people.some(p=>!p.name.trim()))error="Give every resident a name.";$("#validation").textContent=error;$("#save").disabled=!!error;$("#copy").disabled=!!error}
function renderHistory(){const root=$("#history");root.replaceChildren();$("#history-count").textContent=history.length+" periods";if(!history.length){root.append(el("p","muted","No saved bills yet."));return}history.forEach(h=>{const box=el("div","bill"),line=el("div","bill-line"),text=el("div","bill-desc");text.append(el("strong","",(types[h.bill_type]||"Bill")+" · "+h.bill_month.slice(5)+"/"+h.bill_month.slice(0,4)),el("small","",h.people.length+" residents · "+h.billing_days+" days"));line.append(text,el("span","bill-money",money(h.amount)));box.append(line);const actions=el("div","bill-actions"),view=el("button","mini",shown.has(h.id)?"Hide details":"Details");view.addEventListener("click",()=>{shown.has(h.id)?shown.delete(h.id):shown.add(h.id);renderHistory()});const load=el("button","mini","Load");load.addEventListener("click",()=>{if(!confirm("Load this bill into the form? Your current resident list will be kept."))return;draft={type:h.bill_type,month:h.bill_month,amount:String(h.amount),days:h.billing_days};$("#bill-type").value=draft.type;$("#bill-month").value=draft.month;$("#bill-amount").value=draft.amount;$("#billing-days").value=draft.days;h.people.forEach(saved=>{const p=people.find(x=>x.name===saved.name);if(p){p.mode=saved.mode==="full"?"custom":saved.mode;p.customDays=saved.mode==="full"?h.billing_days:saved.customDays}});writeDraft();renderMembers();renderResults();scheduleMembers();document.querySelector("#dashboard")?.scrollIntoView({behavior:"smooth",block:"start"})});const del=el("button","mini red","Delete");del.addEventListener("click",async()=>{if(!confirm("Delete this saved bill?"))return;const {error}=await db.from("bill_history").delete().eq("id",h.id);if(error){toast("Could not delete this bill. Please try again.");return}history=history.filter(x=>x.id!==h.id);renderHistory();toast("Bill deleted.")});actions.append(view,load,del);box.append(actions);if(shown.has(h.id)){const detail=el("div","bill-detail");h.people.forEach((p,i)=>{const row=el("div","paid-row");row.append(el("span","",p.name+" · "+p.days+" days · "+money(p.share)));const label=el("label");const check=el("input");check.type="checkbox";check.checked=!!p.paid;check.addEventListener("change",async()=>{const next=h.people.map((x,j)=>j===i?{...x,paid:check.checked}:x);check.disabled=true;const {error}=await db.from("bill_history").update({people:next,updated_at:new Date().toISOString()}).eq("id",h.id);if(error){toast("Could not update payment status. Try again.");check.checked=!check.checked}else{h.people=next;toast("Payment status saved.");renderHistory()}check.disabled=false});label.append(check,el("span","",p.paid?"Paid":"Mark paid"));row.append(label);detail.append(row)});box.append(detail)}root.append(box)})}
function scheduleMembers(){if(!user)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{writeQueue=writeQueue.then(saveMembers).catch(err=>toast("Your resident list could not sync. Please try again."))},650)}
async function saveMembers(){if(!user)return;const uid=user.id;const data=people.map((p,i)=>({id:p.id,user_id:uid,name:p.name.trim()||"Person "+(i+1),sort_order:i,mode:p.mode==="full"?"custom":p.mode,custom_days:p.mode==="full"?draft.days:Math.max(0,Math.min(366,Number(p.customDays)||0))}));const current=new Set(data.map(x=>x.id));const old=[...savedIds].filter(x=>!current.has(x));if(data.length){const {error}=await db.from("room_members").upsert(data,{onConflict:"id"});if(error)throw error}if(old.length){const {error}=await db.from("room_members").delete().in("id",old);if(error)throw error}savedIds=new Set(current)}
async function loadAccount(u){user=u;draft={type:"electric",month:ym,amount:"",days:30};$("#loading").classList.add("hidden");show("#auth",false);show("#workspace",true);show("#signout",true);$("#sync-chip").textContent="Connected";$("#sync-chip").classList.add("connected");readDraft();$("#bill-type").value=draft.type;$("#bill-month").value=draft.month;$("#bill-amount").value=draft.amount;$("#billing-days").value=draft.days;const [m,h]=await Promise.all([db.from("room_members").select("id,name,sort_order,mode,custom_days").order("sort_order"),db.from("bill_history").select("id,bill_type,bill_month,amount,billing_days,people,created_at").order("bill_month",{ascending:false}).limit(100)]);if(m.error||h.error){toast("Could not load your account data. Please try again.");return}if(user?.id!==u.id)return;people=m.data.map(p=>({id:p.id,name:p.name,mode:p.mode||"w4",customDays:p.custom_days??0}));savedIds=new Set(people.map(p=>p.id));history=h.data;
const prefs=await db.from("room_preferences").select("members_initialized").eq("user_id",u.id).maybeSingle();
if(prefs.error){toast("Could not load your preferences.");return}
if(!prefs.data){const existing=new Set(people.map(p=>p.name.trim().toLocaleLowerCase("vi")));
const missing=defaultMemberNames.filter(name=>!existing.has(name.toLocaleLowerCase("vi"))).slice(0,Math.max(0,70-people.length));
if(missing.length){const defaults=missing.map((name,i)=>({id:id(),user_id:u.id,name,sort_order:people.length+i,mode:"w4",custom_days:0}));const seeded=await db.from("room_members").upsert(defaults,{onConflict:"id"});if(seeded.error){toast("Could not initialize residents.");return}people.push(...defaults.map(p=>({id:p.id,name:p.name,mode:p.mode,customDays:p.custom_days})));savedIds=new Set(people.map(p=>p.id))}
const mark=await db.from("room_preferences").upsert({user_id:u.id,members_initialized:true},{onConflict:"user_id"});if(mark.error)toast("Could not save initialization preferences.")}
renderMembers();renderResults();renderHistory()}
function showAuth(){user=null;people=[];history=[];draft={type:"electric",month:ym,amount:"",days:30};savedIds.clear();clearTimeout(saveTimer);$("#loading").classList.add("hidden");show("#auth",true);show("#workspace",false);show("#signout",false);$("#sync-chip").textContent="Signed out";$("#sync-chip").classList.remove("connected")}
const loginCooldownKey="oghep-login-backoff-v1";
let loginCooldownUntil=Number(localStorage.getItem(loginCooldownKey))||0;
let loginCooldownTick=null;
function refreshLoginButton(){
 const remaining=Math.max(0,Math.ceil((loginCooldownUntil-Date.now())/1000));
 const button=$("#login-button");
 button.disabled=authBusy||remaining>0;
 button.textContent=authBusy?"Sending...":remaining>0?"Try again in "+Math.ceil(remaining/60)+" min":"Email me a sign-in link";
 if(remaining<=0&&loginCooldownTick){clearInterval(loginCooldownTick);loginCooldownTick=null;localStorage.removeItem(loginCooldownKey)}
}
function cooldownLogin(seconds){
 loginCooldownUntil=Date.now()+seconds*1000;
 localStorage.setItem(loginCooldownKey,String(loginCooldownUntil));
 if(loginCooldownTick)clearInterval(loginCooldownTick);
 loginCooldownTick=setInterval(refreshLoginButton,1000);
 refreshLoginButton()
}
refreshLoginButton();
if(loginCooldownUntil>Date.now())loginCooldownTick=setInterval(refreshLoginButton,1000);
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();
 if(authBusy||Date.now()<loginCooldownUntil)return;
 const email=$("#email").value.trim();if(!email)return;
 authBusy=true;refreshLoginButton();$("#authmsg").textContent="Sending your sign-in link...";
 try{
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  if(error)throw error;
  $("#authmsg").textContent="Check your inbox and spam folder for your sign-in link.";
  cooldownLogin(60);
 }catch(err){
  if(err?.status===429||err?.code==="over_email_send_rate_limit"||err?.code==="over_request_rate_limit"){
   $("#authmsg").textContent="Email sending is temporarily limited. Please wait 30–60 minutes before trying again.";
   cooldownLogin(30*60);
  }else if(err?.code==="email_address_not_authorized"||String(err?.message||"").toLowerCase().includes("email address not authorized")){
   $("#authmsg").textContent="This email is not authorized to receive a sign-in link. Contact the site owner.";
  }else{
   $("#authmsg").textContent="Could not send your sign-in link. Please try again or contact the site owner.";
  }
 }finally{authBusy=false;refreshLoginButton()}
});
$("#signout").addEventListener("click",async()=>{const {error}=await db.auth.signOut();if(error)toast("Could not sign out. Please try again.");else showAuth()});
$("#add-member").addEventListener("click",()=>{if(people.length>=70){toast("The limit is 70 residents.");return}people.push({id:id(),name:"Person "+(people.length+1),mode:"w4",customDays:0});renderMembers();renderResults();scheduleMembers();const inputs=document.querySelectorAll(".member-name");inputs[inputs.length-1]?.focus();inputs[inputs.length-1]?.select()});
$("#bill-type").addEventListener("change",e=>{draft.type=e.target.value;writeDraft();renderResults()});
$("#bill-month").addEventListener("change",e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){draft.month=e.target.value;writeDraft();renderResults()}});
$("#bill-amount").addEventListener("input",e=>{draft.amount=e.target.value;writeDraft();renderResults()});
$("#billing-days").addEventListener("change",e=>{draft.days=Math.max(1,Math.min(366,Math.trunc(Number(e.target.value))||30));e.target.value=draft.days;writeDraft();renderMembers();renderResults()});
$("#copy").addEventListener("click",async()=>{const parts=split();if(!parts)return;const lines=[types[draft.type]+" – "+draft.month.slice(5)+"/"+draft.month.slice(0,4),"Bill total: "+money(+draft.amount),"Billing period: "+draft.days+" days","",...parts.map((p,i)=>(i+1)+". "+p.name+" — "+p.days+" days: "+money(p.share)),"","TOTAL: "+money(parts.reduce((s,p)=>s+p.share,0))];try{await navigator.clipboard.writeText(lines.join("\n"));toast("Copied. Ready to share in your group chat.")}catch{toast("Clipboard access is unavailable in this browser.")}});
$("#save").addEventListener("click",async()=>{const parts=split();if(!parts||!user||people.some(p=>!p.name.trim()))return;const existing=history.find(h=>h.bill_type===draft.type&&h.bill_month===draft.month);if(existing&&!confirm("A bill for this month and type exists. Replace it?"))return;$("#save").disabled=true;try{await writeQueue;const record={user_id:user.id,bill_type:draft.type,bill_month:draft.month,amount:Number(draft.amount),billing_days:draft.days,people:parts.map(p=>({name:p.name,days:p.days,share:p.share,mode:p.mode,customDays:p.customDays,paid:existing?.people.find(x=>x.name===p.name)?.paid||false})),updated_at:new Date().toISOString()};if(existing)record.id=existing.id;else record.id=id();const {data,error}=await db.from("bill_history").upsert(record,{onConflict:"user_id,bill_type,bill_month"}).select("id,bill_type,bill_month,amount,billing_days,people,created_at").single();if(error)throw error;history=[data,...history.filter(h=>h.id!==data.id)].sort((a,b)=>b.bill_month.localeCompare(a.bill_month));renderHistory();toast("Bill saved successfully.")}catch(err){toast("Could not save the bill. Please try again.")}finally{renderResults()}});
db.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){showAuth();return}if(event==="SIGNED_IN"&&session?.user&&user?.id!==session.user.id)setTimeout(()=>loadAccount(session.user),0)});
db.auth.getSession().then(({data,error})=>{if(error){showAuth();toast("Could not verify your session. Please sign in again.")}else if(data.session?.user)loadAccount(data.session.user);else showAuth()}).catch(()=>{showAuth();toast("Could not reach the server. Check your connection.")});
