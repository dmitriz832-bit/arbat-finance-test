/* Shared document presentation; existing forms retain their accounting handlers. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 document.body.classList.add('ui-modern');
 const header=document.querySelector('body > header');const measure=()=>document.documentElement.style.setProperty('--ab-header-height',header.getBoundingClientRect().height+'px');new ResizeObserver(measure).observe(header);measure();
 const title=$('title'),org=$('orgFilter').closest('label');
 const heading=document.createElement('div');heading.className='ui-page-heading';title.before(heading);heading.append(title,org);
 const sheet=document.createElement('div');sheet.className='ui-sheet-overlay';sheet.hidden=true;
 sheet.innerHTML='<div class="ui-sheet" role="dialog" aria-modal="true" aria-labelledby="ui-sheet-title" tabindex="-1"><header class="ui-sheet-header"><h2 id="ui-sheet-title"></h2><button type="button" class="ui-sheet-close" data-sheet-close aria-label="Закрыть">×</button></header><div class="ui-sheet-body"></div><footer class="ui-sheet-footer"><button type="button" data-sheet-cancel>Отмена</button><button type="button" class="primary" data-sheet-save>Сохранить</button></footer><div class="ui-discard" hidden><p>Закрыть без сохранения изменений?</p><button type="button" data-sheet-stay>Продолжить ввод</button><button type="button" class="danger" data-sheet-discard>Не сохранять</button></div></div>';
 document.body.append(sheet);
 const sheetBody=sheet.querySelector('.ui-sheet-body'),save=sheet.querySelector('[data-sheet-save]'),discard=sheet.querySelector('.ui-discard');let active=null;
 const values=form=>form?[...form.elements].filter(e=>e.name||e.id).map(e=>[e.name||e.id,e.type,e.checked,e.multiple?[...e.selectedOptions].map(o=>o.value):e.value]):[];
 const restore=(form,snapshot)=>{const assign=()=>{for(const [name,type,checked,value] of snapshot){const el=form.elements.namedItem(name)||$(name);if(!el)continue;if(type==='checkbox'||type==='radio')el.checked=checked;else if(el.multiple){for(const option of el.options)option.selected=value.includes(option.value)}else if(type!=='file')el.value=value;}};assign();for(const el of form.querySelectorAll('select'))el.dispatchEvent(new Event('change',{bubbles:true}));assign();};
 function close(rollback=false){if(!active)return;const state=active;active=null;if(rollback&&state.form)restore(state.form,state.snapshot);state.anchor.replaceWith(state.node);state.node.classList.remove('ui-sheet-content');state.node.classList.add('ui-form-source');sheet.hidden=true;discard.hidden=true;document.body.classList.remove('ui-sheet-open');state.trigger?.focus({preventScroll:true});}
 function cancel(){if(!active)return;if(active.form&&JSON.stringify(values(active.form))!==JSON.stringify(active.snapshot)){discard.hidden=false;sheet.querySelector('[data-sheet-stay]').focus();}else close(true);}
 sheet.querySelector('[data-sheet-cancel]').onclick=cancel;
 sheet.querySelector('[data-sheet-close]').onclick=cancel;
 sheet.querySelector('[data-sheet-stay]').onclick=()=>{discard.hidden=true;sheet.querySelector('[data-sheet-cancel]').focus()};
 sheet.querySelector('[data-sheet-discard]').onclick=()=>close(true);
 sheet.addEventListener('click',e=>{if(e.target===sheet)cancel()});
 function open(node,name,trigger,form=node.matches('form')?node:null){
  if(active)return;const date=form?.querySelector('input[type=date][name=date]');if(date&&!date.value){const now=new Date();date.value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}const anchor=document.createComment('document source');node.before(anchor);active={node,form,anchor,trigger,snapshot:values(form)};
  node.classList.remove('ui-form-source');node.classList.add('ui-sheet-content');sheetBody.append(node);
  $('ui-sheet-title').textContent=name;save.textContent=form?'Сохранить':'Готово';save.onclick=()=>{if(!active)return;if(!form){close();return}const submit=form.querySelector('button[type=submit],button:not([type])');form.requestSubmit(submit||undefined)};
  sheet.hidden=false;discard.hidden=true;document.body.classList.add('ui-sheet-open');sheetBody.scrollTop=0;
  const opened=active;requestAnimationFrame(()=>{if(active!==opened||sheet.hidden||sheet.contains(document.activeElement))return;sheet.querySelector('.ui-sheet').focus({preventScroll:true});});
 }
 const legacySelector='.modal-backdrop.open,.whdialog.open,.cw-overlay,.arbat-delete-alert,#ab-profile-overlay.open';
 const topLegacy=()=>[...document.querySelectorAll(legacySelector)].filter(n=>n.getClientRects().length).sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0)).at(-1);
 const focusable=root=>[...root.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.matches('.smart-combobox>select')&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
 function trap(e,root){const fields=focusable(root),first=fields[0],last=fields.at(-1);if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.querySelector('.smart-combobox-list[data-open="1"]'))return;
  const legacy=topLegacy();if(legacy){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const b=[...legacy.querySelectorAll('[id$=Cancel],[id$=Close],.modal-head button,#ab-profile-close,#appNoticeOk')].find(n=>n.getClientRects().length);b?.click();}else if(e.key==='Tab')trap(e,legacy);return;}
  if(!active)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return}
  if(e.key==='Tab')trap(e,sheet);
 },true);
 document.addEventListener('submit',e=>{if(!active||e.target!==active.form)return;const state=active,keys=['arbat-finance-demo-live','arbat-warehouse-v1'],before=keys.map(k=>localStorage.getItem(k));queueMicrotask(()=>{if(active===state&&before.some((v,i)=>v!==localStorage.getItem(keys[i])))close();});},true);
 function button(text,callback,primary=false){const b=document.createElement('button');b.type='button';b.textContent=text;if(primary)b.className='primary';b.onclick=callback;return b;}
 function toolbar(section,description){section.querySelectorAll(':scope > .hv-workspace-header,:scope > .hv-actionbar').forEach(n=>n.remove());const bar=document.createElement('div');bar.className='ui-page-toolbar';const note=document.createElement('p');note.textContent=description;bar.append(note);const actions=document.createElement('div');actions.className='ui-toolbar-actions';bar.append(actions);section.prepend(bar);return actions;}
 function prepareForm(id,name,actions,label,primary=true){
  const form=$(id);if(!form)return;const card=form.closest('.card');form.classList.add('ui-form-source');form.closest('details')?.classList.add('ui-source-details');form.dataset.uiDocument=name;
  for(const child of form.children){if(child.matches('button[type=submit],button:not([type])'))child.classList.add('ui-original-submit');if(child.tagName==='LABEL'&&!child.querySelector('input,select,textarea'))child.classList.add('ui-form-note');if(child.matches('label')&&child.querySelector('textarea'))child.classList.add('ui-field-wide');}
  const b=button(label||name,()=>open(form,name,b),primary);actions.append(b);
  const mixed=card&&[...card.children].some(n=>n!==form&&(n.querySelector('table,.scroll,.whtable')||n.matches('.scroll,.whtable')||n.id==='crewList'));if(card&&!mixed)card.classList.add('ui-source-card');return b;
 }
 const specs=[['cash','cashForm','Новая операция','Новая операция','Поступления, расходы и переводы между счетами.'],['deals','dealForm','Новая сделка','Новая сделка','Проекты, договоры и финансовый результат.'],['realizations','realizationForm','Новая реализация','Новая реализация','Акты и этапы выполненных работ.'],['expenses','expenseForm','Расход проекта','Добавить расход','Фактическая себестоимость по каждому проекту.'],['costs','costForm','Общий расход','Добавить расход','Расходы бизнеса вне отдельных проектов.'],['labor','laborForm','Начисление сотруднику','Добавить начисление','Начисления и история расчётов с сотрудниками.'],['calendar','calendarForm','Платёжное обязательство','Добавить обязательство','План обязательных платежей и прогноз денег.']];
 const documentTriggers=new Map();
 for(const [sectionId,formId,name,label,description] of specs){const section=$(sectionId);if(section)documentTriggers.set(formId,prepareForm(formId,name,toolbar(section,description),label));}
 window.addEventListener('arbat:open-document',event=>{const formId=event.detail?.formId,trigger=documentTriggers.get(formId),form=$(formId);if(!trigger||!form)return;const previous=active;trigger.click();const origin=event.detail?.trigger;if(active&&active!==previous&&active.form===form&&origin instanceof HTMLElement&&origin.isConnected)active.trigger=origin;queueMicrotask(()=>{if(active?.form!==form)return;for(const [name,value] of Object.entries(event.detail?.values||{})){const field=form.elements.namedItem(name);if(!field)continue;field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}))}active.snapshot=values(form)})});
 const importCard=$('bankCsvFile')?.closest('.card');if(importCard){importCard.classList.add('ui-form-source');const actions=$('cash').querySelector('.ui-toolbar-actions');const b=button('Импорт выписки',()=>open(importCard,'Импорт банковской выписки',b));actions.append(b);}
 document.querySelectorAll('.arbat-section-tabs[data-section]').forEach(n=>n.remove());document.querySelectorAll('#tabs .arbat-menu-caption').forEach(n=>n.remove());$('overview').querySelectorAll('.hv-hero,.hv-jumps').forEach(n=>n.remove());
 const cashTitle=$('cashTable')?.closest('.card')?.querySelector('h2');if(cashTitle)cashTitle.textContent='Журнал операций';
 if($('psClose'))$('psClose').textContent='Списать расход и вернуть остаток';if($('psTopup'))$('psTopup').textContent='Пополнить запас бригады';
 function segments(section,items,key){
  const bar=document.createElement('div');bar.className='ui-segments';bar.setAttribute('role','tablist');bar.setAttribute('aria-label',key);let selected=items[0][0];try{selected=sessionStorage.getItem('arbat-ui-'+key)||selected}catch{}
  const select=value=>{if(!items.some(x=>x[0]===value))value=items[0][0];for(const [v,label,nodes] of items)for(const n of nodes){n.classList.toggle('ui-pane-hidden',v!==value);n.setAttribute('role','tabpanel');n.id||='ui-pane-'+key+'-'+v;}for(const b of bar.children){const on=b.dataset.pane===value;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}try{sessionStorage.setItem('arbat-ui-'+key,value)}catch{}section.dataset.uiPane=value;};
  for(const [v,label] of items){const b=button(label,()=>select(v));b.dataset.pane=v;b.setAttribute('role','tab');bar.append(b);}
  bar.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const bs=[...bar.children],index=bs.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?bs.length-1:(index+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[next].click();bs[next].focus();});section.prepend(bar);select(selected);return bar;
 }
 const settings=$('settings'),work=$('work'),laborSection=$('labor');
 const cardFor=id=>$(id)?.closest('.card');
 const employeeCard=cardFor('personForm');
 if(employeeCard&&laborSection){employeeCard.classList.add('employee-directory-card');employeeCard.querySelector('h2').textContent='Справочник сотрудников';const laborToolbar=laborSection.querySelector(':scope > .ui-page-toolbar');if(laborToolbar)laborToolbar.after(employeeCard);else laborSection.prepend(employeeCard);const actions=document.createElement('div');actions.className='ui-card-actions';employeeCard.querySelector('h2').after(actions);prepareForm('personForm','Новый сотрудник',actions,'Добавить сотрудника');employeeCard.classList.remove('ui-source-card');}
 const settingGroups=[
  ['periods','Финансовые периоды',cardFor('periodCloseForm')],
  ['partners','Контрагенты',cardFor('counterpartyForm'),'counterpartyForm','Новый контрагент'],
  ['wallets','Счета и кассы',cardFor('walletForm'),'walletForm','Счёт или касса'],
  ['dds-articles','Статьи ДДС',$('articlesTable')?.closest('.card')],
  ['pnl-articles','Статьи ОПиУ',cardFor('pnlArticleForm'),'pnlArticleForm','Новая статья ОПиУ'],
  ['backups','Резервные копии',$('export')?.closest('.card')]
 ];
 for(const [, ,card,formId,name] of settingGroups){if(!card||!formId)continue;const actions=document.createElement('div');actions.className='ui-card-actions';card.querySelector('h2').after(actions);const trigger=prepareForm(formId,name,actions,'Добавить');if(trigger)documentTriggers.set(formId,trigger);card.classList.remove('ui-source-card');}
 segments(settings,settingGroups.map(g=>[g[0],g[1],[g[2]].filter(Boolean)]),'settings');
 const backupCard=$('export')?.closest('.card'),settingsNote=backupCard?.querySelector('p');if(settingsNote)settingsNote.textContent='Экспорт создаёт локальную резервную копию общей базы. Используйте её только для аварийного восстановления.';if(backupCard?.querySelector('h2'))backupCard.querySelector('h2').textContent='Резервные копии';
 const workCards=[...work.querySelectorAll(':scope > .card')];
 if(workCards.length>=4){const actionsFor=card=>{const a=document.createElement('div');a.className='ui-card-actions';card.querySelector('h2').after(a);return a};prepareForm('crewForm','Новая бригада',actionsFor(workCards[0]),'Создать бригаду');workCards[0].classList.remove('ui-source-card');const workActions=actionsFor(workCards[1]),batch=$('openBatch');if(batch){workActions.append(batch);batch.textContent='Создать ведомость';}prepareForm('workForm','Выполненная работа',workActions,'Добавить отдельную работу',false);workCards[1].classList.remove('ui-source-card');prepareForm('settlePayForm','Привязка выплаты к сотруднику',actionsFor(workCards[2]),'Привязать выплату',false);workCards[2].classList.remove('ui-source-card');segments(work,[['work','Ведомости',[workCards[1]]],['crews','Бригады',[workCards[0]]],['payroll','Расчёты',[workCards[2]]],['rates','Расценки',[workCards[3]]]],'work');$('workPriceList')?.classList.add('ui-bounded-list');}
 const crewMembers=$('crewMembers');if(crewMembers){const choices=document.createElement('div');choices.className='ui-choice-list';crewMembers.after(choices);crewMembers.classList.add('ui-native-multiple');crewMembers.required=false;const draw=()=>{choices.replaceChildren();for(const option of crewMembers.options){const row=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.checked=option.selected;text.textContent=option.textContent;input.onchange=()=>{option.selected=input.checked;crewMembers.dispatchEvent(new Event('change',{bubbles:true}));};row.append(input,text);choices.append(row);}if(!choices.children.length)choices.textContent='Сначала добавьте действующих сотрудников производственной категории.';};new MutationObserver(draw).observe(crewMembers,{childList:true});crewMembers.addEventListener('change',draw);crewMembers.form.addEventListener('reset',()=>queueMicrotask(draw));draw();const hint=crewMembers.parentElement.querySelector('small');if(hint)hint.textContent='Отметьте сотрудников, которые входят в бригаду.';}
 const warehouse=$('warehouseApp');let warehouseMode='';
 const planTable=$('psPlan');if(planTable){planTable.hidden=true;const heading=planTable.previousElementSibling;if(heading?.tagName==='H3')heading.hidden=true;}
 function warehouseViews(){
  if(!warehouse)return;const intro=$('arbatWarehouseIntro');if(!intro)return;const route=(()=>{try{return sessionStorage.getItem('arbat-last-route')||''}catch{return ''}})();if(!route.startsWith('materials:'))return;const mode=route.split(':')[1],cardFor=id=>$(id)?.closest('.card');
  const groups=mode==='movement'?[['project','Комплектация',[$('projectStock'),$('psReservationCard')]],['crew','Запасы бригад',[$('psReplenishment')]],['journal','Журнал движений',[cardFor('whMovements')]]]:mode==='catalog'?[['balances','Остатки',[cardFor('whBalances')]],['items','Номенклатура',[cardFor('whItems')]],['places','Места хранения',[cardFor('whPlaces')]]]:[['receipt','Поступления',[$('whImportPanel'),cardFor('whMovements')]]];
  warehouse.classList.add('ui-warehouse-ready');for(const card of warehouse.querySelectorAll(':scope > .card'))card.classList.remove('ui-warehouse-visible');intro.classList.add('ui-warehouse-visible','ui-warehouse-toolbar','ui-page-toolbar');const actions=intro.querySelector('.whbar');if(actions){actions.classList.add('ui-toolbar-actions');for(const b of intro.querySelectorAll(':scope > button'))actions.append(b);}intro.querySelector('h2')?.remove();for(const b of intro.querySelectorAll('button'))b.textContent=b.textContent.replace(/^\+\s*/, '');for(const [,label,nodes] of groups)for(const n of nodes.filter(Boolean))n.classList.add('ui-warehouse-visible');let tabs=warehouse.querySelector(':scope > .ui-segments');if(tabs&&warehouseMode!==mode){tabs.remove();tabs=null}if(!tabs&&groups.length>1)segments(warehouse,groups.map(([v,label,nodes])=>[v,label,nodes.filter(Boolean)]),'warehouse-'+mode);warehouseMode=mode;
 }
 const names={overview:'Обзор бизнеса',cash:'Движение денег',calendar:'Платёжный календарь',deals:'Сделки и проекты',expenses:'Расходы проектов',costs:'Общие расходы',realizations:'Реализации',work:'Производство',labor:'Сотрудники',settings:'Настройки'};
 function sync(){const section=document.querySelector('main > section.active');if(!section)return;let route='';try{route=sessionStorage.getItem('arbat-last-route')}catch{}const desired=({'materials:receipt':'Поступления на склад','materials:movement':'Материалы и комплектация','materials:catalog':'Остатки и номенклатура'})[route]||names[section.id];if(desired&&title.textContent!==desired)title.textContent=desired;warehouseViews();}new MutationObserver(sync).observe(title,{childList:true});sync();
 const stockActions=()=>{let d;try{d=JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return}const project=$('psDeal')?.value,crew=$('psCrew')?.value;const planned=(d.plans||[]).some(p=>p.dealId===project&&p.lines?.length);if($('psIssue'))$('psIssue').disabled=!project||!crew||!planned;if($('psClose'))$('psClose').disabled=!(d.projectIssues||[]).some(x=>x.dealId===project&&x.crewId===crew&&!x.closed);};if($('psIssues'))new MutationObserver(stockActions).observe($('psIssues'),{childList:true});$('psDeal')?.addEventListener('change',stockActions);$('psCrew')?.addEventListener('change',stockActions);window.addEventListener('arbat-warehouse-changed',stockActions);stockActions();
 const watched=new WeakSet();let previousLegacy=null,previousFocus=null;
 const legacyState=()=>{const top=topLegacy();document.body.classList.toggle('ui-modal-open',Boolean(top));if(top&&top!==previousLegacy){previousFocus=document.activeElement;const dialog=top.querySelector('.modal,.whmodal,.cw-dialog,#ab-profile-window');if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');const heading=dialog.querySelector('h2');if(heading){heading.id||='ui-legacy-heading-'+Math.random().toString(36).slice(2);dialog.setAttribute('aria-labelledby',heading.id);}}if(top.id==='ab-profile-overlay'){const tabs=$('ab-profile-tabs');tabs?.setAttribute('role','tablist');const selected=$('ab-profile-subtitle')?.textContent.includes('Администратор')?1:0;[...tabs.children].forEach((b,i)=>{b.setAttribute('role','tab');b.setAttribute('aria-selected',String(i===selected))});}if(dialog){dialog.tabIndex=-1;dialog.focus({preventScroll:true});}}else if(!top&&previousLegacy&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousLegacy=top;};
 const modalObserver=new MutationObserver(legacyState);
 const watch=()=>{for(const n of document.querySelectorAll('.modal-backdrop,.whdialog,.cw-overlay,.arbat-delete-alert,#ab-profile-overlay'))if(!watched.has(n)){watched.add(n);modalObserver.observe(n,{attributes:true,attributeFilter:['class','style']});}const auth=$('ab-form');if(auth&&!auth.dataset.uiLabels){auth.dataset.uiLabels='1';for(const input of auth.querySelectorAll('input')){const label=document.createElement('label');label.textContent=input.type==='email'?'Электронная почта':'Пароль';input.before(label);label.append(input);}}legacyState();};new MutationObserver(watch).observe(document.body,{childList:true});watch();
 const articleDescription=$('articleDescription');if(articleDescription){const update=()=>{articleDescription.hidden=['Выберите статью','Описание статьи появится после выбора'].includes(articleDescription.textContent.trim())};new MutationObserver(update).observe(articleDescription,{childList:true});update();}
 const crewNote=$('psReplenishment')?.querySelector('p');if(crewNote)crewNote.textContent='Материалы, которые остаются у бригады между объектами. Расход по проекту возникает после фактического списания.';
 const peopleNote=$('personForm')?.closest('.card')?.querySelector('p');if(peopleNote&&peopleNote.textContent.includes('Демо'))peopleNote.textContent='Единый справочник сотрудников и исполнителей для начислений и состава бригад.';
 const valueClasses=['ui-value-positive','ui-value-negative','ui-value-intermediate','ui-value-neutral'];
 const mark=(node,state)=>{if(!node)return;node.classList.remove(...valueClasses);node.classList.add('ui-value-'+state);};
 const numberFrom=node=>{if(!node)return null;const value=node.textContent.replace(/\u00a0/g,' ').replace(/[^0-9,.-]/g,'').replace(',','.');const n=Number(value);return Number.isFinite(n)?n:null;};
 const tableInfo=id=>{const table=$(id)?.querySelector('table');if(!table?.tHead?.rows.length)return null;const headers=[...table.tHead.rows[0].cells].map(x=>x.textContent.trim().toLocaleLowerCase('ru-RU'));const col=pattern=>headers.findIndex(x=>pattern.test(x));return {table,headers,col,rows:[...table.tBodies].flatMap(x=>[...x.rows]).filter(x=>!x.querySelector('td[colspan]'))};};
 const markColumn=(info,pattern,state)=>{if(!info)return;const index=info.col(pattern);if(index<0)return;for(const row of info.rows)mark(row.cells[index],typeof state==='function'?state(row.cells[index],row):state);};
 function semanticColors(){
  for(const node of document.querySelectorAll('.ui-value-positive,.ui-value-negative,.ui-value-intermediate,.ui-value-neutral'))node.classList.remove(...valueClasses);
  for(const card of document.querySelectorAll('#kpis>.card,#calendarKpis>.card,#reportKpis>.card')){const title=card.querySelector('.muted')?.textContent.toLocaleLowerCase('ru-RU')||'',value=card.querySelector('.stat'),n=numberFrom(value);if(!value)continue;if(n===0)mark(value,'neutral');else if(/расход|затрат|выбыт/.test(title))mark(value,'negative');else if(/платеж/.test(title))mark(value,'intermediate');else if(/результат|прибыл|поток|остаток/.test(title))mark(value,n!==null&&n<0?'negative':'positive');else if(/выруч|поступлен/.test(title))mark(value,'positive');}
  const wallet=tableInfo('walletBalances');markColumn(wallet,/поступлен/,'positive');markColumn(wallet,/выбыт/,'negative');markColumn(wallet,/^остаток$/,(cell)=>{const n=numberFrom(cell);return n===null||n===0?'intermediate':n<0?'negative':'positive'});
  const result=tableInfo('results');markColumn(result,/выруч/,'positive');markColumn(result,/затрат/,'negative');markColumn(result,/результат/,(cell)=>{const n=numberFrom(cell);return n!==null&&n<0?'negative':n===0?'neutral':'positive'});
  const cash=tableInfo('cashTable');if(cash){const type=cash.col(/^тип$/),amount=cash.col(/^сумма$/);for(const row of cash.rows){const text=row.cells[type]?.textContent||'',state=/поступ/i.test(text)?'positive':/расход|выбыт/i.test(text)?'negative':'intermediate';mark(row.cells[type],state);mark(row.cells[amount],state);}}
  const real=tableInfo('realTable');markColumn(real,/сумма|выруч/,'positive');
  for(const id of ['expensesTable','costTable','laborTable']){const info=tableInfo(id);markColumn(info,/сумма|начислен/,'negative');}
  const materials=tableInfo('materialsTable');if(materials){const operation=materials.col(/операц/),qty=materials.col(/колич/);for(const row of materials.rows){const text=row.cells[operation]?.textContent||'',state=/приход|возврат/i.test(text)?'positive':/передач/i.test(text)?'intermediate':'negative';mark(row.cells[operation],state);mark(row.cells[qty],state);}}
  const deals=tableInfo('dealsTable');markColumn(deals,/договор|реализац/,'positive');markColumn(deals,/^план$|^факт$/,'negative');markColumn(deals,/^остаток$/,'intermediate');markColumn(deals,/прибыль|маржа/,(cell)=>{const n=numberFrom(cell);return n!==null&&n<0?'negative':n===null?'intermediate':'positive'});
  const expenseSummary=tableInfo('expenseSummary');markColumn(expenseSummary,/^план$|факт расходов/,'negative');markColumn(expenseSummary,/осталось/,(cell)=>{const n=numberFrom(cell);return n!==null&&n<0?'negative':'intermediate'});
  const calendar=tableInfo('calendarTable');markColumn(calendar,/^сумма$/,'negative');markColumn(calendar,/прогноз остатка/,(cell)=>{const n=numberFrom(cell);return n!==null&&n<0?'negative':n===0?'intermediate':'positive'});markColumn(calendar,/^статус$/,(cell)=>/просроч|дефицит/i.test(cell.textContent)?'negative':/скоро/i.test(cell.textContent)?'intermediate':'neutral');
  const rules=tableInfo('calendarRules');markColumn(rules,/^сумма$/,'negative');markColumn(rules,/^статус$/,(cell)=>/активно/i.test(cell.textContent)?'positive':'intermediate');
  const report=tableInfo('reportTable');if(report)for(const row of report.rows){const label=row.cells[0]?.textContent||'',state=/поступлен|выручка|реализация/i.test(label)?'positive':/выбыт|расход|затрат|начислен/i.test(label)?'negative':/перевод/i.test(label)?'intermediate':/результат|прибыл|поток/i.test(label)?null:'neutral';for(const cell of [...row.cells].slice(1)){if(state)mark(cell,state);else if(/результат|прибыл|поток/i.test(label)){const n=numberFrom(cell);mark(cell,n!==null&&n<0?'negative':n===0?'neutral':'positive');}}}
 }
 let colorFrame=0;const scheduleColors=()=>{if(colorFrame)return;colorFrame=requestAnimationFrame(()=>{colorFrame=0;semanticColors();});};new MutationObserver(scheduleColors).observe(document.querySelector('main'),{childList:true,subtree:true});scheduleColors();
 const layout=$('layout'),sidebar=$('sidebar'),sideToggle=$('toggleSide'),headerInner=header.querySelector(':scope > div');
 const navToggle=document.createElement('button');navToggle.id='ui-nav-toggle';navToggle.type='button';navToggle.setAttribute('aria-controls','sidebar');navToggle.setAttribute('aria-label','Открыть меню');navToggle.innerHTML='<span aria-hidden="true">☰</span><span>Меню</span>';headerInner.append(navToggle);
 const navBackdrop=document.createElement('button');navBackdrop.id='ui-nav-backdrop';navBackdrop.type='button';navBackdrop.tabIndex=-1;navBackdrop.setAttribute('aria-label','Закрыть меню');document.body.append(navBackdrop);
 const compactNav=()=>matchMedia('(max-width:1100px)').matches;
 function setNav(open,focus=true){
  if(!compactNav())open=false;
  layout.classList.toggle('mobile-open',open);document.body.classList.toggle('ui-nav-open',open);navToggle.setAttribute('aria-expanded',String(open));navToggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
  sidebar.setAttribute('aria-hidden',String(compactNav()&&!open));
  if(open&&focus)requestAnimationFrame(()=>sideToggle.focus({preventScroll:true}));else if(!open&&focus&&compactNav())navToggle.focus({preventScroll:true});
 }
 navToggle.onclick=()=>setNav(!layout.classList.contains('mobile-open'));
 navBackdrop.onclick=()=>setNav(false);
 sideToggle.addEventListener('click',e=>{if(!compactNav())return;e.preventDefault();e.stopImmediatePropagation();setNav(!layout.classList.contains('mobile-open'));},true);
 $('tabs').addEventListener('click',e=>{const target=e.target.closest('[data-route]');if(!target||!compactNav())return;const hasChildren=Boolean(target.closest('.arbat-nav-group')?.querySelector('.arbat-nav-children'));if(target.classList.contains('arbat-nav-sub')||!hasChildren)setTimeout(()=>setNav(false,false));});
 addEventListener('resize',()=>setNav(layout.classList.contains('mobile-open'),false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('ui-nav-open')){e.preventDefault();setNav(false)}});
 setNav(false,false);
 document.addEventListener('click',e=>{const b=e.target.closest?.('#ab-profile-tabs .ab-tab');if(b)for(const tab of b.parentElement.children)tab.setAttribute('aria-selected',String(tab===b));});
 /* Mobile data cards need explicit labels: generated tables are annotated after every render. */
 let tableFrame=0;
 const annotateTables=()=>{
  tableFrame=0;
  for(const table of document.querySelectorAll('main table,#ab-profile-window table,.modal table,.whmodal table')){
   const headers=[...(table.tHead?.rows?.[0]?.cells||[])].map(cell=>cell.textContent.trim().replace(/\s+/g,' '));
   if(!headers.length)continue;
   const keepWide=Boolean(table.closest('#reportTable'));
   table.classList.toggle('ui-data-cards',!keepWide);
   table.classList.toggle('ui-wide-table',keepWide);
   for(const body of table.tBodies)for(const row of body.rows)for(const [index,cell] of [...row.cells].entries()){
    const span=Math.max(1,Number(cell.colSpan)||1),label=headers.slice(index,index+span).filter(Boolean).join(' / ');
    if(label)cell.dataset.columnLabel=label;
   }
  }
 };
 const scheduleTableLabels=()=>{if(!tableFrame)tableFrame=requestAnimationFrame(annotateTables)};
 const tableObserver=new MutationObserver(scheduleTableLabels);tableObserver.observe(document.querySelector('main'),{childList:true,subtree:true});tableObserver.observe(sheetBody,{childList:true,subtree:true});
 scheduleTableLabels();

 /* iPhone tab bar: four frequent workflows plus the complete navigation drawer. */
 const mobileTabs=document.createElement('nav');mobileTabs.className='ui-mobile-tabs';mobileTabs.setAttribute('aria-label','Основная навигация');
 const mobileItems=[
  ['overview','Главная','<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
  ['deals','Сделки','<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'],
  ['cash','Деньги','<path d="M12 2v20m5-16c-1.5-1.4-4-2-6-2-3 0-5 1.3-5 3.5 0 5.5 12 1 12 7 0 2.4-2.6 4-6 4-2.7 0-5-1-6.5-2.5"/>'],
  ['work','Работы','<path d="M4 8h16M4 16h16M8 4v16m8-16v16"/>'],
  ['menu','Ещё','<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>']
 ];
 for(const [route,label,icon] of mobileItems){const b=document.createElement('button');b.type='button';b.dataset.mobileRoute=route;b.setAttribute('aria-label',label);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icon+'</svg><span>'+label+'</span>';b.onclick=()=>route==='menu'?setNav(true):window.arbatNavigate?.(route);mobileTabs.append(b)}
 document.body.append(mobileTabs);
 const syncMobileTabs=()=>{let route='overview';try{route=sessionStorage.getItem('arbat-last-route')||route}catch{}for(const b of mobileTabs.children){const active=b.dataset.mobileRoute===route||(b.dataset.mobileRoute==='deals'&&route==='realizations');b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}};
 new MutationObserver(syncMobileTabs).observe(title,{childList:true});mobileTabs.addEventListener('click',()=>requestAnimationFrame(syncMobileTabs));syncMobileTabs();
})();
