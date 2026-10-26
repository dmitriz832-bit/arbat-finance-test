(()=>{
  const base='https://albkplrjiksydkjkivlm.supabase.co';
  const key='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const style=document.createElement('style');
  style.textContent=`
    #ab-profile-open{width:100%;text-align:left}#ab-profile-open .sicon{display:inline-flex;align-items:center;justify-content:center}
    #ab-profile-open[hidden]{display:none!important}#ab-profile-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(var(--ft-primary-rgb),0.659);display:none;align-items:center;justify-content:center;padding:18px}
    #ab-profile-overlay.open{display:flex}#ab-profile-window{display:block!important;position:relative;box-sizing:border-box;overflow:auto}
    #ab-profile-window h2{margin-top:0}#ab-profile-window button{padding:8px 12px;border-radius:var(--ft-radius-control);cursor:pointer}#ab-profile-window table{width:100%;border-collapse:collapse;font-size:13px}
    #ab-profile-window td,#ab-profile-window th{border-bottom:1px solid var(--ft-primary-soft);padding:10px 8px;text-align:left;white-space:nowrap}#ab-profile-window .ab-stat{display:flex;gap:10px;flex-wrap:wrap}
    #ab-profile-window .ab-stat>div{padding:13px;border:1px solid var(--ft-primary-soft);border-radius:var(--ft-radius-control);min-width:160px}#ab-profile-window .ab-scroll{overflow:auto}#ab-profile-close{float:right}
    #ab-profile-window .ab-danger{color:var(--ft-danger)}#ab-profile-window .ab-tab{margin-right:9px;margin-bottom:10px}#ab-profile-window .ab-note{color:var(--ft-muted);font-size:13px}
    .ab-access-form{display:grid;grid-template-columns:1.4fr 1.4fr 1fr auto;gap:10px;align-items:end;margin:14px 0 20px;padding:16px;background:var(--ft-primary-pale);border:1px solid var(--ft-primary-soft);border-radius:var(--ft-radius-control)}
    .ab-access-form label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:500;color:var(--ft-primary)}.ab-access-form input,.ab-access-form select{width:100%;min-height:42px}
    .ab-person-link{border:0!important;background:transparent!important;color:var(--ft-primary)!important;padding:0!important;font-weight:500;text-align:left}.ab-status-ok{color:var(--ft-success-text);font-weight:500}.ab-status-off{color:var(--ft-danger);font-weight:500}
    .ab-person-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.ab-person-card>div{padding:13px;border:1px solid var(--ft-primary-soft);border-radius:var(--ft-radius-card)}.ab-person-card small{display:block;color:var(--ft-primary);margin-bottom:5px}
    @media(max-width:760px){.ab-access-form{grid-template-columns:1fr}.ab-person-card{grid-template-columns:1fr 1fr}.ab-access-form button{width:100%}}
  `;
  document.head.append(style);

  const button=document.createElement('button');
  button.id='ab-profile-open';button.type='button';button.className='arbat-nav-main';button.hidden=true;
  button.innerHTML='<span class="sicon">👤</span><span class="slabel">Мой профиль</span>';button.title='Мой профиль';
  const group=document.createElement('div');group.className='arbat-nav-group';group.dataset.group='profile';group.append(button);
  const nav=document.getElementById('tabs');
  if(nav){const settings=nav.querySelector('[data-group="settings"]');if(settings)settings.after(group);else nav.append(group)}else document.body.append(button);

  const overlay=document.createElement('div');overlay.id='ab-profile-overlay';
  overlay.innerHTML='<section id="ab-profile-window" role="dialog" aria-modal="true" aria-labelledby="ab-profile-heading"><button id="ab-profile-close">Закрыть ✕</button><h2 id="ab-profile-heading">Личный кабинет</h2><p id="ab-profile-subtitle"></p><div id="ab-profile-tabs"></div><div id="ab-profile-content">Загрузка…</div></section>';
  document.body.append(overlay);
  document.getElementById('ab-profile-close').onclick=()=>overlay.classList.remove('open');
  overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.classList.remove('open')});
  const logoutArea=document.createElement('div');logoutArea.id='ab-profile-logout-area';logoutArea.style.cssText='margin-top:18px;border-top:1px solid #e4e9ef;padding-top:15px;display:flex;justify-content:flex-end';
  document.getElementById('ab-profile-window').append(logoutArea);

  const content=document.getElementById('ab-profile-content');
  const tabs=document.getElementById('ab-profile-tabs');
  const subtitle=document.getElementById('ab-profile-subtitle');
  let identity=null,staffCache=[],peopleCache=[];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const currency=value=>Number(value||0).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
  const roleName=role=>({admin:'Администратор',accountant:'Бухгалтер',employee:'Сотрудник'})[role]||role;

  async function request(path,body,root='rest/v1/'){
    const token=await window.abGetToken();
    const response=await fetch(base+'/'+root+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.message||result.error_description||result.error||'HTTP '+response.status);
    return result;
  }
  async function setStaffEnabled(user){
    if(!user.enabled)return request('admin-invite-staff',{email:user.email,role:user.role,employee_id:user.employee_id,full_name:user.full_name||user.email},'functions/v1/');
    return request('rpc/admin_set_staff',{p_email:user.email,p_enabled:false,p_role:null});
  }
  async function sendPasswordLink(email){
    const response=await fetch(base+'/auth/v1/recover?redirect_to='+encodeURIComponent('https://dmitriz832-bit.github.io/arbat-finance-test/app/'),{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email})});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.message||result.error_description||result.error||'HTTP '+response.status);return result;
  }

  function tab(text,handler){const element=document.createElement('button');element.className='ab-tab';element.textContent=text;element.onclick=handler;tabs.append(element)}

  async function salary(){
    content.textContent='Загружаем расчёты…';
    try{
      const payroll=await request('rpc/my_payroll',{});const rows=Array.isArray(payroll.rows)?payroll.rows:[];
      rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      content.innerHTML='<h3>Мои начисления и выплаты</h3><div class="ab-stat"><div>Начислено<br><b>'+currency(payroll.earned)+'</b></div><div>Удержано НДФЛ<br><b>'+currency(payroll.withheld)+'</b></div><div>Выплачено<br><b>'+currency(payroll.paid)+'</b></div><div>К выплате<br><b>'+currency(payroll.balance)+'</b></div></div><p class="ab-note">Здесь видны только личные начисления, удержанный НДФЛ и выплаты. Взносы работодателя и управленческое распределение расходов сотрудникам не показываются.</p>'+(rows.length?'<div class="ab-scroll"><table><thead><tr><th>Дата</th><th>Тип</th><th>Основание</th><th>Начислено</th><th>НДФЛ</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(row.date)+'</td><td>'+(row.kind==='payment'?'Выплата':esc(row.description||'Начисление'))+'</td><td>'+esc(row.project||row.description)+'</td><td>'+currency(row.amount)+'</td><td>'+(row.kind==='payment'?'—':currency(row.ndfl))+'</td></tr>').join('')+'</tbody></table></div>':'<p>Начислений или привязанных выплат пока нет.</p>');
    }catch(error){content.innerHTML='<h3>Мои начисления и выплаты</h3><p>Расчёт временно недоступен: '+esc(error.message)+'</p>'}
  }

  async function loadAdminData(){
    const [staff,people]=await Promise.all([request('rpc/admin_staff_list',{}),request('rpc/admin_people_list',{})]);
    staffCache=staff;peopleCache=people;return {staff,people};
  }

  function personCard(employeeId,email){
    const person=peopleCache.find(item=>item.employee_id===employeeId)||staffCache.find(item=>item.email===email)||{};
    const staff=staffCache.find(item=>item.email===email)||{};
    content.innerHTML='<button type="button" id="ab-back-access">← Управление доступом</button><h3>'+esc(person.full_name||staff.full_name||email)+'</h3><div class="ab-person-card"><div><small>Должность</small>'+esc(person.position||'Не указана')+'</div><div><small>Электронная почта</small>'+esc(email||'Не назначена')+'</div><div><small>Роль</small>'+esc(roleName(staff.role||'employee'))+'</div><div><small>Статус работы</small>'+esc(person.work_status||'Не указан')+'</div><div><small>Взаимодействие</small>'+esc(person.employment_status||'Не указано')+'</div><div><small>Отпуск</small>'+esc(String(person.annual_leave_days??28))+' дней в год</div></div><p class="ab-note">Карточка связана со справочником сотрудников по внутреннему идентификатору. Изменение кадровых данных выполняется в разделе «Настройки → Сотрудники».</p>';
    document.getElementById('ab-back-access').onclick=admin;
  }

  async function admin(){
    content.textContent='Загружаем сотрудников…';
    try{
      const {staff,people}=await loadAdminData();
      const free=people.filter(person=>!staff.some(user=>user.employee_id===person.employee_id));
      content.innerHTML='<h3>Управление доступом</h3><p class="ab-note">Добавьте сотрудника из справочника, укажите почту и роль. Новый пользователь получит письмо для установки пароля.</p><form id="ab-access-form" class="ab-access-form"><label>Сотрудник<select name="employee_id" required><option value="">Выберите сотрудника</option>'+free.map(person=>'<option value="'+esc(person.employee_id)+'">'+esc(person.full_name)+' · '+esc(person.position||'Без должности')+'</option>').join('')+'</select></label><label>Электронная почта<input name="email" type="email" autocomplete="off" required placeholder="name@company.ru"></label><label>Роль<select name="role" required><option value="">Выберите роль</option><option value="accountant">Бухгалтер</option><option value="employee">Сотрудник</option><option value="admin">Администратор</option></select></label><button class="primary" type="submit">Выдать доступ</button></form><div class="ab-scroll"><table><thead><tr><th>Сотрудник</th><th>Почта</th><th>Роль</th><th>Доступ</th><th>Последний вход</th><th>Управление</th></tr></thead><tbody>'+staff.map((user,index)=>'<tr><td><button type="button" class="ab-person-link" data-person="'+index+'">'+esc(user.full_name||user.email)+'</button><div class="ab-note">'+esc(user.position||'')+'</div></td><td>'+esc(user.email)+'</td><td><select data-role="'+index+'" aria-label="Роль '+esc(user.full_name||user.email)+'"><option value="admin" '+(user.role==='admin'?'selected':'')+'>Администратор</option><option value="accountant" '+(user.role==='accountant'?'selected':'')+'>Бухгалтер</option><option value="employee" '+(user.role==='employee'?'selected':'')+'>Сотрудник</option></select></td><td class="'+(user.enabled?'ab-status-ok':'ab-status-off')+'">'+(user.enabled?'Разрешён':'Заблокирован')+'</td><td>'+esc(user.last_login?new Date(user.last_login).toLocaleString('ru-RU'):'Не входил')+'</td><td><button data-user="'+index+'">'+(user.enabled?'Заблокировать':'Разблокировать')+'</button> <button data-remove="'+index+'" class="ab-access-remove" title="Удалить только доступ к системе">Удалить доступ</button> <button data-reset="'+index+'">'+(user.last_login?'Сменить пароль':'Повторить приглашение')+'</button></td></tr>').join('')+'</tbody></table></div>';

      document.getElementById('ab-access-form').onsubmit=async event=>{
        event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type="submit"]');submit.disabled=true;
        const person=people.find(item=>item.employee_id===form.elements.employee_id.value);
        try{
          const result=await request('admin-invite-staff',{email:form.elements.email.value.trim().toLowerCase(),role:form.elements.role.value,employee_id:person.employee_id,full_name:person.full_name},'functions/v1/');
          await admin();alert(result.invited?'Доступ создан. Сотруднику отправлено письмо для установки пароля.':'Доступ обновлён. Сотрудник уже был зарегистрирован и может войти с прежним паролем.');
        }catch(error){alert(error.message);submit.disabled=false}
      };
      content.querySelectorAll('[data-person]').forEach(element=>element.onclick=()=>{const user=staff[Number(element.dataset.person)];personCard(user.employee_id,user.email)});
      content.querySelectorAll('[data-user]').forEach(element=>element.onclick=async()=>{const actor=identity,user=staff[Number(element.dataset.user)];if(!await window.ArbatPopup.confirm((user.enabled?'Заблокировать ':'Разблокировать ')+(user.full_name||user.email)+'?'))return;if(identity!==actor||actor?.role!=='admin'||!element.isConnected)return;element.disabled=true;try{await setStaffEnabled(user);await admin()}catch(error){alert(error.message);element.disabled=false}});
      content.querySelectorAll('[data-remove]').forEach(element=>element.onclick=async()=>{const actor=identity,target=staff[Number(element.dataset.remove)];if(String(target.email).toLowerCase()===String(identity.email).toLowerCase()){alert('Нельзя удалить собственный доступ');return}if(!await window.ArbatPopup.confirm('Удалить доступ «'+(target.full_name||target.email)+'» к ARBAT FINANCE? Вход будет заблокирован. Учётная запись, журнал, кадровые и финансовые данные сохранятся. Администратор сможет восстановить доступ кнопкой «Разблокировать».'))return;if(identity!==actor||actor?.role!=='admin'||!element.isConnected)return;element.disabled=true;try{await request('admin-invite-staff',{action:'remove',email:target.email},'functions/v1/');await admin();alert('Доступ заблокирован. Для восстановления используйте кнопку «Разблокировать» в строке сотрудника.')}catch(error){alert('Не удалось удалить доступ: '+error.message);element.disabled=false}});
      content.querySelectorAll('[data-reset]').forEach(element=>element.onclick=async()=>{const actor=identity,user=staff[Number(element.dataset.reset)];if(!await window.ArbatPopup.confirm('Отправить '+(user.full_name||user.email)+' персональную ссылку для установки пароля?'))return;if(identity!==actor||actor?.role!=='admin'||!element.isConnected)return;element.disabled=true;try{const result=await request('admin-invite-staff',{email:user.email,role:user.role,employee_id:user.employee_id,full_name:user.full_name||user.email},'functions/v1/');if(!result.invited)await sendPasswordLink(user.email);alert(result.invited?'Приглашение отправлено на '+user.email:'Ссылка восстановления запрошена для '+user.email);await admin()}catch(error){alert('Не удалось отправить приглашение: '+error.message);element.disabled=false}});
      content.querySelectorAll('[data-role]').forEach(element=>element.onchange=async()=>{const actor=identity,user=staff[Number(element.dataset.role)],nextRole=element.value;if(!await window.ArbatPopup.confirm('Изменить роль '+(user.full_name||user.email)+' на «'+roleName(nextRole)+'»?')){element.value=user.role;return}if(identity!==actor||actor?.role!=='admin'||!element.isConnected)return;element.disabled=true;try{await request('rpc/admin_set_staff',{p_email:user.email,p_enabled:user.enabled,p_role:nextRole});await admin()}catch(error){alert(error.message);element.value=user.role;element.disabled=false}});
    }catch(error){content.textContent='Ошибка: '+error.message}
  }

  async function activity(){
    content.textContent='Загружаем журнал…';
    try{
      const [rows,data]=await Promise.all([request('staff_activity?select=email,event,details,created_at&order=created_at.desc&limit=250'),loadAdminData()]);
      const names=new Map(data.staff.map(item=>[String(item.email).toLowerCase(),item.full_name||item.email]));
      const labels={login:'Вход',access_changed:'Изменение доступа',access_created:'Выдан доступ',document_created:'Создан документ',document_updated:'Изменён документ',document_deleted:'Удалён документ'};
      const seen=new Set();const clean=rows.filter(row=>{const key=[row.email,row.event,row.created_at,JSON.stringify(row.details||{})].join('|');if(seen.has(key))return false;seen.add(key);return true});
      content.innerHTML='<h3>Журнал активности</h3><p class="ab-note">Пользователи показаны по ФИО; почта остаётся вторичным идентификатором.</p>'+(clean.length?'<div class="ab-scroll"><table><thead><tr><th>Время</th><th>Пользователь</th><th>Действие и параметры</th></tr></thead><tbody>'+clean.map(row=>{const details=row.details||{},pieces=[details.collection==='labor'?'Начисление сотруднику':details.collection,details.employee,details.date,details.amount!=null?'Сумма: '+currency(details.amount):'',details.status,details.document_id?'№ '+details.document_id:'',details.target?'Доступ: '+details.target:''].filter(Boolean);return '<tr><td>'+esc(new Date(row.created_at).toLocaleString('ru-RU'))+'</td><td>'+esc(names.get(String(row.email).toLowerCase())||row.email)+'</td><td><b>'+esc(labels[row.event]||row.event)+'</b>'+(pieces.length?'<div class="ab-note">'+pieces.map(esc).join(' · ')+'</div>':'')+'</td></tr>'}).join('')+'</tbody></table></div>':'<p>Событий пока нет.</p>');
    }catch(error){content.textContent='Ошибка загрузки: '+error.message}
  }

  function open(){
    if(!identity){content.textContent='Идёт проверка учётной записи. Повторите попытку через несколько секунд.';overlay.classList.add('open');return}
    const logout=document.getElementById('ab-logout');if(logout&&logout.parentNode!==logoutArea){logoutArea.append(logout);logout.hidden=false}
    overlay.classList.add('open');subtitle.textContent=(identity.full_name||identity.email)+' · '+roleName(identity.role);tabs.replaceChildren();tab('Мои начисления',salary);
    if(identity.role==='admin'){tab('Доступ сотрудников',admin);tab('Журнал активности',activity);admin()}else salary();
  }
  button.addEventListener('click',event=>{event.preventDefault();open()});
  window.abProfileReady=value=>{identity=value;window.abIdentity=value;button.hidden=false;const logout=document.getElementById('ab-logout');if(logout&&logout.parentNode!==logoutArea)logoutArea.append(logout)};
})();
