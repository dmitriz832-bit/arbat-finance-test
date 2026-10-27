/* Guard the whole stock/finance command, including asynchronous period checks. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatStockOperationBridge=api})(globalThis,()=>{
 'use strict';const serial=JSON.stringify;
 function create(options){let busy=false;return Object.freeze({async mutate(command,baseline){
  if(busy)throw Error('Сохранение уже выполняется');
  const actor=options.getIdentity?.();if(!actor||!['admin','accountant'].includes(actor.role))throw Error('Недостаточно прав');
  const initial=serial(options.getData()),identity=serial(actor);if(initial!==baseline)throw Error('Данные изменились. Откройте новую форму; введённые значения сохранены');
  if(typeof options.ensureOpenPeriods!=='function')throw Error('Проверка периодов недоступна');
  busy=true;try{const prepared=options.prepare(options.getData(),command,{actor});await options.ensureOpenPeriods([...new Set([command.date,...(prepared.affectedDates||[])])]);
   if(serial(options.getIdentity?.())!==identity||serial(options.getData())!==initial)throw Error('Документы или права изменились во время проверки. Введённые значения сохранены');
   if(prepared.cancelled){if(!options.backup)throw Error('Резервное копирование недоступно');await options.backup(initial);if(serial(options.getIdentity?.())!==identity||serial(options.getData())!==initial)throw Error('Данные или права изменились во время резервного копирования')}
   options.commit(prepared);return prepared;
  }finally{busy=false}
 }})}
 return Object.freeze({create});
});
if(typeof window==='object'&&typeof document==='object'&&window.ArbatStockOperationBridge){
 (()=>{
  const financeKey='arbat-finance-demo-live',warehouseKey='arbat-warehouse-v1';
  const bridge=window.ArbatStockOperationBridge.create({
   getData:()=>({finance:db,warehouse:JSON.parse(localStorage.getItem(warehouseKey)||'{}')}),
   getIdentity:()=>window.abIdentity,
   ensureOpenPeriods:dates=>{if(!window.arbatEnsureOpenPeriods)throw Error('Проверка периодов ещё загружается');return window.arbatEnsureOpenPeriods(dates)},
   prepare:(state,command,{actor})=>window.ArbatStockOperations.prepare(state,command,{actor,fifo:window.arbatFifo}),
   backup:async raw=>{if(!window.ArbatBackups?.save)throw Error('Резервное копирование недоступно');await window.ArbatBackups.save('arbat-stock-operation-backup-'+Date.now(),raw)},
   commit:prepared=>{
    const previousDb=db,previousFinance=localStorage.getItem(financeKey),previousWarehouse=localStorage.getItem(warehouseKey);
    try{localStorage.setItem(warehouseKey,JSON.stringify(prepared.warehouse));db=prepared.finance;save()}
    catch(error){db=previousDb;try{if(previousWarehouse===null)localStorage.removeItem(warehouseKey);else localStorage.setItem(warehouseKey,previousWarehouse);if(previousFinance===null)localStorage.removeItem(financeKey);else localStorage.setItem(financeKey,previousFinance)}catch(rollbackError){console.error('Stock rollback failed',rollbackError)}throw error}
    window.dispatchEvent(new Event('arbat-warehouse-changed'));window.dispatchEvent(new Event('storage'));
   }
  });window.arbatApplyStockOperation=(command,baseline)=>bridge.mutate(command,baseline).then(result=>({documentId:result.documentId,realizationId:result.realizationId}));
 })();
}
