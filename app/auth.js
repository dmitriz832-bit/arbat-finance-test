(()=>{
  const U='https://albkplrjiksydkjkivlm.supabase.co';
  const K='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const S='arbat-session-v1';
  const LAST_EMAIL='arbat-last-email-v1';
  let session;
  try{session=JSON.parse(localStorage.getItem(S))}catch{}

  const logoutButton=document.createElement('button');
  logoutButton.id='ab-logout';
  logoutButton.type='button';
  logoutButton.textContent='Выйти';
  logoutButton.hidden=true;
  logoutButton.onclick=async()=>{
    if(!confirm('Выйти из ARBAT FINANCE?'))return;
    logoutButton.disabled=true;
    try{if(session?.access_token)await call('/auth/v1/logout',{})}catch(e){}
    finally{
      session=null;
      localStorage.removeItem(S);
      sessionStorage.removeItem('arbat-last-route');
      sessionStorage.removeItem('arbat-multi-hydrated');
      localStorage.removeItem('arbat-cloud-revision-v1');
      location.reload();
    }
  };
  document.body.appendChild(logoutButton);

  const gate=document.createElement('div');
  gate.id='ab-auth';
  gate.innerHTML=`
    <div class="card">
      <h2>ARBAT FINANCE</h2>
      <p id="ab-message">Войдите в рабочую систему</p>
      <form id="ab-form" data-ui-labels="1" autocomplete="on">
        <label for="ab-email">Электронная почта</label>
        <input id="ab-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Почта сотрудника" required>
        <label for="ab-password">Пароль</label>
        <input id="ab-password" name="password" type="password" minlength="8" autocomplete="current-password" placeholder="Пароль" required>
        <button type="submit">Войти</button>
      </form>
    </div>`;
  document.body.append(gate);

  const f=document.getElementById('ab-form');
  const message=document.getElementById('ab-message');
  const emailField=document.getElementById('ab-email');
  try{emailField.value=localStorage.getItem(LAST_EMAIL)||''}catch(e){}
  const showLogin=()=>{
    f.hidden=false;
    gate.classList.remove('ab-checking');
    requestAnimationFrame(()=>{(emailField.value?f.elements.password:emailField).focus({preventScroll:true})});
  };
  if(session){
    f.hidden=true;
    gate.classList.add('ab-checking');
    message.textContent='Загружаем ARBAT FINANCE…';
  }
  window.abMessage=x=>{message.textContent=x};

  async function call(path,body,auth=true){
    const r=await fetch(U+path,{method:'POST',headers:{apikey:K,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(body)});
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(x.msg||x.error_description||x.message||x.error||'HTTP '+r.status);
    return x;
  }
  function save(s){session=s;localStorage.setItem(S,JSON.stringify(s))}
  window.abGetToken=async()=>{
    if(!session?.access_token)throw Error('Требуется вход');
    if(session.expires_at&&Date.now()/1000>session.expires_at-60)save(await call('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false));
    return session.access_token;
  };
  async function enter(){
    window.abMessage('Проверяем права и загружаем общую базу…');
    await window.abGetToken();
    const identity=await call('/rest/v1/rpc/claim_staff_access',{});
    window.abIdentity=identity;
    window.dispatchEvent(new CustomEvent('arbat:identity',{detail:identity}));
    if(identity.role==='employee'){
      const keys=['arbat-finance-demo-live','arbat-warehouse-v1','arbat-cloud-revision-v1'];
      if(keys.some(x=>localStorage.getItem(x)!==null)){
        for(const key of keys)localStorage.removeItem(key);
        location.reload();
        return;
      }
      document.body.classList.add('ab-profile-only','ab-ready');
      logoutButton.hidden=false;
      if(window.abProfileReady)window.abProfileReady(identity);
      document.getElementById('ab-profile-open')?.click();
      return;
    }
    const complete=await window.arbatCloudBoot();
    if(complete){
      document.body.classList.add('ab-ready');
      logoutButton.hidden=false;
      if(window.abProfileReady)window.abProfileReady(identity);
    }
  }
  f.onsubmit=async e=>{
    e.preventDefault();
    const email=emailField.value.trim().toLowerCase();
    try{
      window.abMessage('Проверка пароля…');
      save(await call('/auth/v1/token?grant_type=password',{email,password:f.elements.password.value},false));
      localStorage.setItem(LAST_EMAIL,email);
      await enter();
    }catch(error){
      showLogin();
      window.abMessage('Не удалось войти: '+error.message);
    }
  };

  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.get('access_token')){
    save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)});
    history.replaceState(null,'',location.pathname);
  }
  if(session)enter().catch(()=>{
    showLogin();
    window.abMessage('Сессия завершена. Войдите снова.');
  });
})();
