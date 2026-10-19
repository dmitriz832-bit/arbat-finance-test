(()=>{
  'use strict';
  const normalize=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();

  function enhanceSelect(select){
    if(select.multiple||select.dataset.searchableSelect==='1'||select.closest('.searchable-select'))return;
    select.dataset.searchableSelect='1';
    const box=document.createElement('div');box.className='searchable-select';
    const search=document.createElement('input');search.type='search';search.className='searchable-select-input';search.autocomplete='off';search.placeholder='Введите для поиска…';search.setAttribute('aria-label','Поиск по списку');
    select.before(box);box.append(search,select);
    const filter=()=>{const term=normalize(search.value);let visible=0;for(const option of select.options){const show=!term||normalize(option.textContent).includes(term)||option.selected;option.hidden=!show;if(show&&option.value)visible++;}box.dataset.matches=String(visible);};
    search.addEventListener('input',filter);
    search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'){event.preventDefault();select.focus();if(event.key==='Enter'&&select.showPicker)try{select.showPicker()}catch{}}});
    select.addEventListener('change',()=>{search.value='';filter()});
    new MutationObserver(filter).observe(select,{childList:true,subtree:true,characterData:true});filter();
  }
  const enhanceAll=root=>{if(root.matches?.('select'))enhanceSelect(root);root.querySelectorAll?.('select').forEach(enhanceSelect)};
  enhanceAll(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceAll(node)}))).observe(document.body,{childList:true,subtree:true});

  const dealModal=document.getElementById('dealModal');
  if(dealModal){
    const actions=dealModal.querySelector('#editDealForm .modal-actions');
    const create=document.createElement('button');create.type='button';create.id='createRealizationFromDeal';create.className='deal-realization-action';create.textContent='+ Создать реализацию';
    actions?.prepend(create);
    create.addEventListener('click',()=>{
      const deal=(db.deals||[]).find(row=>row._id===modalDealId);if(!deal)return alert('Сначала откройте сохранённую сделку');
      document.getElementById('closeDealModal')?.click();
      document.querySelector('[data-tab="realizations"]')?.click();
      requestAnimationFrame(()=>{
        const trigger=[...document.querySelectorAll('#realizations .ui-toolbar-actions button')].find(button=>/реализац/i.test(button.textContent));trigger?.click();
        requestAnimationFrame(()=>{const project=document.getElementById('realProject');project.value=window.arbatDealKey(deal);project.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#realizationForm input[name="date"]')?.focus();});
      });
    });
  }

  function markDocumentAreas(){
    document.querySelectorAll('.modal form,.ui-sheet-content,.whmodal form').forEach(form=>form.classList.add('document-form'));
    document.querySelectorAll('.card').forEach(card=>{if(card.querySelector('table,.scroll,.whtable'))card.classList.add('document-register')});
    const cash=document.getElementById('cashArticle'),cost=document.getElementById('costPnlArticle'),labor=document.getElementById('laborPnlArticle');
    if(cash)cash.closest('label').dataset.catalog='Статьи ДДС: показываются все статьи выбранного типа операции';
    if(cost)cost.closest('label').dataset.catalog='Полный справочник статей ОПиУ';
    if(labor)labor.closest('label').dataset.catalog='Все расходные статьи ОПиУ';
  }
  markDocumentAreas();new MutationObserver(markDocumentAreas).observe(document.body,{childList:true,subtree:true});
})();
