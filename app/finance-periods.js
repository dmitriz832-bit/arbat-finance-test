/* Period register: server status is authoritative; absent months are open only after a successful read. */
(function(root){
 'use strict';
 const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
 function yearRows(records,year){
  if(!Array.isArray(records)||!Number.isInteger(year)||year<1900||year>2200)throw Error('Не удалось прочитать статусы периодов');
  const map=new Map();
  for(const row of records){if(!row||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)||!['open','closed'].includes(row.status)||map.has(row.period))throw Error('Некорректный ответ со статусами периодов');map.set(row.period,row);}
  return months.map((label,i)=>{const period=year+'-'+String(i+1).padStart(2,'0'),row=map.get(period),closed=row?.status==='closed';return {period,label,status:closed?'closed':'open',neverClosed:!row?.closed_at&&!row?.reopened_at,changedAt:(closed?row?.closed_at:row?.reopened_at)||null,actor:(closed?row?.closed_name:row?.reopened_name)||'',reason:row?.reopen_reason||''};});
 }
 if(typeof module==='object'&&module.exports){module.exports={yearRows};return;}
 const form=document.getElementById('periodCloseForm');if(!form)return;
 const card=form.closest('.card'),section=document.getElementById('settings'),result=document.getElementById('periodCloseResult');
 const panel=document.createElement('div');panel.id='financePeriods';
 panel.innerHTML='<div class="period-toolbar"><div class="period-year"><button type="button" data-year-step="-1" aria-label="Предыдущий год">‹</button><label>Год<input id="periodRegisterYear" type="number" min="1900" max="2200" step="1" inputmode="numeric"></label><button type="button" data-year-step="1" aria-label="Следующий год">›</button></div><button type="button" id="periodRegisterRefresh">Обновить статусы</button></div><p id="periodRegisterState" role="status" aria-live="polite">Статусы ещё не загружены.</p><div id="periodRegisterRows" role="table" aria-label="Статусы финансовых периодов"></div>';
 form.before(panel);
 card.querySelector('h2').textContent='Финансовые периоды';
 card.querySelector('p').textContent='Статус действует сразу для АИР-КЛИМАТ и АРБАТ.ГК. Открытый месяц доступен для изменений. Закрывайте его после сверки документов и отчётов. Месяцы, которые не закрывали, открыты по умолчанию.';
 const selected=document.createElement('p');selected.id='periodSelectedStatus';selected.setAttribute('role','status');form.prepend(selected);
 const yearInput=document.getElementById('periodRegisterYear'),state=document.getElementById('periodRegisterState'),rowsEl=document.getElementById('periodRegisterRows'),refreshButton=document.getElementById('periodRegisterRefresh'),submit=form.querySelector('button.primary'),periodField=form.elements.period,actionField=form.elements.status,reasonField=form.elements.reason;
 let records=null,loading=false,loadedAt=0,loadId=0;
 yearInput.value=String(new Date().getFullYear());periodField.value||=yearInput.value+'-'+String(new Date().getMonth()+1).padStart(2,'0');
 const identity=()=>root.abIdentity,canRead=()=>['admin','accountant'].includes(identity()?.role),admin=()=>identity()?.role==='admin';
 const visible=()=>section.classList.contains('active')&&section.dataset.uiPane==='periods';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'Дата не указана':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tomsk'});};
 function selectedStatus(){
  form.hidden=!admin();submit.disabled=loading||!records||!admin();
  if(!records){selected.textContent='Статус месяца не подтверждён. Обновите список перед изменением.';return;}
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodField.value)){selected.textContent='Выберите месяц.';submit.disabled=true;return;}
  const year=Number(periodField.value.slice(0,4));if(year<1900||year>2200){submit.disabled=true;return;}
  const row=yearRows(records,year).find(x=>x.period===periodField.value);
  selected.textContent=periodField.value+': '+(row.status==='closed'?'закрыт — изменения документов запрещены.':'открыт — документы можно изменять.');
  actionField.value=row.status==='closed'?'open':'closed';actionField.dispatchEvent(new Event('change',{bubbles:true}));
  reasonField.required=row.status==='closed';reasonField.closest('label').hidden=row.status!=='closed';
  submit.textContent=row.status==='closed'?'Открыть выбранный период':'Закрыть выбранный период';
 }
 function draw(){
  selectedStatus();rowsEl.replaceChildren();if(!records)return;
  let rows;try{rows=yearRows(records,Number(yearInput.value));}catch(error){state.textContent='Укажите год от 1900 до 2200.';return;}
  const head='<div class="period-head" role="row"><span role="columnheader">Месяц</span><span role="columnheader">Статус</span><span role="columnheader">Последнее изменение</span><span role="columnheader">Причина последнего открытия</span>'+(admin()?'<span role="columnheader">Действие</span>':'')+'</div>';
  rowsEl.innerHTML=head+rows.map(row=>'<div class="period-row" role="row" data-period="'+row.period+'"><div role="cell" class="period-month">'+row.label+' '+yearInput.value+'</div><div role="cell"><span class="period-status '+row.status+'">'+(row.status==='closed'?'Закрыт':'Открыт')+'</span>'+(row.neverClosed?'<small>Не закрывался</small>':'')+'</div><div role="cell" class="period-change">'+(row.neverClosed?'—':esc(date(row.changedAt))+'<small>'+esc(row.actor||'Сотрудник не указан')+'</small>')+'</div><div role="cell" class="period-reason">'+(row.reason?'<small>Причина открытия</small>'+esc(row.reason):'—')+'</div>'+(admin()?'<div role="cell" class="period-action"><button type="button" data-select-period="'+row.period+'">'+(row.status==='closed'?'Открыть…':'Закрыть…')+'</button></div>':'')+'</div>').join('');
  rowsEl.classList.toggle('period-readonly',!admin());
 }
 async function refresh(){
  if(!canRead()){records=null;draw();return;}
  const actor=identity(),request=++loadId;loading=true;records=null;draw();refreshButton.disabled=true;state.classList.remove('period-error');state.textContent='Загружаем статусы из общей базы…';
  try{
   const token=await root.abGetToken();
   const response=await fetch('https://albkplrjiksydkjkivlm.supabase.co/rest/v1/rpc/finance_period_status_list',{method:'POST',headers:{apikey:'sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
   const data=await response.json();if(!response.ok)throw Error('Не удалось загрузить статусы. Проверьте соединение и права доступа.');
   yearRows(data,Number(yearInput.value));
   if(request!==loadId||identity()!==actor)return;
   records=data;loadedAt=Date.now();state.textContent='Данные из общей базы · обновлено '+new Date(loadedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'. Время изменений — Томск.';
  }catch(error){if(request!==loadId||identity()!==actor)return;records=null;state.classList.add('period-error');state.textContent='Статусы не загружены. Нажмите «Обновить статусы». До загрузки изменение периода недоступно.';}
  finally{if(request===loadId){loading=false;refreshButton.disabled=false;draw();}}
 }
 root.ArbatPeriods={refresh,syncForm:selectedStatus};
 panel.addEventListener('click',event=>{const step=event.target.closest('[data-year-step]'),pick=event.target.closest('[data-select-period]');if(step){const next=Number(yearInput.value)+Number(step.dataset.yearStep);if(next>=1900&&next<=2200){yearInput.value=String(next);draw();}}if(pick&&admin()&&records){periodField.value=pick.dataset.selectPeriod;selectedStatus();form.scrollIntoView({behavior:'smooth',block:'center'});(reasonField.required?reasonField:submit).focus({preventScroll:true});}});
 yearInput.addEventListener('change',()=>{if(records)draw();else refresh();});
 periodField.addEventListener('change',()=>{selectedStatus();const year=Number(periodField.value.slice(0,4));if(year>=1900&&year<=2200){yearInput.value=String(year);draw();}});
 actionField.closest('label').hidden=true; // The current server status determines the only available operation.
 refreshButton.onclick=refresh;
 root.addEventListener('arbat:identity',()=>{loadId++;records=null;loadedAt=0;loading=false;draw();if(visible())refresh();});
 const refreshVisible=()=>{if(visible()&&canRead()&&!loading&&Date.now()-loadedAt>15000)refresh();};
 new MutationObserver(refreshVisible).observe(section,{attributes:true,attributeFilter:['class','data-ui-pane']});
 root.addEventListener('focus',refreshVisible);setInterval(()=>{if(document.visibilityState==='visible')refreshVisible();},30000);
 draw();refreshVisible();
})(typeof window==='object'?window:globalThis);
