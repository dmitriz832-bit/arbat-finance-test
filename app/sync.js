(()=>{
  const U='https://albkplrjiksydkjkivlm.supabase.co';
  const P='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const K=['arbat-finance-demo-live','arbat-warehouse-v1'];
  const T=['finance_state','warehouse_state'];
  const B='arbat-cloud-revision-v1';
  let rev={},active=false,busy=false,halt=false,pending={};
  const previous=[null,null];
  const financialDocuments=['deals','realizations','expenses','cash','calendar','costs','labor','workActs','workBatches','crewSettlements'];
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
    if(!response.ok)throw Error(result.message||result.error||'HTTP '+response.status);
    return result;
  }

  async function fetchAll(){
    return Promise.all(T.map(async table=>{
      const rows=await api(table+'?select=payload,revision&id=eq.main');
      if(!rows[0])throw Error('Не создана общая таблица '+table);
      return rows[0];
    }));
  }

  function fail(error){
    active=false;
    halt=true;
    document.body.classList.remove('ab-ready');
    window.abMessage('Синхронизация приостановлена: '+error.message+'. Ваши последние изменения сохранены локально. Не продолжайте работу до проверки конфликта.');
  }

  function applyRemote(rows){
    for(let i=0;i<K.length;i++){previous[i]=rows[i].payload;baseSet.call(localStorage,K[i],JSON.stringify(rows[i].payload))}
    rev=Object.fromEntries(T.map((table,i)=>[table,rows[i].revision]));
    put(B,rev);
    window.dispatchEvent(new CustomEvent('arbat:cloud-update',{detail:{finance:rows[0].payload,warehouse:rows[1].payload,revisions:{...rev}}}));
  }

  async function flush(){
    if(!active||busy||halt)return;
    busy=true;
    try{
      for(let i=0;i<K.length;i++){
        const key=K[i];
        if(!(key in pending))continue;
        const value=pending[key];
        delete pending[key];
        const next=await api('rpc/update_shared_state',{
          p_store:i===0?'finance':'warehouse',
          p_payload:JSON.parse(value),
          p_expected_revision:rev[T[i]]
        });
        previous[i]=JSON.parse(value);
        rev[T[i]]=next;
        put(B,rev);
      }
    }catch(error){fail(error)}finally{
      busy=false;
      if(active&&Object.keys(pending).length)flush();
    }
  }

  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&K.includes(key)&&active&&!halt&&key===K[0]){
      try{value=JSON.stringify(attributeDocuments(JSON.parse(value),previous[0]))}catch(error){console.error('Author metadata failed',error)}
    }
    const result=baseSet.call(this,key,value);
    if(this===localStorage&&K.includes(key)&&active&&!halt){pending[key]=value;flush()}
    return result;
  };

  window.arbatCloudBoot=async()=>{
    const rows=await fetchAll();
    const saved=load(B);
    if(!saved||T.some((table,i)=>Number(saved[table])!==Number(rows[i].revision))){
      active=false;
      for(let i=0;i<K.length;i++){
        const backup='arbat-original-'+K[i];
        if(localStorage.getItem(K[i])&&!localStorage.getItem(backup))baseSet.call(localStorage,backup,localStorage.getItem(K[i]));
      }
      applyRemote(rows);
      location.reload();
      return false;
    }
    rev=saved;
    for(let i=0;i<rows.length;i++)previous[i]=rows[i].payload;
    active=true;
    setInterval(async()=>{
      if(!active||busy||Object.keys(pending).length)return;
      try{
        const fresh=await fetchAll();
        if(T.some((table,i)=>Number(fresh[i].revision)!==Number(rev[table])))applyRemote(fresh);
      }catch(error){fail(error)}
    },4500);
    return true;
  };
})();
