/* One atomic, guarded write path for financial workspaces. No parallel storage. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatFinancialWorkspaceStore=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const collections=Object.freeze(['loanContracts','fixedAssets','budgetVersions','paymentRequests','calendar','costs']);
 const key=x=>String(x?._id||x?.id||''),serial=x=>JSON.stringify(x),clone=x=>JSON.parse(serial(x));
 function dates(value,out=new Set()){
  if(!value||typeof value!=='object')return out;
  for(const [name,v] of Object.entries(value)){
   if(['date','dueDate','startDate','endDate','inServiceDate','depreciationStartMonth','disposalDate','purchaseDueDate','month','period','loanInterestMonth','depreciationMonth'].includes(name)&&typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(v))out.add(v.length===7?v+'-01':v);
   if(v&&typeof v==='object')dates(v,out);
  }
  return out;
 }
 function changedRows(before=[],after=[]){const old=new Map(before.map(x=>[key(x),x])),next=new Map(after.map(x=>[key(x),x]));return [...before.filter(x=>serial(x)!==serial(next.get(key(x)))),...after.filter(x=>serial(x)!==serial(old.get(key(x))))];}
 function linkedCashDates(value,data,out){if(!value||typeof value!=='object')return;for(const [field,v] of Object.entries(value)){if(field==='cashId')for(const payment of data.cash||[])if(key(payment)===String(v)&&payment.date)out.add(payment.date);if(v&&typeof v==='object')linkedCashDates(v,data,out);}}
 function create(options){
  let busy=false;
  async function mutate(command){
   if(busy)throw Error('Сохранение уже выполняется. Дождитесь результата.');
   const actor=options.getIdentity?.();
   if(!actor)throw Error('Для сохранения необходим вход в систему.');
   if(!['admin','accountant'].includes(actor.role))throw Error('Недостаточно прав для изменения финансовых документов.');
   const allowed=new Set(command.collections||[command.collection]);
   if(!allowed.size||[...allowed].some(x=>!collections.includes(x)))throw Error('Недопустимый раздел финансовых документов.');
   if(typeof command.apply!=='function')throw Error('Не задано изменение документа.');
   if(typeof options.ensureOpenPeriods!=='function')throw Error('Проверка закрытых периодов недоступна. Повторите после загрузки.');
   busy=true;
   try{
    const live=options.getData(),baseline=serial(live),identity=serial(actor),draft=clone(live),result=command.apply(draft);
    if(result&&typeof result.then==='function')throw Error('Изменение должно быть синхронным.');
    const affected=new Set(command.dates||[]),changed=[],removed=[];
    for(const name of new Set([...Object.keys(live),...Object.keys(draft)])){
     if(serial(live[name])===serial(draft[name]))continue;
     if(!allowed.has(name)||!Array.isArray(draft[name]))throw Error('Изменение затронуло недопустимый раздел: '+name);
     const prior=live[name]||[],next=draft[name],ids=new Set();
     for(const row of next){const id=key(row);if(!id||ids.has(id))throw Error('У документа отсутствует уникальный идентификатор.');ids.add(id);}
     const rows=changedRows(prior,next);for(const row of rows){dates(row,affected);linkedCashDates(row,live,affected);linkedCashDates(row,draft,affected);}
     if(['budgetVersions','paymentRequests'].includes(name)&&actor.role!=='admin'&&next.some(row=>row.status==='approved'&&serial(row)!==serial(prior.find(x=>key(x)===key(row)))))throw Error('Утверждение доступно руководителю.');
     removed.push(...prior.filter(row=>!ids.has(key(row))));changed.push(name);
    }
    if(!changed.length)return result;
    options.validate?.(draft,changed);
    await options.ensureOpenPeriods([...affected].filter(Boolean).sort());
    if(serial(options.getIdentity?.())!==identity||serial(options.getData())!==baseline)throw Error('Документы или права изменились во время проверки. Откройте свежую версию; ввод сохранён.');
    if(removed.length){if(typeof options.backup!=='function')throw Error('Для удаления необходима резервная копия.');await options.backup(baseline);}
    if(serial(options.getIdentity?.())!==identity||serial(options.getData())!==baseline)throw Error('Данные изменились во время резервного копирования. Повторите действие.');
    // All changes enter one native save, retaining its shared-state/CAS path.
    options.commit(draft,changed);
    return result;
   }finally{busy=false;}
  }
  return Object.freeze({mutate});
 }
 return Object.freeze({create,dates,changedRows,collections});
});
