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
        <label for="ab-password-confirm" id="ab-confirm-label" hidden>Повторите пароль</label>
        <input id="ab-password-confirm" name="password_confirm" type="password" minlength="8" autocomplete="new-password" placeholder="Повторите новый пароль" hidden>
        <button type="submit" id="ab-submit">Войти</button>
        <button type="button" id="ab-password-link" class="ab-secondary">Забыли пароль?</button>
        <button type="button" id="ab-login-instead" class="ab-secondary" hidden>У меня уже есть пароль</button>
        <p id="ab-auth-help" class="ab-auth-help" hidden></p>
      </form>
    </div>`;
  document.body.append(gate);

  const f=document.getElementById('ab-form');
  const message=document.getElementById('ab-message');
  const emailField=document.getElementById('ab-email');
  const emailLabel=document.querySelector('label[for="ab-email"]');
  const passwordField=document.getElementById('ab-password');
  const passwordConfirm=document.getElementById('ab-password-confirm');
  const confirmLabel=document.getElementById('ab-confirm-label');
  const submitButton=document.getElementById('ab-submit');
  const passwordLink=document.getElementById('ab-password-link');
  const loginInstead=document.getElementById('ab-login-instead');
  const authHelp=document.getElementById('ab-auth-help');
  let authMode='login',statusRequest=0;
  try{emailField.value=localStorage.getItem(LAST_EMAIL)||''}catch(e){}
  const showLogin=()=>{
    authMode='login';emailLabel.hidden=false;emailField.hidden=false;emailField.required=true;confirmLabel.hidden=true;passwordConfirm.hidden=true;passwordConfirm.required=false;passwordField.hidden=false;passwordField.required=true;passwordField.autocomplete='current-password';passwordField.placeholder='Пароль';submitButton.hidden=false;submitButton.disabled=false;submitButton.textContent='Войти';passwordLink.hidden=false;passwordLink.disabled=false;loginInstead.hidden=true;authHelp.hidden=false;authHelp.textContent='Доступ выдаёт администратор. Если забыли пароль, запросите ссылку для восстановления.';
    f.hidden=false;
    gate.classList.remove('ab-checking');
    requestAnimationFrame(()=>{(emailField.value?f.elements.password:emailField).focus({preventScroll:true})});
  };
  const showPasswordSetup=(kind='invite')=>{
    authMode='setup';f.hidden=false;gate.classList.remove('ab-checking');emailLabel.hidden=true;emailField.hidden=true;emailField.required=false;
    passwordField.value='';passwordField.autocomplete='new-password';passwordField.placeholder='Не менее 8 символов';confirmLabel.hidden=false;passwordConfirm.hidden=false;passwordConfirm.required=true;passwordConfirm.value='';
    submitButton.textContent='Сохранить пароль';submitButton.hidden=false;submitButton.disabled=false;passwordLink.hidden=true;loginInstead.hidden=true;authHelp.hidden=false;authHelp.textContent='После сохранения этого пароля последующие входы будут выполняться через обычную форму.';
    message.textContent=kind==='recovery'?'Установите новый пароль':'Завершите первый вход';requestAnimationFrame(()=>passwordField.focus({preventScroll:true}));
  };
  const showFirstLogin=()=>{
    authMode='first-login';emailLabel.hidden=false;emailField.hidden=false;emailField.required=true;passwordField.hidden=true;passwordField.required=false;confirmLabel.hidden=true;passwordConfirm.hidden=true;passwordConfirm.required=false;
    submitButton.hidden=false;submitButton.disabled=false;submitButton.textContent='Отправить ссылку для первого входа';passwordLink.hidden=true;loginInstead.hidden=false;authHelp.hidden=false;
    message.textContent='Первый вход сотрудника';authHelp.textContent='Подтвердите свою почту по персональной ссылке. После перехода система откроет два поля для создания пароля.';
  };
  if(session){
    f.hidden=true;
    gate.classList.add('ab-checking');
    message.textContent='Загружаем ARBAT FINANCE…';
  }
  window.abMessage=x=>{message.textContent=x};

  async function call(path,body,auth=true,method='POST'){
    const r=await fetch(U+path,{method,headers:{apikey:K,'Content-Type':'application/json',...(auth&&session?.access_token?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(body)});
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(x.msg||x.error_description||x.message||x.error||'HTTP '+r.status);
    return x;
  }
  async function onboarding(action='status'){
    const email=emailField.value.trim().toLowerCase();
    const r=await fetch(U+'/functions/v1/staff-onboarding',{method:'POST',headers:{apikey:K,'Content-Type':'application/json'},body:JSON.stringify({email,action})});
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(x.message||'Не удалось проверить учётную запись');
    return x;
  }
  async function detectFirstLogin(){
    const email=emailField.value.trim().toLowerCase();
    if(!email||!emailField.validity.valid||authMode==='setup')return;
    const request=++statusRequest;
    try{const result=await onboarding();if(request===statusRequest&&result.mode==='first_login')showFirstLogin()}
    catch(error){console.warn('First-login status is unavailable',error)}
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
        // Do not reload for an employee: the profile-only interface needs no finance_state.

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
    if(authMode==='setup'){
      if(passwordField.value!==passwordConfirm.value){window.abMessage('Пароли не совпадают. Проверьте оба поля.');passwordConfirm.focus();return}
      submitButton.disabled=true;
      try{await call('/auth/v1/user',{password:passwordField.value},true,'PUT');window.abMessage('Пароль сохранён. Загружаем систему…');await enter()}
      catch(error){submitButton.disabled=false;window.abMessage('Не удалось сохранить пароль: '+error.message)}
      return;
    }
    if(authMode==='first-login'){
      submitButton.disabled=true;
      try{
        await onboarding('send');submitButton.hidden=true;loginInstead.hidden=false;authHelp.hidden=false;
        authHelp.textContent='Письмо отправлено. Откройте персональную ссылку — на открывшейся странице появятся два поля нового пароля.';
        window.abMessage('Проверьте почту для завершения первого входа');
      }catch(error){submitButton.disabled=false;window.abMessage('Не удалось отправить ссылку: '+error.message)}
      return;
    }
    const email=emailField.value.trim().toLowerCase();
    try{
      window.abMessage('Проверка пароля…');
      save(await call('/auth/v1/token?grant_type=password',{email,password:f.elements.password.value},false));
      localStorage.setItem(LAST_EMAIL,email);
      await enter();
    }catch(error){
      showLogin();
      try{const status=await onboarding();if(status.mode==='first_login'){showFirstLogin();return}}catch(e){}
      passwordLink.hidden=false;passwordLink.disabled=false;authHelp.hidden=false;authHelp.textContent='Проверьте почту и пароль или запросите ссылку для первого входа / восстановления доступа.';
      window.abMessage(error.message==='Invalid login credentials'?'Почта или пароль не подошли':'Не удалось войти: '+error.message);
    }
  };

  emailField.addEventListener('change',detectFirstLogin);
  emailField.addEventListener('blur',detectFirstLogin);
  loginInstead.onclick=()=>{showLogin();message.textContent='Войдите в рабочую систему';requestAnimationFrame(()=>passwordField.focus({preventScroll:true}))};

  const RECOVERY_COOLDOWN='arbat-recovery-cooldown-v1';
  passwordLink.onclick=async()=>{
    if(Number(localStorage.getItem(RECOVERY_COOLDOWN)||0)>Date.now()){window.abMessage('Отправка писем временно ограничена. Обратитесь к администратору или попробуйте позже.');return}
    const email=emailField.value.trim().toLowerCase();if(!email){window.abMessage('Сначала укажите электронную почту');emailField.focus();return}
    passwordLink.disabled=true;
    try{await call('/auth/v1/recover?redirect_to='+encodeURIComponent('https://dmitriz832-bit.github.io/arbat-finance-test/app/'),{email},false);passwordLink.disabled=false;authHelp.hidden=false;authHelp.textContent='Если администратор выдал доступ, проверьте почту и откройте ссылку на этом устройстве. Она приведёт к форме создания нового пароля.';window.abMessage('Ссылка для установки пароля отправлена')}
    catch(error){if(/rate limit|429/i.test(error.message)){localStorage.setItem(RECOVERY_COOLDOWN,String(Date.now()+30*60*1000));window.abMessage('Supabase ограничил отправку писем. Повторите попытку позднее или обратитесь к администратору.')}else window.abMessage('Не удалось отправить ссылку: '+error.message);passwordLink.disabled=false}
  };

  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.get('access_token')){
    save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)});
    history.replaceState(null,'',location.pathname);
    if(['invite','recovery'].includes(hash.get('type')))showPasswordSetup(hash.get('type'));
  }
  if(!session&&authMode!=='setup'){showLogin();if(emailField.value)requestAnimationFrame(detectFirstLogin)}
  if(session&&authMode!=='setup')enter().catch(()=>{
    showLogin();
    window.abMessage('Сессия завершена. Войдите снова.');
  });
})();
