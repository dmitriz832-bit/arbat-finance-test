/* Visual column placement deliberately preserves row.cells / cellIndex contracts. */
(()=>{
 const prefix='arbat-table-layout-v1:',states=new WeakMap(),filters=new Map();let layouts={},frame=0,identity=window.abIdentity;
 const user=()=>String(identity?.user_id||identity?.id||identity?.email||'local');
 function load(){try{layouts=JSON.parse(localStorage.getItem(prefix+user())||'{}')}catch{layouts={}}if(!layouts||typeof layouts!=='object'||Array.isArray(layouts))layouts={}}
 function save(){try{localStorage.setItem(prefix+user(),JSON.stringify(layouts));return true}catch{return false}}
 load();
 const text=cell=>{const copy=cell.cloneNode(true);copy.querySelectorAll('.arbat-col-resizer,.arbat-sort-arrow,.tp-resizer,.tp-col-filter').forEach(n=>n.remove());return copy.textContent.trim()};
 function describe(table){
  // Calendar matrices and editable form grids have positional semantics, not journal columns.
  if(table.closest('form,#bankImportPreview,[data-table-settings="off"]')||table.querySelector('tbody input:not([type=checkbox]),tbody select,tbody textarea')||table.tHead?.rows.length!==1)return null;
  const headers=[...table.tHead.rows[0].cells];if(headers.length<2||headers.some(c=>c.colSpan!==1||c.rowSpan!==1))return null;
  if(table.querySelector('[rowspan]:not([rowspan="1"])')||table.closest('#calendarGrid,.calendar-grid,.calendar-matrix'))return null;
  const seen={};const columns=headers.map((cell,index)=>{const label=text(cell)||'Действия',count=seen[label]=(seen[label]||0)+1;return {id:label+'#'+count,label,index}});
  const host=table.closest('[id]');if(!host)return null;
  const ordinal=[...host.querySelectorAll('table')].indexOf(table);
  return {columns,key:host.id+':'+Math.max(0,ordinal)+':'+columns.map(c=>c.id).join('|')};
 }
 function config(state){const saved=layouts[state.key]||{},ids=state.columns.map(c=>c.id),order=[...new Set([...(Array.isArray(saved.order)?saved.order:[]).filter(id=>ids.includes(id)),...ids])],hidden=new Set((Array.isArray(saved.hidden)?saved.hidden:[]).filter(id=>ids.includes(id)));if(hidden.size===ids.length)hidden.delete(order[0]);return {order,hidden}}
 const selectionWidth=44;
 const selectionCell=cell=>!!cell?.querySelector('input[type=checkbox]')&&!text(cell);
 // Selection is identified by content, never by source or visual column position.
 function compactSelection(table){
  const headers=[...(table.tHead?.rows[0]?.cells||[])],selected=new Set(headers.filter(cell=>cell.colSpan===1&&selectionCell(cell)).map(cell=>cell.cellIndex));
  for(const row of table.rows)for(const cell of row.cells){
   const isSelection=cell.colSpan===1&&selected.has(cell.cellIndex)&&(selectionCell(cell)||!text(cell));cell.classList.toggle('tp-selection',isSelection);
   if(isSelection)for(const input of cell.querySelectorAll('input[type=checkbox]'))if(!input.closest('.tp-selection-hit')){const label=document.createElement('label');label.className='tp-selection-hit';input.before(label);label.append(input)}
  }
  table.classList.toggle('tp-has-selection',!!selected.size);
  const cols=[...(table.querySelector(':scope > colgroup')?.children||[])];
  cols.forEach((col,index)=>{col.classList.toggle('tp-selection-col',selected.has(index));if(selected.has(index))col.style.width=selectionWidth+'px'});
  // The native resizer's stored total can still include the former large selector.
  // Keep every substantive col width; only remove that obsolete selection space.
  if(selected.size&&cols.length&&cols.every(col=>parseFloat(col.style.width)>0))table.style.setProperty('--arbat-table-width',cols.reduce((sum,col)=>sum+parseFloat(col.style.width),0)+'px');
  return selected;
 }
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 function width(table,column){const money=/сумм|стоим|цен|остаток|долг|оплач|прибыл|выруч|затрат|начисл|ндс|оборот|сальдо|баланс|марж/i.test(column.label),base=/дата|период/i.test(column.label)?125:money?170:155;
  if(!money)return base;
  context.font='600 14px Arial';return Math.ceil(Math.max(base,...[...table.rows].slice(0,150).map(row=>context.measureText(row.cells[column.index]?.textContent.trim()||'').width+40)));
 }
 function apply(table,state){
  const selected=compactSelection(table),{order,hidden}=config(state),visible=order.filter(id=>!hidden.has(id)),byId=new Map(state.columns.map(c=>[c.id,c])),isSelection=id=>selected.has(byId.get(id).index),widths=visible.map(id=>isSelection(id)?selectionWidth:Math.max(width(table,byId.get(id)),Number(layouts[state.key]?.widths?.[id])||0));
  table.style.setProperty('--tp-columns',widths.map((w,i)=>isSelection(visible[i])||layouts[state.key]?.widths?.[visible[i]]?`${w}px`:`minmax(${w}px,1fr)`).join(' '));table.style.setProperty('--tp-min-width',widths.reduce((a,b)=>a+b,0)+'px');
  table.classList.add('tp-table');table.setAttribute('role','table');
  for(const row of table.rows){row.setAttribute('role','row');for(const cell of row.cells){
   if(cell.colSpan>1){cell.classList.add('tp-span');continue}
   const column=state.columns[cell.cellIndex];if(!column)continue;
   const isHidden=hidden.has(column.id);cell.classList.toggle('tp-hidden',isHidden);cell.style.order=String(order.indexOf(column.id));cell.dataset.tpLabel=column.label;
   cell.setAttribute('role',cell.tagName==='TH'?'columnheader':'cell');if(isHidden)cell.removeAttribute('aria-colindex');else cell.setAttribute('aria-colindex',String(visible.indexOf(column.id)+1));
  }}
  table.setAttribute('aria-colcount',String(visible.length));
  for(const column of state.columns){const th=table.tHead.rows[0].cells[column.index];if(selected.has(column.index)){th.querySelector('.tp-resizer')?.remove();continue}if(th.querySelector('.tp-resizer'))continue;const handle=document.createElement('span');handle.className='tp-resizer';handle.title='Потяните для изменения ширины; двойное нажатие — сбросить';th.append(handle);
   handle.onclick=event=>event.stopPropagation();handle.ondblclick=event=>{event.stopPropagation();if(layouts[state.key]?.widths)delete layouts[state.key].widths[column.id];save();apply(table,state)};
   handle.onpointerdown=event=>{event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);const start=event.clientX,initial=th.getBoundingClientRect().width;const move=e=>{const current=config(state);layouts[state.key]={...layouts[state.key],order:current.order,hidden:[...current.hidden],widths:{...layouts[state.key]?.widths,[column.id]:Math.max(width(table,column),initial+e.clientX-start)}};apply(table,state)};const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);save()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end)};
  }
  // Presentation helpers consume the real layout without reordering row.cells.
  table.dispatchEvent(new CustomEvent('arbat:table-layout',{bubbles:true,detail:{columns:state.columns.map(column=>({index:column.index,label:column.label,order:order.indexOf(column.id),hidden:hidden.has(column.id),width:widths[visible.indexOf(column.id)]||0,sized:selected.has(column.index)||!!layouts[state.key]?.widths?.[column.id]}))}}));
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
 // Filtering is presentation only: never splice/reorder rows, change row.hidden, or
 // rebuild source cells. Existing index-based editors and page filters keep ownership.
 const funnel='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h18l-7 8v7l-4 2v-9z"/></svg>';
 const filterDialog=document.createElement('dialog');filterDialog.className='tp-filter-dialog';filterDialog.setAttribute('aria-labelledby','tp-filter-title');document.body.append(filterDialog);let filterActive=null,filterOpener=null;
 const criteria=state=>filters.get(state.key)||new Map();
 const dataRows=table=>[...table.tBodies].flatMap(body=>[...body.rows]).filter(row=>!row.querySelector('[colspan]'));
 const dateValue=value=>{let m=String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];m=String(value).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:null};
 const numberValue=value=>{const s=String(value).trim().replace(/[\s\u00a0\u202f]/g,'').replace('−','-').replace(',','.');return /^[-+]?\d+(?:\.\d+)?(?:₽|руб\.?|%|[а-яa-z²³./]+)?(?:\([^)]*\))?$/.test(s)?Number(s.match(/^[-+]?\d+(?:\.\d+)?/)[0]):null};
 function kind(table,column){if(/дата|период|срок/i.test(column.label)&&dataRows(table).some(row=>dateValue(text(row.cells[column.index]||document.createElement('td')))))return 'date';if(/сумм|стоим|цен|остаток|долг|оплач|прибыл|выруч|затрат|начисл|ндс|оборот|сальдо|баланс|марж|колич|кол-во|резерв|свобод|^выдан|^нужно|^потреб|^выдать|^закуп|^доступ|план|^факт|бюджет|докуп|израсход|возвращ/i.test(column.label))return 'number';if(/статус|состояние|^тип|операция|организация|компания|направление|категория|^статья/i.test(column.label))return 'choice';return 'text'}
 function matches(value,criterion){if(criterion.kind==='text')return value.toLocaleLowerCase('ru').includes(criterion.value.toLocaleLowerCase('ru'));if(criterion.kind==='choice')return value===criterion.value;const v=criterion.kind==='date'?dateValue(value):numberValue(value);return v!==null&&(!criterion.from||v>=(criterion.kind==='date'?criterion.from:Number(criterion.from)))&&(!criterion.to||v<=(criterion.kind==='date'?criterion.to:Number(criterion.to)))}
 const criterionLabel=c=>c.kind==='text'||c.kind==='choice'?c.value:[c.from?'от '+c.from:'',c.to?'до '+c.to:''].filter(Boolean).join(' ');
 function applyFilters(table,state){
  const selected=criteria(state),rows=dataRows(table);for(const row of rows)row.classList.toggle('tp-filtered-out',[...selected].some(([id,c])=>{const column=state.columns.find(x=>x.id===id);return column&&!matches(text(row.cells[column.index]||document.createElement('td')),c)}));
  for(const body of table.tBodies){const heading=body.querySelector('.warehouse-project-heading');if(heading)heading.classList.toggle('tp-filtered-out',!!selected.size&&![...body.rows].some(row=>!row.querySelector('[colspan]')&&!row.classList.contains('tp-filtered-out')&&!row.hidden))}
  for(const row of table.rows)for(const cell of row.cells){const column=state.columns[cell.cellIndex];cell.classList.toggle('tp-filter-column',cell.colSpan===1&&!!column&&selected.has(column.id));}
  const status=state.filterStatus;if(!status)return;status.replaceChildren();status.hidden=!selected.size;if(!selected.size)return;
  const summary=document.createElement('strong');summary.textContent='Фильтры столбцов: '+selected.size+' · Показано '+rows.filter(row=>!row.classList.contains('tp-filtered-out')&&!row.hidden&&row.style.display!=='none').length+' из '+rows.length;status.append(summary);
  for(const [id,c] of selected){const column=state.columns.find(x=>x.id===id);if(!column)continue;const chip=document.createElement('button');chip.type='button';chip.className='tp-filter-chip';chip.textContent=column.label+': '+criterionLabel(c)+' ×';chip.setAttribute('aria-label','Убрать фильтр: '+column.label);chip.onclick=()=>{selected.delete(id);applyFilters(table,state)};status.append(chip)}
  const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить фильтры столбцов';reset.onclick=()=>{filters.delete(state.key);applyFilters(table,state)};status.append(reset);
  const note=document.createElement('small');note.textContent='Отбор меняет только видимые строки; суммы исходной таблицы не пересчитываются.';status.append(note)
 }
 function filterFields(table,state,column,container){
  container.replaceChildren();const type=kind(table,column),saved=criteria(state).get(column.id)||{};
  function field(label,type,value){const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=label;input.type=type;input.setAttribute('aria-label',label);input.value=value||'';if(type==='number')input.step='any';wrap.append(input);container.append(wrap);return input}
  if(type==='date'||type==='number'){field(type==='date'?'С даты':'От',type,saved.from).name='from';field(type==='date'?'По дату':'До',type,saved.to).name='to'}
  else if(type==='choice'){const label=document.createElement('label'),select=document.createElement('select');label.textContent='Значение';select.name='value';select.setAttribute('aria-label','Значение');select.append(new Option('Все значения',''));for(const value of [...new Set(dataRows(table).map(row=>text(row.cells[column.index]||document.createElement('td'))))].sort((a,b)=>a.localeCompare(b,'ru')))if(value)select.append(new Option(value,value));if(saved.value&&!Array.from(select.options).some(o=>o.value===saved.value))select.append(new Option(saved.value,saved.value));select.value=saved.value||'';label.append(select);container.append(label)}
  else field('Содержит','search',saved.value).name='value';
 }
 function openFilter(table,state,id,opener){
  filterOpener=opener;filterActive={table,state};filterDialog.replaceChildren();const title=document.createElement('h2');title.id='tp-filter-title';title.textContent='Фильтр столбца';const form=document.createElement('form'),label=document.createElement('label'),select=document.createElement('select'),fields=document.createElement('div');fields.className='tp-filter-fields';label.textContent='Столбец';select.setAttribute('aria-label','Столбец');for(const column of state.columns)if(!table.tHead.rows[0].cells[column.index].querySelector('input[type=checkbox]')&&column.label!=='Действия')select.append(new Option(column.label,column.id));select.value=id||select.options[0]?.value;label.append(select);form.append(label,fields);const render=()=>{const column=state.columns.find(x=>x.id===select.value);if(column)filterFields(table,state,column,fields)};select.onchange=render;render();
  form.addEventListener('input',event=>event.target.setCustomValidity?.(''));const actions=document.createElement('div');actions.className='tp-actions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';cancel.onclick=()=>filterDialog.close();const applyButton=document.createElement('button');applyButton.type='submit';applyButton.textContent='Применить фильтр';actions.append(cancel,applyButton);form.append(actions);form.onsubmit=event=>{event.preventDefault();const column=state.columns.find(x=>x.id===select.value),type=kind(table,column),value=fields.querySelector('[name=value]')?.value.trim()||'',from=fields.querySelector('[name=from]')?.value||'',to=fields.querySelector('[name=to]')?.value||'';fields.querySelector('[name=to]')?.setCustomValidity('');if(from&&to&&(type==='date'?from>to:Number(from)>Number(to))){const end=fields.querySelector('[name=to]');end.setCustomValidity('Конец диапазона должен быть не раньше начала');end.reportValidity();return}const current=criteria(state);if(value||from||to)current.set(column.id,{kind:type,value,from,to});else current.delete(column.id);filters.set(state.key,current);applyFilters(table,state);filterDialog.close()};filterDialog.append(title,form);filterDialog.showModal();
 }
 filterDialog.addEventListener('close',()=>{filterOpener?.isConnected&&filterOpener.focus();filterActive=null});
 function enhance(){frame=0;for(const table of document.querySelectorAll('main table,#ab-profile-window table')){
  let state=states.get(table);if(!state){state=describe(table);if(!state){compactSelection(table);continue}states.set(table,state);
   let viewport=table.parentElement;if(!viewport.matches('.scroll,.whtable,.ab-scroll,.tp-viewport')){const wrap=document.createElement('div');wrap.className='tp-viewport';table.before(wrap);wrap.append(table);viewport=wrap}viewport.classList.add('tp-viewport');
   viewport.previousElementSibling?.matches('.tp-toolbar')&&viewport.previousElementSibling.remove();
   const toolbar=document.createElement('div');toolbar.className='tp-toolbar';const button=document.createElement('button');button.type='button';button.className='tp-settings';button.textContent='⋯';button.setAttribute('aria-label','Настройка таблицы');button.setAttribute('aria-haspopup','dialog');button.onclick=()=>{opener=button;active={table,state};renderDialog();dialog.showModal()};const filterButton=document.createElement('button');filterButton.type='button';filterButton.className='tp-filters';filterButton.innerHTML=funnel+'<span>Фильтры столбцов</span>';filterButton.setAttribute('aria-haspopup','dialog');filterButton.onclick=()=>openFilter(table,state,null,filterButton);const status=document.createElement('div');status.className='tp-filter-status';status.setAttribute('role','status');status.hidden=true;toolbar.append(status,filterButton,button);viewport.before(toolbar);state.toolbar=toolbar;state.filterStatus=status;
  }apply(table,state);applyFilters(table,state);
 }}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(enhance)};
 // Only child mutations: our classes/styles never create an observer feedback loop.
 new MutationObserver(records=>{if(records.some(r=>!dialog.contains(r.target)&&!filterDialog.contains(r.target)&&!r.target.closest?.('.tp-toolbar')))schedule()}).observe(document.body,{childList:true,subtree:true});
 const externalFilterChanged=event=>{if(!event.target.closest('form,dialog,.ui-sheet,.modal-backdrop'))schedule()};document.addEventListener('input',externalFilterChanged);document.addEventListener('change',externalFilterChanged);
 window.addEventListener('arbat:identity',event=>{identity=event.detail||window.abIdentity;filters.clear();filterDialog.close();load();schedule()});schedule();
})();
