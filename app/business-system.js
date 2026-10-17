(()=>{
  const API='https://albkplrjiksydkjkivlm.supabase.co';
  const KEY='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const amount=value=>Number(value||0).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
  const toast=document.createElement('div');toast.className='arbat-sync-toast';toast.textContent='Данные обновлены в фоне';document.body.append(toast);
  let toastTimer;
  function showToast(text='Данные обновлены в фоне'){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200)}

  window.addEventListener('arbat:cloud-update',event=>{
    try{
      if(event.detail?.finance){db=event.detail.finance;window.render?.()}
      showToast();
    }catch(error){console.error('Background refresh failed',error)}
  });

  const entryForms=['dealForm','cashForm','calendarForm','expenseForm','costForm','realizationForm','laborForm','matForm','crewForm','workForm','settlePayForm','walletForm','counterpartyForm','personForm'];
  function preventUnsafeDefaults(root=document){
    for(const id of entryForms){
      const form=root.getElementById?root.getElementById(id):document.getElementById(id);if(!form)continue;
      for(const select of form.querySelectorAll('select:not([multiple])')){
        if(!select.options.length||[...select.options].some(option=>option.value===''))continue;
        const label=select.closest('label')?.childNodes[0]?.textContent?.trim()||'значение';
        select.prepend(new Option('Выберите '+label.toLocaleLowerCase('ru-RU'),'',true,true));select.value='';select.required=true;
      }
    }
  }
  preventUnsafeDefaults();
  new MutationObserver(()=>preventUnsafeDefaults()).observe(document.querySelector('main'),{childList:true,subtree:true});

  let userId='',preferences={columns:{}};
  const prefLocal=()=>`arbat-ui-preferences-${userId||'anonymous'}`;
  function jwtUser(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub||''}catch{return ''}}
  async function prefApi(method,body){
    const token=await window.abGetToken();if(!userId)userId=jwtUser(token);
    const url=API+'/rest/v1/user_preferences'+(method==='GET'?`?select=preferences&user_id=eq.${encodeURIComponent(userId)}`:'?on_conflict=user_id');
    const response=await fetch(url,{method,headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Error('Не удалось сохранить персональные настройки');
    return method==='GET'?response.json():null;
  }
  async function loadPreferences(){
    try{const token=await window.abGetToken();userId=jwtUser(token);const rows=await prefApi('GET');preferences=rows[0]?.preferences||JSON.parse(localStorage.getItem(prefLocal())||'{"columns":{}}')}catch{try{preferences=JSON.parse(localStorage.getItem(prefLocal())||'{"columns":{}}')}catch{preferences={columns:{}}}}
    preferences.columns||={};enhanceTables();
  }
  let prefSaveTimer;
  function savePreferences(){
    localStorage.setItem(prefLocal(),JSON.stringify(preferences));clearTimeout(prefSaveTimer);
    prefSaveTimer=setTimeout(()=>prefApi('POST',{user_id:userId,preferences}).catch(()=>{}),700);
  }
  window.addEventListener('arbat:identity',loadPreferences);if(window.abIdentity)loadPreferences();

  function tableKey(table){
    const host=table.parentElement?.id||table.closest('[id]')?.id||table.closest('section')?.id||'table';
    const heading=table.closest('.card')?.querySelector('h2,h3')?.textContent?.trim()||'';
    return (host+'-'+heading).replace(/\s+/g,'-').toLocaleLowerCase('ru-RU');
  }
  function enhanceTable(table){
    if(!table.tHead?.rows[0])return;table.classList.add('arbat-resizable');const key=tableKey(table),saved=preferences.columns?.[key]||[];
    let group=table.querySelector(':scope > colgroup');if(!group){group=document.createElement('colgroup');for(let i=0;i<table.tHead.rows[0].cells.length;i++)group.append(document.createElement('col'));table.prepend(group)}
    [...group.children].forEach((col,index)=>{if(saved[index])col.style.width=saved[index]+'px'});
    [...table.tHead.rows[0].cells].forEach((th,index)=>{
      if(th.querySelector(':scope > .arbat-col-resizer'))return;const handle=document.createElement('span');handle.className='arbat-col-resizer';handle.title='Потяните для изменения ширины. Двойное нажатие — сбросить.';th.append(handle);
      handle.addEventListener('pointerdown',event=>{event.preventDefault();handle.setPointerCapture(event.pointerId);const startX=event.clientX,startWidth=th.getBoundingClientRect().width,col=group.children[index];const move=e=>{const width=Math.max(72,Math.round(startWidth+e.clientX-startX));col.style.width=width+'px';preferences.columns[key]||=[];preferences.columns[key][index]=width};const up=()=>{handle.removeEventListener('pointermove',move);savePreferences()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up,{once:true})});
      handle.addEventListener('dblclick',()=>{group.children[index].style.width='';if(preferences.columns[key])delete preferences.columns[key][index];savePreferences()});
    });
  }
  let tableFrame=0;function enhanceTables(){if(tableFrame)return;tableFrame=requestAnimationFrame(()=>{tableFrame=0;document.querySelectorAll('.scroll table,.whtable table,#ab-profile-window table').forEach(enhanceTable)})}
  new MutationObserver(enhanceTables).observe(document.body,{childList:true,subtree:true});enhanceTables();

  function ensureBusinessData(){
    if(typeof db==='undefined')return;db.priceHistory||=[];db.priceImports||=[];db.employeeEvents||=[];
    for(const price of db.priceCatalog||[]){price.effectiveFrom||='2026-01-01';price.priceCode||=price.id}
    for(const person of db.people||[]){person._id||=person.id;if(person.annualLeaveDays==null)person.annualLeaveDays=person.status==='Трудовой договор'?28:0}
  }
  ensureBusinessData();

  function workDate(){return document.getElementById('batchDate')?.value||document.getElementById('workForm')?.elements.date?.value||new Date().toISOString().slice(0,10)}
  function labelOf(price){return price.name+' · '+price.section+' · '+price.unit}
  window.arbatPriceForDate=function(label,date=workDate()){
    ensureBusinessData();const current=(db.priceCatalog||[]).find(price=>labelOf(price)===label);if(!current)return null;
    const versions=[...(db.priceHistory||[]).filter(price=>price.priceCode===(current.priceCode||current.id)),current].filter(price=>(!price.effectiveFrom||date>=price.effectiveFrom)&&(!price.effectiveTo||date<=price.effectiveTo)).sort((a,b)=>String(b.effectiveFrom||'').localeCompare(String(a.effectiveFrom||'')));
    return versions[0]||current;
  };
  if(typeof window.workPriceByLabel==='function')window.workPriceByLabel=label=>window.arbatPriceForDate(label);

  function previousDay(date){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10)}
  function versionPrice(price,newRate,effectiveFrom,changes={}){
    if(!effectiveFrom)throw Error('Укажите дату начала действия');if(!(newRate>=0))throw Error('Укажите корректную расценку');
    if(price.effectiveFrom&&effectiveFrom<=price.effectiveFrom)throw Error('Дата новой версии должна быть позже '+price.effectiveFrom);
    db.priceHistory.push({...price,versionId:crypto.randomUUID(),effectiveTo:previousDay(effectiveFrom)});
    Object.assign(price,changes,{rate:newRate,effectiveFrom,effectiveTo:null,priceCode:price.priceCode||price.id,versionId:crypto.randomUUID()});
  }
  function modal(title,body,onSubmit){
    const back=document.createElement('div');back.className='arbat-modal-backdrop';back.innerHTML='<div class="arbat-modal"><h2>'+esc(title)+'</h2><form>'+body+'<div class="arbat-modal-actions"><button type="button" data-close>Отмена</button><button class="primary" type="submit">Сохранить</button></div></form></div>';document.body.append(back);const form=back.querySelector('form');back.querySelector('[data-close]').onclick=()=>back.remove();back.onclick=e=>{if(e.target===back)back.remove()};form.onsubmit=e=>{e.preventDefault();try{onSubmit(form);back.remove()}catch(error){alert(error.message)}};return form;
  }
  function editPrice(price){
    const form=modal(price?'Новая версия расценки':'Новая позиция прайса','<label>Раздел<input name="section" required value="'+esc(price?.section||'')+'"></label><label>Работа<input name="name" required value="'+esc(price?.name||'')+'"></label><label>Единица<input name="unit" required value="'+esc(price?.unit||'')+'"></label><label>Расценка, ₽<input name="rate" type="number" min="0" step="0.01" required value="'+esc(price?.rate??'')+'"></label><label>Действует с<input name="effectiveFrom" type="date" required></label><div class="arbat-price-note">Старые ведомости сохраняют прежнюю ставку. Новая цена применяется по дате выполненных работ.</div>',form=>{
      const data=Object.fromEntries(new FormData(form)),rate=Number(data.rate);ensureBusinessData();
      if(price)versionPrice(price,rate,data.effectiveFrom,{name:data.name.trim(),section:data.section.trim(),unit:data.unit.trim()});
      else {const code='price-'+crypto.randomUUID();db.priceCatalog.push({id:code,priceCode:code,name:data.name.trim(),section:data.section.trim(),unit:data.unit.trim(),rate,effectiveFrom:data.effectiveFrom,effectiveTo:null,versionId:crypto.randomUUID()})}
      save();showToast('Прайс обновлён');
    });
    if(price)form.elements.effectiveFrom.min=new Date().toISOString().slice(0,10);
  }
  async function loadXlsx(){if(window.XLSX)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';script.onload=resolve;script.onerror=()=>reject(Error('Не удалось загрузить обработчик Excel'));document.head.append(script)})}
  const norm=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
  async function importPrices(file,effectiveFrom){
    await loadXlsx();const book=XLSX.read(await file.arrayBuffer(),{type:'array'}),rows=[];
    for(const name of book.SheetNames){const data=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:''});const headerIndex=data.findIndex(row=>row.some(cell=>/работ|наименован/i.test(String(cell)))&&row.some(cell=>/цен|расцен/i.test(String(cell))));if(headerIndex<0)continue;const headers=data[headerIndex].map(norm),nameIndex=headers.findIndex(x=>/работ|наименован/.test(x)),rateIndex=headers.findIndex(x=>/цен|расцен/.test(x)),unitIndex=headers.findIndex(x=>/ед|единиц/.test(x)),sectionIndex=headers.findIndex(x=>/раздел|категор/.test(x));for(const cells of data.slice(headerIndex+1)){const work=String(cells[nameIndex]||'').trim(),rate=Number(String(cells[rateIndex]||'').replace(/\s/g,'').replace(',','.'));if(work&&Number.isFinite(rate))rows.push({name:work,rate,unit:String(cells[unitIndex]||'шт.').trim(),section:String(cells[sectionIndex]||name).trim()})}}
    if(!rows.length)throw Error('Не найдены колонки с работами и ценами');ensureBusinessData();let added=0,changed=0,unchanged=0;
    for(const row of rows){const found=db.priceCatalog.find(price=>norm(price.name)===norm(row.name)&&norm(price.unit)===norm(row.unit));if(!found){const code='price-'+crypto.randomUUID();db.priceCatalog.push({...row,id:code,priceCode:code,effectiveFrom,effectiveTo:null,versionId:crypto.randomUUID()});added++}else if(Number(found.rate)!==row.rate){versionPrice(found,row.rate,effectiveFrom,{name:row.name,unit:row.unit,section:row.section});changed++}else unchanged++}
    db.priceImports.push({id:crypto.randomUUID(),filename:file.name,effectiveFrom,importedAt:new Date().toISOString(),added,changed,unchanged});save();return {added,changed,unchanged};
  }
  function enhancePriceBook(){
    const area=document.getElementById('workPriceList');if(!area||area.dataset.enhancedPrice)return;area.dataset.enhancedPrice='1';const card=area.closest('.card'),tools=document.createElement('div');tools.className='arbat-tools';tools.innerHTML='<button type="button" class="primary" data-price-add>+ Новая позиция</button><button type="button" data-price-import>Загрузить прайс Excel</button><input type="file" accept=".xlsx,.xls" hidden><span class="arbat-price-note">Цены версионируются по дате. Ведомости хранят собственную ставку.</span>';area.before(tools);tools.querySelector('[data-price-add]').onclick=()=>editPrice(null);const input=tools.querySelector('input');tools.querySelector('[data-price-import]').onclick=()=>input.click();input.onchange=()=>{const file=input.files?.[0];if(!file)return;const form=modal('Загрузка прайса','<label>Файл<input value="'+esc(file.name)+'" readonly></label><label>Новые цены действуют с<input name="effectiveFrom" type="date" required></label><div class="arbat-price-note">Нужны колонки «Работа / Наименование», «Цена / Расценка», желательно «Ед.» и «Раздел».</div>',async form=>{try{const result=await importPrices(file,form.elements.effectiveFrom.value);alert('Прайс загружен. Новых: '+result.added+', обновлено: '+result.changed+', без изменений: '+result.unchanged)}catch(error){alert(error.message)}});form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const result=await importPrices(file,form.elements.effectiveFrom.value);form.closest('.arbat-modal-backdrop').remove();alert('Прайс загружен. Новых: '+result.added+', обновлено: '+result.changed+', без изменений: '+result.unchanged)}catch(error){alert(error.message);submit.disabled=false}}};
    area.addEventListener('click',event=>{const row=event.target.closest('tbody tr');if(!row)return;const cells=[...row.cells].map(cell=>cell.textContent.trim()),price=db.priceCatalog.find(item=>item.section===cells[0]&&item.name===cells[1]&&item.unit===cells[2]);if(price)editPrice(price)});
  }
  enhancePriceBook();

  function readWarehouse(){try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}}
  function saveWarehouse(store){store.folders=Array.isArray(store.folders)?store.folders:[];localStorage.setItem('arbat-warehouse-v1',JSON.stringify(store));window.dispatchEvent(new Event('arbat-warehouse-changed'));window.dispatchEvent(new CustomEvent('arbat:cloud-update',{detail:{warehouse:store}}))}
  function enhanceWarehouseCatalog(){
    const area=document.getElementById('whItems');if(!area||area.dataset.folderEnhanced)return;area.dataset.folderEnhanced='1';const card=area.closest('.card'),tools=document.createElement('div');tools.className='arbat-tools';tools.innerHTML='<button type="button" class="primary" data-folder-add>+ Папка</button><button type="button" data-catalog-import>Загрузить номенклатуру Excel</button><input type="file" accept=".xlsx,.xls" hidden><span class="arbat-price-note">Папки можно задавать путём, например «Вентиляция / Воздуховоды».</span><div class="wh-category-tree" data-folder-tree></div>';card.querySelector('h2')?.after(tools);let selected='';
    const renderTree=()=>{const store=readWarehouse(),folders=[...new Set(['Материалы','Оборудование','Инструмент','Расходники',...(store.folders||[]),...(store.items||[]).map(item=>item.category).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'ru'));tools.querySelector('[data-folder-tree]').innerHTML='<button type="button" data-folder="" class="'+(!selected?'active':'')+'">Все</button>'+folders.map(folder=>'<button type="button" data-folder="'+esc(folder)+'" class="'+(selected===folder?'active':'')+'">'+esc(folder)+'</button>').join('');filterRows()};
    const filterRows=()=>{for(const row of area.querySelectorAll('tbody tr')){const category=row.cells[2]?.textContent.trim()||'';row.hidden=!!selected&&category!==selected&&!category.startsWith(selected+' /')}};
    tools.onclick=event=>{const folderButton=event.target.closest('[data-folder]');if(folderButton){selected=folderButton.dataset.folder;renderTree();return}if(event.target.closest('[data-folder-add]')){const name=prompt('Название или путь папки, например «Крепёж / Саморезы»');if(!name?.trim())return;const store=readWarehouse();store.folders=[...new Set([...(store.folders||[]),name.trim().replace(/\s*\/\s*/g,' / ')])];saveWarehouse(store);renderTree()}};
    const file=tools.querySelector('input');tools.querySelector('[data-catalog-import]').onclick=()=>file.click();file.onchange=async()=>{if(!file.files?.[0])return;try{await loadXlsx();const book=XLSX.read(await file.files[0].arrayBuffer(),{type:'array'}),store=readWarehouse();store.items=Array.isArray(store.items)?store.items:[];store.folders=Array.isArray(store.folders)?store.folders:[];let added=0,updated=0;for(const sheetName of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{defval:''});for(const row of rows){const entries=Object.entries(row),get=pattern=>entries.find(([key])=>pattern.test(norm(key)))?.[1],name=String(get(/наимен|товар|материал/)||'').trim();if(!name)continue;const sku=String(get(/артик|код/)||'').trim(),unit=String(get(/^ед|единиц/)||'шт').trim(),category=String(get(/папк|категор|групп/)||'Материалы').trim(),min=Number(String(get(/миним|мин остат/)||0).replace(',','.'))||0,found=store.items.find(item=>(sku&&item.sku===sku)||norm(item.name)===norm(name));if(found){Object.assign(found,{name,sku,unit,category,min});updated++}else{store.items.push({id:'item-'+crypto.randomUUID(),name,sku,unit,category,min});added++}if(category)store.folders.push(category)}}store.folders=[...new Set(store.folders)];saveWarehouse(store);renderTree();alert('Номенклатура загружена. Новых: '+added+', обновлено: '+updated)}catch(error){alert(error.message)}finally{file.value=''}};
    new MutationObserver(()=>{filterRows();const category=document.querySelector('#whDlgForm select[name="category"]');if(category&&!category.dataset.folders){category.dataset.folders='1';const current=category.value,store=readWarehouse(),folders=[...new Set([...[...category.options].map(option=>option.value).filter(Boolean),...(store.folders||[])])];category.innerHTML='<option value="">Выберите папку</option>'+folders.map(folder=>'<option value="'+esc(folder)+'">'+esc(folder)+'</option>').join('');category.value=current}}).observe(area.closest('#warehouseApp')||document.body,{childList:true,subtree:true});renderTree();
  }
  enhanceWarehouseCatalog();

  function enhanceLabor(){
    const form=document.getElementById('laborForm');if(!form||form.dataset.hrEnhanced)return;form.dataset.hrEnhanced='1';const submit=form.querySelector('button[type="submit"],button:not([type])');
    const fields=document.createRange().createContextualFragment('<label>Вид начисления<select name="accrualType" required><option value="">Выберите вид начисления</option><option value="salary">Заработная плата</option><option value="bonus">Премия</option><option value="vacation">Отпускные</option><option value="sick">Больничный</option><option value="compensation">Компенсация</option><option value="alimony">Алименты / удержание</option><option value="other">Прочее</option></select></label><label>Статья ОПиУ<select name="article" required><option value="">Выберите статью</option><option>Производственная заработная плата</option><option>Административная заработная плата</option><option>Коммерческая заработная плата</option><option>Отпускные</option><option>Больничные</option><option>Премии</option><option>Алименты и удержания</option><option>Прочие расходы на персонал</option></select></label><label>НДФЛ, ₽<input name="ndfl" type="number" min="0" step="0.01" placeholder="Укажите рассчитанную сумму"></label><label>Страховые взносы работодателя, ₽<input name="employerContributions" type="number" min="0" step="0.01" placeholder="Укажите рассчитанную сумму"></label>');form.insertBefore(fields,submit);form.querySelector('input[name="amount"]').closest('label').childNodes[0].textContent='Начислено до удержаний, ₽';
    form.addEventListener('submit',()=>{for(const name of ['ndfl','employerContributions']){const input=form.elements[name];if(input.value==='')input.value='0'}},{capture:true});
    const card=document.createElement('div');card.className='card employee-events-card';card.innerHTML='<h2>Отпуска и отсутствия</h2><form id="employeeEventForm" class="fields"><label>Сотрудник<select name="personId" required><option value="">Выберите сотрудника</option></select></label><label>Событие<select name="type" required><option value="">Выберите событие</option><option value="vacation">Отпуск</option><option value="sick">Больничный</option><option value="unpaid">Отпуск без содержания</option><option value="other">Другое отсутствие</option></select></label><label>Дата начала<input type="date" name="dateFrom" required></label><label>Дата окончания<input type="date" name="dateTo" required></label><label>Дней<input type="number" min="0.5" step="0.5" name="days" required></label><label>Примечание<input name="note"></label><button class="primary">Добавить</button></form><div id="employeeEventSummary"></div><div class="scroll" id="employeeEventsTable"></div>';
    form.closest('.card').after(card);card.querySelector('form').onsubmit=e=>{e.preventDefault();const value=Object.fromEntries(new FormData(e.currentTarget)),person=db.people.find(item=>item.id===value.personId);if(!person)return alert('Выберите сотрудника');db.employeeEvents.push({...value,id:'leave-'+crypto.randomUUID(),days:Number(value.days),employeeName:person.name});e.currentTarget.reset();save();renderEmployeeEvents()};renderEmployeeEvents();setupEmployeeWorkspace();
  }
  function setupEmployeeWorkspace(){
    const section=document.getElementById('labor'),directory=section?.querySelector(':scope > .employee-directory-card'),accrualForm=document.getElementById('laborForm')?.closest('.card'),accrualTable=document.getElementById('laborTable')?.closest('.card'),leave=section?.querySelector(':scope > .employee-events-card');if(!section||!directory||!accrualForm||!accrualTable||!leave||section.querySelector(':scope > .employee-workspace-tabs'))return;
    const bar=document.createElement('div');bar.className='ui-segments employee-workspace-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Разделы сотрудников');const panes={directory:[directory],accruals:[accrualForm,accrualTable],leave:[leave]},labels={directory:'Справочник',accruals:'Начисления и выплаты',leave:'Отпуска и отсутствия'};
    const select=value=>{if(!panes[value])value='directory';for(const [key,cards] of Object.entries(panes))for(const card of cards)card.classList.toggle('ui-pane-hidden',key!==value);for(const button of bar.children){const active=button.dataset.employeePane===value;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1}try{sessionStorage.setItem('arbat-ui-employees',value)}catch{}};
    for(const [key,label] of Object.entries(labels)){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.employeePane=key;button.setAttribute('role','tab');button.onclick=()=>select(key);bar.append(button)}
    const toolbar=section.querySelector(':scope > .ui-page-toolbar');if(toolbar){toolbar.querySelector('p').textContent='Карточки сотрудников, кадровые события и расчёты собраны в одном разделе.';toolbar.after(bar)}else section.prepend(bar);let selected='directory';try{selected=sessionStorage.getItem('arbat-ui-employees')||selected}catch{}select(selected);
  }
  function renderEmployeeEvents(){
    const form=document.getElementById('employeeEventForm');if(!form||typeof db==='undefined')return;ensureBusinessData();const select=form.elements.personId,previous=select.value;select.innerHTML='<option value="">Выберите сотрудника</option>'+db.people.map(person=>'<option value="'+esc(person.id)+'">'+esc(person.name)+'</option>').join('');if([...select.options].some(option=>option.value===previous))select.value=previous;
    const year=new Date().getFullYear(),events=db.employeeEvents||[],vacations=events.filter(item=>item.type==='vacation'&&String(item.dateFrom).startsWith(year+'-')),used=vacations.reduce((sum,item)=>sum+Number(item.days||0),0),total=db.people.reduce((sum,person)=>sum+Number(person.annualLeaveDays||0),0);document.getElementById('employeeEventSummary').innerHTML='<div class="employee-events-summary"><div><small>Положено за '+year+'</small><b>'+total+' дней</b></div><div><small>Использовано</small><b>'+used+' дней</b></div><div><small>Остаток</small><b>'+Math.max(0,total-used)+' дней</b></div></div>';
    document.getElementById('employeeEventsTable').innerHTML='<table><thead><tr><th>Сотрудник</th><th>Событие</th><th>Период</th><th>Дней</th><th>Примечание</th></tr></thead><tbody>'+events.map(item=>'<tr><td>'+esc(db.people.find(p=>p.id===item.personId)?.name||item.employeeName)+'</td><td>'+esc(({vacation:'Отпуск',sick:'Больничный',unpaid:'Без содержания',other:'Другое'})[item.type]||item.type)+'</td><td>'+esc(item.dateFrom)+' — '+esc(item.dateTo)+'</td><td>'+esc(item.days)+'</td><td>'+esc(item.note||'')+'</td></tr>').join('')+'</tbody></table>';enhanceTables();
  }
  enhanceLabor();

  const personForm=document.getElementById('personForm');if(personForm&&!personForm.elements.annualLeaveDays){const submit=personForm.querySelector('button');submit.insertAdjacentHTML('beforebegin','<label>Дата приёма<input type="date" name="hireDate"></label><label>Отпуск в год, дней<input type="number" min="0" step="1" name="annualLeaveDays" placeholder="Например, 28"></label>')}
  function renderEnhancedLabor(){
    if(typeof db==='undefined')return;const labor=document.getElementById('laborTable'),people=document.getElementById('personTable'),money=value=>Number(value||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
    if(labor)labor.innerHTML='<table><thead><tr><th>Дата</th><th>Сотрудник</th><th>Организация</th><th>Вид начисления</th><th>Статья ОПиУ</th><th>Начислено</th><th>НДФЛ</th><th>Взносы работодателя</th><th>К выплате</th></tr></thead><tbody>'+(db.labor||[]).map(item=>{const person=db.people.find(p=>p.id===item.personId),type=({salary:'Заработная плата',bonus:'Премия',vacation:'Отпускные',sick:'Больничный',compensation:'Компенсация',alimony:'Алименты / удержание',other:'Прочее'})[item.accrualType]||'Начисление',gross=Number(item.amount||0),ndfl=Number(item.ndfl||0);return '<tr><td>'+esc(item.date||item.dt||'—')+'</td><td>'+esc(person?.name||item.name||'Не указан')+'</td><td>'+esc(item.org||'—')+'</td><td>'+esc(type)+'</td><td>'+esc(item.article||'Не указана')+'</td><td>'+money(gross)+'</td><td>'+money(ndfl)+'</td><td>'+money(item.employerContributions)+'</td><td>'+money(Math.max(0,gross-ndfl))+'</td></tr>'}).join('')+'</tbody></table>';
    if(people)people.innerHTML='<table><thead><tr><th>Сотрудник</th><th>Должность</th><th>Категория</th><th>Статус работы</th><th>Оформление</th><th>Дата приёма</th><th>Отпуск в год</th><th>Оклад</th><th>Действия</th></tr></thead><tbody>'+(db.people||[]).map(person=>'<tr><td>'+esc(person.name)+'</td><td>'+esc(person.position||'—')+'</td><td>'+esc(({production:'Производственные',administrative:'Административные',commercial:'Коммерческие'})[person.expenseType]||'Не определено')+'</td><td>'+esc(person.workStatus||'Работает')+'</td><td>'+esc(person.status||'—')+'</td><td>'+esc(person.hireDate||'—')+'</td><td>'+esc(person.annualLeaveDays??'—')+'</td><td>'+money(person.salary)+'</td><td><button type="button" class="employee-edit-button">Изменить</button></td></tr>').join('')+'</tbody></table>';
    if(people&&typeof window.bindEditButtons==='function')window.bindEditButtons();
  }
  const originalReportData=window.reportData;if(typeof originalReportData==='function')window.reportData=function(){const rows=(typeof db!=='undefined'?db.labor:[])||[],amounts=rows.map(item=>item.amount);try{rows.forEach(item=>item.amount=Number(item.amount||0)+Number(item.employerContributions||0));const result=originalReportData.apply(this,arguments);if(result?.kind!=='cash')result.hints='Начисления и страховые взносы работодателя распределяются в ОПиУ по категории сотрудника и выбранной статье. НДФЛ учитывается как удержание из начисления и не увеличивает расход работодателя. Монтажные ведомости отнесены к производственным расходам. Результат управленческий и не заменяет бухгалтерский расчёт.';return result}finally{rows.forEach((item,index)=>item.amount=amounts[index])}};
  const originalRender=window.render;if(typeof originalRender==='function')window.render=function(){ensureBusinessData();const result=originalRender.apply(this,arguments);enhancePriceBook();renderEmployeeEvents();renderEnhancedLabor();enhanceTables();return result};
  renderEnhancedLabor();
})();
