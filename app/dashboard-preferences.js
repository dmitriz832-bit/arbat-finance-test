/* Personal presentation only: never changes financial records or cloud state. */
(()=>{
 'use strict';
 const key=()=> 'arbat-wallet-order-v1:'+String(window.abIdentity?.user_id||window.abIdentity?.email||'local');
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(value)?value:[]}catch{return []}};
 window.arbatOrderedWallets=rows=>{const order=read(),rank=id=>{const i=order.indexOf(String(id));return i<0?order.length:i};return [...rows].sort((a,b)=>rank(a.walletId)-rank(b.walletId))};
 const dialog=document.createElement('dialog');dialog.className='ux-preferences-dialog';dialog.setAttribute('aria-labelledby','walletOrderTitle');
 dialog.innerHTML='<h2 id="walletOrderTitle">Порядок счетов и касс</h2><p>Настройка сохраняется для вас в этом браузере. Новые счета добавляются в конец списка.</p><div class="wallet-order-list"></div><footer><button type="button" data-order-cancel>Отмена</button><button type="button" class="primary" data-order-save>Сохранить порядок</button></footer>';
 document.body.append(dialog);let draft=[];
 function draw(){const list=dialog.querySelector('.wallet-order-list');list.replaceChildren();draft.forEach((wallet,i)=>{const row=document.createElement('div'),label=document.createElement('span');label.textContent=wallet.name+' · '+wallet.org;row.append(label);for(const [step,text] of [[-1,'Выше'],[1,'Ниже']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',text+': '+wallet.name);b.disabled=i+step<0||i+step>=draft.length;b.onclick=()=>{[draft[i],draft[i+step]]=[draft[i+step],draft[i]];draw();list.children[i+step].querySelector(step<0?'button':'button:last-child').focus()};row.append(b)}list.append(row)})}
 document.addEventListener('click',e=>{if(!e.target.closest('[data-wallet-order]'))return;draft=window.arbatOrderedWallets((db.wallets||[]).map(w=>({...w,walletId:w.id})));draw();dialog.showModal()});
 dialog.querySelector('[data-order-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-order-save]').onclick=()=>{try{localStorage.setItem(key(),JSON.stringify(draft.map(w=>String(w.walletId))))}catch{alert('Не удалось сохранить порядок в браузере.');return}dialog.close();window.arbatRenderDashboard()};
 window.addEventListener('arbat:identity',()=>window.arbatRenderDashboard?.());
 // Pack natural-height panels; avoid large empty grid tracks when neighbours differ in height.
 const grid=document.querySelector('.dashboard-layout');if(!grid)return;
 const panels=[...grid.children];let scheduled=false;
 function pack(){scheduled=false;const narrow=innerWidth<=1100;for(const panel of panels){if(!panel.getClientRects().length)continue;const span=Math.ceil((panel.getBoundingClientRect().height+16)/24);panel.style.gridRowEnd=narrow?'auto':'span '+span}grid.classList.toggle('is-packed',!narrow)}
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(pack)}};
 const observer=new ResizeObserver(schedule);panels.forEach(p=>observer.observe(p));window.addEventListener('resize',schedule);window.arbatRenderDashboard?.();schedule();
})();
