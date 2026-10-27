/* Route integration: existing native document editors, single shared db and CAS save. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),pages=new Map(),getData=()=>db;
 const getWarehouse=()=>{try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}},getOrg=()=>$('orgFilter')?.value||'';
 const bridge=window.ArbatFinancialWorkspaceStore.create({getData,validate:(data,changed)=>window.ArbatFinancialPaymentLinks.assertValid(data,changed),getIdentity:()=>window.abIdentity,ensureOpenPeriods:dates=>{if(!window.arbatEnsureOpenPeriods)throw Error('Проверка периодов ещё загружается. Повторите сохранение.');return window.arbatEnsureOpenPeriods(dates)},backup:raw=>{if(!window.ArbatBackups?.checkpoint)throw Error('Резервное копирование недоступно');return window.ArbatBackups.checkpoint('arbat-financial-workspace-backup-'+Date.now(),raw)},commit:(next,changed)=>{const before=Object.fromEntries(changed.map(k=>[k,db[k]]));for(const key of changed)db[key]=next[key];try{save()}catch(error){for(const key of changed)db[key]=before[key];throw error}}});
 function source(collection,id){
  if(['taxObligationEvents','vatAdvanceEvents'].includes(collection)){window.arbatNavigate('taxes');return window.ArbatTaxRegisterUI?.openEvent?.(collection,id)}
  if(collection==='moves'||collection==='warehouse'){window.arbatNavigate('materials:movement');const row=[...document.querySelectorAll('#whMovements [data-wh-move]')].find(r=>r.dataset.whMove===String(id));row?.click();return}
  if(collection==='crewSettlements'){const row=(db.crewSettlements||[]).find(r=>String(r._id||r.id)===String(id));if(row?.cashId)return openRecord('cash',row.cashId);window.arbatNavigate('labor:summary');return}
  if(collection==='payables')return window.arbatOpenPayables?.(id);
  if(collection==='calendar')return editCalendar(id);
  if(collection==='wallets')return showWallet(id);
  const route={loanContracts:'loans',fixedAssets:'fixedAssets',paymentRequests:'paymentRequests'}[collection];
  if(route){window.arbatNavigate(route);const page=pages.get(route);if(page?.openDocument)return page.openDocument(id);requestAnimationFrame(()=>{const attr=route==='loans'?'data-loan-open':'data-asset-open',buttons=$(route+'WorkspaceHost')?.querySelectorAll('['+attr+']');for(const b of buttons||[])if(b.getAttribute(attr)===String(id)){b.click();break}});return}
  if(collection==='deals'){const d=(db.deals||[]).find(x=>String(x._id||x.id)===String(id));if(d)return showDealModal(d._id)}
  if(collection==='workActs')return openWorkEdit('act',id);
  if(['realizations','expenses','cash','materials','labor','costs','people'].includes(collection))return openRecord(collection,id);
 }
 window.arbatOpenFinancialSource=source;
 const calendar=$('calendar'),host=document.createElement('div');host.id='calendarWorkspaceHost';calendar.querySelector(':scope > .ui-page-toolbar')?.after(host);if(!host.isConnected)calendar.prepend(host);
 for(const id of ['calendarKpis','calendarAlerts','calendarTable','calendarRules','calendarNotice']){const el=$(id);if(el)el.closest('.card')?.classList.add('financial-legacy-calendar')}
 const calendarForm=$('calendarForm');
 function plan(values={},trigger){window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'calendarForm',trigger:trigger||document.activeElement,values:{type:'out',frequency:'once',active:'yes',...values}}}));}
 window.arbatEditCalendar=editCalendar;window.arbatNewCalendarPlan=plan;
 const common={getData,getWarehouse,getOrg,getOrganization:getOrg,getActor:()=>window.abIdentity,mutate:bridge.mutate,openSource:source,openRecord:source};
 if(window.ArbatCalendarWorkspace)pages.set('calendar',window.ArbatCalendarWorkspace.mount(host,{...common,editPlan:editCalendar,newPlan:plan}));
 function mount(section,api,extra={}){if(api?.mount&&$(section+'WorkspaceHost'))pages.set(section,api.mount($(section+'WorkspaceHost'),{...common,...extra}))}
 mount('budgets',window.ArbatBudgetWorkspace,{view:'budgets'});mount('paymentRequests',window.ArbatBudgetWorkspace,{view:'requests'});
 mount('loans',window.ArbatLoanWorkspace);mount('fixedAssets',window.ArbatAssetWorkspace);mount('balance',window.ArbatBalanceWorkspace);
 function refresh(){for(const [section,page] of pages)if($(section)?.classList.contains('active'))page.refresh?.();}
 const previous=window.render;if(typeof previous==='function')window.render=function(...args){const result=previous.apply(this,args);refresh();return result};
 document.addEventListener('arbat:navigate',refresh);window.addEventListener('arbat:cloud-update',refresh);window.addEventListener('storage',refresh);window.addEventListener('arbat-warehouse-changed',refresh);$('orgFilter')?.addEventListener('change',refresh);
 calendarForm?.addEventListener('change',event=>{if(['type','org'].includes(event.target.name))calendarChoices(calendarForm)});
 function calendarChoices(form){if(!form)return;const type=form.elements.type?.value||'out',select=form.elements.articleId;if(select){const old=select.value;select.replaceChildren(new Option('Выберите статью',''),...(db.articles||[]).filter(a=>a.group===(type==='in'?'Поступление':'Выбытие')&&a.activity!=='Техническая операция').map(a=>new Option(a.name,a.id)));if([...select.options].some(o=>o.value===old))select.value=old;select.dispatchEvent(new Event('change',{bubbles:true}));}const wallet=form.elements.walletId;if(wallet){const old=wallet.value;wallet.replaceChildren(new Option('Счёт не назначен',''),...(db.wallets||[]).filter(w=>w.verified&&w.org===form.elements.org.value).map(w=>new Option(w.name,w.id)));if([...wallet.options].some(o=>o.value===old))wallet.value=old;wallet.dispatchEvent(new Event('change',{bubbles:true}));}}
 $('calendarEditForm')?.addEventListener('change',event=>{if(['type','org'].includes(event.target.name))calendarChoices(event.currentTarget)});
 calendarChoices(calendarForm);refresh();
})();
