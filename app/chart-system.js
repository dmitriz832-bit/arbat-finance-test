/* Shared chart descriptions work with mouse, keyboard and touch without parsing displayed money. */
(()=>{
 'use strict';
 let current=null,description='',tooltip=null;
 function hide(){
  if(current){if(description)current.setAttribute('aria-describedby',description);else current.removeAttribute('aria-describedby');current.removeAttribute('data-chart-active')}
  current=null;description='';if(tooltip)tooltip.hidden=true;
 }
 function show(target){
  const content=target?.dataset.chartTooltip;if(!content)return;
  if(current!==target){hide();current=target;description=target.getAttribute('aria-describedby')||''}
  if(!tooltip){tooltip=document.createElement('div');tooltip.id='ftChartTooltip';tooltip.className='ft-chart-tooltip';tooltip.setAttribute('role','tooltip');document.body.append(tooltip)}
  const lines=content.split('\n');tooltip.replaceChildren(...lines.map((line,index)=>{const node=document.createElement(index?'span':'strong');node.textContent=line;return node}));
  tooltip.hidden=false;target.setAttribute('data-chart-active','');target.setAttribute('aria-describedby',[description,tooltip.id].filter(Boolean).join(' '));
  const anchor=target.getBoundingClientRect(),box=tooltip.getBoundingClientRect(),margin=12;
  const left=Math.min(Math.max(margin,anchor.left+anchor.width/2-box.width/2),Math.max(margin,innerWidth-box.width-margin));
  const above=anchor.top-box.height-10,top=above>=margin?above:Math.min(innerHeight-box.height-margin,anchor.bottom+10);
  tooltip.style.left=left+'px';tooltip.style.top=Math.max(margin,top)+'px';
 }
 const item=target=>target instanceof Element?target.closest('[data-chart-tooltip]'):null;
 document.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const target=item(event.target);if(target)show(target)});
 document.addEventListener('pointerout',event=>{if(event.pointerType==='touch')return;if(current&&!current.contains(event.relatedTarget)&&document.activeElement!==current)hide()});
 document.addEventListener('pointerdown',event=>{const target=item(event.target);if(target)show(target);else hide()});
 document.addEventListener('focusin',event=>{const target=item(event.target);if(target)show(target);else hide()});
 document.addEventListener('focusout',event=>{if(current&&!current.contains(event.relatedTarget))hide()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&current)hide()});
 window.addEventListener('scroll',()=>{if(current&&(document.activeElement===current||current.matches(':hover')))show(current);else hide()},true);window.addEventListener('resize',hide);
 // A finance rerender can replace the focused chart while its tooltip is open.
 new MutationObserver(()=>{if(current&&!current.isConnected)hide()}).observe(document.body,{childList:true,subtree:true});
})();
