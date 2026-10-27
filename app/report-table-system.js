/* Matrix presentation only: retain source cells, listeners and saved column identities. */
(()=>{
 const layouts=new WeakMap(),positions=new WeakMap(),pending=new Set(),mobile=matchMedia('(max-width:700px)');let frame=0;
 const articleLabel=/^(?:статья(?:\s|$)|наименование(?:\s|$)|показатель(?:\s|$)|категория(?:\s|$)|материал(?:\s|$)|номенклатура(?:\s|$)|сотрудник(?:\s|$)|направление(?:\s|$)|проект(?:\s|$))/i;
 const measureLabel=/январ|феврал|март|апрел|май|июн|июл|август|сентябр|октябр|ноябр|декабр|итого|план|факт|остаток|выруч|прибыл|расход|затрат|результат|колич|выдан|израсход|возвращ|отклон|доступ|докуп|сумм|начисл|оплач|долг|марж|бюджет|себестоим|^\d{4}(?:[-.]\d{2})?$|^q[1-4]$|квартал/i;
 const text=cell=>cell.dataset.tpLabel||cell.textContent.trim();
 const selection=cell=>!!cell.querySelector('input[type="checkbox"]')&&!cell.textContent.trim();
 const context=document.createElement('canvas').getContext('2d');
 function contentWidths(table){
  const widths=new Map();
  for(const row of table.rows){let index=0;for(const cell of row.cells){
   if(cell.colSpan===1&&!selection(cell)){
    const content=cell.querySelector('.ux-text-link,[data-ux-report-cell]')||cell,style=getComputedStyle(content),box=getComputedStyle(cell),value=content.textContent.trim();
    context.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing=parseFloat(style.letterSpacing)||0,padding=(parseFloat(box.paddingLeft)||0)+(parseFloat(box.paddingRight)||0);
    const width=Math.ceil(Math.max(0,...value.split(/\r?\n/).map(line=>context.measureText(line).width+Math.max(0,line.length-1)*spacing))+padding+6);
    widths.set(index,Math.max(widths.get(index)||0,width));
   }
   index+=cell.colSpan;
  }}
  return widths;
 }
 function describe(table){
  if(table.closest('form,#bankImportPreview,#calendarGrid,.calendar-grid,.calendar-matrix,[data-report-matrix="off"]')||table.querySelector('tbody input:not([type="checkbox"]),tbody select,tbody textarea'))return null;
  const headers=[...(table.tHead?.rows||[])].find(row=>[...row.cells].some(cell=>articleLabel.test(text(cell))||cell.matches('[data-report-column="article"],[data-column="article"],[data-column-key="article"]')));
  if(!headers)return null;
  let index=0,article=-1;const columns=[...headers.cells].map(cell=>{const column={cell,index,label:text(cell)};if(!selection(cell)&&(cell.matches('[data-report-column="article"],[data-column="article"],[data-column-key="article"]')||article<0&&articleLabel.test(column.label)))article=index;index+=cell.colSpan;return column});
  const explicit=table.matches('[data-report-matrix],.report-matrix')||table.closest('#reportTable,[data-report-matrix],.report-matrix');
  if(article<0||!explicit&&columns.filter(column=>measureLabel.test(column.label)).length<2)return null;
  return {columns,article,count:index};
 }
 function viewportFor(table){
  let viewport=table.parentElement;
  if(!viewport.matches('.scroll,.whtable,.ab-scroll,.tp-viewport,.rt-viewport,#reportTable')){viewport=document.createElement('div');viewport.className='rt-viewport';table.before(viewport);viewport.append(table)}
  viewport.classList.add('rt-viewport');
  if(!positions.has(viewport)){
   const position={table,left:viewport.scrollLeft,top:viewport.scrollTop};positions.set(viewport,position);
   viewport.addEventListener('scroll',()=>{if(position.table.isConnected&&position.table.parentElement===viewport){position.left=viewport.scrollLeft;position.top=viewport.scrollTop}},{passive:true});
  }
  return viewport;
 }
 function enhance(table){
  if(!table.isConnected)return;const info=describe(table);if(!info)return;
  const viewport=viewportFor(table),saved=layouts.get(table)||[],visible=[];
  table.classList.add('rt-table');
  const minimums=contentWidths(table);
  // Label visibility follows table preferences. A hidden label never promotes a checkbox.
  for(const column of info.columns){
   const layout=saved.find(item=>item.index===column.index),hidden=layout?layout.hidden:column.cell.hidden||column.cell.classList.contains('tp-hidden');
   if(hidden)continue;
   const article=column.index===info.article;
   let width=selection(column.cell)?44:layout?.sized?layout.width:article?280:Math.max(150,layout?.width||0,minimums.get(column.index)||0);
   if(article&&mobile.matches)width=Math.min(width,Math.max(138,Math.min(180,viewport.clientWidth*.48)));
   visible.push({index:column.index,order:layout?.order??(Number(column.cell.style.order)||column.index),width,sized:selection(column.cell)||!!layout?.sized});
  }
  visible.sort((a,b)=>a.order-b.order);
  // The project-expense summary is a full-width register. Share spare room among
  // automatic tracks while keeping any width explicitly saved by the user exact.
  const stretch=!!table.closest('#expenseSummary');
  table.style.setProperty('--rt-columns',visible.map(column=>stretch&&!column.sized?`minmax(${column.width}px,1fr)`:`${column.width}px`).join(' '));
  table.style.setProperty('--rt-min-width',visible.reduce((sum,column)=>sum+column.width,0)+'px');
  const articleVisible=visible.some(column=>column.index===info.article);
  for(const row of table.rows){let index=0;for(const cell of row.cells){
   cell.classList.toggle('rt-label',articleVisible&&index===info.article&&cell.colSpan===1);
   cell.classList.toggle('rt-selection',selection(cell));
   cell.classList.toggle('rt-value',index!==info.article&&!selection(cell)&&cell.colSpan===1);
   if(index===info.article)cell.style.setProperty('--rt-label-width',(visible.find(column=>column.index===info.article)?.width||0)+'px');
   index+=cell.colSpan;
  }}
  // Native multi-row tables use per-row offsets; preference grids have one header row.
  let top=0;for(const row of table.tHead?.rows||[]){for(const cell of row.cells)cell.style.setProperty('--rt-header-top',top+'px');top+=row.getBoundingClientRect().height}
  viewport.previousElementSibling?.matches('.ux-report-period')&&viewport.previousElementSibling.classList.add('rt-obsolete-period');
  const period=viewport.parentElement.querySelector(':scope > .ux-report-period');if(period)period.classList.add('rt-obsolete-period');
  const position=positions.get(viewport);
  if(position.table!==table){position.table=table;viewport.scrollLeft=position.left;viewport.scrollTop=position.top}
 }
 function flush(){frame=0;const tables=[...pending];pending.clear();tables.forEach(enhance)}
 function queue(table){if(table?.tagName!=='TABLE')return;pending.add(table);if(!frame)frame=requestAnimationFrame(flush)}
 function scan(node){if(node.nodeType!==1)return;if(node.matches('table'))queue(node);node.querySelectorAll('table').forEach(queue)}
 document.addEventListener('arbat:table-layout',event=>{layouts.set(event.target,event.detail.columns);queue(event.target)});
 new MutationObserver(records=>{for(const record of records){const table=record.target.closest?.('table');if(table)queue(table);for(const node of record.addedNodes)scan(node)}}).observe(document.body,{childList:true,subtree:true});
 const resize=()=>document.querySelectorAll('table.rt-table').forEach(queue);window.addEventListener('resize',resize);mobile.addEventListener('change',resize);document.fonts?.addEventListener('loadingdone',resize);
 scan(document.body);
})();
