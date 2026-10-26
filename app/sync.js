(()=>{
  const U='https://albkplrjiksydkjkivlm.supabase.co';
  const P='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const K=['arbat-finance-demo-live','arbat-warehouse-v1'];
  const T=['finance_state','warehouse_state'];
  const B='arbat-cloud-revision-v1';
  const RECOVERY='arbat-unsynced-recovery-v1:';
  let rev={},active=false,busy=false,halt=false,pending={},conflictRetries=0,lastCloudCheck=0,writeVersion=0;
  const previous=[null,null];
  const financialDocuments=['vatAdvanceEvents','taxObligationEvents','deals','realizations','expenses','cash','calendar','costs','labor','workActs','workBatches','crewSettlements'];
  function attributeDocuments(payload,prior){
    const actor=window.abIdentity;if(!actor?.email||!payload||typeof payload!=='object')return payload;
    const author={id:actor.user_id||actor.id||'',name:actor.full_name||actor.email,email:actor.email};
    const now=new Date().toISOString();
    for(const collection of financialDocuments){
      const rows=payload[collection];if(!Array.isArray(rows))continue;
      const previousRows=Array.isArray(prior?.[collection])?prior[collection]:[];
      const indexed=new Map(previousRows.map(row=>[String(row?._id||row?.id||''),row]).filter(([id])=>id));
      for(const row of rows){
        if(!row||typeof row!=='object')continue;
        const id=String(row._id||row.id||'');if(!id)continue;
        const before=indexed.get(id);
        if(!before){row.createdBy??=author;row.createdAt??=now;row.updatedBy??=author;row.updatedAt??=now;continue}
        row.createdBy??=before.createdBy;row.createdAt??=before.createdAt;
        const strip=x=>{const copy={...x};delete copy.updatedBy;delete copy.updatedAt;return JSON.stringify(copy)};
        if(strip(row)!==strip(before)){row.updatedBy=author;row.updatedAt=now}
        else {row.updatedBy??=before.updatedBy;row.updatedAt??=before.updatedAt}
      }
    }
    return payload;
  }
  const baseSet=Storage.prototype.setItem;
  const load=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
  const put=(k,v)=>baseSet.call(localStorage,k,JSON.stringify(v));

  async function api(path,body){
    const token=await window.abGetToken();
    const response=await fetch(U+'/rest/v1/'+path,{
      method:body===undefined?'GET':'POST',
      headers:{apikey:P,Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok){const error=Error(result.message||result.error||'HTTP '+response.status);error.status=response.status;throw error;}
    return result;
  }

  const closedPeriod=message=>String(message||'').match(/Financial period (\d{4}-\d{2}) is closed/i)?.[1]||'';
  const periodMessage=period=>'Финансовый период '+period+' закрыт. Изменение документа не сохранено. Администратор может открыть период с указанием причины в настройках «Закрытие периода». После исправления период следует закрыть снова.';
  const syncError=error=>closedPeriod(error.message)?periodMessage(closedPeriod(error.message)):error.message;
  window.arbatEnsureOpenPeriods=async dates=>{
    const periods=new Set(dates.filter(Boolean).map(date=>String(date).slice(0,7)));
    if(!periods.size)return;
    const rows=await api('finance_periods?select=period,status&status=eq.closed');
    if(!Array.isArray(rows))throw Error('Не удалось проверить статус финансового периода. Документ не сохранён.');
    const locked=rows.find(row=>row.status==='closed'&&periods.has(row.period));
    if(locked)throw Error(periodMessage(locked.period));
  };

  async function fetchAll(){
    return Promise.all(T.map(async table=>{
      const rows=await api(table+'?select=payload,revision&id=eq.main');
      if(!rows[0])throw Error('Не создана общая таблица '+table);
      return rows[0];
    }));
  }

  const recoveryOwner=()=>{
    const actor=window.abIdentity;
    if(!actor||actor.role==='employee')return '';
    return String(actor.user_id||actor.id||actor.email||'').trim().toLowerCase();
  };
  const recoveryKey=owner=>RECOVERY+encodeURIComponent(owner);
  function recoveryFor(owner){
    if(!owner)return null;
    const raw=localStorage.getItem(recoveryKey(owner));
    if(raw===null)return null;
    try{const snapshot=JSON.parse(raw);return snapshot.owner===owner?snapshot:{owner,rawSnapshot:raw}}
    catch{return {owner,rawSnapshot:raw}}
  }
  function preserveRecovery(error){
    const owner=recoveryOwner();if(!owner)return null;
    const existing=recoveryFor(owner);if(existing)return existing;
    const actor=window.abIdentity;
    const snapshot={format:'arbat-unsynced-recovery-v1',owner,identity:{user_id:actor.user_id||actor.id||'',email:actor.email||'',full_name:actor.full_name||''},createdAt:new Date().toISOString(),reason:error.message,revisions:{...rev},base:{finance:previous[0],warehouse:previous[1]},stores:{finance:load(K[0]),warehouse:load(K[1])},rawStorage:Object.fromEntries(K.map(key=>[key,localStorage.getItem(key)]))};
    try{put(recoveryKey(owner),snapshot)}catch(error){snapshot.storageError=error.message}
    return snapshot;
  }
  function showRecovery(snapshot){
    if(!snapshot||snapshot.owner!==recoveryOwner())return;
    const owner=snapshot.owner,key=recoveryKey(owner),auth=document.getElementById('ab-auth'),logout=document.getElementById('ab-logout');let discarded=false,retrying=false;
    document.getElementById('ab-sync-recovery')?.remove();
    auth?.classList.remove('ab-checking');
    const form=document.getElementById('ab-form');if(form)form.hidden=true;
    const box=document.createElement('div');box.id='ab-sync-recovery';
    const period=closedPeriod(snapshot.reason);
    const note=document.createElement('p');note.textContent=period?periodMessage(period)+' Ваши изменения сохранены в отдельной копии. После открытия периода нажмите «Повторить синхронизацию». ' + (window.abIdentity?.role==='admin'?'':'Обратитесь к администратору. '):'Сохранена отдельная копия несинхронизированных данных. Скачайте её для сверки с администратором. Автоматическое сохранение остановлено.';
    const download=document.createElement('button');download.id='ab-recovery-download';download.type='button';download.textContent='Скачать несохранённую копию';
    download.onclick=()=>{
      if(discarded||recoveryOwner()!==owner)return;
      const current=recoveryFor(owner)||(snapshot.storageError?snapshot:null);if(!current)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='arbat-unsynced-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    };
    const discard=document.createElement('button');discard.id='ab-recovery-discard';discard.type='button';discard.textContent='Отказаться от локальных изменений';discard.style.cssText='margin-top:10px';
    discard.onclick=async()=>{
      if(discarded||retrying||recoveryOwner()!==owner||(!recoveryFor(owner)&&!snapshot.storageError))return;
      if(!await window.ArbatPopup.confirm('Отказаться от несохранённых локальных изменений и загрузить серверную версию? Сначала скачайте копию, если она нужна для сверки.'))return;
      if(discarded||retrying||recoveryOwner()!==owner||(!recoveryFor(owner)&&!snapshot.storageError))return;
      discard.disabled=true;
      try{
        const fresh=await fetchAll();
        if(recoveryOwner()!==owner)return;
        applyRemote(fresh);localStorage.removeItem(key);discarded=true;pending={};box.remove();location.reload();
      }catch(error){window.abMessage('Копия сохранена. Не удалось загрузить серверную версию: '+error.message);discard.disabled=false}
    };
    box.append(note,download);
    if(snapshot.base?.finance&&snapshot.base?.warehouse){
      const retry=document.createElement('button');retry.id='ab-recovery-retry';retry.type='button';retry.textContent='Повторить синхронизацию';
      retry.onclick=async()=>{
        if(discarded||retrying||recoveryOwner()!==owner)return;
        const current=recoveryFor(owner)||(snapshot.storageError?snapshot:null);if(!current?.base?.finance||!current.base.warehouse)return;
        retrying=true;retry.disabled=true;discard.disabled=true;
        try{
          const fresh=await fetchAll();if(discarded||recoveryOwner()!==owner)return;
          const stores=['finance','warehouse'],visible=stores.map((store,i)=>mergeShared(current.base[store],fresh[i].payload,current.stores[store]));
          const result=await api('rpc/update_shared_state_batch',{p_changes:stores.map((store,i)=>({store,payload:visible[i],expected_revision:fresh[i].revision}))});
          if(discarded||recoveryOwner()!==owner)return;
          for(let i=0;i<stores.length;i++)if(!Number.isSafeInteger(result?.[stores[i]])||result[stores[i]]<=fresh[i].revision)throw Error('Некорректное подтверждение общей версии');
          applyRemote(visible.map((payload,i)=>({payload,revision:result[stores[i]]})));
          localStorage.removeItem(key);discarded=true;box.remove();location.reload();
        }catch(error){window.abMessage('Копия сохранена. Синхронизация не завершена: '+syncError(error))}
        finally{retrying=false;retry.disabled=false;discard.disabled=false}
      };
      box.append(retry);
    }
    if(period&&window.abIdentity?.role==='admin'){
      const label=document.createElement('label');label.textContent='Причина открытия периода '+period;
      const reason=document.createElement('input');reason.id='ab-recovery-period-reason';reason.type='text';reason.placeholder='Не менее 10 символов';label.append(reason);
      const reopen=document.createElement('button');reopen.id='ab-recovery-open-period';reopen.type='button';reopen.textContent='Открыть период '+period;
      reopen.onclick=async()=>{
        if(discarded||retrying||recoveryOwner()!==owner||window.abIdentity?.role!=='admin')return;
        const explanation=String(reason.value||'').trim();
        if(explanation.length<10){window.abMessage('Укажите причину открытия периода: не менее 10 символов.');return;}
        if(!await window.ArbatPopup.confirm('Открыть финансовый период '+period+' для исправления? Причина будет записана в журнале.'))return;
        if(discarded||retrying||recoveryOwner()!==owner||window.abIdentity?.role!=='admin')return;
        retrying=true;reopen.disabled=true;discard.disabled=true;
        try{
          await api('rpc/set_finance_period_status',{p_period:period,p_status:'open',p_reason:explanation});
          if(recoveryOwner()!==owner)return;
          window.abMessage('Период '+period+' открыт. Нажмите «Повторить синхронизацию», чтобы сохранить вашу копию с проверкой изменений коллег. После исправления закройте период в настройках.');
        }catch(error){window.abMessage('Период не открыт. Копия сохранена: '+syncError(error));}
        finally{retrying=false;reopen.disabled=false;discard.disabled=false;}
      };
      box.append(label,reopen);
    }
    box.append(discard);
    if(logout){logout.hidden=false;logout.style.position='static';logout.style.marginTop='10px';box.append(logout)}
    (auth?.querySelector('.card')||document.body).append(box);
  }

  function reportSync(status){try{window.ArbatTelemetry?.capture('arbat_sync_result',{status})}catch{}}
  function fail(error){
    reportSync('failed');
    active=false;
    halt=true;
    document.body.classList.remove('ab-ready');
    try{const snapshot=preserveRecovery(error);showRecovery(snapshot);window.abMessage('Синхронизация приостановлена: '+syncError(error)+'. '+(snapshot?.storageError?'Отдельная копия не записана: '+snapshot.storageError+'. Скачайте её сейчас; не закрывайте и не обновляйте страницу.':'Скачайте несохранённую копию для проверки конфликта.'))}
    catch(storageError){window.abMessage('Синхронизация приостановлена: '+syncError(error)+'. Не удалось сохранить отдельную копию: '+storageError.message+'. Не закрывайте и не обновляйте страницу.')}
  }

  function applyRemote(rows,visible=rows.map(row=>row.payload)){
    for(let i=0;i<K.length;i++){previous[i]=JSON.parse(JSON.stringify(rows[i].payload));baseSet.call(localStorage,K[i],JSON.stringify(visible[i]))}
    rev=Object.fromEntries(T.map((table,i)=>[table,rows[i].revision]));
    put(B,rev);
    window.dispatchEvent(new CustomEvent('arbat:cloud-update',{detail:{finance:visible[0],warehouse:visible[1],revisions:{...rev}}}));
    lastCloudCheck=Date.now();
  }

  function mergeShared(base,remote,local){
    if(!base||!remote||!local||typeof base!=='object'||typeof remote!=='object'||typeof local!=='object')return local;
    const merged={...remote};
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const conflict=key=>{throw Error('Конфликт документа: '+key+' одновременно изменён другим сотрудником. Сверьте обе версии перед повторным сохранением')};
    for(const key of new Set([...Object.keys(base),...Object.keys(local)])){
      const before=base[key],mine=local[key],theirs=remote[key];
      if(Array.isArray(mine)&&Array.isArray(theirs)){
        const identity=row=>String(row?._id||row?.id||'');
        if(!mine.every(row=>identity(row))||!theirs.every(row=>identity(row))){if(!same(mine,before)){if(!same(theirs,before)&&!same(mine,theirs))conflict(key);merged[key]=mine}continue}
        const result=new Map(theirs.map(row=>[identity(row),row])),baseMap=new Map((Array.isArray(before)?before:[]).map(row=>[identity(row),row]));
        if(key==='cash'){
          const mineMap=new Map(mine.map(row=>[identity(row),row]));
          for(const id of new Set([...baseMap.keys(),...result.keys(),...mineMap.keys()])){
            const old=baseMap.get(id),localRow=mineMap.get(id),remoteRow=result.get(id),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
            if([old,localRow,remoteRow].some(row=>row?.supplierAllocations?.length)&&!same(localRow,old)&&!same(remoteRow,old)&&!same(localRow,remoteRow))throw Error('Конфликт привязки оплаты: платёж '+id+' одновременно изменён другим сотрудником. Сверьте связи перед повторным сохранением');
          }
        }
        const mineRows=new Map(mine.map(row=>[identity(row),row]));
        for(const id of new Set([...baseMap.keys(),...result.keys(),...mineRows.keys()])){
          const old=baseMap.get(id),mineRow=mineRows.get(id),theirRow=result.get(id);
          if(!same(mineRow,old)&&!same(theirRow,old)&&!same(mineRow,theirRow))conflict(key+' / '+id);
        }
        for(const [id,row] of new Map(mine.map(row=>[identity(row),row]))){const old=baseMap.get(id);if(!old||JSON.stringify(row)!==JSON.stringify(old))result.set(id,row)}
        for(const [id,row] of baseMap)if(!mine.some(candidate=>identity(candidate)===id)&&JSON.stringify(result.get(id))===JSON.stringify(row))result.delete(id);
        merged[key]=[...result.values()];
      }else if(!same(mine,before)){if(!same(theirs,before)&&!same(mine,theirs))conflict(key);merged[key]=mine;}
    }
    return merged;
  }

  async function flush(){
    if(!active||busy||halt||!Object.keys(pending).length)return;
    busy=true;
    const batch={...pending};pending={};
    try{
      const changes=[];
      for(let i=0;i<K.length;i++)if(K[i] in batch)changes.push({store:i===0?'finance':'warehouse',payload:JSON.parse(batch[K[i]]),expected_revision:rev[T[i]]});
      const next=await api('rpc/update_shared_state_batch',{p_changes:changes});
      for(const change of changes)if(!Number.isSafeInteger(next?.[change.store])||next[change.store]<=change.expected_revision)throw Error('Некорректный ответ сервера при сохранении общей версии');
      for(let i=0;i<K.length;i++)if(K[i] in batch){previous[i]=JSON.parse(batch[K[i]]);rev[T[i]]=next[i===0?'finance':'warehouse']}
      put(B,rev);conflictRetries=0;reportSync('success');
    }catch(error){
      if(conflictRetries<2&&/revision|conflict|expected|измен/i.test(error.message)){
        reportSync('retry');
        try{
          const fresh=await fetchAll(),visible=fresh.map(row=>row.payload),recovered={...batch,...pending};
          // Read pending after the fetch: the user may have saved again while it ran.
          for(let i=0;i<K.length;i++)if(K[i] in recovered){
            visible[i]=mergeShared(previous[i],fresh[i].payload,JSON.parse(recovered[K[i]]));
            recovered[K[i]]=JSON.stringify(visible[i]);
          }
          pending=recovered;conflictRetries++;applyRemote(fresh,visible);
          window.abMessage('Изменения коллеги объединены с вашими. Сохраняем общую версию…');
        }
        catch(recoveryError){fail(recoveryError)}
      }else fail(error)
    }finally{
      busy=false;
      if(active&&Object.keys(pending).length)queueMicrotask(flush);
    }
  }

  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&K.includes(key)&&active&&!halt&&key===K[0]){
      try{value=JSON.stringify(attributeDocuments(JSON.parse(value),previous[0]))}catch(error){console.error('Author metadata failed',error)}
    }
    const result=baseSet.call(this,key,value);
    if(this===localStorage&&K.includes(key)&&active&&!halt){writeVersion++;pending[key]=value;queueMicrotask(flush)}
    return result;
  };

  window.arbatCloudBoot=async()=>{
    const recovery=recoveryFor(recoveryOwner());
    if(recovery){active=false;halt=true;document.body.classList.remove('ab-ready');showRecovery(recovery);window.abMessage('Есть несохранённые изменения предыдущей сессии. Скачайте копию и сверьте данные перед продолжением.');return false}
    const rows=await fetchAll();
    const saved=load(B);
    if(!saved||T.some((table,i)=>Number(saved[table])!==Number(rows[i].revision))){
      active=false;
      for(let i=0;i<K.length;i++){
        const backup='arbat-original-'+K[i];
        if(localStorage.getItem(K[i])&&!localStorage.getItem(backup))baseSet.call(localStorage,backup,localStorage.getItem(K[i]));
      }
      applyRemote(rows);
      // Allow one reload to rehydrate legacy in-memory state, never an infinite loop.
      const bootKey='arbat-cloud-boot-reloads';
      const count=Number(sessionStorage.getItem(bootKey)||0);
      if(count<1){
        sessionStorage.setItem(bootKey,String(count+1));
        location.reload();
      }else{
        sessionStorage.removeItem(bootKey);
        window.abMessage('Не удалось согласовать локальные данные с сервером. Автоматическая перезагрузка остановлена, чтобы не зациклить вход. Закройте другие вкладки ARBAT FINANCE и обновите страницу один раз.');
      }
      return false;
    }
    sessionStorage.removeItem('arbat-cloud-boot-reloads');
    rev=saved;
    for(let i=0;i<rows.length;i++)previous[i]=rows[i].payload;
    active=true;
    const refresh=async()=>{
      if(!active||busy||Object.keys(pending).length)return;
      try{
        const version=writeVersion,fresh=await fetchAll();
        if(busy||Object.keys(pending).length||version!==writeVersion)return;
        if(T.some((table,i)=>Number(fresh[i].revision)!==Number(rev[table])))applyRemote(fresh);else lastCloudCheck=Date.now();
      }catch(error){
        if(error.name==='TypeError'||[408,429,500,502,503,504].includes(error.status)){window.abMessage('Нет связи с общей базой. Повторяем проверку автоматически; локальные данные сохранены.');return;}
        fail(error);
      }
    };
    setInterval(refresh,4500);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCloudCheck>1500)refresh()});
    window.addEventListener('focus',()=>{if(Date.now()-lastCloudCheck>1500)refresh()});
    return true;
  };
})();
