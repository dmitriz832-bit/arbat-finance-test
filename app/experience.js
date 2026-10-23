/* Approved interaction contract, using the original record editors and save handlers. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),model=window.ArbatExperience,core=window.ArbatFinanceCore;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rub=x=>Number(core.rubles(x)).toLocaleString('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2});
 const today=()=>model.iso(new Date()),org=()=>$('orgFilter').value;
 document.body.classList.add('ux-app');
 // Protect edits in legacy cards as well as the shared creation sheet.
 const dirtyModals=new Map(),modalSelector='.modal-backdrop,.whdialog';
 const formValues=node=>JSON.stringify([...node.querySelectorAll('input,select,textarea')].filter(x=>x.name&&x.type!=='file').map(x=>[x.name,x.value,x.checked]));
 const trackModal=node=>{if(!node.matches(modalSelector))return;const active=node.classList.contains('open');if(active){dirtyModals.set(node,{initial:formValues(node),focus:document.activeElement})}else dirtyModals.delete(node)};
 const modalChanges=new MutationObserver(records=>{for(const record of records)trackModal(record.target)});
 for(const node of document.querySelectorAll(modalSelector)){modalChanges.observe(node,{attributes:true,attributeFilter:['class']});trackModal(node)}
 function guardClose(event){
  if(event.type==='keydown'&&(event.key!=='Escape'||document.querySelector('.smart-combobox-list[data-open="1"]')))return;
  const node=[...dirtyModals.keys()].filter(x=>x.getClientRects().length).sort((a,b)=>(+getComputedStyle(a).zIndex||0)-(+getComputedStyle(b).zIndex||0)).at(-1);if(!node)return;
  if(event.type==='click'&&event.target!==node&&!event.target.closest('#closeDealModal,#cancelDealEdit,#genericCancel,#genericClose,#calendarModalCancel,#calendarModalClose,#walletEditCancel,#walletModalClose,#workEditCancel,#workEditClose,#batchCancel,#batchClose,#allocCancel,#allocClose,#whCancel'))return;
  if(formValues(node)!==dirtyModals.get(node).initial&&!confirm('Закрыть карточку без сохранения изменений?')){event.preventDefault();event.stopImmediatePropagation()}
 }
 window.addEventListener('click',guardClose,true);window.addEventListener('keydown',guardClose,true);
 const overview=$('overview'),visuals=$('dashboardVisuals');if(!visuals)return;
 const period=$('ownerPeriodMode').closest('.card');period.classList.add('ux-period');period.querySelector('h2').textContent='Период финансового результата';visuals.prepend(period);
 const note=document.createElement('p');note.className='ux-help';note.textContent='Применяется к финансовому результату и его расшифровкам. Прогноз календаря — от сегодняшней даты; налоги имеют свой квартал.';period.querySelector('h2').after(note);
 const controls=document.createElement('div');controls.className='ux-period-actions';controls.innerHTML='<button type="button" data-ux-period-step="-1" aria-label="Предыдущий период">←</button><button type="button" data-ux-period-step="1" aria-label="Следующий период">→</button><button type="button" data-ux-period-current>Текущий</button><span id="uxPeriodError" role="alert"></span>';period.append(controls);
 const periodDialog=document.createElement('dialog');periodDialog.className='ux-preferences-dialog';periodDialog.setAttribute('aria-labelledby','uxPeriodDialogTitle');
 const periodTitle=period.querySelector('h2');periodTitle.id='uxPeriodDialogTitle';
 const periodBar=document.createElement('div');periodBar.className='ux-period-bar';
 const periodTrigger=document.createElement('button');periodTrigger.type='button';periodTrigger.id='uxPeriodTrigger';periodTrigger.setAttribute('aria-haspopup','dialog');
 const periodDone=document.createElement('button');periodDone.type='button';periodDone.className='primary';periodDone.textContent='Готово';periodDone.onclick=()=>periodDialog.close();
 period.before(periodBar);periodBar.append(periodTrigger,controls);document.body.append(periodDialog);periodDialog.append(period,periodDone);
 periodTrigger.onclick=()=>periodDialog.showModal();periodDialog.addEventListener('click',e=>{if(e.target===periodDialog){const r=periodDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)periodDialog.close()}});
 const periodIds=['ownerPeriodMode','ownerPeriodReference','ownerPeriodFrom','ownerPeriodTo'];let good=periodIds.map(id=>$(id).value);
 try{const saved=JSON.parse(sessionStorage.getItem('arbat-financial-period')||'null');if(saved&&saved.length===4){core.ownerPeriodBounds(...saved);periodIds.forEach((id,i)=>$(id).value=saved[i]);good=saved}}catch{}
 function updatePeriod(){
  const values=periodIds.map(id=>$(id).value);try{core.ownerPeriodBounds(...values)}catch{$('uxPeriodError').textContent='Укажите корректный период: дата начала не позже даты окончания.';return false}
  good=values;periodTrigger.textContent='Период: '+core.ownerPeriodBounds(...values).label+' ▾';$('uxPeriodError').textContent='';try{sessionStorage.setItem('arbat-financial-period',JSON.stringify(values))}catch{}
  const range=values[0]==='range',all=values[0]==='all';$('ownerPeriodReference').closest('label').hidden=range||all;for(const id of ['ownerPeriodFrom','ownerPeriodTo'])$(id).closest('label').hidden=!range;
  controls.querySelectorAll('[data-ux-period-step]').forEach(b=>b.disabled=range||all);window.render();return true;
 }
 for(const id of periodIds)$(id).onchange=updatePeriod;
 controls.addEventListener('click',e=>{const step=e.target.closest('[data-ux-period-step]');if(step)$('ownerPeriodReference').value=model.shiftPeriod(good[1],good[0],Number(step.dataset.uxPeriodStep));else if(e.target.closest('[data-ux-period-current]')){$('ownerPeriodReference').value=today();$('ownerPeriodFrom').value=today().slice(0,7)+'-01';$('ownerPeriodTo').value=today()}else return;updatePeriod()});
 const taxPanel=$('dashboardTaxes').closest('article'),taxControl=document.createElement('div');taxControl.className='ux-tax-controls';taxControl.innerHTML='<label>Квартал по дате<input type="date" id="uxTaxReference" aria-label="Квартал налогового расчёта"></label><button type="button" data-tax-step="-1" aria-label="Предыдущий налоговый квартал">←</button><button type="button" data-tax-step="1" aria-label="Следующий налоговый квартал">→</button><span class="ux-help">Отдельно от периода финансового результата. Обе организации.</span><button type="button" class="ux-text-link" data-ux-tax>Документы и правила расчёта →</button>';taxPanel.querySelector('.dashboard-panel-head').after(taxControl);$('uxTaxReference').value=today();
 try{const v=sessionStorage.getItem('arbat-tax-reference');if(v){core.ownerPeriodBounds('quarter',v);$('uxTaxReference').value=v}}catch{}
 const taxChange=()=>{if(!$('uxTaxReference').value)return;try{sessionStorage.setItem('arbat-tax-reference',$('uxTaxReference').value)}catch{}window.arbatRenderDashboard();refreshDetail()};$('uxTaxReference').onchange=taxChange;taxControl.addEventListener('click',e=>{const b=e.target.closest('[data-tax-step]');if(b){$('uxTaxReference').value=model.shiftPeriod($('uxTaxReference').value,'quarter',+b.dataset.taxStep);taxChange()}});
 const flowNote=document.createElement('p');flowNote.className='ux-help';flowNote.textContent='Фактическое движение денег за последние 6 месяцев, включая текущий. Переводы между своими счетами не увеличивают доходы и расходы.';$('dashboardCashFlow').before(flowNote);
 const spendAction=document.createElement('button');spendAction.type='button';spendAction.className='ux-text-link';spendAction.dataset.uxMetric='expenses';spendAction.textContent='Открыть расходы выбранного периода →';$('dashboardSpending').after(spendAction);
 const detail=document.createElement('article');detail.id='uxDetail';detail.className='ux-detail';detail.hidden=true;detail.innerHTML='<button type="button" id="uxDetailBack">← Назад</button><h2 id="uxDetailTitle" tabindex="-1"></h2><p id="uxDetailScope" class="ux-help"></p><div id="uxDetailBody"></div>';overview.append(detail);
 let detailState=null,origin=null;
 const route=()=>sessionStorage.getItem('arbat-last-route')||document.querySelector('main > section.active')?.id||'overview';
 function showDetail(kind,value,trigger){if(!detailState){origin={route:route(),scroll:window.scrollY,trigger:trigger||document.activeElement};if(origin.route!=='overview')window.arbatNavigate('overview')}detailState={kind,value};visuals.hidden=true;detail.hidden=false;refreshDetail();$('uxDetailTitle').focus({preventScroll:true});window.scrollTo(0,0)}
 $('uxDetailBack').onclick=()=>{const saved=origin;detailState=null;origin=null;detail.hidden=true;visuals.hidden=false;if(saved?.route&&saved.route!=='overview')window.arbatNavigate(saved.route);requestAnimationFrame(()=>{window.scrollTo(0,saved?.scroll||0);saved?.trigger?.isConnected&&saved.trigger.focus({preventScroll:true})})};
 const sourceButton=row=>row.collection&&row.id?'<button type="button" class="ux-text-link" data-ux-source="'+esc(row.collection)+'" data-ux-id="'+esc(row.id)+'">'+esc(row.source?.document||row.source?.name||row.label||'Открыть документ')+'</button>':'<strong>'+esc(row.label||'Расчётная строка')+'</strong>';
 function sourceRows(rows){return rows.length?'<div class="ux-source-list">'+rows.map(row=>'<div class="ux-source-row"><div>'+sourceButton(row)+'<small>'+esc([row.date,row.label,row.source?.org].filter(Boolean).join(' · '))+'</small><p>'+esc(row.explanation||row.source?.note||row.source?.payee||'')+'</p></div><strong class="'+(row.amount<0n?'dashboard-negative':'')+'">'+rub(row.amount)+'</strong></div>').join('')+'</div>':'<div class="ux-empty">За выбранный период записей нет. Измените период или добавьте документ в соответствующем разделе.</div>'}
 function refreshDetail(){
  if(!detailState)return;const data=window.arbatDashboardSnapshot(),{kind,value}=detailState;let title='',scope='',body='';
  if(kind==='metric'){
   title=({revenue:'Реализации без НДС',direct:'Признанные прямые затраты',production:'Общепроизводственные расходы',gross:'Валовый результат',ebitda:'EBITDA',result:'Управленческий результат',expenses:'Расходы по документам',cash:'Чистый денежный поток'})[value];
   const rows=model.financialRows(data.financial,value,core),total=rows.reduce((v,x)=>v+x.amount,0n);scope=data.bounds.label+' · '+(data.org||'Весь бизнес');
   body='<div class="ux-detail-summary"><strong>'+rub(total)+'</strong><p>Источник: документы выбранного периода. В результате расходы показаны со знаком минус, доходы — плюс. Корректировка НЗП выделена отдельно.</p></div>'+sourceRows(rows);
  }else if(kind==='report'){
   const {label,column,year,reportKind,organization}=value;
   const cell=reportData({year,kind:reportKind,org:organization}).rows.find(row=>row[0].trim()===label)?.[column];
   // reportData already formats currency/percent cells; do not parse presentation text as money.
   const displayed=cell==null?'Статья больше не содержит операций':String(cell);
   const month=column<=12?String(column).padStart(2,'0'):null,bounds=core.ownerPeriodBounds(month?'month':'year',year+'-'+(month||'01')+'-01');
   let warehouse={};try{warehouse=JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{}
   const input={...db,warehouse,fifo:window.arbatFifo?.(warehouse),wipAccounting:true},snapshot=core.ownerPeriodSnapshot(input,bounds,organization);
   title=label.trim();scope=bounds.label+' · '+(organization||'Весь бизнес');let rows,explanation='';
   if(reportKind==='cash'){
    let type=value.cashType,records=snapshot.cash.rows;
    if(label.includes('Технические переводы'))records=records.filter(x=>x.type==='transfer');
    else{records=records.filter(x=>x.type!=='transfer');if(type)records=records.filter(x=>x.type===type);if(value.articleName)records=records.filter(x=>(db.articles.find(a=>a.id===x.articleId)?.name||'Не классифицировано')===value.articleName)}
    rows=records.map(source=>({source,collection:'cash',id:source._id,date:source.date,label:source.type==='in'?'Поступление':source.type==='out'?'Платёж':'Перевод',amount:core.cents(source.amount||0)*(label==='ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК'&&source.type==='out'?-1n:1n)}));explanation='ДДС отражает платежи с НДС. Переводы между своими счетами не входят в чистый поток.';
   }else{
    rows=model.reportRows(snapshot,label,core);
    if(label.startsWith('↳ Реализация:')){const dir=label.split('Реализация:')[1].trim();rows=model.financialRows(snapshot,'revenue',core).filter(x=>db.deals.some(d=>d.dir===dir&&window.arbatDealKey(d)===x.source.projectKey))}
    if(!rows){rows=model.financialRows(snapshot,'result',core);explanation='Расчётный показатель. Ниже исходные документы периода для проверки, а не простая сумма данной строки. Сверка использует распределение по направлениям; проценты — отношение соответствующих итогов. Корректировка НЗП показана отдельной строкой.'}
   }
   body='<div class="ux-detail-summary"><strong>'+esc(displayed)+'</strong><p>Значение выбранной ячейки отчёта · '+esc(scope)+'</p></div><p class="ux-explanation">'+esc(explanation||'Состав показателя по данным финансового ядра. Нажмите документ для просмотра и изменения.')+'</p>'+sourceRows(rows);
  }else if(kind==='plan'){
   const p=data.forecast,isDue=(x,n)=>x.days!==null&&x.days<n;
   const rows=value==='income'?p.incomeRows.filter(x=>x.days!==null&&x.days>=0&&x.days<7):value==='overdue'?p.rows.filter(x=>x.days!==null&&x.days<0):value==='month'?p.rows.filter(x=>isDue(x,30)):value==='forecast'?[...p.incomeRows.filter(x=>x.days!==null&&x.days>=0&&x.days<7),...p.rows.filter(x=>isDue(x,7))]:p.rows.filter(x=>isDue(x,7));
   title=({income:'Поступления на 7 дней',outcome:'Платежи на 7 дней',forecast:'Остаток после планов',month:'Платежи на 30 дней',overdue:'Срок оплаты прошёл'})[value];scope=(data.org||'Весь бизнес')+' · от '+p.today;
   body='<p class="ux-explanation">Источник: неоплаченные документы поставщиков с указанным сроком и самостоятельные планы календаря. Просроченные платежи включены в потребность в деньгах. Зарплатные и налоговые сроки автоматически не добавляются. План не подтверждает факт оплаты.</p>';
   body+='<div class="ux-detail-summary"><strong>Платежи за 30 дней: '+rub(p.obligations30)+'</strong><p>Без срока оплаты: '+rub(p.combined.undated)+' · записей на сверке: '+p.review.length+'</p>'+(!p.forecastComplete?'<p>Прогноз неполный. Уточните сроки и документы.</p>':'')+'</div>';
   if(value==='forecast')body+='<p>'+((p.forecastComplete&&data.quality.cashCertified)?'Расчётный остаток по внесённым планам: '+rub(data.liquidityCents+p.income.due7-p.obligations7):'Остаток после планов не определён: требуется уточнение сроков, документов или банковская сверка.')+'</p>';
   body+=sourceRows(rows.map(x=>({source:x.rule||{name:x.name,org:x.org},collection:x.source==='supplier'?'payables':'calendar',id:x.documentKey||x.calendarId,date:x.occurrence,label:x.source==='supplier'?'Документ поставщика':p.incomeRows.includes(x)?'План поступления':'План платежа',amount:x.amount*(value==='forecast'&&!p.incomeRows.includes(x)?-1n:1n)})))+'<button type="button" data-ux-payables>Уточнить сроки и оплаты поставщикам</button> <button type="button" data-ux-new-plan>Добавить самостоятельный план</button> <button type="button" data-ux-plan="month">Показать платежи на 30 дней</button>';
  }else if(kind==='wallets'){
   title='Деньги по счетам и кассам';scope='На текущий момент · '+(data.org||'Весь бизнес');body='<p class="ux-explanation">Начальные остатки + движения денег. Статус сверки показан на главной. Нажмите счёт для просмотра реквизитов и параметров.</p>'+sourceRows(data.wallets.map(w=>({source:{name:w.name,org:w.org},id:w.walletId,collection:'wallets',label:w.kind,amount:core.cents(w.balance)})));
  }else if(kind==='stock'){
   title='Остатки материалов';scope='По движениям FIFO · '+(data.org||'Все организации');body='<p class="ux-explanation">Остатки по местам хранения. Неоценённые материалы не подменяются нулевой стоимостью.</p><div class="ux-source-list">'+data.stock.rows.map(x=>'<div class="ux-source-row"><div><strong>'+esc(x.name||x.itemName||x.itemId)+'</strong><small>'+esc(x.placeName||x.placeId)+' · '+esc(x.qty)+' '+esc(x.unit||'')+'</small></div><strong>'+(x.value===null?'Требует оценки':rub(x.value))+'</strong></div>').join('')+'</div><button type="button" data-ux-route="materials:catalog">Открыть остатки и номенклатуру →</button>';
  }else if(kind==='tax'){
   title='Источники налогового расчёта';scope=data.taxes.bounds.label+' · Обе организации';const bounds=data.taxes.bounds,within=x=>(x.date||x.dt||'')>=bounds.from&&(x.date||x.dt||'')<=bounds.to;
   const rows=[];for(const collection of ['cash','realizations','expenses','costs','labor'])for(const source of db[collection]||[]){if(!within(source))continue;if(collection==='cash'?(source.org!=='АИР-КЛИМАТ'||source.type==='transfer'):source.org!=='АРБАТ.ГК')continue;rows.push({collection,source,id:source._id||source.id,date:source.date||source.dt,label:({cash:'ДДС — источник УСН',realizations:'Реализация',expenses:'Расход проекта',costs:'Общий расход',labor:'Начисление'})[collection],amount:core.cents(source.amount||0)})}
   body='<p class="ux-explanation">Показаны исходные документы для проверки, их суммы не складываются в налог напрямую. УСН: классифицированные поступления и расходы АИР-КЛИМАТ. НДС: реализации и расходы АРБАТ.ГК с подтверждённой ставкой и признаком вычета. Прибыль: налоговые доходы, допустимые расходы и начисления. Исключения задаются в документах. Расчёт предварительный, до зачёта авансов.</p>'+sourceRows(rows);
  }
  $('uxDetailTitle').textContent=title;$('uxDetailScope').textContent=scope;$('uxDetailBody').innerHTML=body;
 }
 function openSource(collection,id){
  if(collection==='payables')return window.arbatOpenPayables?.(id);
  if(collection==='calendar')return editCalendar(id);
  if(collection==='wallets')return showWallet(id);
  if(collection==='workActs')return openWorkEdit('act',id);
  if(['realizations','expenses','cash','materials','labor','costs','people'].includes(collection))return openRecord(collection,id);
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-ux-payables],[data-ux-metric],[data-ux-plan],[data-ux-source],[data-ux-project],[data-ux-projects],[data-ux-wallets],[data-ux-stock],[data-ux-tax],[data-ux-new-plan],[data-ux-route]');if(!b)return;
  if(b.hasAttribute('data-ux-payables'))window.arbatOpenPayables?.();
  else if(b.hasAttribute('data-ux-source'))openSource(b.dataset.uxSource,b.dataset.uxId);
  else if(b.hasAttribute('data-ux-project'))showDealModal(b.dataset.uxProject);
  else if(b.hasAttribute('data-ux-projects'))window.arbatNavigate('deals');
  else if(b.hasAttribute('data-ux-new-plan'))window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'calendarForm'}}));
  else if(b.hasAttribute('data-ux-route'))window.arbatNavigate(b.dataset.uxRoute);
  else if(b.hasAttribute('data-ux-wallets'))showDetail('wallets','',b);
  else if(b.hasAttribute('data-ux-stock'))showDetail('stock','',b);
  else if(b.hasAttribute('data-ux-tax'))showDetail('tax','',b);
  else if(b.hasAttribute('data-ux-plan'))showDetail('plan',b.dataset.uxPlan,b);
  else showDetail('metric',b.dataset.uxMetric,b);
 });
 // Journals: visible column labels and an explicit opening action, without replacing existing handlers.
 const tableHosts=['dealsTable','realTable','expensesTable','cashTable','costTable','laborTable','workActsList','workBatchList','materialsTable','personTable','counterpartyTable','walletsTable','articlesTable','whMovements','whBalances','whItems','whPlaces'];
 function enhanceRows(host){for(const table of host.querySelectorAll('table')){const headers=[...(table.tHead?.rows[0]?.cells||[])].map(x=>x.textContent.trim());table.classList.add('ux-register-table');for(const row of table.tBodies[0]?.rows||[]){if(row.querySelector('[colspan]'))continue;[...row.cells].forEach((cell,i)=>{if(cell.dataset.label!==headers[i])cell.dataset.label=headers[i]||''});if(row.dataset.uxOpen)return;const editor=row.querySelector('button[data-edit]');if(!editor)continue;const cell=[...row.cells].find(c=>!c.querySelector('button,input,select,a')&&c.textContent.trim());if(!cell)continue;const link=document.createElement('button');link.type='button';link.className='ux-text-link';link.textContent=cell.textContent;cell.replaceChildren(link);link.onclick=e=>{e.stopPropagation();editor.click()};row.dataset.uxOpen='1'}}}
 for(const id of tableHosts){const host=$(id);if(host){enhanceRows(host);new MutationObserver(()=>enhanceRows(host)).observe(host,{childList:true,subtree:true})}}
 // Report context is explicit; the same source drilldown uses the selected dashboard period.
 const reports=$('reports'),reportTools=document.createElement('div');reportTools.className='ux-report-sources';reportTools.innerHTML='<strong>От суммы — к документам</strong><p>Нажмите значение в таблице: откроются источники за этот месяц или год. Возврат сохранит параметры отчёта.</p>';reports.prepend(reportTools);
 const reportTable=$('reportTable');
 const mobilePeriod=document.createElement('div');mobilePeriod.className='ux-report-period';
 mobilePeriod.innerHTML='<label for="uxReportMonth">Период отчёта</label><div><button type="button" data-report-month-step="-1" aria-label="Предыдущий месяц">←</button><select id="uxReportMonth" aria-label="Месяц или итог года">'+['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь','Итого за год'].map((name,i)=>'<option value="'+(i+1)+'">'+name+'</option>').join('')+'</select><button type="button" data-report-month-step="1" aria-label="Следующий месяц">→</button></div><p>Суммы в рублях. Нажмите сумму, чтобы открыть документы выбранного периода.</p>';
 reportTable.before(mobilePeriod);const monthSelect=$('uxReportMonth');monthSelect.value=String(new Date().getMonth()+1);
 function reportPeriod(){
  const column=Number(monthSelect.value);for(const row of reportTable.querySelectorAll('tr')){[...row.cells].forEach((cell,i)=>cell.classList.toggle('ux-report-selected',i===0||i===column));row.classList.toggle('ux-report-total',/^(ПОСТУПЛЕНИЯ|ВЫБЫТИЯ|ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК|ВЫРУЧКА|ВАЛОВАЯ ПРИБЫЛЬ|EBITDA|ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ|ИТОГОВЫЙ)/.test(row.cells[0]?.textContent.trim()||''))}
  mobilePeriod.querySelector('[data-report-month-step="-1"]').disabled=column===1;mobilePeriod.querySelector('[data-report-month-step="1"]').disabled=column===13;
 }
 monthSelect.addEventListener('change',reportPeriod);mobilePeriod.addEventListener('click',e=>{const b=e.target.closest('[data-report-month-step]');if(!b)return;monthSelect.value=String(Number(monthSelect.value)+Number(b.dataset.reportMonthStep));monthSelect.dispatchEvent(new Event('change',{bubbles:true}))});
 new MutationObserver(reportPeriod).observe(reportTable,{childList:true,subtree:true});reportPeriod();
 function reportLinks(){if(!reportTable)return;let cashType='';for(const row of reportTable.querySelectorAll('tbody tr')){const label=row.cells[0]?.textContent.trim();if(!label)continue;if(label==='ПОСТУПЛЕНИЯ')cashType='in';else if(label==='ВЫБЫТИЯ')cashType='out';else if(!label.startsWith('↳'))cashType='';for(let i=1;i<row.cells.length;i++){const cell=row.cells[i];if(cell.querySelector('[data-ux-report-cell]'))continue;const b=document.createElement('button');b.type='button';b.className='ux-text-link';b.dataset.uxReportCell=String(i);b.textContent=cell.textContent;const state={label,column:i,year:$('reportYear').value,reportKind:$('reportType').value,organization:org(),displayed:cell.textContent,cashType,articleName:label.startsWith('↳')?label.slice(1).trim():''};b.onclick=()=>showDetail('report',state,b);cell.replaceChildren(b)}}}
 if(reportTable){new MutationObserver(reportLinks).observe(reportTable,{childList:true,subtree:true});reportLinks()}
 const original=window.render;window.render=function(){const values=periodIds.map(id=>$(id).value);try{core.ownerPeriodBounds(...values)}catch{periodIds.forEach((id,i)=>$(id).value=good[i])}const result=original.apply(this,arguments);refreshDetail();return result};
 const routeScroll=new Map(),navigate=window.arbatNavigate;
 window.arbatNavigate=function(next){next=({reports:'reports:pnl',expenses:'expenses:project',costs:'expenses:general',materials:'materials:catalog'})[next]||next;const previous=route();routeScroll.set(previous,window.scrollY);if(detailState&&next!=='overview'){detailState=null;detail.hidden=true;visuals.hidden=false}const result=navigate.call(this,next);requestAnimationFrame(()=>window.scrollTo(0,routeScroll.get(next)||0));return result};
 window.addEventListener('arbat-warehouse-changed',()=>requestAnimationFrame(refreshDetail));
 window.addEventListener('arbat:cloud-update',()=>requestAnimationFrame(refreshDetail));
 updatePeriod();
})();
