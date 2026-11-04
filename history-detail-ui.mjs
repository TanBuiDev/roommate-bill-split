/* A single, accessible payment-detail dialog shared by legacy and monthly history. */
let dialog=null;
let menuDismissInstalled=false;

function createDialog(){
 const root=document.createElement("dialog");
 root.id="payment-history-dialog";
 root.className="history-detail-dialog";
 root.setAttribute("aria-labelledby","payment-history-dialog-title");
 const container=document.createElement("div");
 container.className="history-detail-dialog-inner";
 const header=document.createElement("div");
 header.className="history-detail-dialog-head";
 const title=document.createElement("h3");
 title.id="payment-history-dialog-title";
 const close=document.createElement("button");
 close.type="button";close.className="mini";close.id="payment-history-dialog-close";
 close.addEventListener("click",()=>root.close());
 header.append(title,close);
 const content=document.createElement("div");
 content.id="payment-history-dialog-content";
 content.className="history-detail-dialog-content";
 container.append(header,content);
 root.append(container);document.body.append(root);
 return root;
}
export function closeHistoryDetail(){
 if(dialog?.open)dialog.close();
}
export function openHistoryDetail(title,content,closeLabel="Close"){
 dialog ||=createDialog();
 if(dialog.open)dialog.close();
 document.getElementById("payment-history-dialog-title").textContent=title;
 const button=document.getElementById("payment-history-dialog-close");
 button.textContent=closeLabel;
 button.setAttribute("aria-label",closeLabel);
 document.getElementById("payment-history-dialog-content").replaceChildren(content);
 dialog.showModal();
 button.focus();
}
export function historyMenu(items,label="More options"){
 const menu=document.createElement("details");
 menu.className="history-more";
 const summary=document.createElement("summary");
 summary.className="mini";
 summary.setAttribute("aria-label",label);
 summary.title=label;
 summary.textContent="⋯";
 menu.append(summary);
 const options=document.createElement("div");
 options.className="history-more-content";
 for(const item of items){
  if(!item)continue;
  const button=document.createElement("button");
  button.type="button";
  button.className="history-menu-item"+(item.destructive?" history-menu-danger":"");
  button.textContent=item.label;
  button.disabled=Boolean(item.disabled);
  button.addEventListener("click",()=>{menu.open=false;item.onClick()});
  options.append(button);
 }
 menu.append(options);
 menu.addEventListener("keydown",e=>{if(e.key==="Escape"){menu.open=false;summary.focus();e.stopPropagation()}});
 if(!menuDismissInstalled){
  document.addEventListener("click",event=>{
   for(const active of document.querySelectorAll(".history-more[open]")){
    if(!active.contains(event.target))active.open=false;
   }
  });
  menuDismissInstalled=true;
 }
 return menu;
}
