/* Durable deletion snapshots. Live data, auth and unsynced recovery keys are never migrated. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports){module.exports=api;return}
 const manager=api.createManager({storage:root.localStorage,archive:api.indexedArchive(root.indexedDB)});root.ArbatBackups=manager;
 manager.migrateLegacy().catch(error=>console.warn('Deletion backup archive:',error.message));
 const anchor=document.getElementById('export');if(anchor){const button=document.createElement('button');button.type='button';button.id='exportDeletionBackups';button.textContent='Скачать архив удалений';anchor.after(button);button.onclick=async()=>{button.disabled=true;try{const entries=await manager.list(),url=URL.createObjectURL(new Blob([JSON.stringify({format:'arbat-deletion-archive-v1',entries},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='arbat-deletion-archive-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}catch(error){alert('Не удалось скачать архив: '+error.message)}finally{button.disabled=false}}}
})(globalThis,function(){
 'use strict';
 const financial=/^arbat-(?:finance-(?:bulk|delete)|work-(?:batch|delete|edit)|deal-delete)-backup-\d+$/;
 const warehouse=/^arbat-(?:warehouse-backup|delete-snapshot)-\d+$/;
 const isLegacyKey=key=>key==='arbat-last-deletion-backup'||financial.test(key)||warehouse.test(key)||/^arbat-tax-register-backup-\d+$/.test(key);
 const same=(a,b)=>{if(a===b)return true;try{return JSON.stringify(JSON.parse(a??'null'))===JSON.stringify(JSON.parse(b??'null'))}catch{return false}};
 function createManager({storage,archive}){
  let active=null,migrating=null;
  async function save(key,value){const record={key,value:String(value),createdAt:new Date().toISOString()},id=await archive.write(record),read=await archive.read(id);if(!read||read.value!==record.value||read.key!==key)throw Error('Резервная копия не прошла проверку чтения');return id;}
  function migrateLegacy(){
   if(migrating)return migrating;
   migrating=(async()=>{const keys=[];for(let n=0;n<storage.length;n++){const k=storage.key(n);if(isLegacyKey(k))keys.push(k)}for(const key of keys){const raw=storage.getItem(key);if(raw===null)continue;await save(key,raw);if(storage.getItem(key)===raw)storage.removeItem(key)}})().finally(()=>{migrating=null});
   return migrating;
  }
  async function prepare(state,action='Удаление'){
   await migrateLegacy();await save('deletion',JSON.stringify({format:'arbat-deletion-backup-v1',action,...state}));
   return {matches:current=>['finance','warehouse','financeModel','warehouseModel'].every(k=>current[k]===state[k]),run(fn){if(active)throw Error('Уже выполняется другое удаление');active=state;try{return fn()}finally{active=null}}};
  }
  function checkpoint(key,value){
   if(!financial.test(key)&&!warehouse.test(key))throw Error('Неизвестный ключ резервной копии');
   if(!active)throw Error('Резервная копия не подготовлена. Повторите удаление через подтверждение.');
   let matches=false;
   if(financial.test(key))matches=same(value,active.financeModel)||same(value,active.finance);
   else {try{const snapshot=JSON.parse(value);matches=(same(JSON.stringify(snapshot.warehouse),active.warehouse)||same(JSON.stringify(snapshot.warehouse),active.warehouseModel))&&(same(JSON.stringify(snapshot.finance),active.financeModel)||same(JSON.stringify(snapshot.finance),active.finance))}catch{}}
   if(!matches)throw Error('Данные изменились после резервного копирования. Повторите удаление.');
  }
  return {save,prepare,checkpoint,migrateLegacy,list:async()=>{await migrateLegacy();return archive.list()}};
 }
 function indexedArchive(indexedDB){
  let opened=null;
  function open(){if(!opened)opened=new Promise((resolve,reject)=>{if(!indexedDB){reject(Error('Хранилище резервных копий недоступно в этом браузере'));return}const request=indexedDB.open('arbat-finance-deletion-backups',1);request.onupgradeneeded=()=>{request.result.createObjectStore('snapshots',{keyPath:'id',autoIncrement:true})};request.onerror=()=>reject(request.error||Error('Не удалось открыть архив'));request.onblocked=()=>reject(Error('Архив занят другой вкладкой. Закройте её и повторите.'));request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db)}}).catch(error=>{opened=null;throw error});return opened;}
  async function transact(mode,operation){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode),request=operation(tx.objectStore('snapshots'));let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||Error('Ошибка сохранения архива'));tx.onabort=()=>reject(tx.error||Error('Сохранение архива отменено'))});}
  return {write:record=>transact('readwrite',store=>store.add(record)),read:id=>transact('readonly',store=>store.get(id)),list:()=>transact('readonly',store=>store.getAll())};
 }
 return {createManager,isLegacyKey,indexedArchive};
});
