(()=>{
  'use strict';
  const normalize=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
  let opened=null;
  function close(combo){if(!combo)return;combo.classList.remove('open');combo.list.removeAttribute('data-open');combo.append(combo.list);combo.input.setAttribute('aria-expanded','false');combo.input.value=selectedLabel(combo.select);combo.input.dataset.searching='0';if(opened===combo)opened=null}
  function positionList(combo){
    if(!combo?.isConnected){close(combo);return}
    const rect=combo.input.getBoundingClientRect(),view=window.visualViewport,top=view?.offsetTop||0,bottom=top+(view?.height||innerHeight),left=view?.offsetLeft||0,width=view?.width||innerWidth;
    const below=bottom-rect.bottom-8,above=rect.top-top-8,up=below<160&&above>below,height=Math.max(48,Math.min(280,up?above:below));
    Object.assign(combo.list.style,{position:'fixed',left:Math.max(left+8,Math.min(rect.left,left+width-Math.min(rect.width,width-16)-8))+'px',width:Math.min(rect.width,width-16)+'px',right:'auto',maxHeight:height+'px',top:(up?Math.max(top+8,rect.top-Math.min(combo.list.scrollHeight,height)):rect.bottom)+'px'});
  }
  function optionsFor(select){return [...select.options].map((option,index)=>({option,index,label:option.textContent.trim(),group:option.parentElement?.tagName==='OPTGROUP'?option.parentElement.label:''}))}
  function draw(combo,term=''){const query=normalize(term),rows=optionsFor(combo.select).filter(row=>!query||normalize(row.label+' '+row.group).includes(query));combo.list.replaceChildren();let group='';for(const row of rows){if(row.group&&row.group!==group){const title=document.createElement('div');title.className='combobox-group';title.textContent=row.group;combo.list.append(title);group=row.group}const item=document.createElement('button');item.type='button';item.className='combobox-option';item.dataset.index=String(row.index);item.setAttribute('role','option');item.setAttribute('aria-selected',String(row.option.selected));item.textContent=row.label||'—';item.disabled=row.option.disabled;item.addEventListener('mousedown',event=>event.preventDefault());item.addEventListener('click',()=>choose(combo,row.index));combo.list.append(item)}if(!rows.length){const empty=document.createElement('div');empty.className='combobox-empty';empty.textContent='Ничего не найдено';combo.list.append(empty)}}
  const selectedLabel=select=>{const option=select.selectedOptions[0];return option?.value?option.textContent.trim():''};
  function choose(combo,index){const option=combo.select.options[index];if(!option||option.disabled)return;combo.select.value=option.value;combo.input.dataset.searching='0';combo.select.dispatchEvent(new Event('change',{bubbles:true}));combo.input.focus({preventScroll:true});close(combo);if(matchMedia('(pointer:coarse)').matches)combo.input.blur()}
  function open(combo){if(combo.select.disabled)return;if(opened&&opened!==combo)close(opened);opened=combo;combo.classList.add('open');combo.input.setAttribute('aria-expanded','true');(combo.closest('dialog[open]')||document.body).append(combo.list);combo.list.dataset.open='1';draw(combo,combo.input.dataset.searching==='1'?combo.input.value:'');positionList(combo)}
  function enhanceSelect(select){
    if(select.multiple||select.dataset.searchableSelect==='2'||select.closest('.smart-combobox'))return;select.dataset.searchableSelect='2';select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const combo=document.createElement('div');combo.className='smart-combobox';const input=document.createElement('input');input.type='text';input.className='smart-combobox-input';input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.placeholder=select.options[0]?.textContent.trim()||'Выберите значение';const list=document.createElement('div');list.className='smart-combobox-list';list.setAttribute('role','listbox');select.before(combo);combo.append(input,list,select);Object.assign(combo,{input,list,select});
    const accessibleName=select.getAttribute('aria-label')||select.closest('label')?.childNodes[0]?.textContent.trim()||input.placeholder;input.setAttribute('aria-label',accessibleName);list.id='combobox-list-'+(++enhanceSelect.count);input.setAttribute('aria-controls',list.id);
    const sync=()=>{input.disabled=select.disabled;input.setAttribute('aria-required',String(select.required));if(document.activeElement!==input||input.dataset.searching!=='1')input.value=selectedLabel(select);draw(combo,input.dataset.searching==='1'?input.value:'')};
    input.addEventListener('pointerdown',()=>{if(document.activeElement!==input){input.dataset.searching='0';input.value=selectedLabel(select)}open(combo)});
    input.addEventListener('focus',()=>{if(!combo.classList.contains('open')){input.dataset.searching='0';open(combo);queueMicrotask(()=>input.select())}});
    input.addEventListener('paste',event=>{if(input.dataset.searching!=='1'&&event.clipboardData){event.preventDefault();input.value=event.clipboardData.getData('text');input.dataset.searching='1';input.dispatchEvent(new Event('input',{bubbles:true}))}});
    input.addEventListener('input',event=>{if(input.dataset.searching!=='1'&&event.inputType?.startsWith('insert')&&event.data!==null&&event.data!==undefined)input.value=event.data;input.dataset.searching='1';open(combo)});
    input.addEventListener('keydown',event=>{const enabled=[...list.querySelectorAll('.combobox-option:not(:disabled)')],current=enabled.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();input.value=selectedLabel(select);close(combo)}else if(event.key==='Enter'){const first=enabled[0];if(combo.classList.contains('open')&&first){event.preventDefault();first.click()}}else if(event.key==='ArrowDown'){event.preventDefault();open(combo);list.querySelector('.combobox-option:not(:disabled)')?.focus()}else if(event.key==='ArrowUp'){event.preventDefault();open(combo);[...list.querySelectorAll('.combobox-option:not(:disabled)')].at(-1)?.focus()}});
    list.addEventListener('keydown',event=>{const rows=[...list.querySelectorAll('.combobox-option:not(:disabled)')],index=rows.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();rows[(index+(event.key==='ArrowDown'?1:rows.length-1))%rows.length]?.focus()}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();input.focus({preventScroll:true});close(combo)}else if(event.key==='Tab'){input.focus({preventScroll:true});close(combo)}});
    input.addEventListener('blur',()=>setTimeout(()=>{if(!combo.contains(document.activeElement)&&!list.contains(document.activeElement))close(combo)},0));
    select.addEventListener('change',sync);select.addEventListener('invalid',event=>{event.preventDefault();input.focus();open(combo)});new MutationObserver(sync).observe(select,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['disabled','required']});sync();
  }
  enhanceSelect.count=0;
  const enhanceAll=root=>{if(root.matches?.('select'))enhanceSelect(root);root.querySelectorAll?.('select').forEach(enhanceSelect)};enhanceAll(document);new MutationObserver(records=>{if(opened&&!opened.isConnected)close(opened);records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceAll(node)}))}).observe(document.body,{childList:true,subtree:true});document.addEventListener('pointerdown',event=>{if(opened&&!opened.contains(event.target)&&!opened.list.contains(event.target))close(opened)},true);
  function viewportChanged(){const view=window.visualViewport;document.documentElement.style.setProperty('--document-view-height',(view?.height||innerHeight)+'px');document.documentElement.style.setProperty('--document-view-top',(view?.offsetTop||0)+'px');if(opened)positionList(opened)}
  window.visualViewport?.addEventListener('resize',viewportChanged);window.visualViewport?.addEventListener('scroll',viewportChanged);window.addEventListener('resize',viewportChanged);document.addEventListener('scroll',()=>{if(opened)positionList(opened)},true);viewportChanged();
  const formGroups={
    cashForm:[['Документ',['date','org','type','walletId','toWalletId']],['Участники и аналитика',['partyRef','articleId','projectKey','payrollPurpose','payrollAllocatedAmount','payrollDistribution']],['Сумма и основание',['amount','note']]],
    dealForm:[['Основные данные',['name','order1c','customerSearch','org','dir']],['Условия договора',['contractTotal','vatRate','cost','dealStage','projectStatus','taxMode']]],
    realizationForm:[['Основание реализации',['projectKey','date','document']],['Сумма документа',['amount','vatRate','vatDeductible']]],
    expenseForm:[['Документ расхода',['projectKey','date','category','note']],['Сумма и налоги',['amount','vatRate','vatDeductible']]],
    costForm:[['Классификация',['date','name','org','dir','allocationPercentages']],['Сумма и налоги',['amount','vatRate','vatDeductible']]],
    laborForm:[['Кому и за что',['date','personId','org','projectKey','pnlArticleId']],['Расчёт начисления',['ndfl','otherDeductions','employerContributions','amount']]],
    calendarForm:[['Обязательство',['org','articleId','payee','name']],['Сумма и график',['amount','dueDate','frequency','active']]],
    editDealForm:[['Проект и заказчик',['name','order1c','customerSearch','org','dir']],['Финансы и состояние',['contractTotal','vatRate','cost','dealStage','projectStatus','taxMode']]]
  };
  function organizeForm(form){
    if(!form||form.dataset.documentOrganized==='1')return;
    const spec=formGroups[form.id];if(!spec)return;
    form.dataset.documentOrganized='1';form.classList.add('document-form');
    const sections=[];
    for(const [title,names] of spec){
      const section=document.createElement('fieldset');section.className='document-section';
      const legend=document.createElement('legend');legend.textContent=title;section.append(legend);
      for(const name of names){
        const field=form.elements.namedItem(name),label=field?.closest('label');
        if(label&&label.parentElement===form)section.append(label);
      }
      if(section.children.length>1)sections.push(section);
    }
    // Insert once in reading order; repeatedly prepending reverses the groups.
    form.prepend(...sections);
    for(const note of form.querySelectorAll('[data-vat-summary],#dealCalc,#articleDescription,#realDetails')){
      const fieldName=note.dataset.vatSummary||({dealCalc:'contractTotal',articleDescription:'articleId',realDetails:'projectKey'})[note.id];
      const section=form.elements.namedItem(fieldName)?.closest('fieldset');
      if(section){note.classList.add('document-form-summary');section.append(note)}
    }
  }
  Object.keys(formGroups).forEach(id=>organizeForm(document.getElementById(id)));new MutationObserver(()=>Object.keys(formGroups).forEach(id=>organizeForm(document.getElementById(id)))).observe(document.body,{childList:true,subtree:true});document.querySelectorAll('.card').forEach(card=>{if(card.querySelector('table,.scroll,.whtable'))card.classList.add('document-register')});
  const dealModal=document.getElementById('dealModal');if(dealModal){const actions=dealModal.querySelector('#editDealForm .modal-actions'),button=document.createElement('button');button.type='button';button.id='createRealizationFromDeal';button.className='deal-realization-action';button.textContent='+ Создать реализацию';actions?.prepend(button);button.addEventListener('click',()=>{const deal=(db.deals||[]).find(row=>row._id===modalDealId);if(!deal)return alert('Сначала откройте сохранённую сделку');const key=window.arbatDealKey(deal);document.getElementById('closeDealModal')?.click();window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'realizationForm',values:{projectKey:key}}}))})}
})();
