/* Visual column placement deliberately preserves row.cells / cellIndex contracts. */
(()=>{
 const prefix='arbat-table-layout-v1:',states=new WeakMap();let layouts={},frame=0,identity=window.abIdentity;
 const user=()=>String(identity?.user_id||identity?.id||identity?.email||'local');
 function load(){try{layouts=JSON.parse(localStorage.getItem(prefix+user())||'{}')}catch{layouts={}}if(!layouts||typeof layouts!=='object'||Array.isArray(layouts))layouts={}}
 function save(){try{localStorage.setItem(prefix+user(),JSON.stringify(layouts));return true}catch{return false}}
 load();
 const text=cell=>{const copy=cell.cloneNode(true);copy.querySelectorAll('.arbat-col-resizer,.arbat-sort-arrow,.tp-resizer').forEach(n=>n.remove());return copy.textContent.trim()};
 function describe(table){
  // Calendar matrices and editable form grids have positional semantics, not journal columns.
  if(table.closest('form,#bankImportPreview,[data-table-settings="off"]')||table.tHead?.rows.length!==1)return null;
  const headers=[...table.tHead.rows[0].cells];if(headers.length<2||headers.some(c=>c.colSpan!==1||c.rowSpan!==1))return null;
  if(table.querySelector('[rowspan]:not([rowspan="1"])')||table.closest('#calendarGrid,.calendar-grid,.calendar-matrix'))return null;
  const seen={};const columns=headers.map((cell,index)=>{const label=text(cell)||'Действия',count=seen[label]=(seen[label]||0)+1;return {id:label+'#'+count,label,index}});
  const host=table.closest('[id]');if(!host)return null;
  const ordinal=[...host.querySelectorAll('table')].indexOf(table);
  return {columns,key:host.id+':'+Math.max(0,ordinal)+':'+columns.map(c=>c.id).join('|')};
 }
 function config(state){const saved=layouts[state.key]||{},ids=state.columns.map(c=>c.id),order=[...new Set([...(Array.isArray(saved.order)?saved.order:[]).filter(id=>ids.includes(id)),...ids])],hidden=new Set((Array.isArray(saved.hidden)?saved.hidden:[]).filter(id=>ids.includes(id)));if(hidden.size===ids.length)hidden.delete(order[0]);return {order,hidden}}
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 function width(table,column){const money=/сумм|стоим|цен|остаток|долг|оплач|прибыл|выруч|затрат|начисл|ндс|оборот|сальдо|баланс|марж/i.test(column.label),base=/дата|период/i.test(column.label)?125:money?170:155;
  if(!money)return base;
  context.font='600 14px Arial';return Math.ceil(Math.max(base,...[...table.rows].slice(0,150).map(row=>context.measureText(row.cells[column.index]?.textContent.trim()||'').width+40)));
 }
 function apply(table,state){
  const {order,hidden}=config(state),visible=order.filter(id=>!hidden.has(id)),byId=new Map(state.columns.map(c=>[c.id,c])),widths=visible.map(id=>Math.max(width(table,byId.get(id)),Number(layouts[state.key]?.widths?.[id])||0));
  table.style.setProperty('--tp-columns',widths.map((w,i)=>layouts[state.key]?.widths?.[visible[i]]?`${w}px`:`minmax(${w}px,1fr)`).join(' '));table.style.setProperty('--tp-min-width',widths.reduce((a,b)=>a+b,0)+'px');
  table.classList.add('tp-table');table.setAttribute('role','table');
  for(const row of table.rows){row.setAttribute('role','row');for(const cell of row.cells){
   if(cell.colSpan>1){cell.classList.add('tp-span');continue}
   const column=state.columns[cell.cellIndex];if(!column)continue;
   const isHidden=hidden.has(column.id);cell.classList.toggle('tp-hidden',isHidden);cell.style.order=String(order.indexOf(column.id));cell.dataset.tpLabel=column.label;
   cell.setAttribute('role',cell.tagName==='TH'?'columnheader':'cell');if(isHidden)cell.removeAttribute('aria-colindex');else cell.setAttribute('aria-colindex',String(visible.indexOf(column.id)+1));
  }}
  table.setAttribute('aria-colcount',String(visible.length));
  for(const column of state.columns){const th=table.tHead.rows[0].cells[column.index];if(th.querySelector('.tp-resizer'))continue;const handle=document.createElement('span');handle.className='tp-resizer';handle.title='Потяните для изменения ширины; двойное нажатие — сбросить';th.append(handle);
   handle.onclick=event=>event.stopPropagation();handle.ondblclick=event=>{event.stopPropagation();if(layouts[state.key]?.widths)delete layouts[state.key].widths[column.id];save();apply(table,state)};
   handle.onpointerdown=event=>{event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);const start=event.clientX,initial=th.getBoundingClientRect().width;const move=e=>{const current=config(state);layouts[state.key]={...layouts[state.key],order:current.order,hidden:[...current.hidden],widths:{...layouts[state.key]?.widths,[column.id]:Math.max(width(table,column),initial+e.clientX-start)}};apply(table,state)};const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);save()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end)};
  }
 }
 const dialog=document.createElement('dialog');dialog.className='tp-dialog';dialog.setAttribute('aria-labelledby','tp-title');document.body.append(dialog);let active=null,opener=null;
 function renderDialog(focusId,action){
  if(!active)return;const {table,state}=active,{order,hidden}=config(state);
  dialog.replaceChildren();const heading=document.createElement('h2');heading.id='tp-title';heading.textContent='Настройка таблицы';const note=document.createElement('p');note.textContent='Выберите столбцы и их порядок. Настройки сохраняются для вас в этом браузере.';dialog.append(heading,note);
  const list=document.createElement('ul');list.className='tp-columns';
  order.forEach((id,i)=>{const column=state.columns.find(c=>c.id===id),row=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=!hidden.has(id);check.disabled=check.checked&&hidden.size===order.length-1;check.dataset.tpId=id;check.dataset.tpAction='visibility';label.append(check,document.createTextNode(column.label));row.append(label);
   check.onchange=()=>{check.checked?hidden.delete(id):hidden.add(id);update(order,hidden,id,'visibility')};
   for(const [delta,symbol,name] of [[-1,'↑','Выше'],[1,'↓','Ниже']]){const button=document.createElement('button');button.type='button';button.textContent=symbol;button.setAttribute('aria-label',name+': '+column.label);button.disabled=i+delta<0||i+delta>=order.length;button.dataset.tpId=id;button.dataset.tpAction=String(delta);button.onclick=()=>{[order[i],order[i+delta]]=[order[i+delta],order[i]];update(order,hidden,id,String(delta))};row.append(button)}list.append(row)
  });dialog.append(list);
  const actions=document.createElement('div');actions.className='tp-actions';const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить';reset.onclick=()=>{delete layouts[state.key];save();apply(table,state);renderDialog()};const close=document.createElement('button');close.type='button';close.textContent='Готово';close.onclick=()=>dialog.close();actions.append(reset,close);dialog.append(actions);
  if(focusId)[...dialog.querySelectorAll('[data-tp-id]')].find(el=>el.dataset.tpId===focusId&&el.dataset.tpAction===action&&!el.disabled)?.focus();
 }
 function update(order,hidden,id,action){layouts[active.state.key]={...layouts[active.state.key],order,hidden:[...hidden]};const persisted=save();apply(active.table,active.state);renderDialog(id,action);if(!persisted){const error=document.createElement('p');error.setAttribute('role','status');error.textContent='Настройки применены. Браузер не разрешил сохранить их после закрытия.';dialog.append(error)}}
 dialog.addEventListener('close',()=>{opener?.focus();active=null});
 function enhance(){frame=0;for(const table of document.querySelectorAll('main table,#ab-profile-window table')){
  let state=states.get(table);if(!state){state=describe(table);if(!state)continue;states.set(table,state);
   let viewport=table.parentElement;if(!viewport.matches('.scroll,.whtable,.ab-scroll,.tp-viewport')){const wrap=document.createElement('div');wrap.className='tp-viewport';table.before(wrap);wrap.append(table);viewport=wrap}viewport.classList.add('tp-viewport');
   viewport.previousElementSibling?.matches('.tp-toolbar')&&viewport.previousElementSibling.remove();
   const toolbar=document.createElement('div');toolbar.className='tp-toolbar';const button=document.createElement('button');button.type='button';button.className='tp-settings';button.textContent='⋯ Настройка таблицы';button.setAttribute('aria-haspopup','dialog');button.onclick=()=>{opener=button;active={table,state};renderDialog();dialog.showModal()};toolbar.append(button);viewport.before(toolbar);state.toolbar=toolbar;
  }apply(table,state);
 }}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(enhance)};
 // Only child mutations: our classes/styles never create an observer feedback loop.
 new MutationObserver(records=>{if(records.some(r=>!dialog.contains(r.target)&&!r.target.closest?.('.tp-toolbar')))schedule()}).observe(document.body,{childList:true,subtree:true});
 window.addEventListener('arbat:identity',event=>{identity=event.detail||window.abIdentity;load();schedule()});schedule();
})();
