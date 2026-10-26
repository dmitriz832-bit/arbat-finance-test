/* Shared Fintablo dialogs. Financial actions explicitly await confirmation. */
(()=>{
 'use strict';
 if(window.ArbatPopup)return;
 const queue=[];let active=null,sequence=0,approvedAction=false,region=null;const toastStates=new WeakMap();
 const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
 const restore=node=>{if(node?.isConnected&&!node.disabled)node.focus?.({preventScroll:true})};
 function request(kind,message,options={}){
  return new Promise(resolve=>{
   const focused=document.activeElement,origin=active?.dialog.contains(focused)?active.origin:focused;
   queue.push({kind,message:String(message??''),options,origin,resolve});showNext();
  });
 }
 function showNext(){
  if(active||!queue.length)return;
  if(!document.body){document.addEventListener('DOMContentLoaded',showNext,{once:true});return}
  const item=queue.shift(),options=item.options,dialog=element('dialog','ft-confirm-dialog'+(item.kind==='prompt'?' ft-prompt-dialog':''));
  active={...item,dialog};const current=active,id='ft-popup-'+(++sequence);
  dialog.setAttribute('aria-labelledby',id+'-title');dialog.setAttribute('aria-describedby',id+'-message');
  const header=element('header','ft-popup-header'),title=element('h2','ft-popup-title',options.title||(item.kind==='prompt'?'Введите значение':'Подтверждение'));
  title.id=id+'-title';const close=element('button','ft-popup-close','×');close.type='button';close.setAttribute('aria-label','Закрыть');close.dataset.popupAction='close';header.append(title,close);
  const message=element('p','ft-popup-message',item.message);message.id=id+'-message';dialog.append(header,message);
  let input=null;
  if(item.kind==='prompt'){
   const label=element('label','ft-popup-label',options.inputLabel||'Значение');input=element('textarea','ft-popup-input');input.value=String(options.value??'');input.rows=options.multiline?6:2;input.id=id+'-input';label.htmlFor=input.id;label.append(input);dialog.append(label);
  }
  const actions=element('footer','ft-popup-actions'),cancel=element('button','ft-popup-cancel secondary',options.cancelLabel||'Отмена'),accept=element('button','ft-popup-confirm primary'+(options.danger?' danger':''),options.confirmLabel||(item.kind==='prompt'?'Продолжить':'Подтвердить'));
  cancel.type=accept.type='button';cancel.dataset.popupAction='cancel';accept.dataset.popupAction='confirm';actions.append(cancel,accept);dialog.append(actions);
  function finish(value){
   if(active!==current)return;
   active=null;if(dialog.open)dialog.close();dialog.remove();item.resolve(value);
   if(queue.length)showNext();else restore(item.origin);
  }
  close.onclick=cancel.onclick=()=>finish(item.kind==='prompt'?null:false);accept.onclick=()=>finish(item.kind==='prompt'?input.value:true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(item.kind==='prompt'?null:false)});
  dialog.addEventListener('close',()=>finish(item.kind==='prompt'?null:false));
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)finish(item.kind==='prompt'?null:false)});
  current.finish=finish;document.body.append(dialog);dialog.showModal();(input||cancel).focus({preventScroll:true});if(input)input.select();
 }
 // This listener runs before legacy card shortcuts, so Escape closes only the top popup.
 window.addEventListener('keydown',event=>{
  if(!active)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();active.finish(active.kind==='prompt'?null:false);return}
  if(event.key==='Tab'){
   const nodes=[...active.dialog.querySelectorAll('button,textarea,input,select,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0),first=nodes[0],last=nodes.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  }
 },true);
 function placeToast(){
  if(!region||!document.body)return;
  const focused=document.activeElement?.closest('dialog[open]'),owner=(active?.dialog.open?active.dialog:null)||focused||[...document.querySelectorAll('dialog[open]')].filter(dialog=>dialog.matches(':modal')).at(-1)||(!document.body.classList.contains('ab-ready')&&document.getElementById('ab-auth'))||document.body;
  if(region.parentElement!==owner){const shown=region.hasAttribute('popover')&&region.matches(':popover-open');if(shown)region.hidePopover();owner.append(region);if(region.children.length&&region.hasAttribute('popover'))region.showPopover();}
 }
 document.addEventListener('close',placeToast,true);
 document.addEventListener('focusin',()=>{if(region?.children.length)placeToast()});
 const observeToasts=()=>new MutationObserver(records=>{if(region?.children.length&&records.some(record=>record.type==='attributes'||record.removedNodes.length))placeToast()}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
 if(document.body)observeToasts();else document.addEventListener('DOMContentLoaded',observeToasts,{once:true});
 function toast(message,options={}){
  if(!document.body){document.addEventListener('DOMContentLoaded',()=>toast(message,options),{once:true});return}
  if(!region){region=element('section','ft-toast-region');region.setAttribute('aria-label','Уведомления');if(typeof region.showPopover==='function')region.setAttribute('popover','manual');document.body.append(region)}
  placeToast();const ownerRegion=region,text=String(message??''),kind=String(options.kind||'');
  const repeated=[...region.children].find(node=>{const state=toastStates.get(node);return state?.text===text&&state?.kind===kind});
  if(repeated){toastStates.get(repeated).refresh(options);if(region.hasAttribute('popover')&&!region.matches(':popover-open'))region.showPopover();return}
  const node=element('article','ft-toast'+(options.kind?' ft-toast-'+options.kind:''));node.setAttribute('role',options.kind==='error'?'alert':'status');
  const content=element('div','ft-toast-message',String(message??'')),close=element('button','ft-toast-close','×');close.type='button';close.setAttribute('aria-label','Закрыть уведомление');node.append(content,close);region.append(node);
  if(region.hasAttribute('popover')&&!region.matches(':popover-open'))region.showPopover();
  let timeout=null;const remove=()=>{clearTimeout(timeout);node.remove();if(!ownerRegion.children.length&&ownerRegion.hasAttribute('popover')&&ownerRegion.matches(':popover-open'))ownerRegion.hidePopover()};close.onclick=remove;
  let duration=options.duration===0?0:Number(options.duration)||7500;
  const refresh=next=>{clearTimeout(timeout);if(next?.duration!==undefined)duration=next.duration===0?0:Number(next.duration)||7500;if(duration&&!node.contains(document.activeElement))timeout=setTimeout(remove,duration)};
  toastStates.set(node,{text,kind,refresh});refresh();
  node.addEventListener('mouseenter',()=>clearTimeout(timeout));node.addEventListener('focusin',()=>clearTimeout(timeout));node.addEventListener('mouseleave',()=>{if(duration&&!node.contains(document.activeElement)){clearTimeout(timeout);timeout=setTimeout(remove,duration)}});node.addEventListener('focusout',()=>{if(duration){clearTimeout(timeout);timeout=setTimeout(remove,duration)}});
  // Messages are never hidden by a rapid burst: keep the latest five visible.
  while(region.children.length>5)region.firstElementChild.remove();
 }
 window.ArbatPopup={
  confirm:(message,options)=>approvedAction?Promise.resolve(true):request('confirm',message,options),
  prompt:(message,value='',options={})=>request('prompt',message,{...options,value}),
  toast,
  alert(message){toast(message)},
  // The deletion guard already confirmed this exact action and captured its backup.
  // Approval applies only to calls made during synchronous dispatch, never other tasks.
  runConfirmedAction(action){const previous=approvedAction;approvedAction=true;try{return action()}finally{approvedAction=previous}}
 };
 // alert has no result to await. confirm and prompt are never monkey-patched.
 window.alert=message=>{toast(message)};
})();
