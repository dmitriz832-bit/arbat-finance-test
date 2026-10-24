/* Existing finance storage and CAS synchronization own persistence. */
(()=>{'use strict';
const model=window.ArbatTaxRegisters,core=window.ArbatFinanceCore;if(!model)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),id=x=>String(x?._id||x?.id||''),rub=x=>Number(core.rubles(x)).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
const names={received:'Получен аванс',offset:'Зачёт',refund:'Возврат',openingDebt:'Начальная задолженность',openingCredit:'Начальная переплата',accrual:'Начислено',payment:'Уплачено',ensBalance:'Подтверждённое сальдо ЕНС'},taxNames={vat:'НДС',usn:'УСН',profit:'Налог на прибыль',ndfl:'НДФЛ',contributions:'Страховые взносы'};
const dialog=document.createElement('dialog');dialog.id='taxRegistersDialog';dialog.className='tax-register-dialog';dialog.innerHTML='<header><h2 data-title></h2><button type="button" data-close>Закрыть</button></header><label>По состоянию на<input type="date" data-asof></label><div data-report></div><button type="button" data-new>Добавить событие</button><form data-editor hidden></form>';document.body.append(dialog);
let mode='advances',collection='vatAdvanceEvents',editing=null,baseline='',busy=false;
const allowed=()=>!window.abIdentity||['admin','accountant'].includes(window.abIdentity.role);
const rows=()=>db[collection]||[],snapshot=()=>JSON.stringify(rows());
const options=(values,current)=>values.map(([value,label])=>'<option value="'+esc(value)+'"'+(String(current??'')===String(value)?' selected':'')+'>'+esc(label)+'</option>').join('');
const select=(name,label,values,value)=>'<label>'+label+'<select name="'+name+'">'+options(values,value)+'</select></label>';
const input=(name,label,value='',type='text')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'"'+(name==='amount'?' inputmode="decimal"':'')+'></label>';
const dates=e=>{if(!e)return [];const list=[e.date],p=['accrual','openingDebt','openingCredit'].includes(e.kind)?String(e.period||''):'';if(/^\d{4}$/.test(p)){for(let n=1;n<=12;n++)list.push(p+'-'+String(n).padStart(2,'0')+'-01')}else if(/^\d{4}-Q[1-4]$/.test(p)){const start=(Number(p.at(-1))-1)*3+1;for(let n=start;n<start+3;n++)list.push(p.slice(0,4)+'-'+String(n).padStart(2,'0')+'-01')}else if(/^\d{4}-\d{2}$/.test(p))list.push(p+'-01');return list};
function report(){
 const to=dialog.querySelector('[data-asof]').value,result=mode==='advances'?model.advances(db,{to}):model.obligations(db,{to});
 let html='<p>Только внесённые события с документами-основаниями. Расчётная оценка налога не создаёт подтверждённое обязательство.</p>';
 if(mode==='advances'){
  html+='<div class="tax-register-totals">'+model.organizations.map(org=>{const r=model.advances(db,{org,to});return '<p><strong>'+esc(org)+'</strong><br>НДС начислено с авансов: '+rub(r.accrued)+'<br>НДС принят к вычету: '+rub(r.deducted)+'<br>Остаток авансов: '+rub(r.balances.reduce((s,b)=>s+b.remaining,0n))+'</p>'}).join('')+'</div>';
 }else{
  html+='<div class="tax-register-scroll"><table><thead><tr><th>Организация / налог / период</th><th>Начальные остатки: долг / переплата</th><th>Начислено</th><th>Уплачено</th><th>Зачтено</th><th>Возвращено</th><th>Долг</th><th>Переплата</th></tr></thead><tbody>'+result.rows.map(r=>'<tr><td>'+esc(r.org)+'<br>'+esc(taxNames[r.tax])+' · '+esc(r.period)+'</td>'+[r.openingDebt,r.openingCredit].map((v,i)=>i===0?'<td>'+rub(v)+' / ':rub(v)+'</td>').join('')+[r.accrued,r.paid,r.offset,r.refund,r.debt,r.overpayment].map(v=>'<td>'+rub(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><h3>ЕНС: подтверждённые данные</h3>'+(result.ens.map(e=>'<p>'+esc(e.org)+' · '+esc(e.date)+' · '+rub(e.balance)+' · '+esc(e.document)+'</p>').join('')||'<p>Сальдо ЕНС не внесено. Расчётные остатки по налогам не заменяют выписку ЕНС.</p>');
 }
 if(result.issues.length)html+='<div role="status"><h3>Требует проверки</h3>'+result.issues.map(x=>'<p>'+esc(x.event.document||id(x.event))+': '+esc(x.message)+'</p>').join('')+'</div>';
 html+='<h3>События</h3><div class="tax-register-events">'+rows().map(e=>'<button type="button" data-event="'+esc(id(e))+'"><strong>'+esc(e.date)+' · '+esc(names[e.kind]||e.kind)+'</strong><span>'+esc(e.org)+' · '+esc(e.amount)+' ₽</span><span>'+esc(e.document)+'</span></button>').join('')+'</div>';
 dialog.querySelector('[data-report]').innerHTML=html;dialog.querySelector('[data-new]').disabled=!allowed();
}
function edit(row){
 editing=row?id(row):null;baseline=snapshot();const e=row||{org:'АРБАТ.ГК',date:dialog.querySelector('[data-asof]').value,kind:mode==='advances'?'received':'accrual'},form=dialog.querySelector('[data-editor]');
 const kinds=mode==='advances'?['received','offset','refund']:['openingDebt','openingCredit','accrual','payment','offset','refund','ensBalance'];
 form.innerHTML='<h3>'+(row?'Изменить событие':'Новое событие')+'</h3><div class="tax-register-fields">'+select('kind','Вид события',kinds.map(k=>[k,names[k]]),e.kind)+select('org','Организация',model.organizations.map(x=>[x,x]),e.org)+input('date','Дата события',e.date,'date')+input('amount','Сумма, ₽',e.amount)+input('document','Документ-основание',e.document)+(mode==='advances'?select('vatRate','Ставка НДС аванса',[['','Выберите'],...[0,5,7,10,20,22].map(n=>[n,n+'%'])],e.vatRate):select('tax','Налог',[['','Выберите'],...Object.entries(taxNames)],e.tax)+input('period','Налоговый период: 2026, 2026-01 или 2026-Q1',e.period)+select('confirmed','Подтверждено бухгалтером',[['','Не проверено'],['true','Да']],String(e.confirmed??''))+select('ensConfirmed','Принадлежность зачёта подтверждена данными ЕНС',[['','Не проверено'],['true','Да']],String(e.ensConfirmed??'')))+'<div data-references></div></div><p data-error role="alert" hidden></p><div class="tax-register-actions"><button type="submit">Сохранить событие</button><button type="button" data-cancel>Отмена</button>'+(row?'<button type="button" data-remove>Убрать событие</button>':'')+'</div>';
 if(typeof initializeMoney==='function')initializeMoney(form);form.hidden=false;references(e);form.scrollIntoView({block:'start'});
}
function references(existing={}){
 const f=dialog.querySelector('form'),kind=f.elements.kind.value,org=f.elements.org.value;
 const needsCash=mode==='advances'?['received','refund'].includes(kind):['payment','refund'].includes(kind),type=mode==='advances'?(kind==='received'?'in':'out'):(kind==='refund'?'in':'out');
 let html='';
 const refSelect=(name,label,items,value)=>'<label>Поиск: '+label+'<input type="search" data-search-ref="'+name+'" placeholder="Дата, номер, назначение"></label>'+select(name,label,[['','Выберите документ'],...items.map(x=>[id(x),[x.date,x.document||x.note||x.name||id(x),x.amount+' ₽'].filter(Boolean).join(' · ')])],value);
 if(needsCash)html+=refSelect('cashId','Платёж ДДС',(db.cash||[]).filter(x=>x.org===org&&x.type===type),existing.cashId);
 if(mode==='advances'&&kind!=='received')html+=refSelect('advanceId','Зарегистрированный аванс',(db.vatAdvanceEvents||[]).filter(x=>x.org===org&&x.kind==='received'),existing.advanceId);
 if(mode==='advances'&&kind==='offset')html+=refSelect('realizationId','Реализация',(db.realizations||[]).filter(x=>x.org===org),existing.realizationId);
 f.querySelector('[data-references]').innerHTML=html;
 for(const label of f.querySelectorAll('label')){const n=label.querySelector('[name]')?.name;if(n==='vatRate')label.hidden=kind!=='received';if(n==='tax'||n==='period')label.hidden=kind==='ensBalance';if(n==='ensConfirmed')label.hidden=kind!=='offset';}
}
async function commit(remove=false){if(busy||!allowed())return;busy=true;const f=dialog.querySelector('form'),error=f.querySelector('[data-error]');try{
 if(snapshot()!==baseline)throw Error('Регистр изменён другим сотрудником. Закройте форму и откройте событие снова.');
 const old=rows().find(x=>id(x)===editing),sourceBaseline=JSON.stringify([db.cash,db.realizations]),e={...Object.fromEntries(new FormData(f)),_id:editing||crypto.randomUUID()};if(!remove){if(!String(e.amount||'').trim())throw Error('Укажите сумму');e.amount=core.rubles(core.cents(e.amount));}if(editing&&!old)throw Error('Событие уже удалено');
 const next=remove?rows().filter(x=>id(x)!==editing):[...rows().filter(x=>id(x)!==editing),e];const candidate={...db,[collection]:next};
 const check=mode==='advances'?model.advances(candidate):model.obligations(candidate),newIssues=check.issues.filter(x=>id(x.event)===e._id||!rows().some(r=>id(r)===id(x.event)));
 if(!remove&&newIssues.length)throw Error(newIssues[0].message);
 // A change or deletion must also leave dependent offsets/refunds valid.
 const before=mode==='advances'?model.advances(db):model.obligations(db),prior=new Set(before.issues.map(x=>id(x.event)+'|'+x.message));const introduced=check.issues.find(x=>!prior.has(id(x.event)+'|'+x.message));if(introduced)throw Error(introduced.message);
 if(window.arbatEnsureOpenPeriods)await window.arbatEnsureOpenPeriods([...dates(old),...dates(e),...(mode==='advances'?rows().filter(r=>[old,e].filter(Boolean).some(x=>(x.advanceId||id(x))===(r.advanceId||id(r))&&r.date>=x.date)).flatMap(dates):[])]);
 if(snapshot()!==baseline||sourceBaseline!==JSON.stringify([db.cash,db.realizations]))throw Error('Регистр или документ-источник изменился во время проверки периода. Откройте форму снова.');
 if(remove){if(!confirm('Убрать налоговое событие? Будет сохранена резервная копия регистра.'))return;localStorage.setItem('arbat-tax-register-backup-'+Date.now(),snapshot())}
 db[collection]=next;save();f.hidden=true;report();
 }catch(e){error.hidden=false;error.textContent=e.message}finally{busy=false}}
dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close'))dialog.close();if(b.hasAttribute('data-new'))edit();if(b.hasAttribute('data-event'))edit(rows().find(x=>id(x)===b.dataset.event));if(b.hasAttribute('data-cancel'))dialog.querySelector('form').hidden=true;if(b.hasAttribute('data-remove'))commit(true)});
dialog.addEventListener('submit',e=>{e.preventDefault();commit()});dialog.addEventListener('change',e=>{if(e.target.hasAttribute('data-asof'))report();if(['kind','org'].includes(e.target.name))references()});dialog.addEventListener('input',e=>{const name=e.target.dataset.searchRef;if(!name)return;const select=dialog.querySelector('[name="'+name+'"]'),q=e.target.value.toLocaleLowerCase('ru-RU');for(const option of select.options)option.hidden=!!option.value&&!option.textContent.toLocaleLowerCase('ru-RU').includes(q)});
document.addEventListener('click',e=>{const b=e.target.closest('[data-open-tax-register]');if(!b)return;mode=b.dataset.openTaxRegister;collection=mode==='advances'?'vatAdvanceEvents':'taxObligationEvents';dialog.querySelector('[data-title]').textContent=mode==='advances'?'НДС с авансов покупателей':'Сверка налоговых обязательств';dialog.querySelector('[data-asof]').value=document.querySelector('#uxTaxReference')?.value||new Date().toISOString().slice(0,10);dialog.querySelector('form').hidden=true;report();dialog.showModal()});
})();
