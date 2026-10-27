(()=>{
  const API='https://albkplrjiksydkjkivlm.supabase.co';
  const KEY='sb_publishable_GJgjkhRNhlWRbjUJGAo8AA_JM6-D90C';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const amount=value=>Number(value||0).toLocaleString('ru-RU',{style:'currency',currency:'RUB'});
  function showToast(text='Данные обновлены в фоне'){window.ArbatPopup.toast(text,{duration:2200})}

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
    preferences.columns||={};document.querySelectorAll('table.arbat-resizable').forEach(table=>{delete table.dataset.independentColumns});enhanceTables();
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
  function naturalColumnWidth(table,index){
    const cells=[...table.rows].slice(0,36).map(row=>row.cells[index]).filter(Boolean);
    const measured=cells.reduce((max,cell)=>Math.max(max,cell.scrollWidth+30,cell.getBoundingClientRect().width+16),0);
    return Math.max(82,Math.min(420,Math.ceil(measured||140)));
  }
  function syncTableWidth(table,group){
    const width=[...group.children].reduce((sum,col)=>sum+(parseFloat(col.style.width)||0),0);
    table.style.setProperty('--arbat-table-width',Math.ceil(width)+'px');
  }
  function enhanceTable(table){
    if(!table.tHead?.rows[0])return;const host=table.closest('.scroll,.whtable,.ab-scroll,#ab-profile-window')||table.parentElement,available=Math.max(0,(host?.clientWidth||0)-2);
    if(!table.getClientRects().length||available<160){delete table.dataset.independentColumns;return}
    const key=tableKey(table),saved=preferences.columns?.[key]||[],headers=[...table.tHead.rows[0].cells];
    let group=table.querySelector(':scope > colgroup');if(!group){group=document.createElement('colgroup');for(let i=0;i<table.tHead.rows[0].cells.length;i++)group.append(document.createElement('col'));table.prepend(group)}
    if(group.children.length!==headers.length){group.replaceChildren(...headers.map(()=>document.createElement('col')));delete table.dataset.independentColumns}
    if(!table.dataset.independentColumns){
      const widths=headers.map((_,index)=>Number(saved[index])||naturalColumnWidth(table,index)),total=widths.reduce((sum,width)=>sum+width,0);
      if(total<available&&widths.length){const flexible=widths.map((_,index)=>index).filter(index=>!Number(saved[index])),targets=flexible.length?flexible:[widths.length-1],extra=(available-total)/targets.length;targets.forEach(index=>widths[index]=Math.round(widths[index]+extra))}
      [...group.children].forEach((col,index)=>col.style.width=widths[index]+'px');table.dataset.independentColumns='1';table.classList.add('arbat-resizable');syncTableWidth(table,group);
    }
    headers.forEach((th,index)=>{
      if(th.querySelector(':scope > .arbat-col-resizer'))return;const handle=document.createElement('span');handle.className='arbat-col-resizer';handle.title='Потяните для изменения ширины. Двойное нажатие — сбросить.';th.append(handle);
      handle.addEventListener('pointerdown',event=>{event.preventDefault();handle.setPointerCapture(event.pointerId);const startX=event.clientX,startWidth=parseFloat(group.children[index].style.width)||th.getBoundingClientRect().width,col=group.children[index];const move=e=>{const width=Math.max(72,Math.round(startWidth+e.clientX-startX));col.style.width=width+'px';syncTableWidth(table,group)};const up=()=>{handle.removeEventListener('pointermove',move);preferences.columns[key]=[...group.children].map(col=>Math.round(parseFloat(col.style.width)||0));savePreferences()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up,{once:true});handle.addEventListener('pointercancel',up,{once:true})});
      handle.addEventListener('dblclick',()=>{const width=naturalColumnWidth(table,index);group.children[index].style.width=width+'px';if(preferences.columns[key])delete preferences.columns[key][index];syncTableWidth(table,group);savePreferences()});
    });
  }
  // Desktop wheel: over a wide table, scroll its own horizontal viewport.
  // Shift+wheel always scrolls horizontally; plain wheel uses horizontal scrolling
  // only when the table cannot scroll vertically. Touch/trackpad native gestures remain intact.
  let tableFrame=0;function enhanceTables(){if(tableFrame)return;tableFrame=requestAnimationFrame(()=>{tableFrame=0;document.querySelectorAll('.scroll table,.whtable table,.ab-scroll table,#ab-profile-window table').forEach(table=>{enhanceTable(table);
      const heads=[...(table.tHead?.rows[0]?.cells||[])].map(c=>c.textContent.replace(/Потяните.*$/,'').trim());
      for(const row of table.tBodies||[])for(const tr of row.rows)[...tr.cells].forEach((cell,i)=>{const label=heads[i]||'Данные';if(cell.dataset.columnLabel!==label)cell.dataset.columnLabel=label});
    })})}
  new MutationObserver(enhanceTables).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  window.addEventListener('resize',enhanceTables,{passive:true});
  if('ResizeObserver'in window)new ResizeObserver(enhanceTables).observe(document.querySelector('main'));
  document.addEventListener('transitionend',event=>{if(event.propertyName==='grid-template-columns'||event.propertyName==='width')enhanceTables()});
  document.addEventListener('click',event=>{if(event.target.closest('[data-route],.arbat-nav-sub,.side-nav button'))requestAnimationFrame(enhanceTables)},true);
  enhanceTables();

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
    return versions[0]||null;
  };
  if(typeof window.workPriceByLabel==='function')window.workPriceByLabel=(label,date)=>window.arbatPriceForDate(label,date);

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
    area.addEventListener('click',event=>{const row=event.target.closest('tbody tr');if(!row)return;const price=db.priceCatalog.find(item=>String(item.id)===row.dataset.priceId);if(price)editPrice(price)});
  }
  enhancePriceBook();

  function readWarehouse(){try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}}
  function saveWarehouse(store){store.folders=Array.isArray(store.folders)?store.folders:[];localStorage.setItem('arbat-warehouse-v1',JSON.stringify(store));window.dispatchEvent(new Event('arbat-warehouse-changed'));window.dispatchEvent(new CustomEvent('arbat:cloud-update',{detail:{warehouse:store}}))}
  function enhanceWarehouseCatalog(){
    const area=document.getElementById('whItems');if(!area||area.dataset.folderEnhanced)return;area.dataset.folderEnhanced='1';const card=area.closest('.card'),tools=document.createElement('div');tools.className='arbat-tools wh-catalog-tools';tools.innerHTML='<button type="button" class="primary" data-folder-add>+ Корневая папка</button><button type="button" data-catalog-import>Загрузить номенклатуру Excel</button><input type="file" accept=".xlsx,.xls" hidden><span class="arbat-price-note">Выберите папку в дереве, чтобы отфильтровать номенклатуру. Действия доступны справа от названия.</span>';card.querySelector('h2')?.after(tools);
    const layout=document.createElement('div');layout.className='wh-catalog-layout';layout.innerHTML='<aside class="wh-category-tree"><div class="wh-tree-heading"><strong>Папки</strong><span data-folder-total></span></div><div data-folder-tree role="tree" aria-label="Дерево папок номенклатуры"></div></aside><div class="wh-catalog-content"></div>';area.before(layout);layout.querySelector('.wh-catalog-content').append(area);const tree=layout.querySelector('[data-folder-tree]'),collapsed=new Set();let selected='';
    const normalizePath=value=>String(value||'').split('/').map(part=>part.trim()).filter(Boolean).join(' / '),parentPath=value=>{const parts=normalizePath(value).split(' / ');parts.pop();return parts.join(' / ')},folderName=value=>normalizePath(value).split(' / ').at(-1)||'';
    const addPath=(set,value)=>{const parts=normalizePath(value).split(' / ').filter(Boolean);for(let i=1;i<=parts.length;i++)set.add(parts.slice(0,i).join(' / '))};
    const folderPaths=store=>{const set=new Set();for(const path of store.folders||[])addPath(set,path);for(const item of store.items||[])addPath(set,item.category);return [...set].sort((a,b)=>a.split(' / ').length-b.split(' / ').length||a.localeCompare(b,'ru'))};
    const ensureFolders=()=>{const store=readWarehouse();store.items=Array.isArray(store.items)?store.items:[];store.folders=Array.isArray(store.folders)?store.folders:[];if(!store.folderTreeVersion){if(!store.folders.length&&!store.items.some(item=>item.category))store.folders=['Материалы','Оборудование','Инструмент','Расходники'];store.folderTreeVersion=2;saveWarehouse(store)}return store};
    const filterRows=()=>{for(const row of area.querySelectorAll('tbody tr')){const category=normalizePath(row.cells[2]?.textContent);row.hidden=!!selected&&category!==selected&&!category.startsWith(selected+' / ')}};
    const itemCount=(store,path)=>store.items.filter(item=>{const category=normalizePath(item.category);return category===path||category.startsWith(path+' / ')}).length;
    const renderTree=()=>{const store=ensureFolders(),folders=folderPaths(store),children=parent=>folders.filter(path=>parentPath(path)===parent);tree.replaceChildren();layout.querySelector('[data-folder-total]').textContent=folders.length+' папок';
      const appendRow=(path,depth)=>{const nested=children(path),row=document.createElement('div');row.className='wh-tree-row'+(selected===path?' active':'');row.dataset.path=path;row.style.setProperty('--tree-depth',depth);row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(depth+1));row.setAttribute('aria-expanded',nested.length?String(!collapsed.has(path)):null);row.innerHTML='<button type="button" class="wh-tree-toggle" data-folder-toggle aria-label="'+(nested.length?'Развернуть или свернуть':'Нет вложенных папок')+'">'+(nested.length?(collapsed.has(path)?'›':'⌄'):'')+'</button><button type="button" class="wh-tree-select" data-folder-select><span class="wh-folder-icon">▱</span><span class="wh-folder-name"></span><span class="wh-folder-count"></span></button><span class="wh-tree-actions"><button type="button" data-folder-child title="Добавить вложенную папку" aria-label="Добавить вложенную папку">＋</button><button type="button" data-folder-edit title="Переименовать или перенести" aria-label="Переименовать или перенести">✎</button><button type="button" data-folder-delete title="Удалить пустую папку" aria-label="Удалить пустую папку">×</button></span>';row.querySelector('.wh-folder-name').textContent=folderName(path);row.querySelector('.wh-folder-count').textContent=String(itemCount(store,path));tree.append(row);if(!collapsed.has(path))for(const child of nested)appendRow(child,depth+1)};
      const root=document.createElement('div');root.className='wh-tree-row wh-tree-root'+(!selected?' active':'');root.dataset.path='';root.setAttribute('role','treeitem');root.innerHTML='<span class="wh-tree-toggle"></span><button type="button" class="wh-tree-select" data-folder-select><span class="wh-folder-icon">◇</span><span class="wh-folder-name">Вся номенклатура</span><span class="wh-folder-count">'+store.items.length+'</span></button><span class="wh-tree-actions"><button type="button" data-folder-child title="Добавить корневую папку" aria-label="Добавить корневую папку">＋</button></span>';tree.append(root);for(const path of children(''))appendRow(path,0);filterRows();syncCategorySelect()};
    const parentOptions=(folders,current='')=>['<option value="">Корневой уровень</option>',...folders.filter(path=>!current||path!==current&&!path.startsWith(current+' / ')).map(path=>'<option value="'+esc(path)+'">'+esc(path)+'</option>')].join('');
    const editFolder=(current,parent=selected)=>{const store=ensureFolders(),folders=folderPaths(store),editing=Boolean(current),initialParent=editing?parentPath(current):normalizePath(parent),form=modal(editing?'Папка номенклатуры':'Новая папка','<label>Название папки<input name="name" required value="'+esc(editing?folderName(current):'')+'" placeholder="Например, Воздуховоды"></label><label>Расположение<select name="parent">'+parentOptions(folders,current||'')+'</select></label><div class="arbat-price-note">При переименовании или переносе пути всех вложенных папок и товаров обновятся автоматически.</div>',form=>{const name=String(form.elements.name.value||'').trim();if(!name||name.includes('/'))throw Error('Укажите название одного уровня без символа «/»');const targetParent=normalizePath(form.elements.parent.value),next=normalizePath((targetParent?targetParent+' / ':'')+name),fresh=ensureFolders(),all=folderPaths(fresh);if(all.some(path=>path.toLocaleLowerCase('ru-RU')===next.toLocaleLowerCase('ru-RU')&&path!==current))throw Error('Папка с таким названием уже существует на выбранном уровне');if(editing){const replace=path=>path===current||path.startsWith(current+' / ')?next+path.slice(current.length):path;fresh.folders=(fresh.folders||[]).map(path=>replace(normalizePath(path)));for(const item of fresh.items)item.category=replace(normalizePath(item.category));selected=replace(selected)}else{fresh.folders.push(next);selected=next}const set=new Set();for(const path of fresh.folders)addPath(set,path);for(const item of fresh.items)addPath(set,item.category);fresh.folders=[...set];saveWarehouse(fresh);renderTree();showToast(editing?'Папка обновлена':'Папка создана')});form.elements.parent.value=initialParent};
    const deleteFolder=async path=>{const store=ensureFolders(),approvedStore=JSON.stringify(store),approvedActor=JSON.stringify(window.abIdentity||null),allowed=()=>!window.abIdentity||['admin','accountant'].includes(window.abIdentity.role),contents=value=>({nested:folderPaths(value).filter(folder=>folder.startsWith(path+' / ')),items:value.items.filter(item=>{const category=normalizePath(item.category);return category===path||category.startsWith(path+' / ')})}),{nested,items}=contents(store);if(!allowed())return alert('Недостаточно прав для изменения склада.');if(nested.length||items.length)return alert('Папку нельзя удалить: внутри '+items.length+' позиций и '+nested.length+' вложенных папок. Сначала перенесите их через редактирование.');if(!await window.ArbatPopup.confirm('Удалить пустую папку «'+folderName(path)+'»?'))return;const fresh=ensureFolders(),current=contents(fresh);if(!allowed()||JSON.stringify(window.abIdentity||null)!==approvedActor||JSON.stringify(fresh)!==approvedStore||!folderPaths(fresh).includes(path)||current.nested.length||current.items.length)return alert('Данные склада или права доступа изменились. Проверьте папку и повторите удаление.');fresh.folders=fresh.folders.filter(folder=>normalizePath(folder)!==path);selected=parentPath(path);saveWarehouse(fresh);renderTree();showToast('Папка удалена')};
    tree.onclick=event=>{const row=event.target.closest('.wh-tree-row'),path=row?.dataset.path??'';if(event.target.closest('[data-folder-toggle]')){if(!path)return;collapsed.has(path)?collapsed.delete(path):collapsed.add(path);renderTree();return}if(event.target.closest('[data-folder-select]')){selected=path;renderTree();return}if(event.target.closest('[data-folder-child]')){editFolder('',path);return}if(event.target.closest('[data-folder-edit]')){editFolder(path);return}if(event.target.closest('[data-folder-delete]'))deleteFolder(path)};
    tools.querySelector('[data-folder-add]').onclick=()=>editFolder('','');
    const file=tools.querySelector('input');tools.querySelector('[data-catalog-import]').onclick=()=>file.click();file.onchange=async()=>{if(!file.files?.[0])return;try{await loadXlsx();const book=XLSX.read(await file.files[0].arrayBuffer(),{type:'array'}),store=ensureFolders();let added=0,updated=0;for(const sheetName of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{defval:''});for(const row of rows){const entries=Object.entries(row),get=pattern=>entries.find(([key])=>pattern.test(norm(key)))?.[1],name=String(get(/наимен|товар|материал/)||'').trim();if(!name)continue;const sku=String(get(/артик|код/)||'').trim(),unit=String(get(/^ед|единиц/)||'шт').trim(),category=normalizePath(get(/папк|категор|групп/)||'Материалы'),min=Number(String(get(/миним|мин остат/)||0).replace(',','.'))||0,found=store.items.find(item=>(sku&&item.sku===sku)||norm(item.name)===norm(name));if(found){Object.assign(found,{name,sku,unit,category,min});updated++}else{store.items.push({id:'item-'+crypto.randomUUID(),name,sku,unit,category,min});added++}addPath(new Set(store.folders),category);store.folders.push(category)}}const set=new Set();for(const path of store.folders)addPath(set,path);store.folders=[...set];saveWarehouse(store);renderTree();alert('Номенклатура загружена. Новых: '+added+', обновлено: '+updated)}catch(error){alert(error.message)}finally{file.value=''}};
    function syncCategorySelect(){const category=document.querySelector('#whDlgForm select[name="category"]');if(!category)return;const folders=folderPaths(ensureFolders()),signature=folders.join('|');if(category.dataset.folderSignature===signature)return;const current=category.value;category.innerHTML='<option value="">Выберите папку</option>'+folders.map(folder=>'<option value="'+esc(folder)+'">'+esc(folder)+'</option>').join('');category.dataset.folderSignature=signature;if(folders.includes(current))category.value=current;else if(selected&&folders.includes(selected))category.value=selected}
    new MutationObserver(()=>{filterRows();syncCategorySelect()}).observe(area.closest('#warehouseApp')||document.body,{childList:true,subtree:true});renderTree();
  }
  enhanceWarehouseCatalog();

  function enhanceLabor(){
    const form=document.getElementById('laborForm');if(!form||form.dataset.hrEnhanced)return;form.dataset.hrEnhanced='1';const submit=form.querySelector('button[type="submit"],button:not([type])');
    if(!form.elements.accrualType){const field=document.createRange().createContextualFragment('<label>Вид начисления<select name="accrualType" required><option value="">Выберите вид начисления</option><option value="salary">Заработная плата</option><option value="bonus">Премия</option><option value="vacation">Отпускные</option><option value="sick">Больничный</option><option value="compensation">Компенсация</option><option value="other">Прочее</option></select></label>');form.insertBefore(field,form.querySelector('[name="pnlArticleId"]')?.closest('label')||submit)}
    form.querySelector('input[name="amount"]').closest('label').childNodes[0].textContent='Начислено до удержаний, ₽';
    form.addEventListener('submit',()=>{for(const name of ['ndfl','employerContributions']){const input=form.elements[name];if(input.value==='')input.value='0'}},{capture:true});
    const leave=document.getElementById('leaveForm')?.closest('.card');if(leave){leave.classList.add('employee-leave-card');form.closest('.card').after(leave)}setupEmployeeWorkspace();
  }
  function setupEmployeeWorkspace(){
    const section=document.getElementById('labor'),directory=section?.querySelector(':scope > .employee-directory-card'),accrualForm=document.getElementById('laborForm')?.closest('.card'),accrualTable=document.getElementById('laborTable')?.closest('.card'),leave=section?.querySelector(':scope > .employee-leave-card');if(!section||!directory||!accrualForm||!accrualTable||!leave||section.querySelector(':scope > .employee-workspace-tabs'))return;
    const bar=document.createElement('div');bar.className='ui-segments employee-workspace-tabs';bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Разделы сотрудников');const panes={directory:[directory],accruals:[accrualForm,accrualTable],leave:[leave]},labels={directory:'Справочник',accruals:'Начисления и выплаты',leave:'Отпуска и отсутствия'};
    const select=value=>{if(!panes[value])value='directory';for(const [key,cards] of Object.entries(panes))for(const card of cards)card.classList.toggle('ui-pane-hidden',key!==value);for(const button of bar.children){const active=button.dataset.employeePane===value;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1}try{sessionStorage.setItem('arbat-ui-employees',value)}catch{}};
    for(const [key,label] of Object.entries(labels)){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.employeePane=key;button.setAttribute('role','tab');button.onclick=()=>select(key);bar.append(button)}
    const toolbar=section.querySelector(':scope > .ui-page-toolbar');if(toolbar){toolbar.querySelector('p').textContent='Карточки сотрудников, кадровые события и расчёты собраны в одном разделе.';toolbar.after(bar)}else section.prepend(bar);let selected='directory';try{selected=sessionStorage.getItem('arbat-ui-employees')||selected}catch{}select(selected);
  }
  enhanceLabor();

  // Opening positions are dated balances, never synthetic cash documents.
  window.arbatCommitWalletOpening=async(form,existingId,done=()=>{})=>{
    if(form.dataset.openingSaving)return;form.dataset.openingSaving='1';
    try{
      const actor=window.abIdentity;if(!actor||!['admin','accountant'].includes(actor.role))throw Error('Недостаточно прав для изменения начального остатка');
      const baseline=JSON.stringify(db),identity=JSON.stringify(actor),editor=JSON.stringify([...new FormData(form)]),editorSession=window.arbatDocumentSession?.(form),raw=Object.fromEntries(new FormData(form)),existing=(db.wallets||[]).find(w=>w.id===existingId);
      if(existingId&&!existing)throw Error('Кошелёк уже удалён. Откройте актуальную запись');
      const core=window.ArbatFinanceCore,values=core.walletOpeningValues(raw,existing,db.cash||[]);let openingChanged=!existing||existing.org!==values.org||existing.openingBalanceDate!==values.openingBalanceDate;try{openingChanged=openingChanged||core.cents(existing?.openingBalance??'0')!==core.cents(values.openingBalance)}catch{openingChanged=true}
      if(openingChanged){
        if(typeof window.arbatEnsureOpenPeriodRange!=='function')throw Error('Проверка закрытых периодов недоступна. Обновите страницу.');
        const dates=[values.openingBalanceDate,existing?.openingBalanceDate,...(!existing?.openingBalanceDate?(db.cash||[]).filter(c=>c.walletId===existingId||c.toWalletId===existingId).map(c=>c.date):[])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')).sort();
        await window.arbatEnsureOpenPeriodRange(dates[0],'');
      }
      if(typeof window.arbatEnsureOpenPeriods!=='function')throw Error('Проверка закрытых периодов недоступна. Обновите страницу.');
      await window.arbatEnsureOpenPeriods([existing?.bankStatementDate,values.bankStatementDate].filter(Boolean));
      if(JSON.stringify(window.abIdentity)!==identity||JSON.stringify(db)!==baseline||editor!==JSON.stringify([...new FormData(form)])||!form.isConnected||editorSession&&window.arbatDocumentSession?.(form)!==editorSession)throw Error('Данные, права или форма изменились во время проверки. Проверьте ввод и сохраните снова.');
      if(existing)Object.assign(existing,values);else db.wallets.push({id:'custom-'+crypto.randomUUID(),...values});done();save();window.dispatchEvent(new CustomEvent('arbat:document-saved',{detail:{form}}));
    }catch(error){alert(error.message)}finally{delete form.dataset.openingSaving}
  };
  for(const formId of ['walletForm','walletEditForm']){const f=document.getElementById(formId),field=f?.elements.openingBalanceDate;if(field){field.required=true;const label=field.closest('label');if(label){const text=[...label.childNodes].find(n=>n.nodeType===3);if(text)text.textContent='Начальный остаток на конец дня ';}}}
  function enhanceWalletEditor(){
    const table=document.getElementById('walletsTable'),form=document.getElementById('walletEditForm');if(!table||!form||form.dataset.reconciliationEnhanced)return;form.dataset.reconciliationEnhanced='1';let walletId='';
    const selectFromRow=event=>{const row=event.target.closest?.('#walletsTable tbody tr');if(!row)return;const rows=[...table.querySelectorAll('tbody tr')],wallet=(db.wallets||[])[rows.indexOf(row)];if(!wallet)return;walletId=wallet.id;queueMicrotask(()=>{form.elements.openingBalanceDate.value=wallet.openingBalanceDate||'';form.elements.bankStatementDate.value=wallet.bankStatementDate||'';form.elements.bankStatementBalance.value=wallet.bankStatementBalance??''})};
    document.addEventListener('click',selectFromRow);document.addEventListener('keydown',event=>{if(event.key==='Enter')selectFromRow(event)});
    form.onsubmit=event=>{event.preventDefault();if(!walletId)return alert('Не выбран кошелёк');window.arbatCommitWalletOpening(form,walletId,()=>{document.getElementById('walletModal').classList.remove('open');walletId='';})};
  }
  enhanceWalletEditor();

  const personForm=document.getElementById('personForm');if(personForm&&!personForm.elements.annualLeaveDays){const submit=personForm.querySelector('button');submit.insertAdjacentHTML('beforebegin','<label>Дата приёма<input type="date" name="hireDate"></label><label>Отпуск в год, дней<input type="number" min="0" step="1" name="annualLeaveDays" placeholder="Например, 28"></label>')}
  function renderEnhancedLabor(){
    if(typeof db==='undefined')return;const labor=document.getElementById('laborTable'),people=document.getElementById('personTable'),money=value=>Number(value||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
    if(labor)labor.innerHTML='<table><thead><tr><th>Дата</th><th>Сотрудник</th><th>Организация</th><th>Вид начисления</th><th>Статья ОПиУ</th><th>Начислено</th><th>НДФЛ</th><th>Взносы работодателя</th><th>К выплате</th></tr></thead><tbody>'+(db.labor||[]).filter(item=>!document.getElementById('orgFilter')?.value||item.org===document.getElementById('orgFilter').value).map(item=>{const person=db.people.find(p=>p.id===item.personId),type=({salary:'Заработная плата',bonus:'Премия',vacation:'Отпускные',sick:'Больничный',compensation:'Компенсация',alimony:'Алименты / удержание',other:'Прочее'})[item.accrualType]||'Начисление',totals=(()=>{try{return window.ArbatFinanceCore.payroll({gross:item.amount||0,ndfl:item.ndfl||0,other:item.otherDeductions||0,contributions:item.employerContributions||0})}catch{return null}})(),gross=Number(item.amount||0),ndfl=Number(item.ndfl||0),article=item.pnlArticleName||(db.pnlArticles||[]).find(row=>row.id===item.pnlArticleId)?.name||item.article||'Не указана';return '<tr><td>'+esc(item.date||item.dt||'—')+'</td><td>'+esc(person?.name||item.name||'Не указан')+'</td><td>'+esc(item.org||'—')+'</td><td>'+esc(type)+'</td><td>'+esc(article)+'</td><td>'+money(gross)+'</td><td>'+money(ndfl)+'</td><td>'+money(item.employerContributions)+'</td><td>'+(totals?money(Number(window.ArbatFinanceCore.rubles(totals.payable))):'Требует проверки')+'</td></tr>'}).join('')+'</tbody></table>';
    if(people)people.innerHTML='<table><thead><tr><th>Сотрудник</th><th>Должность</th><th>Категория</th><th>Статус работы</th><th>Оформление</th><th>Дата приёма</th><th>Отпуск в год</th><th>Оклад</th><th>Действия</th></tr></thead><tbody>'+(db.people||[]).map(person=>'<tr><td>'+esc(person.name)+'</td><td>'+esc(person.position||'—')+'</td><td>'+esc(({production:'Производственные',administrative:'Административные',commercial:'Коммерческие'})[person.expenseType]||'Не определено')+'</td><td>'+esc(person.workStatus||'Работает')+'</td><td>'+esc(person.status||'—')+'</td><td>'+esc(person.hireDate||'—')+'</td><td>'+esc(person.annualLeaveDays??'—')+'</td><td>'+money(person.salary)+'</td><td><button type="button" class="employee-edit-button">Изменить</button></td></tr>').join('')+'</tbody></table>';
    if(people&&typeof window.bindEditButtons==='function')window.bindEditButtons();
  }
  function withPayrollContext(run){
    const core=window.ArbatFinanceCore;if(!core)return run();
    window.ArbatFinanceCore={...core,
      payrollReconciliation:options=>core.payrollReconciliation({...options,settlements:db.crewSettlements||[],workActs:db.workActs||[]}),
      paymentExceptionRegister:options=>core.paymentExceptionRegister({...options,crewSettlements:db.crewSettlements||[],workActs:db.workActs||[]})
    };
    try{return run()}finally{window.ArbatFinanceCore=core}
  }
  function syncPayrollPaymentFields(){
    const form=document.getElementById('cashForm');if(!form)return;
    const isEmployeePayment=form.elements.type?.value==='out'&&String(form.elements.partyRef?.value||'').startsWith('person:');
    for(const name of ['payrollPurpose','payrollAllocatedAmount','payrollDistribution']){const field=form.elements[name];if(!field)continue;const label=field.closest('label');if(label)label.style.display=isEmployeePayment?'flex':'none';field.required=name==='payrollPurpose'&&isEmployeePayment;if(!isEmployeePayment)field.value=''}
  }
  // A payout settles the employee/company balance through the native DDS form.
  // Accrual documents and their employer contributions remain unchanged.
  const payrollContexts=new WeakMap(),payrollActor=()=>JSON.stringify(window.abIdentity||null),canPayPayroll=()=>['admin','accountant'].includes(window.abIdentity?.role);
  const payrollState=org=>window.ArbatFinanceCore.payrollByOrganization({accruals:db.labor||[],payments:db.cash||[],settlements:db.crewSettlements||[],workActs:db.workActs||[]},org);
  const payrollRevision=()=>JSON.stringify([db.labor,db.cash,db.crewSettlements,db.workActs,db.people,db.wallets,db.articles]);
  function payrollPaymentEligibility(org,personId,state=payrollState(org),data=db){
    const cash=data.cash||[],linked=source=>source?.cashId?cash.find(p=>String(p._id||p.id||'')===String(source.cashId)):null;
    const applicable=(source,owner)=>{const payment=linked(source);return String(payment?.org??source?.org??owner??'')===String(org)&&source?.payrollPayment!==false&&payment?.payrollPayment!==false;};
    const unresolved=(source,reason)=>({allowed:false,reason,source:linked(source)||source});
    // A remaining cash share has no confirmed recipient. It can settle any
    // employee of this company, so paying a computed balance first is unsafe.
    for(const part of state.unallocatedPayments||[])if(part.amount!==0n&&applicable(part.source,part.org))return unresolved(part.source,'Сверьте выплаты: в организации есть нераспределённая зарплатная выплата. Уточните получателей и суммы в исходном платеже.');
    const cashIssues=new Set(['payroll-invalid-allocation','payroll-overallocated-payment','payroll-unallocated-payment']);
    for(const issue of state.issues||[]){
      if(issue.code==='crew-payroll-linked-labor-overlap'||!applicable(issue.source,issue.org))continue;
      const source=issue.source||{},affected=issue.personId?[issue.personId]:[source.personId,issue.accrual?.personId,...(Array.isArray(source.payrollAllocations)?source.payrollAllocations.map(p=>p?.personId):[]),...(source.memberIds||[])].filter(Boolean);
      if(!cashIssues.has(issue.code)&&affected.length&&!affected.map(String).includes(String(personId)))continue;
      const detail=issue.code==='payroll-invalid-payment'?'проверьте сумму предыдущей зарплатной выплаты.':cashIssues.has(issue.code)?'проверьте распределение предыдущей зарплатной выплаты.':issue.code==='payroll-invalid-settlement'?'проверьте привязку существующей выплаты к сотруднику.':'исправьте замечания в начислениях и расчётах сотрудника.';
      return unresolved(issue.source,'Сверьте начисления и выплаты: '+detail);
    }
    return {allowed:true,reason:'',source:null};
  }
  window.arbatPayrollPaymentEligibility=payrollPaymentEligibility;
  function payrollPaymentButton(person,eligibility){
    const button=document.createElement('button');button.type='button';button.textContent=eligibility.allowed?'Выплатить':'Сверить выплаты';button.dataset[eligibility.allowed?'payrollPay':'payrollReview']=JSON.stringify([person.org,person.personId]);if(eligibility.reason)button.title=eligibility.reason;return button;
  }
  function renderPayrollPaymentActions(){
    const table=document.querySelector('#payrollReconciliationTable table');
    table?.querySelectorAll('[data-payroll-payment-column]').forEach(cell=>cell.remove());
    if(table&&canPayPayroll()){
      const head=document.createElement('th');head.textContent='Выплата';head.dataset.payrollPaymentColumn='';table.querySelector('thead tr')?.append(head);
      const state=payrollState(document.getElementById('orgFilter')?.value||''),people=state.people;
      table.querySelectorAll('tbody tr').forEach((row,index)=>{const person=people[index];if(!person)return;const cell=row.insertCell();cell.dataset.payrollPaymentColumn='';if(person.payable>0n){const eligibility=payrollPaymentEligibility(person.org,person.personId,state);cell.append(payrollPaymentButton(person,eligibility));if(!eligibility.allowed){const reason=document.createElement('small');reason.textContent=eligibility.reason;cell.append(reason);}}else cell.textContent='—';});
    }
    const actions=document.querySelector('#labor > .ui-page-toolbar .ui-toolbar-actions');
    if(actions&&!actions.querySelector('[data-payroll-balances]')){const button=document.createElement('button');button.type='button';button.dataset.payrollBalances='';button.textContent='Выплатить зарплату';button.onclick=()=>window.arbatNavigate?.('labor:summary');actions.append(button);}
    const balances=actions?.querySelector('[data-payroll-balances]');if(balances)balances.hidden=!canPayPayroll();
  }
  window.addEventListener('arbat:identity',renderPayrollPaymentActions);
  window.arbatOpenPayrollPayment=function(org,personId,trigger){
    const form=document.getElementById('cashForm');if(!form)return;
    if(!canPayPayroll())return alert('Недостаточно прав для выплаты зарплаты.');
    if(document.body.classList.contains('ui-sheet-open'))return alert('Сначала сохраните или закройте открытый документ.');
    const state=payrollState(org),eligibility=payrollPaymentEligibility(org,personId,state);if(!eligibility.allowed)return alert(eligibility.reason);
    const person=(db.people||[]).find(p=>String(p.id)===String(personId)),balance=state.people.find(p=>p.org===org&&p.personId===String(personId));
    if(!person||!org||!balance||balance.payable<=0n)return alert('Долг к выплате отсутствует. Проверьте свежие взаиморасчёты.');
    form.reset();if(typeof editTarget!=='undefined'&&editTarget?.key==='cash')editTarget=null;if(typeof resetEdit==='function')resetEdit(form);
    form.querySelector('[data-payroll-payment-context]')?.remove();
    const context={org,personId:String(personId),actor:payrollActor(),revision:payrollRevision()};
    window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'cashForm',trigger,values:{org,type:'out',partyRef:'person:'+personId,payrollPurpose:'salary',amount:window.ArbatFinanceCore.rubles(balance.payable),payrollAllocatedAmount:'',payrollDistribution:'',walletId:'',articleId:'',projectKey:'',note:'Зарплата / аванс · '+person.name+' · '+org}}}));
    queueMicrotask(()=>{
      const session=window.arbatDocumentSession?.(form);if(!session)return;
      context.session=session;payrollContexts.set(form,context);
      const note=document.createElement('p');note.className='muted ui-field-wide';note.dataset.payrollPaymentContext='';note.textContent='Выплата зарплаты · '+person.name+' · '+org+'. Остаток к выплате: '+amount(window.ArbatFinanceCore.rubles(balance.payable))+'. Можно выплатить часть суммы. Укажите дату фактической выплаты, счёт и статью ДДС. После сохранения платёж уменьшит долг; повторное начисление расхода не создаётся.';form.prepend(note);
      const date=form.elements.date;if(date&&!date.value)date.value=typeof isoToday==='function'?isoToday():new Date().toISOString().slice(0,10);
      const title=document.getElementById('ui-sheet-title');if(title)title.textContent='Выплата зарплаты';
    });
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-payroll-pay],[data-payroll-review]');if(!button)return;
    try{
      const [org,personId]=JSON.parse(button.dataset.payrollPay||button.dataset.payrollReview);if(button.hasAttribute('data-payroll-pay'))return window.arbatOpenPayrollPayment(org,personId,button);
      const eligibility=payrollPaymentEligibility(org,personId),source=eligibility.source,collection=['cash','labor','workActs'].find(key=>(db[key]||[]).includes(source));
      if(collection){window.arbatNavigate?.(collection==='workActs'?'work':collection);if(collection==='workActs')window.openWorkEdit?.('act',source.id||source._id);else window.openRecord?.(collection,source._id||source.id);}
      else {window.arbatNavigate?.('cash');alert(eligibility.reason||'Замечания изменились. Проверьте свежие взаиморасчёты.');}
    }catch(error){alert(error.message)}
  });
  const payrollCashForm=document.getElementById('cashForm'),nativePayrollCashSubmit=payrollCashForm?.onsubmit;
  const payrollSheet=document.querySelector('.ui-sheet-overlay');
  if(payrollSheet&&payrollCashForm)new MutationObserver(()=>{
    if(!payrollSheet.hidden||!payrollContexts.has(payrollCashForm)||window.arbatDocumentSession?.(payrollCashForm))return;
    payrollContexts.delete(payrollCashForm);payrollCashForm.querySelector('[data-payroll-payment-context]')?.remove();payrollCashForm.reset();payrollCashForm.elements.type.dispatchEvent(new Event('change',{bubbles:true}));
  }).observe(payrollSheet,{attributes:true,attributeFilter:['hidden']});
  if(nativePayrollCashSubmit)payrollCashForm.onsubmit=function(event){
    const context=payrollContexts.get(this);
    if(!context||context.session!==window.arbatDocumentSession?.(this)){payrollContexts.delete(this);this.querySelector('[data-payroll-payment-context]')?.remove();return nativePayrollCashSubmit.call(this,event);}
    try{
      if(!canPayPayroll()||context.actor!==payrollActor())throw Error('Пользователь или права изменились. Откройте выплату снова.');
      const state=payrollState(context.org),eligibility=payrollPaymentEligibility(context.org,context.personId,state);if(!eligibility.allowed)throw Error(eligibility.reason);
      if(context.revision!==payrollRevision())throw Error('Начисления, выплаты или справочники изменились. Откройте выплату снова, чтобы проверить остаток.');
      if(typeof window.arbatEnsureOpenPeriods!=='function')throw Error('Проверка закрытых периодов недоступна. Обновите страницу.');
      const fields=this.elements,core=window.ArbatFinanceCore,balance=state.people.find(p=>p.org===context.org&&p.personId===context.personId),payment=core.cents(fields.amount.value);
      if(fields.type.value!=='out'||fields.org.value!==context.org||fields.partyRef.value!=='person:'+context.personId||fields.payrollPurpose.value!=='salary')throw Error('Для другого сотрудника, организации или назначения откройте отдельную выплату.');
      if(!balance||payment<=0n||payment>balance.payable)throw Error('Сумма выплаты должна быть положительной и не превышать остаток долга сотруднику.');
      if(fields.payrollDistribution.value.trim()||fields.payrollAllocatedAmount.value.trim()&&core.cents(fields.payrollAllocatedAmount.value)!==payment)throw Error('В этой выплате вся сумма относится к выбранному сотруднику. Для нескольких сотрудников используйте отдельную операцию ДДС.');
      const previous=fields.payrollAllocatedAmount.value,count=db.cash.length;fields.payrollAllocatedAmount.value=core.rubles(payment);
      try{const result=nativePayrollCashSubmit.call(this,event);if(db.cash.length>count){payrollContexts.delete(this);this.querySelector('[data-payroll-payment-context]')?.remove();}return result;}finally{fields.payrollAllocatedAmount.value=previous;}
    }catch(error){event.preventDefault();alert(error.message);}
  };
  const originalReportData=window.reportData;if(typeof originalReportData==='function')window.reportData=function(){const result=originalReportData.apply(this,arguments);if(result?.kind!=='cash')result.hints=(result.hints?result.hints+' ':'')+'Начисления и страховые взносы работодателя рассчитаны единым финансовым модулем. НДФЛ является удержанием и не увеличивает расходы. Связанные с актами начисления не повторяют стоимость работ. Результат управленческий и не заменяет бухгалтерский расчёт.';return result};
  const originalRender=window.render;if(typeof originalRender==='function')window.render=function(){ensureBusinessData();const result=withPayrollContext(()=>originalRender.apply(this,arguments));enhancePriceBook();renderEnhancedLabor();enhanceWalletEditor();syncPayrollPaymentFields();renderPayrollPaymentActions();enhanceTables();return result};
  document.getElementById('cashForm')?.addEventListener('change',event=>{if(event.target?.name==='partyRef'||event.target?.name==='type')syncPayrollPaymentFields()});
  renderEnhancedLabor();
  syncPayrollPaymentFields();
  renderPayrollPaymentActions();
})();
