/* Presentation-only composition for the three-step authenticated workspace.
   Moves existing controls without cloning them, preserving their event listeners. */
export function installDashboardLayout({t}){
 const get=id=>document.getElementById(id);
 const create=(tag,cls,id)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(id)element.id=id;
  return element;
 };
 const txt=(tag,cls,id,key)=>{
  const element=create(tag,cls,id);
  element.dataset.dashboardText=key;
  element.textContent=t(key);
  return element;
 };
 const fee=get("fee-workspace"),editor=get("fee-editor"),residents=get("residents-panel");
 const billAdd=editor.querySelector(".ub-add-row"),billSummary=editor.querySelector(".ub-summary");
 if(!fee||!editor||!residents||!billAdd||!billSummary)throw Error("Billing layout elements missing");

 const daySection=create("details","bill-days-step","bill-days-step");
 daySection.open=true;
 const dayHeader=create("summary","bill-days-toggle","bill-days-toggle");
 const dayLeft=create("span","bill-days-toggle-title");
 dayLeft.append(txt("strong",null,null,"A. Residents and days"));
 dayLeft.append(txt("small",null,null,"Choose weekly shortcuts or exact days"));
 const dayRight=create("span","bill-days-toggle-side");
 dayRight.append(create("span","bill-days-count","bill-days-count"));
 const chevron=create("span","bill-days-chevron");
 chevron.setAttribute("aria-hidden","true");
 dayRight.append(chevron);
 dayHeader.append(dayLeft,dayRight);
 daySection.append(dayHeader,residents);
 residents.classList.add("bill-resident-board");
 editor.insertBefore(daySection,billAdd);

 const billHeader=create("div","bill-stage-heading","bill-add-heading");
 billHeader.append(txt("h4",null,null,"B. Bills for this month"),
   txt("p",null,null,"Select a category, enter its charges, then add it to the list."));
 editor.insertBefore(billHeader,billAdd);

 const totalHeader=create("div","bill-stage-heading","bill-total-heading");
 totalHeader.append(txt("h4",null,null,"C. Totals and allocations"),
   txt("p",null,null,"Only checked bills count toward each resident's share."));
 editor.insertBefore(totalHeader,billSummary);

 const currentHistory=fee.querySelector(".fee-history-wrap");
 const oldHistory=document.querySelector(".history-panel");
 if(!currentHistory||!oldHistory)throw Error("Billing history panels missing");
 oldHistory.id="billing-history-panel";
 currentHistory.id="bill-history-current";
 const historyContent=get("history");
 const oldBlock=create("section","bill-legacy-history","bill-history-legacy");
 oldBlock.append(txt("h4","bill-history-group-title",null,"Earlier individual bills"));
 historyContent.parentElement.insertBefore(oldBlock,historyContent);
 oldBlock.append(historyContent);
 const emptyHistory=txt("p","muted bill-history-empty","bill-history-empty","No saved payment history yet.");
 oldHistory.insertBefore(emptyHistory,oldBlock);
 oldHistory.insertBefore(currentHistory,oldBlock);

 const links=document.querySelector(".nav-links");
 const appNav=create("nav","app-nav hidden","app-nav");
 appNav.setAttribute("aria-label",t("Application navigation"));
 const items=[
  ["#owner-panel","01","Members","app-nav-members"],
  ["#fee-workspace","02","Calculate bills","app-nav-billing"],
  ["#billing-history-panel","03","Payment history","app-nav-history"]
 ];
 for(const [href,num,textKey,cls] of items){
  const link=create("a","app-nav-link "+cls);
  link.href=href;
  const numNode=create("span","app-nav-index");numNode.textContent=num;
  link.append(numNode,txt("span",null,null,textKey));
  appNav.append(link);
 }
 links.parentElement.insertBefore(appNav,links.nextSibling);

 const title=get("dashboard-title");
 const dashHead=title?.closest(".dashboard-head");
 const headCaption=dashHead?.querySelector("p");
 const topDescription=get("fee-title")?.nextElementSibling;
 const headerStep=get("fee-workspace")?.querySelector(".panel-header .step-number");
 const legacyStep=get("residents-panel")?.querySelector(".panel-header .step-number");
 if(legacyStep)legacyStep.classList.add("hidden");
 if(headerStep)headerStep.textContent="02";

 function retranslate(){
  for(const element of document.querySelectorAll("[data-dashboard-text]"))element.textContent=t(element.dataset.dashboardText);
  appNav.setAttribute("aria-label",t("Application navigation"));
  if(document.body.classList.contains("app-active")){
   if(title)title.textContent=t("Apartment dashboard");
   if(headCaption)headCaption.textContent=t("Manage residents and monthly bills in one place.");
  }
  const heading=oldHistory.querySelector("#history-title");
  if(heading)heading.textContent=t("Payment history");
  const description=oldHistory.querySelector(".history-head p");
  if(description)description.textContent=t("Saved monthly periods, individual bills, and payment statuses.");
  if(topDescription)topDescription.textContent=t("Choose days, add bills, and save your monthly settlement.");
  const count=get("bill-days-count");
  if(count?.dataset.people)syncDaySummary(Number(count.dataset.people),Number(count.dataset.days));
 }
 function setSignedIn(signedIn){
  document.body.classList.toggle("app-active",!!signedIn);
  if(signedIn)retranslate();
  else {
   appNav.classList.add("hidden");
   if(title)title.textContent=t("Your bill. In one place.");
   if(headCaption)headCaption.textContent=t("Sign in to keep your household and payment history together.");
  }
 }
 function setApartment(isOwner,hasApartment=true){
  appNav.classList.toggle("hidden",!hasApartment);
  const members=appNav.querySelector(".app-nav-members");
  if(members)members.classList.toggle("hidden",!isOwner);
 }
 function syncDaySummary(people,days){
  const chip=get("bill-days-count");
  if(!chip)return;
  chip.dataset.people=String(people);
  chip.dataset.days=String(days);
  chip.textContent=t("{count} residents · {days} day period",{count:people,days});
 }
 function syncHistory(newCount,legacyCount){
  const n=Math.max(0,Number(newCount)||0);
  const old=Math.max(0,Number(legacyCount)||0);
  currentHistory.classList.toggle("hidden",n===0);
  oldBlock.classList.toggle("hidden",old===0);
  emptyHistory.classList.toggle("hidden",n+old>0);
  const count=get("history-count");
  if(count)count.textContent=t("{count} periods",{count:n+old});
 }
 retranslate();
 setSignedIn(false);
 syncHistory(0,0);
 return {retranslate,setSignedIn,setApartment,syncDaySummary,syncHistory};
}
