/* Explicit tax evidence in the existing document workflow. Never confirms legacy data. */
(function(root){
 'use strict';
 const core=typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore;
 const text=x=>String(x??'').trim(),yes=x=>x===true||x==='true',no=x=>x===false||x==='false';
 const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(text(x))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 const AIR='АИР-КЛИМАТ',ARBAT='АРБАТ.ГК';
 const forms={cashForm:'cash',expenseForm:'expenses',costForm:'costs',realizationForm:'realizations',laborForm:'labor'};
 const fields=['usnRecognitionEvents','profitTaxRecognitionEvents','usnTaxable','usnDeductible','usnRecognitionDate','usnRecognizedAmount','usnDocument','profitTaxable','profitTaxDeductible','profitTaxRecognitionDate','profitTaxRecognizedAmount','profitTaxDocument','taxExclusionReason','vatInvoice','vatDeductionDate'];
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
  for(const [scope,prefix] of [['usnExpense','usn'],['profitExpense','profitTax']]){
   if(!active.includes(scope)||!yes(row[prefix+'Deductible']))continue;
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
 const api={validate,scopes,fields};
 if(typeof module==='object'&&module.exports){module.exports=api;return}
 root.ArbatTaxDocumentFields=api;
 const esc=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const input=(name,title,type='text')=>'<label>'+title+'<input name="'+name+'" type="'+type+'"'+(type==='text'&&name.endsWith('Amount')?' inputmode="decimal"':'')+'></label>';
 const choice=(name,title)=>'<label>'+title+'<select name="'+name+'"><option value="">Не проверено</option><option value="true">Да</option><option value="false">Нет — указать основание</option></select></label>';
 const recognition=prefix=>choice(prefix+'Deductible','Расход подтверждён для налогового учёта')+input(prefix+'RecognitionDate','Дата налогового признания','date')+input(prefix+'RecognizedAmount','Признанная сумма, ₽ (пусто — вся допустимая сумма)')+input(prefix+'Document','Документ и основание признания')+'<div class="tax-event-editor" data-tax-event-editor="'+prefix+'"><p>Частичное признание: укажите отдельные даты, суммы и основания. При наличии событий одиночное признание в расчёт не включается.</p><div data-tax-event-list></div><button type="button" data-tax-event-add>+ Добавить признание</button><input type="hidden" name="'+prefix+'RecognitionEvents"></div>';
 const group=(scope,html)=>'<div data-tax-scope="'+scope+'" class="tax-document-grid">'+html+'</div>';
 function panel(){const d=document.createElement('details');d.className='tax-document-fields';d.dataset.taxFields='';d.innerHTML='<summary>Налоговый учёт · подтверждение данных</summary><p>Заполняет бухгалтер после проверки. Не проверено — документ сохраняется с замечанием. Дата и основание не назначаются автоматически.</p>'+group('usnIncome',choice('usnTaxable','Поступление включается в доходы УСН'))+group('usnExpense',recognition('usn'))+group('profitIncome',choice('profitTaxable','Доход включается в базу налога на прибыль'))+group('profitExpense',recognition('profitTax'))+group('vat',input('vatInvoice','Счёт-фактура / УПД — основание вычета')+input('vatDeductionDate','Дата выполнения условий вычета НДС','date'))+input('taxExclusionReason','Основание исключения из налогового расчёта')+'<p data-tax-form-error role="alert" hidden></p>';return d;}
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
 }
 function setupEvents(panel){
  const prefix=panel.dataset.taxEventEditor,list=panel.querySelector('[data-tax-event-list]'),hidden=panel.querySelector('input[type=hidden]');
  const sync=()=>{const entries=[...list.children].map(el=>({id:el.dataset.eventId,date:el.querySelector('[data-event-date]').value,amount:el.querySelector('[data-event-amount]').value,document:el.querySelector('[data-event-document]').value}));hidden.value=entries.length?JSON.stringify(entries):'';};
  function add(e={}){
   const el=document.createElement('div');el.className='tax-event-row';el.dataset.eventId=e.id||(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+list.children.length);
   el.innerHTML='<label>Дата<input data-event-date type="date"></label><label>Сумма, ₽<input data-event-amount inputmode="decimal"></label><label>Основание<input data-event-document></label><button type="button" data-event-remove>Удалить</button>';
   el.querySelector('[data-event-date]').value=e.date||'';el.querySelector('[data-event-amount]').value=e.amount??'';el.querySelector('[data-event-document]').value=e.document||'';
   el.querySelector('[data-event-remove]').onclick=()=>{el.remove();sync()};el.addEventListener('input',sync);el.addEventListener('change',sync);list.append(el);sync();
  }
  panel.querySelector('[data-tax-event-add]').onclick=()=>add();
  panel.load=events=>{list.replaceChildren();if(Array.isArray(events))for(const e of events)add(e);sync()};
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
 api.hydrate=(form,row,collection)=>{for(const panel of form.querySelectorAll('[data-tax-event-editor]'))panel.load(row[panel.dataset.taxEventEditor+'RecognitionEvents']);for(const name of fields){const f=form.elements.namedItem(name);if(f)f.value=row[name]===undefined?'':String(row[name]);}form.dataset.taxCollection=collection;refresh(form,collection);};
 api.receiptFields=(host,source)=>{
  const d=document.createElement('details');d.className='tax-document-fields';d.dataset.receiptTax='';d.innerHTML='<summary>НДС товарной строки</summary><p>Цена строки указана с НДС. Изменение реквизитов не переоценивает исторические партии FIFO.</p><div class="tax-document-grid"><label>Ставка НДС<select name="vatRate"><option value="">Не проверено</option>'+[0,5,7,10,20,22].map(n=>'<option value="'+n+'">'+n+'%</option>').join('')+'</select></label>'+choice('vatDeductible','Входной НДС принимается к вычету')+input('vatInvoice','Счёт-фактура / УПД')+input('vatDeductionDate','Дата выполнения условий вычета','date')+'</div>';host.append(d);
  for(const name of ['vatRate','vatDeductible','vatInvoice','vatDeductionDate'])d.querySelector('[name='+name+']').value=String(source[name]??'');
 };
 api.receiptValues=host=>Object.fromEntries(['vatRate','vatDeductible','vatInvoice','vatDeductionDate'].map(name=>[name,host.querySelector('[data-receipt-tax] [name='+name+']')?.value||'']));
 for(const [id,collection] of Object.entries(forms)){const f=document.getElementById(id);if(!f)continue;const b=panel(),submit=f.querySelector('button[type=submit],button:not([type])');submit?submit.before(b):f.append(b);for(const part of b.querySelectorAll('[data-tax-event-editor]'))setupEvents(part);f.dataset.taxCollection=collection;refresh(f,collection);f.addEventListener('reset',()=>queueMicrotask(()=>refresh(f,collection)));}
 document.addEventListener('change',e=>{const f=e.target.closest('form');if(f?.dataset.taxCollection)refresh(f,f.dataset.taxCollection);});
 const cleared=new WeakMap(),pending=new WeakSet();
 const signature=form=>JSON.stringify([...new FormData(form)]);
 api.forward=form=>cleared.set(form,signature(form));
 // Capture before the legacy save handler. Its normal save/sync and conflict checks remain in use.
 document.addEventListener('submit',e=>{
  const form=e.target,collection=form.dataset.taxCollection;if(!collection||!form.querySelector('[data-tax-fields]'))return;
  const row=values(form),message=checkEvents(form,row,collection)||validate(row,collection),error=form.querySelector('[data-tax-form-error]');
  if(message){e.preventDefault();e.stopImmediatePropagation();error.hidden=false;error.textContent=message;form.querySelector('[data-tax-fields]').open=true;error.scrollIntoView({block:'nearest'});return;}
  error.hidden=true;
  if(cleared.get(form)===signature(form)){cleared.delete(form);return;}
  if(!root.arbatEnsureOpenPeriods)return;
  e.preventDefault();e.stopImmediatePropagation();if(pending.has(form))return;
  const before=signature(form),target=typeof genericTarget==='object'?genericTarget:null;
  let old=null;if(form.id==='genericEditForm'&&target&&typeof db==='object')old=db[target.key]?.find(x=>x._id===target.id);
  const dates=[old,row].filter(Boolean).flatMap(x=>[x.date,x.usnRecognitionDate,x.profitTaxRecognitionDate,x.vatDeductionDate]);
  pending.add(form);
  root.arbatEnsureOpenPeriods(dates).then(()=>{
   if(before!==signature(form))throw Error('Данные изменились во время проверки периода. Нажмите «Сохранить» ещё раз.');
   if(form.id==='genericEditForm'&&(typeof genericTarget!=='object'||genericTarget!==target))return;
   cleared.set(form,before);form.requestSubmit(e.submitter||undefined);
  }).catch(err=>{error.hidden=false;error.textContent=err.message;form.querySelector('[data-tax-fields]').open=true;}).finally(()=>pending.delete(form));
 },true);
})(typeof window==='object'?window:globalThis);
