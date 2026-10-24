/* Explicit tax registers. Pure calculations; all monetary results are integer kopecks. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatTaxRegisters=api})(globalThis,function(core){
'use strict';
const organizations=['АИР-КЛИМАТ','АРБАТ.ГК'],taxes=['vat','usn','profit','ndfl','contributions'],text=x=>String(x??'').trim(),yes=x=>x===true||x==='true';
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(text(x))&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const id=x=>text(x?._id||x?.id),sameParty=(a,b)=>!a.customerId||!b.customerId||a.customerId===b.customerId;
const period=x=>/^\d{4}-(?:0[1-9]|1[0-2]|Q[1-4])$/.test(text(x))||/^\d{4}$/.test(text(x));
function money(x,allowNegative=false){if(x===null||x===undefined||text(x)==='')throw Error('Укажите сумму');const n=core.cents(x);if(!allowNegative&&n<=0n)throw Error('Сумма должна быть положительной');return n}
function basic(e){if(!id(e))throw Error('Нет идентификатора события');if(!organizations.includes(e.org))throw Error('Выберите организацию');if(!validDate(e.date))throw Error('Проверьте дату события');if(!text(e.document))throw Error('Укажите документ-основание')}
function duplicateIds(events){const counts=new Map();for(const e of events)counts.set(id(e),(counts.get(id(e))||0)+1);return new Set([...counts].filter(([k,n])=>!k||n>1).map(([k])=>k))}
function reference(rows,key,e,type){const matches=(rows||[]).filter(x=>id(x)===text(key));if(matches.length!==1)throw Error('Документ-источник отсутствует или неоднозначен');const r=matches[0];if(r.org!==e.org||type&&r.type!==type)throw Error('Организация или вид платежа не совпадают');if(!validDate(r.date)||e.date<r.date)throw Error('Событие не может быть раньше документа-источника');return r}
function reserve(map,key,n,cap){const used=(map.get(key)||0n)+n;if(used>cap)throw Error('Сумма событий превышает сумму документа');map.set(key,used)}
function calculateAdvances(data={},filters={},reservations=new Map()){
 const all=data.vatAdvanceEvents||[],dups=duplicateIds(all),issues=[],rows=[],balances=[],cashUsed=new Map(reservations),saleUsed=new Map(),acceptedCash=new Map(),byId=new Map();
 const inPeriod=e=>(!filters.org||e.org===filters.org)&&(!filters.from||e.date>=filters.from)&&(!filters.to||e.date<=filters.to);
 const until=e=>!filters.to||e.date<=filters.to;
 const sorted=[...all].sort((a,b)=>text(a.date).localeCompare(text(b.date))||((a.kind==='received'?0:1)-(b.kind==='received'?0:1))||id(a).localeCompare(id(b)));
 for(const e of sorted){if(!until(e))continue;try{
  basic(e);if(dups.has(id(e)))throw Error('Повторяющийся идентификатор события');const n=money(e.amount);let vat=0n,source,collection;
  if(e.kind==='received'){
   source=reference(data.cash,e.cashId,e,'in');collection='cash';if(source.org==='АИР-КЛИМАТ'&&(source.usnTaxable===false||source.usnTaxable==='false'))throw Error('Поступление исключено из доходов УСН: проверьте классификацию аванса');if(e.date!==source.date)throw Error('НДС с аванса начисляется на дату получения платежа');
   if(![0,5,7,10,20,22].includes(Number(e.vatRate))||text(e.vatRate)==='')throw Error('Укажите подтверждённую ставку НДС');
   // Net rounding matches the shared document VAT primitive, including historical rates.
   vat=core.documentVat(e.amount,e.vatRate,false).vatAmount;reserve(cashUsed,id(source),n,money(source.amount));
   const b={id:id(e),org:e.org,date:e.date,source:e,remaining:n,vatRemaining:vat,amount:n,vat,used:0n,deducted:0n,cash:source};byId.set(id(e),b);balances.push(b);
  }else if(e.kind==='offset'||e.kind==='refund'){
   const b=byId.get(text(e.advanceId));if(!b||b.org!==e.org)throw Error('Выберите ранее зарегистрированный аванс той же организации');if(n>b.remaining)throw Error('Зачёт или возврат превышает остаток аванса');
   let cap,key;
   if(e.kind==='offset'){source=reference(data.realizations,e.realizationId,e);collection='realizations';if(e.date!==source.date)throw Error('Дата зачёта должна совпадать с датой реализации');cap=money(source.amountGross??source.amount);key=id(source);if(!sameParty(b.cash,source))throw Error('Контрагент реализации не совпадает с авансом');if(b.cash.projectKey&&source.projectKey&&b.cash.projectKey!==source.projectKey)throw Error('Сделка реализации не совпадает с авансом');if((saleUsed.get(key)||0n)+n>cap)throw Error('Сумма зачётов превышает реализацию')}
   else {source=reference(data.cash,e.cashId,e,'out');collection='cash';if(e.date!==source.date)throw Error('Дата возврата должна совпадать с датой платежа');if(!sameParty(b.cash,source))throw Error('Контрагент возврата не совпадает с авансом');cap=money(source.amount);key=id(source);if((cashUsed.get(key)||0n)+n>cap)throw Error('Сумма возвратов превышает платёж')}
   // Cumulative rounding assigns the last kopeck exactly once over all partial deductions.
   const cumulative=((b.used+n)*b.vat+b.amount/2n)/b.amount;vat=cumulative-b.deducted;
   if(e.kind==='offset')reserve(saleUsed,key,n,cap);else reserve(cashUsed,key,n,cap);
   b.used+=n;b.remaining-=n;b.deducted+=vat;b.vatRemaining-=vat;
  }else throw Error('Неизвестный вид события НДС');
  if(collection==='cash')acceptedCash.set(id(source),(acceptedCash.get(id(source))||0n)+n);
  rows.push({event:e,source,collection,id:id(source),org:e.org,date:e.date,kind:e.kind,amount:n,vat,label:e.kind==='received'?'НДС с аванса':e.kind==='offset'?'Вычет НДС при зачёте аванса':'Вычет НДС при возврате аванса'});
 }catch(error){issues.push({event:e,message:error.message})}}
 const selected=rows.filter(r=>inPeriod(r)),sum=kind=>selected.filter(x=>kind?x.kind===kind:x.kind!=='received').reduce((s,x)=>s+x.vat,0n);
 return {rows:selected,balances:balances.filter(x=>!filters.org||x.org===filters.org),issues:issues.filter(x=>!filters.org||x.event.org===filters.org),accrued:sum('received'),deducted:sum(),coveredCash:[...acceptedCash].filter(([key,n])=>{const r=(data.cash||[]).find(x=>id(x)===key);return r&&n===core.cents(r.amount)}).map(([key])=>key)};
}
function calculateObligations(data={},filters={},reservations=new Map()){
 const all=data.taxObligationEvents||[],dups=duplicateIds(all),issues=[],groups=new Map(),ens=new Map(),cashUsed=new Map(reservations),events=[];
 const ensValues=new Map();for(const e of all){try{if(e.kind!=='ensBalance'||!yes(e.confirmed)||filters.to&&e.date>filters.to)continue;basic(e);const key=e.org+'|'+e.date,n=money(e.amount,true).toString();if(!ensValues.has(key))ensValues.set(key,new Set());ensValues.get(key).add(n)}catch{}}
 for(const e of [...all].sort((a,b)=>text(a.date).localeCompare(text(b.date))||id(a).localeCompare(id(b)))){
  if(filters.to&&e.date>filters.to||filters.org&&e.org!==filters.org)continue;
  try{basic(e);if(dups.has(id(e)))throw Error('Повторяющийся идентификатор события');if(!yes(e.confirmed))throw Error('Налоговое событие не подтверждено');const n=money(e.amount,e.kind==='ensBalance');
   if(e.kind==='ensBalance'){if(ensValues.get(e.org+'|'+e.date)?.size>1){ens.delete(e.org);throw Error('Разные подтверждённые сальдо ЕНС на одну дату: уточните выписки')}ens.set(e.org,{org:e.org,date:e.date,balance:n,document:e.document});events.push(e);continue}
   if(!taxes.includes(e.tax)||!period(e.period))throw Error('Укажите налог и налоговый период');
   if(!['openingDebt','openingCredit','accrual','payment','offset','refund'].includes(e.kind))throw Error('Неизвестный вид налогового события');
   if(e.kind==='offset'&&!yes(e.ensConfirmed))throw Error('Для зачёта нужны подтверждённые данные ЕНС');
   if(e.kind==='payment'||e.kind==='refund'){const r=reference(data.cash,e.cashId,e,e.kind==='payment'?'out':'in');reserve(cashUsed,id(r),n,money(r.amount))}
   const key=[e.org,e.tax,e.period].join('|');if(!groups.has(key))groups.set(key,{org:e.org,tax:e.tax,period:e.period,openingDebt:0n,openingCredit:0n,accrued:0n,paid:0n,offset:0n,refund:0n,events:[]});
   const r=groups.get(key),field=({accrual:'accrued',payment:'paid'})[e.kind]||e.kind;r[field]+=n;r.events.push(e);events.push(e);
  }catch(error){issues.push({event:e,message:error.message})}
 }
 const rows=[...groups.values()].map(r=>{const balance=r.openingDebt-r.openingCredit+r.accrued-r.paid-r.offset+r.refund;return {...r,balance,debt:balance>0n?balance:0n,overpayment:balance<0n?-balance:0n}});
 return {rows,ens:[...ens.values()],issues,events};
}
// Cross-register reservations use only records accepted by a complete own-register pass.
// Neither pass invokes the other; invalid sources or over-refunds cannot reserve money.
function advances(data={},filters={}){
 const accepted=calculateObligations(data,{to:filters.to}),reservations=new Map();
 for(const e of accepted.events)if(e.kind==='payment'||e.kind==='refund')reservations.set(e.cashId,(reservations.get(e.cashId)||0n)+core.cents(e.amount));
 return calculateAdvances(data,filters,reservations);
}
function obligations(data={},filters={}){
 const accepted=calculateAdvances(data,{to:filters.to}),reservations=new Map();
 for(const r of accepted.rows)if(r.collection==='cash')reservations.set(r.id,(reservations.get(r.id)||0n)+r.amount);
 return calculateObligations(data,filters,reservations);
}
return Object.freeze({advances,obligations,validDate,organizations,taxes});
});
