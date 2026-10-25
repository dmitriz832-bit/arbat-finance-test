/* Explicit tax evidence in the existing document workflow. Never confirms legacy data. */
(function(root){
 'use strict';
 const core=typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore;
 const text=x=>String(x??'').trim(),yes=x=>x===true||x==='true',no=x=>x===false||x==='false';
 const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(text(x))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const AIR='АИР-КЛИМАТ',ARBAT='АРБАТ.ГК';
 const forms={cashForm:'cash',expenseForm:'expenses',costForm:'costs',realizationForm:'realizations',laborForm:'labor'};
 const fields=['usnVatAmount','usnVatDocument','usnRecognitionEvents','profitTaxRecognitionEvents','usnTaxable','usnDeductible','usnRecognitionDate','usnRecognizedAmount','usnDocument','profitTaxable','profitTaxDeductible','profitTaxRecognitionDate','profitTaxRecognizedAmount','profitTaxDocument','taxExclusionReason','vatInvoice','vatDeductionDate'];
 function scopes(row,collection){
  if(row.org===AIR&&collection==='cash'&&row.type!=='transfer')return [row.type==='in'?'usnIncome':'usnExpense'];
  if(row.org!==ARBAT)return [];
  if(collection==='realizations'||collection==='costs'&&row.pnlType==='income')return ['profitIncome'];
  if(['expenses','costs','labor'].includes(collection))return collection==='labor'?['profitExpense']:['profitExpense',...(!row.warehouseMoveId?['vat']:[])];
  if(collection==='warehouse')return ['vat'];
  return [];
 }
 function validate(row,collection){
  const active=scopes(row,collection),flags=[];
  if(active.includes('usnIncome'))flags.push('usnTaxable');
  if(active.includes('usnExpense'))flags.push('usnDeductible');
  if(active.includes('profitIncome'))flags.push('profitTaxable');
  if(active.includes('profitExpense'))flags.push('profitTaxDeductible');
  if(flags.some(f=>no(row[f]))&&!text(row.taxExclusionReason))return 'Укажите основание исключения из налогового расчёта';
  if(active.includes('usnIncome')&&(text(row.usnVatAmount)||text(row.usnVatDocument))){
   try{const n=core.cents(row.usnVatAmount),gross=core.cents(row.amountGross??row.amount);if(!text(row.usnVatAmount)||n<0n||n>gross)return 'Проверьте сумму НДС в поступлении';if(!text(row.usnVatDocument))return 'Укажите основание суммы НДС в поступлении'}catch{return 'Проверьте сумму НДС в поступлении'}
  }
  for(const [scope,prefix] of [['usnExpense','usn'],['profitExpense','profitTax']]){
   if(!active.includes(scope)||!yes(row[prefix+'Deductible'])||Array.isArray(row[prefix+'RecognitionEvents'])&&row[prefix+'RecognitionEvents'].length)continue;
   const date=row[prefix+'RecognitionDate'];
   if(!valid(date)||!valid(row.date)||date<row.date)return 'Проверьте дату признания: она не может быть раньше даты документа или оплаты';
   if(!text(row[prefix+'Document']))return 'Укажите документ-основание признания расхода';
   try{
    let max=core.cents(row.amountGross??row.amount);
    if(prefix==='profitTax'){
     if(collection==='labor')max+=core.cents(row.employerContributions||0);
     else {const vat=core.documentVat(row.amountGross??row.amount,row.vatRate,yes(row.vatDeductible));if(vat.vatAmount!==0n&&!yes(row.vatDeductible)&&!no(row.vatDeductible))return 'Укажите возможность вычета входного НДС';max=yes(row.vatDeductible)?vat.amountNet:vat.amountGross;}
    }
    const raw=row[prefix+'RecognizedAmount'],n=text(raw)?core.cents(raw):max;
    if(max<0n||n<0n||n>max)return 'Сумма признания не может превышать допустимую сумму документа или оплаты';
   }catch{return 'Проверьте сумму документа, признания и ставку НДС'}
  }
  if(active.includes('vat')&&(text(row.vatDeductionDate)||text(row.vatInvoice))){
   if(!yes(row.vatDeductible))return 'Для даты вычета подтвердите возможность вычета входного НДС';
   if(!valid(row.vatDeductionDate)||!valid(row.date)||row.vatDeductionDate<row.date)return 'Проверьте дату вычета НДС';
   if(!text(row.vatInvoice))return 'Укажите счёт-фактуру / УПД — основание вычета';
  }
  return null;
 }
 // A proposal is never evidence: only the explicit confirmation action applies it.
 function eventValues(source){
  const row={...source};
  for(const prefix of ['usn','profitTax']){const name=prefix+'RecognitionEvents';if(typeof row[name]==='string'&&row[name].trim()){try{row[name]=JSON.parse(row[name]);if(!Array.isArray(row[name]))return null;}catch{return null;}}}
  return row;
 }
 function proposal(row,collection){
  row=eventValues(row);if(!row)return null;
  const active=scopes(row,collection),prefix=active.includes('usnExpense')?'usn':active.includes('profitExpense')?'profitTax':null;
  if(!prefix||Array.isArray(row[prefix+'RecognitionEvents'])&&row[prefix+'RecognitionEvents'].length)return null;
  try{
   const date=text(row[prefix+'RecognitionDate'])||row.date;
   if(!valid(row.date)||!valid(date)||date<row.date)return null;
   let max=core.cents(row.amountGross??row.amount);
   if(prefix==='profitTax'){
    if(collection==='labor')max+=core.cents(row.employerContributions||0);
    else{const v=core.documentVat(row.amountGross??row.amount,row.vatRate,yes(row.vatDeductible));if(v.vatAmount!==0n&&!yes(row.vatDeductible)&&!no(row.vatDeductible))return null;max=yes(row.vatDeductible)?v.amountNet:v.amountGross;}
   }
   const amount=text(row[prefix+'RecognizedAmount'])?core.cents(row[prefix+'RecognizedAmount']):max;
   if(max<=0n||amount<0n||amount>max)return null;
   return {prefix,date,amount:core.rubles(amount),document:text(row[prefix+'Document'])||text(row.document)||(collection==='expenses'?text(row.note):'')};
  }catch{return null}
 }
 function vatProposal(row,collection){
  row=eventValues(row);if(!row)return null;
  if(!scopes(row,collection).includes('vat')||!yes(row.vatDeductible))return null;
  try{if(!text(row.vatRate)||core.documentVat(row.amountGross??row.amount,row.vatRate,true).vatAmount<=0n)return null;}catch{return null;}
  const patch={vatInvoice:text(row.vatInvoice)||text(row.profitTaxDocument)||text(row.document)||(collection==='expenses'?text(row.note):''),vatDeductionDate:text(row.vatDeductionDate)||row.date};
  return !patch.vatInvoice||validate({...row,...patch},collection)?null:patch;
 }
 const api={validate,scopes,fields,proposal,vatProposal};
 if(typeof module==='object'&&module.exports){module.exports=api;return}
 root.ArbatTaxDocumentFields=api;
 const esc=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const input=(name,title,type='text')=>'<label>'+title+'<input name="'+name+'" type="'+type+'"'+(type==='text'&&name.endsWith('Amount')?' inputmode="decimal"':'')+'></label>';
 const choice=(name,title)=>'<label>'+title+'<select name="'+name+'"><option value="">Не проверено</option><option value="true">Да</option><option value="false">Нет — указать основание</option></select></label>';
 const recognition=prefix=>'<p class="tax-quick-summary" data-tax-proposal="'+prefix+'"></p>'+input(prefix+'Document','Документ-основание расхода')+'<button type="button" data-tax-confirm="'+prefix+'">Подтвердить расход по документу</button><details class="tax-manual" data-tax-manual><summary>Другая дата, часть суммы или исключение</summary><div class="tax-document-grid">'+choice(prefix+'Deductible','Расход подтверждён для налогового учёта')+input(prefix+'RecognitionDate','Дата налогового признания','date')+input(prefix+'RecognizedAmount','Признанная сумма, ₽ (пусто — вся допустимая сумма)')+'</div></details><details class="tax-event-editor" data-tax-event-editor="'+prefix+'"><summary>Признание по нескольким датам <span data-tax-event-count></span></summary><p>Для каждой части укажите дату, сумму и основание. При наличии строк одиночное признание не учитывается.</p><div data-tax-event-list></div><button type="button" data-tax-event-add>+ Добавить признание</button><input type="hidden" name="'+prefix+'RecognitionEvents"></details>';
 const group=(scope,html)=>'<div data-tax-scope="'+scope+'" class="tax-document-grid">'+html+'</div>';
 function panel(){const d=document.createElement('details');d.className='tax-document-fields';d.dataset.taxFields='';d.innerHTML='<summary>Налоговый учёт · <span data-tax-status>Нужно решение бухгалтера</span></summary><p>Можно сохранить операцию и проверить налоги позже. Подтверждайте расход после проверки документов и выполнения условий признания.</p>'+group('usnIncome',choice('usnTaxable','Поступление включается в доходы УСН')+input('usnVatAmount','НДС в поступлении, ₽ (всего, включая НДС аванса)')+input('usnVatDocument','Основание суммы НДС в поступлении'))+group('usnExpense',recognition('usn'))+group('profitIncome',choice('profitTaxable','Доход включается в базу налога на прибыль'))+group('profitExpense',recognition('profitTax'))+group('vat','<p class="tax-quick-summary">Вычет подтверждается отдельно после проверки счёта-фактуры / УПД и выполнения условий.</p><button type="button" data-tax-confirm-vat>Подтвердить вычет по документу</button>'+input('vatInvoice','Счёт-фактура / УПД — основание вычета')+input('vatDeductionDate','Дата выполнения условий вычета НДС','date'))+'<div data-tax-exclusion hidden>'+input('taxExclusionReason','Основание исключения из налогового расчёта')+'</div><p data-tax-form-error role="alert" hidden></p>';return d;}
 function values(form){const row=Object.fromEntries(new FormData(form));if(row.amount!==undefined)row.amountGross=row.amount;
  if(!row.org&&row.projectKey&&typeof db==='object')row.org=(db.deals||[]).find(x=>root.arbatDealKey(x)===row.projectKey)?.org||'';
  if(row.name&&typeof db==='object'){const a=(db.pnlArticles||[]).find(x=>x.name===row.name);if(a)row.pnlType=a.type;}
  return row;
 }
 function refresh(form,collection){const block=form.querySelector('[data-tax-fields]');if(!block)return;
  // Read disabled values as well: disabling a scope must never select another scope.
  const row=values(form),active=scopes(row,collection);block.hidden=!active.length;
  for(const g of block.querySelectorAll('[data-tax-scope]')){g.hidden=!active.includes(g.dataset.taxScope);for(const f of g.querySelectorAll('input,select'))f.disabled=g.hidden;}
  const reason=block.querySelector('[name=taxExclusionReason]');reason.disabled=!active.length;
  for(const prefix of ['usn','profitTax']){const editor=block.querySelector('[data-tax-event-editor="'+prefix+'"]');if(editor?.events)row[prefix+'RecognitionEvents']=editor.events();}
  const suggested=proposal(row,collection);
  for(const label of block.querySelectorAll('[data-tax-proposal]')){
   const prefix=label.dataset.taxProposal,hasEvents=Array.isArray(row[prefix+'RecognitionEvents'])&&row[prefix+'RecognitionEvents'].length;
   label.textContent=hasEvents?'Признание разбито по датам. Проверяйте отдельные части ниже.':suggested?.prefix===prefix?'К признанию: '+suggested.amount.replace('.',',')+' ₽ · '+suggested.date+'. Основание: '+(suggested.document||'нужно указать документ')+'. Подтверждайте только после выполнения условий признания.':'Укажите сумму, дату и реквизиты операции для подготовки признания.';
   block.querySelector('[data-tax-confirm="'+prefix+'"]').hidden=!!hasEvents;
  }
  const flagNames=active.flatMap(x=>({usnIncome:['usnTaxable'],usnExpense:['usnDeductible'],profitIncome:['profitTaxable'],profitExpense:['profitTaxDeductible']})[x]||[]);
  block.querySelector('[data-tax-exclusion]').hidden=!flagNames.some(x=>no(row[x]))&&!text(row.taxExclusionReason);
  const pending=flagNames.some(x=>!yes(row[x])&&!no(row[x]))||active.includes('vat')&&(!text(row.vatRate)||!yes(row.vatDeductible)&&!no(row.vatDeductible)||yes(row.vatDeductible)&&Number(row.vatRate)!==0&&(!text(row.vatInvoice)||!valid(row.vatDeductionDate)));
  block.querySelector('[data-tax-status]').textContent=validate(row,collection)||checkEvents(form,row,collection)?'Нужно проверить реквизиты':pending?'Нужно решение бухгалтера':'Подтверждено в документе';
 }
 function setupEvents(panel){
  const prefix=panel.dataset.taxEventEditor,list=panel.querySelector('[data-tax-event-list]'),hidden=panel.querySelector('input[type=hidden]');
  const sync=()=>{const entries=[...list.children].map(el=>({id:el.dataset.eventId,date:el.querySelector('[data-event-date]').value,amount:el.querySelector('[data-event-amount]').value,document:el.querySelector('[data-event-document]').value}));hidden.value=entries.length?JSON.stringify(entries):'';panel.querySelector('[data-tax-event-count]').textContent=entries.length?'· '+entries.length:'';if(panel.events){const f=panel.closest('form');refresh(f,f.dataset.taxCollection);}};
  function add(e={}){
   const el=document.createElement('div');el.className='tax-event-row';el.dataset.eventId=e.id||(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+list.children.length);
   el.innerHTML='<label>Дата<input data-event-date type="date"></label><label>Сумма, ₽<input data-event-amount inputmode="decimal"></label><label>Основание<input data-event-document></label><button type="button" data-event-remove>Убрать признание</button>';
   el.querySelector('[data-event-date]').value=e.date||'';el.querySelector('[data-event-amount]').value=e.amount??'';el.querySelector('[data-event-document]').value=e.document||'';
   el.querySelector('[data-event-remove]').onclick=()=>{el.remove();sync()};el.addEventListener('input',sync);el.addEventListener('change',sync);list.append(el);sync();
  }
  panel.querySelector('[data-tax-event-add]').onclick=()=>add();
  panel.load=events=>{list.replaceChildren();if(Array.isArray(events))for(const e of events)add(e);panel.open=Array.isArray(events)&&events.length>0;sync()};
  panel.events=()=>hidden.value?JSON.parse(hidden.value):null;
 }
 function checkEvents(form,row,collection){
  for(const prefix of ['usn','profitTax']){
   const panel=form.querySelector('[data-tax-event-editor="'+prefix+'"]');
   if(!panel||panel.closest('[data-tax-scope]')?.hidden)continue;
   const events=panel.events();if(!events)continue;
   let total=0n;const ids=new Set();
   for(const event of events){
    if(!event.id||ids.has(event.id))return 'Повторяющееся событие признания';
    ids.add(event.id);
    if(!valid(event.date)||!valid(row.date)||event.date<row.date)return 'Проверьте даты признания расходов';
    if(!text(event.document))return 'Укажите основание каждого признания';
    let n;try{n=core.cents(event.amount)}catch{return 'Некорректная сумма признания'}
    if(n<=0n)return 'Сумма признания должна быть положительной';total+=n;
   }
   try{
    let max=core.cents(row.amountGross??row.amount);
    if(prefix==='profitTax'){if(collection==='labor')max+=core.cents(row.employerContributions||0);else{const v=core.documentVat(row.amountGross??row.amount,row.vatRate,yes(row.vatDeductible));max=yes(row.vatDeductible)?v.amountNet:v.amountGross}}
    if(total>max)return 'Сумма признаний превышает сумму документа';
   }catch{return 'Проверьте сумму документа и НДС'}
  }
  return null;
 }
 const sourceSnapshots=new WeakMap();
 api.hydrate=(form,row,collection)=>{
  form.dataset.taxCollection=collection;
  const editors=form.querySelectorAll('[data-tax-event-editor]');
  for(const panel of editors)if(typeof panel.load!=='function')setupEvents(panel);
  for(const panel of editors)panel.load(row[panel.dataset.taxEventEditor+'RecognitionEvents']);
  for(const name of fields){const f=form.elements.namedItem(name);if(f&&!name.endsWith('RecognitionEvents'))f.value=row[name]===undefined?'':String(row[name]);}
  refresh(form,collection);
  form.querySelector('[data-tax-source-actions]')?.remove();
  if(row._id&&[AIR,ARBAT].includes(row.org)&&(collection==='cash'&&['in','out'].includes(row.type)||collection==='realizations')){
   const actions=document.createElement('div');actions.dataset.taxSourceActions='';actions.className='tax-document-actions';
   actions.innerHTML='<p>Налоговое событие из сохранённого документа</p>'+(collection==='cash'?'<button type="button" data-tax-source="advances">'+(row.type==='in'?'НДС с аванса':'Возврат аванса')+'</button> <button type="button" data-tax-source="obligations">'+(row.type==='out'?'Уплата налога':'Возврат налога')+'</button>':'<button type="button" data-tax-source="advances">Зачесть аванс при реализации</button>')+'<p data-tax-source-error role="alert" hidden></p>';
   form.querySelector('[data-tax-fields]').after(actions);sourceSnapshots.set(form,{signature:signature(form),collection,id:row._id});
  }else sourceSnapshots.delete(form);
 };
 api.receiptFields=(host,source)=>{
  const d=document.createElement('details');d.className='tax-document-fields';d.dataset.receiptTax='';d.innerHTML='<summary>НДС товарной строки</summary><p>Цена строки указана с НДС. Изменение реквизитов не переоценивает исторические партии FIFO.</p><div class="tax-document-grid"><label>Ставка НДС<select name="vatRate"><option value="">Не проверено</option>'+[0,5,7,10,20,22].map(n=>'<option value="'+n+'">'+n+'%</option>').join('')+'</select></label>'+choice('vatDeductible','Входной НДС принимается к вычету')+input('vatInvoice','Счёт-фактура / УПД')+input('vatDeductionDate','Дата выполнения условий вычета','date')+'</div>';host.append(d);
  for(const name of ['vatRate','vatDeductible','vatInvoice','vatDeductionDate'])d.querySelector('[name='+name+']').value=String(source[name]??'');
 };
 api.receiptValues=host=>Object.fromEntries(['vatRate','vatDeductible','vatInvoice','vatDeductionDate'].map(name=>[name,host.querySelector('[data-receipt-tax] [name='+name+']')?.value||'']));
 for(const [id,collection] of Object.entries(forms)){const f=document.getElementById(id);if(!f)continue;const b=panel(),submit=f.querySelector('button[type=submit],button:not([type])');submit?submit.before(b):f.append(b);for(const part of b.querySelectorAll('[data-tax-event-editor]'))setupEvents(part);f.dataset.taxCollection=collection;refresh(f,collection);f.addEventListener('reset',()=>queueMicrotask(()=>refresh(f,collection)));}
 for(const type of ['input','change'])document.addEventListener(type,e=>{const f=e.target.closest('form');if(f?.dataset.taxCollection)refresh(f,f.dataset.taxCollection);});
 document.addEventListener('click',e=>{
  const sourceAction=e.target.closest('[data-tax-source]');
  if(sourceAction){const form=sourceAction.closest('form'),saved=sourceSnapshots.get(form),error=form.querySelector('[data-tax-source-error]');
   if(!saved||saved.signature!==signature(form)){error.hidden=false;error.textContent='Сначала сохраните изменения операции, затем откройте налоговое событие.';return;}
   const row=typeof db==='object'?(db[saved.collection]||[]).find(x=>x._id===saved.id):null;
   if(row)root.ArbatTaxRegisterUI?.openFromDocument(saved.collection,row,sourceAction.dataset.taxSource);return;
  }
  const vatButton=e.target.closest('[data-tax-confirm-vat]');
  if(vatButton){const form=vatButton.closest('form'),p=vatProposal(values(form),form.dataset.taxCollection),error=form.querySelector('[data-tax-form-error]');
   if(!p){error.hidden=false;error.textContent='Для вычета выберите возможность вычета НДС, укажите счёт-фактуру / УПД и проверьте дату.';return;}
   for(const [name,value]of Object.entries(p))form.elements.namedItem(name).value=value;
   error.hidden=true;refresh(form,form.dataset.taxCollection);return;
  }
  const button=e.target.closest('[data-tax-confirm]');if(!button)return;
  const form=button.closest('form'),row=values(form),prefix=button.dataset.taxConfirm,panel=form.querySelector('[data-tax-event-editor="'+prefix+'"]');
  row[prefix+'RecognitionEvents']=panel.events();
  const p=proposal(row,form.dataset.taxCollection),error=form.querySelector('[data-tax-form-error]');
  const fail=message=>{error.textContent=message;error.hidden=false;form.querySelector('[data-tax-fields]').open=true;};
  if(!p){fail('Проверьте сумму, дату и реквизиты операции. Для нескольких признаний используйте отдельные строки.');return;}
  if(!p.document){fail('Укажите документ-основание расхода. Назначение платежа само по себе не подтверждает признание.');form.elements.namedItem(prefix+'Document').focus();return;}
  const patch={[prefix+'Deductible']:'true',[prefix+'RecognitionDate']:p.date,[prefix+'RecognizedAmount']:p.amount,[prefix+'Document']:p.document},message=validate({...row,...patch},form.dataset.taxCollection);
  if(message){fail(message);return;}
  for(const [name,value]of Object.entries(patch))form.elements.namedItem(name).value=value;
  error.hidden=true;refresh(form,form.dataset.taxCollection);
 });
 const cleared=new WeakMap(),pending=new WeakSet();
 const signature=form=>JSON.stringify([...new FormData(form)]);
 api.forward=form=>cleared.set(form,signature(form));
 // Capture before the legacy save handler. Its normal save/sync and conflict checks remain in use.
 document.addEventListener('submit',e=>{
  const form=e.target,collection=form.dataset.taxCollection;if(!collection||!form.querySelector('[data-tax-fields]'))return;
  const row=values(form);for(const prefix of ['usn','profitTax']){const raw=row[prefix+'RecognitionEvents'];if(raw){try{row[prefix+'RecognitionEvents']=JSON.parse(raw)}catch{row[prefix+'RecognitionEvents']=[]}}}const message=checkEvents(form,row,collection)||validate(row,collection),error=form.querySelector('[data-tax-form-error]');
  if(message){e.preventDefault();e.stopImmediatePropagation();error.hidden=false;error.textContent=message;form.querySelector('[data-tax-fields]').open=true;for(const d of form.querySelectorAll('[data-tax-manual]'))d.open=true;error.scrollIntoView({block:'nearest'});return;}
  error.hidden=true;
  if(cleared.get(form)===signature(form)){cleared.delete(form);return;}
  if(!root.arbatEnsureOpenPeriods)return;
  e.preventDefault();e.stopImmediatePropagation();if(pending.has(form))return;
  const before=signature(form),target=typeof genericTarget==='object'?genericTarget:null;
  let old=null;if(form.id==='genericEditForm'&&target&&typeof db==='object')old=db[target.key]?.find(x=>x._id===target.id);
  const dates=[old,row].filter(Boolean).flatMap(x=>[x.date,x.usnRecognitionDate,x.profitTaxRecognitionDate,x.vatDeductionDate,...(Array.isArray(x.usnRecognitionEvents)?x.usnRecognitionEvents.map(e=>e.date):[]),...(Array.isArray(x.profitTaxRecognitionEvents)?x.profitTaxRecognitionEvents.map(e=>e.date):[])]);
  pending.add(form);
  root.arbatEnsureOpenPeriods(dates).then(()=>{
   if(before!==signature(form))throw Error('Данные изменились во время проверки периода. Нажмите «Сохранить» ещё раз.');
   if(form.id==='genericEditForm'&&(typeof genericTarget!=='object'||genericTarget!==target))return;
   cleared.set(form,before);form.requestSubmit(e.submitter||undefined);
  }).catch(err=>{error.hidden=false;error.textContent=err.message;form.querySelector('[data-tax-fields]').open=true;}).finally(()=>pending.delete(form));
 },true);
})(typeof window==='object'?window:globalThis);
