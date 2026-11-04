import test from "node:test";
import assert from "node:assert/strict";
import { installDashboardLayout } from "../dashboard-layout.mjs";

class FakeElement {
 constructor(tag="div",className="",id=""){
  this.tagName=tag.toLowerCase();this.id=id;this.children=[];this.parentElement=null;
  this.classList={
   names:new Set(className.split(/\s+/).filter(Boolean)),
   add:(x)=>this.classList.names.add(x),
   remove:(x)=>this.classList.names.delete(x),
   contains:(x)=>this.classList.names.has(x),
   toggle:(x,force)=>{
    const yes=force===undefined?!this.classList.names.has(x):force;
    yes?this.classList.names.add(x):this.classList.names.delete(x);return yes;
   }
  };
  this.dataset={};this.attributes={};this.textContent="";this.href="";this.open=false;
 }
 append(...items){for(const item of items){this.#remove(item);this.children.push(item);item.parentElement=this}}
 insertBefore(element,before){this.#remove(element);const idx=before?this.children.indexOf(before):-1;if(before&&idx<0)throw Error("Missing reference child");this.children.splice(idx<0?this.children.length:idx,0,element);element.parentElement=this}
 #remove(element){const parent=element.parentElement;if(parent){const i=parent.children.indexOf(element);if(i>=0)parent.children.splice(i,1);element.parentElement=null}}
 setAttribute(name,value){this.attributes[name]=value}
 querySelector(selector){return query(this,selector,false)[0]||null}
}
const matches=(element,segment)=>{
 if(segment.startsWith("#"))return element.id===segment.slice(1);
 if(segment.startsWith("."))return element.classList.contains(segment.slice(1));
 if(segment==="[data-dashboard-text]")return typeof element.dataset.dashboardText==="string";
 return element.tagName===segment.toLowerCase();
};
function query(root,selector,includeRoot=false){
 const segments=selector.trim().split(/\s+/);
 const descendants=(element)=>element.children.flatMap(c=>[c,...descendants(c)]);
 const all=includeRoot?[root,...descendants(root)]:descendants(root);
 return all.filter(el=>{
  if(!matches(el,segments.at(-1)))return false;
  let ancestor=el.parentElement;
  for(let i=segments.length-2;i>=0;i--){
   while(ancestor&&!matches(ancestor,segments[i]))ancestor=ancestor.parentElement;
   if(!ancestor)return false;
   ancestor=ancestor.parentElement;
  }
  return true;
 });
}
const elem=(tag,cls,id)=>new FakeElement(tag,cls,id);
function setup(){
 const body=elem("body");
 const navContainer=elem("div","header-inner"),links=elem("nav","nav-links");
 navContainer.append(links);body.append(navContainer);
 const dashHead=elem("div","dashboard-head"),h2=elem("h2",null,"dashboard-title");
 dashHead.append(h2,elem("p"));body.append(dashHead);
 const fee=elem("section","panel fee-workspace","fee-workspace"),feeHeader=elem("div","panel-header");
 feeHeader.append(elem("span","step-number"),elem("h3",null,"fee-title"));fee.append(feeHeader);
 const editor=elem("div","fee-editor","fee-editor");
 editor.append(elem("div","ub-add-row"),elem("section","ub-summary"));
 fee.append(editor);
 const feeHistory=elem("div","fee-history-wrap"),feeHistHeader=elem("div","fee-history-head");
 feeHistHeader.append(elem("h4"),elem("p"));feeHistory.append(feeHistHeader);
 feeHistory.append(elem("div","fee-history","fee-history"));fee.append(feeHistory);
 body.append(fee);
 const residentPanel=elem("section","panel","residents-panel"),residentHeader=elem("div","panel-header");
 residentHeader.append(elem("span","step-number"));residentPanel.append(residentHeader);
 residentPanel.append(elem("div","member-board"));body.append(residentPanel);
 const history=elem("section","panel history-panel"),histHeader=elem("div","history-head");
 histHeader.append(elem("h3",null,"history-title"),elem("p"),elem("span",null,"history-count"));
 history.append(histHeader,elem("div","history","history"));body.append(history);
 const document={
  body,createElement:tag=>elem(tag),
  getElementById:id=>query(body,"#"+id)[0]||null,
  querySelector:selector=>query(body,selector)[0]||null,
  querySelectorAll:selector=>query(body,selector)
 };
 globalThis.document=document;
 return {document,fee,editor,residentPanel,history,feeHistory,links};
}
test("authenticated dashboard composes a single month flow and moves existing history nodes",()=>{
 const {document,fee,editor,residentPanel,history,feeHistory}=setup();
 const layout=installDashboardLayout({t:k=>k});
 const days=document.getElementById("bill-days-step");
 assert.equal(residentPanel.parentElement,days);
 assert.equal(days.parentElement,editor);
 assert.equal(days.open,true);
 assert.ok(editor.children.indexOf(days)<editor.children.findIndex(c=>c.classList.contains("ub-add-row")));
 assert.equal(feeHistory.parentElement,history);
 assert.equal(document.getElementById("history").parentElement.id,"bill-history-legacy");
 assert.ok(!fee.children.includes(feeHistory));
 layout.setSignedIn(true);layout.setApartment(true);
 assert.equal(document.body.classList.contains("app-active"),true);
 assert.equal(document.getElementById("app-nav").classList.contains("hidden"),false);
 layout.syncDaySummary(8,30);
 assert.equal(document.getElementById("bill-days-count").textContent,"8 residents · 30 day period");
 layout.syncHistory(2,1);
 assert.equal(document.getElementById("history-count").textContent,"3 periods");
 assert.equal(document.getElementById("bill-history-current").classList.contains("hidden"),false);
 assert.equal(document.getElementById("bill-history-legacy").classList.contains("hidden"),false);
 assert.equal(document.getElementById("bill-history-empty").classList.contains("hidden"),true);
 layout.syncHistory(0,0);
 assert.equal(document.getElementById("bill-history-empty").classList.contains("hidden"),false);
 layout.setSignedIn(false);
 assert.equal(document.body.classList.contains("app-active"),false);
 assert.equal(document.getElementById("app-nav").classList.contains("hidden"),true);
 delete globalThis.document;
});

test("member account hides owner-only navigation, without duplicating day controls",()=>{
 const {document,editor}=setup();
 const layout=installDashboardLayout({t:k=>k});
 layout.setSignedIn(true);layout.setApartment(false);
 const member=document.querySelector(".app-nav-members");
 assert.equal(member.classList.contains("hidden"),true);
 assert.equal(editor.children.filter(x=>x.id==="bill-days-step").length,1);
 layout.retranslate();
 assert.equal(document.getElementById("history-title").textContent,"Payment history");
 delete globalThis.document;
});
