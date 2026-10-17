(()=>{
  const U='https://albkplrjiksydkjkivlm.supabase.co';
  const P='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const K=['arbat-finance-demo-live','arbat-warehouse-v1'];
  const T=['finance_state','warehouse_state'];
  const B='arbat-cloud-revision-v1';
  let rev={},active=false,busy=false,halt=false,pending={};
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
    for(let i=0;i<K.length;i++)baseSet.call(localStorage,K[i],JSON.stringify(rows[i].payload));
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
        rev[T[i]]=next;
        put(B,rev);
      }
    }catch(error){fail(error)}finally{
      busy=false;
      if(active&&Object.keys(pending).length)flush();
    }
  }

  Storage.prototype.setItem=function(key,value){
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
