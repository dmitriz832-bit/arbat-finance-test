/* General warehouse documents. Drafts stay in the dialog until the guarded bridge commits. */
(function(root){
 'use strict';
 const titles={sale:'Отгрузить покупателю',consume:'Списать на проект','receipt-consume':'Приход и расход на проект'},W='arbat-warehouse-v1';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const finance=()=>typeof db!=='undefined'?db:root.db||{},warehouse=()=>{try{return JSON.parse(localStorage.getItem(W)||'{}')}catch{return {}}};
 const id=row=>String(row?._id||row?.id||''),actor=()=>JSON.stringify(root.abIdentity||null),number=value=>Number(String(value).trim().replace(',','.'));
 const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(value),quantity=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:6}).format(value);
 const option=(value,label)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>',vatOptions=[0,5,7,10,20,22].map(rate=>option(rate,rate?rate+'%':'Без НДС')).join('');
 let dialog,busy=false,draft=null,returnFocus=null,scheduled=false;
 function initialize(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='arbatStockOperationDialog';dialog.className='stock-operation-dialog';dialog.setAttribute('aria-labelledby','stockOperationTitle');dialog.setAttribute('aria-describedby','stockOperationHelp');document.body.append(dialog);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('click',event=>{if(event.target.closest('[data-stock-close]'))close()});dialog.addEventListener('close',()=>{draft=null;returnFocus?.isConnected&&returnFocus.focus({preventScroll:true})});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-stock-operation]');if(button)open(button.dataset.stockOperation,{dealId:button.dataset.stockDeal,org:button.dataset.stockOrg,placeId:button.dataset.stockPlace});const source=event.target.closest('[data-stock-document]');if(source)openDocument(source.dataset.stockDocument)});
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;addActions()})};
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});document.addEventListener('arbat:navigate',schedule);root.addEventListener('arbat:identity',()=>{if(draft&&actor()!==draft.actor)error('Сотрудник или права доступа изменились. Ваш ввод сохранён. Закройте окно и откройте документ повторно.');schedule()});addActions();
 }
 function addActions(){
  for(const host of [document.getElementById('arbatWarehouseIntro'),document.querySelector('#warehouseWorkspaceHost .warehouse-workspace-heading')]){
   if(!host||host.querySelector('[data-stock-actions]'))continue;
   const actions=document.createElement('div');actions.className='stock-operation-actions';actions.dataset.stockActions='';actions.setAttribute('aria-label','Операции с товарами');actions.innerHTML=Object.entries(titles).map(([kind,title])=>'<button type="button" data-stock-operation="'+kind+'" aria-haspopup="dialog">'+title+'</button>').join('');host.append(actions);
  }
 }
 function close(){if(!busy&&dialog?.open)dialog.close()}
 function error(message){const alert=dialog?.querySelector('[data-stock-error]');if(alert){alert.textContent=message;alert.hidden=false}}
 function open(kind,context={}){
  if(!titles[kind]||busy)return;
  initialize();if(dialog.open)return;
  const data=finance(),wh=warehouse(),selectedDeal=(data.deals||[]).find(d=>id(d)===String(context.dealId||'')),orgs=[...new Set([...(data.deals||[]).map(d=>d.org),...(wh.places||[]).filter(p=>p.type==='warehouse').map(p=>p.org)].filter(Boolean))];
  const selectedOrg=context.org||selectedDeal?.org||document.getElementById('orgFilter')?.value||orgs[0]||'';
  draft={kind,finance:JSON.parse(JSON.stringify(data)),warehouse:wh,baseline:JSON.stringify({finance:data,warehouse:wh}),actor:actor(),requestId:root.crypto.randomUUID()};returnFocus=document.activeElement;
  const receipt=kind==='receipt-consume',sale=kind==='sale';
  dialog.innerHTML='<form class="stock-operation-form"><fieldset class="stock-operation-controls" data-stock-controls><div class="stock-operation-heading"><h2 id="stockOperationTitle">'+titles[kind]+'</h2><button type="button" data-stock-close aria-label="Закрыть окно">×</button></div><p id="stockOperationHelp" class="stock-operation-help">'+(sale?'Отгрузка уменьшает остатки и создаёт реализацию: выручка по цене продажи, себестоимость по партиям FIFO. Оплату покупателя внесите отдельно в ДДС.':receipt?'Один документ оформляет приход от поставщика и фактический расход на проект. Себестоимость учитывается при списании по FIFO; выручку оформляют реализацией, оплату — отдельно в ДДС.':'Фактический расход материалов на проект уменьшает склад и признаёт себестоимость по FIFO. Выручку оформляют реализацией, оплату — отдельно в ДДС.')+'</p><div class="stock-operation-fields"><label>Организация<select name="org" required>'+option('','Выберите организацию')+orgs.map(org=>option(org,org)).join('')+'</select></label><label>Сделка / проект<select name="dealId" required></select></label><label>'+(receipt?'Склад прихода и списания':'Склад отгрузки / списания')+'<select name="placeId" required></select></label><label>Дата документа<input name="date" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></label><label class="stock-operation-wide">Документ / основание<input name="document" required autocomplete="off" placeholder="Накладная, УПД или основание списания"></label>'+(receipt?'<label>Поставщик<select name="supplierId" required>'+option('','Выберите поставщика')+(data.counterparties||[]).map(p=>option(p.id,p.name||p.id)).join('')+'</select></label>':'')+((sale||receipt)?'<label>'+(sale?'НДС продажи':'НДС поставщика')+'<select name="vatRate" required>'+vatOptions+'</select></label>':'')+(receipt?'<label>Учёт входного НДС<select name="vatDeductible" required>'+option('','Выберите учёт НДС')+option('true','Принимается к вычету')+option('false','Включается в стоимость')+'</select></label><label>Счёт-фактура / УПД с НДС<input name="vatDocument" autocomplete="off"></label>':'')+'</div>'+(receipt?'<p class="stock-operation-help">Выберите ставку и учёт НДС по документам поставщика. Цена закупки указывается с НДС. При ставке выше 0% укажите счёт-фактуру или УПД.</p>':'')+'<div class="stock-operation-items-heading"><h3>Товары</h3><button type="button" data-stock-add>+ Добавить товар</button></div><div data-stock-lines></div><p class="stock-operation-total" data-stock-total aria-live="polite"></p><p class="stock-operation-help">Период, доступ сотрудника и актуальность данных проверяются перед сохранением. Бригада для этой операции не требуется.</p><p class="stock-operation-error" data-stock-error role="alert" hidden></p><div class="stock-operation-footer"><button type="button" data-stock-close>Отмена</button><button type="submit" class="primary">'+(sale?'Сохранить отгрузку и реализацию':receipt?'Сохранить приход и расход':'Сохранить списание')+'</button></div></fieldset></form>';
  const form=dialog.querySelector('form');form.elements.org.value=selectedOrg;references(context.dealId,context.placeId);if(sale)updateSaleVat();
  form.querySelector('[data-stock-add]').onclick=()=>addLine();form.elements.org.onchange=()=>{references();if(sale)updateSaleVat();preview()};form.elements.dealId.onchange=()=>{if(sale)updateSaleVat();preview()};form.addEventListener('input',preview);form.addEventListener('change',preview);form.onsubmit=submit;
  if(Array.isArray(context.lines)&&context.lines.length)context.lines.forEach(addLine);else addLine();preview();dialog.showModal();form.elements.dealId.focus({preventScroll:true});
 }
 function references(dealId='',placeId=''){
  const form=dialog.querySelector('form'),org=form.elements.org.value,data=draft.finance,wh=draft.warehouse;
  form.elements.dealId.innerHTML=option('','Выберите сделку / проект')+(data.deals||[]).filter(d=>d.org===org).map(d=>option(id(d),root.arbatDealOptionLabel?.(d)||d.name||id(d))).join('');form.elements.dealId.value=String(dealId||'');
  const places=(wh.places||[]).filter(p=>p.type==='warehouse'&&p.org===org);form.elements.placeId.innerHTML=option('','Выберите склад')+places.map(p=>option(p.id,p.name||p.id)).join('');form.elements.placeId.value=placeId|| (places.length===1?String(places[0].id):'');
 }
 function updateSaleVat(){const form=dialog.querySelector('form'),deal=(draft.finance.deals||[]).find(d=>id(d)===form.elements.dealId.value),rate=Number(deal?.vatRate||0);form.elements.vatRate.value=[0,5,7,10,20,22].includes(rate)?String(rate):'0';form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}))}
 function addLine(source={}){
  if(!draft||busy)return;
  const list=dialog.querySelector('[data-stock-lines]'),line=document.createElement('fieldset'),priced=draft.kind!=='consume',sale=draft.kind==='sale';line.className='stock-operation-line';line.dataset.stockLine='';
  line.innerHTML='<legend>Товар '+(list.children.length+1)+'</legend><label class="stock-operation-item">Номенклатура<select name="itemId" required>'+option('','Выберите товар')+(draft.warehouse.items||[]).map(i=>option(i.id,i.name+' · '+(i.unit||'ед.'))).join('')+'</select></label><label>Количество<input name="qty" inputmode="decimal" required autocomplete="off" value="'+esc(source.qty??'')+'"></label>'+(priced?'<label>'+(sale?'Цена продажи с НДС, ₽':'Цена закупки с НДС, ₽')+'<input name="'+(sale?'salePrice':'price')+'" inputmode="decimal" required autocomplete="off" value="'+esc(source[sale?'salePrice':'price']??'')+'"></label>':'')+'<p class="stock-operation-availability" data-stock-availability></p><button type="button" data-stock-remove>Удалить товар</button>';
  list.append(line);line.querySelector('select').value=source.itemId||'';line.querySelector('[data-stock-remove]').onclick=()=>{if(list.children.length===1)return error('В документе должен остаться хотя бы один товар.');line.remove();[...list.children].forEach((row,i)=>row.querySelector('legend').textContent='Товар '+(i+1));preview()};preview();
 }
 function preview(){
  if(!draft||!dialog.querySelector('form'))return;
  const form=dialog.querySelector('form'),rate=Number(form.elements.vatRate?.value||0);let total=0;
  for(const line of form.querySelectorAll('[data-stock-line]')){
   const itemId=line.querySelector('[name=itemId]').value,item=(draft.warehouse.items||[]).find(i=>String(i.id)===itemId),qty=number(line.querySelector('[name=qty]').value),price=number(line.querySelector('[name=salePrice],[name=price]')?.value||0);if(Number.isFinite(qty)&&Number.isFinite(price))total+=qty*price;
   const available=(draft.warehouse.moves||[]).filter(m=>String(m.itemId)===itemId&&String(m.date||'').slice(0,10)<=form.elements.date.value).reduce((sum,m)=>sum+(String(m.to||'')===form.elements.placeId.value?Number(m.qty)||0:0)-(String(m.from||'')===form.elements.placeId.value?Number(m.qty)||0:0),0);
   line.querySelector('[data-stock-availability]').textContent=item?'На складе на дату: '+quantity(available)+' '+(item.unit||'ед.')+'.':'Выберите номенклатуру из каталога.';
  }
  const summary=form.querySelector('[data-stock-total]');summary.textContent=draft.kind==='consume'?'Себестоимость будет рассчитана по партиям FIFO при сохранении.':(draft.kind==='sale'?'Выручка по документу: ':'Закупка по документу: ')+money(total)+(rate?' · В том числе НДС '+rate+'%: '+money(total-total/(1+rate/100)):' · Без НДС');
  if(form.elements.vatDocument)form.elements.vatDocument.required=rate>0;
 }
 async function submit(event){
  event.preventDefault();if(busy||!draft)return;const form=event.currentTarget,alert=form.querySelector('[data-stock-error]');alert.textContent='';alert.hidden=true;
  try{
   if(actor()!==draft.actor)throw Error('Сотрудник или права доступа изменились. Ваш ввод сохранён. Закройте окно и откройте документ повторно.');
   if(!['admin','accountant'].includes(root.abIdentity?.role))throw Error('Сохранение доступно администратору и бухгалтеру. Проверьте права доступа.');
   if(typeof root.arbatApplyStockOperation!=='function')throw Error('Сохранение складских документов ещё загружается. Повторите действие.');
   const fields=Object.fromEntries(new FormData(form)),command={kind:draft.kind,org:fields.org,dealId:fields.dealId,placeId:fields.placeId,date:fields.date,document:fields.document.trim(),requestId:draft.requestId,vatRate:0,lines:[...form.querySelectorAll('[data-stock-line]')].map(line=>{const row={itemId:line.querySelector('[name=itemId]').value,qty:number(line.querySelector('[name=qty]').value)},price=line.querySelector('[name=salePrice],[name=price]');if(price)row[price.name]=number(price.value);return row})};
   if(fields.vatRate!==undefined)command.vatRate=Number(fields.vatRate);if(draft.kind==='receipt-consume'){command.supplierId=fields.supplierId;command.vatDeductible=fields.vatDeductible==='true';command.vatDocument=fields.vatDocument.trim()}
   if(!command.document)throw Error('Укажите документ или основание операции.');if(command.lines.some(l=>!l.itemId||!Number.isFinite(l.qty)||l.qty<=0||'salePrice'in l&&(!Number.isFinite(l.salePrice)||l.salePrice<=0)||'price'in l&&(!Number.isFinite(l.price)||l.price<=0)))throw Error('В каждой строке выберите товар, положительное количество и положительную цену.');
   busy=true;form.setAttribute('aria-busy','true');form.querySelector('[data-stock-controls]').disabled=true;dialog.inert=true;const result=await root.arbatApplyStockOperation(command,draft.baseline);busy=false;dialog.close();success(result.documentId,command.kind);
  }catch(reason){error(reason.message||'Документ не сохранён. Проверьте данные и повторите действие.')}finally{busy=false;dialog.inert=false;form.removeAttribute('aria-busy');form.querySelector('[data-stock-controls]').disabled=false}
 }
 function success(documentId,kind){
  const host=document.querySelector('#warehouseWorkspaceHost .warehouse-workspace-heading')||document.getElementById('arbatWarehouseIntro');if(!host)return;host.querySelector('[data-stock-success]')?.remove();const status=document.createElement('p');status.className='stock-operation-success';status.dataset.stockSuccess='';status.setAttribute('role','status');status.innerHTML=esc(kind==='cancel'?'Документ отменён.':kind==='sale'?'Отгрузка и реализация сохранены.':'Документ сохранён.')+(kind==='cancel'?'':' <button type="button" data-stock-document="'+esc(documentId)+'">Открыть документ</button>');host.append(status);
 }
 function openDocument(documentId){
  if(busy)return;initialize();if(dialog.open)return;
  const wh=warehouse(),data=finance(),moves=(wh.moves||[]).filter(m=>String(m.documentId||'')===String(documentId));if(!moves.length)return;
  const first=moves[0],deal=(data.deals||[]).find(d=>id(d)===String(first.dealId)),realization=(data.realizations||[]).find(r=>String(r.warehouseDocumentId||'')===String(documentId)),costs=(data.expenses||[]).filter(e=>moves.some(m=>m.id===e.warehouseMoveId)),cost=costs.reduce((sum,e)=>sum+Number(e.amount||0),0),receipts=moves.filter(m=>m.kind==='receipt'),supplier=receipts[0]?.supplierName||(data.counterparties||[]).find(p=>p.id===receipts[0]?.supplierId)?.name;
  returnFocus=document.activeElement;const baseline=JSON.stringify({finance:data,warehouse:wh}),openedActor=actor();
  const lines=moves.map(m=>{
   const item=(wh.items||[]).find(i=>String(i.id)===String(m.itemId)),saleLine=realization?.lines?.[realization.warehouseMoveIds?.indexOf(m.id)],expense=costs.find(e=>e.warehouseMoveId===m.id);
   return '<article><strong>'+esc(item?.name||m.itemId)+'</strong><span>'+esc(m.stockPurpose==='sale'?'Отгрузка покупателю':({receipt:'Приход',consume:'Расход на проект'})[m.kind]||m.kind)+' · '+quantity(m.qty)+' '+esc(item?.unit||'ед.')+'</span>'+(saleLine?'<span>Цена продажи с НДС: '+money(Number(saleLine.price))+' · Сумма: '+money(Number(saleLine.amountGross))+'</span>':m.kind==='receipt'?'<span>Цена закупки с НДС: '+money(Number(m.price))+' · Сумма: '+money(Number(m.amountGross||Number(m.qty)*Number(m.price)))+'</span>':'')+(expense?'<span>Себестоимость FIFO: '+money(Number(expense.amount))+'</span>':'')+'</article>';
  }).join('');
  const summary=(realization?'<p>Выручка: <strong>'+money(Number(realization.amountGross??realization.amount))+'</strong> · '+(Number(realization.vatRate)?'НДС '+esc(realization.vatRate)+'%: '+money(Number(realization.vatAmount)):'Без НДС')+'</p>':'')+(receipts.length?'<p>Закупка: '+money(receipts.reduce((sum,r)=>sum+Number(r.amountGross||Number(r.qty)*Number(r.price)),0))+(supplier?' · '+esc(supplier):'')+'</p><p>НДС поставщика: '+(Number(receipts[0].vatRate)?esc(receipts[0].vatRate)+'% · '+(receipts[0].vatDeductible?'Принимается к вычету':'Включается в стоимость')+' · '+esc(receipts[0].vatDocument):'Без НДС')+'</p>':'')+'<p>Себестоимость: <strong>'+money(cost)+'</strong></p>';
  dialog.innerHTML='<div class="stock-operation-form"><div class="stock-operation-heading"><h2 id="stockOperationTitle">Складской документ</h2><button type="button" data-stock-close aria-label="Закрыть окно">×</button></div><p id="stockOperationHelp" class="stock-operation-help">Проведённый документ · '+esc(first.org)+' · '+esc(String(first.date).slice(0,10))+'</p><h3>'+esc(first.note||first.document||documentId)+'</h3><p>'+esc(deal?.name||'')+'</p>'+summary+'<div class="stock-operation-document-lines">'+lines+'</div>'+(realization?'<p>Связанная реализация: '+esc(realization.document||realization.note||id(realization))+' · '+money(Number(realization.amount||0))+'</p><button type="button" data-stock-realization="'+esc(id(realization))+'">Открыть реализацию</button>':'')+(receipts.length?'<button type="button" data-stock-payable>Оплата / привязать платёж</button>':'')+'<p class="stock-operation-help">Оплаты учитываются отдельно в ДДС. Проведённые складские строки защищены от отдельного редактирования.</p><p class="stock-operation-error" data-stock-error role="alert" hidden></p><div class="stock-operation-footer">'+(['admin','accountant'].includes(root.abIdentity?.role)?'<button type="button" data-stock-cancel-document>Отменить документ</button>':'')+'<button type="button" data-stock-close>Закрыть</button></div></div>';
  dialog.querySelector('[data-stock-payable]')?.addEventListener('click',()=>{if(!root.arbatOpenPayables||!root.ArbatPayables?.receiptKey)return error('Документы поставщиков ещё загружаются. Повторите действие.');const key=root.ArbatPayables.receiptKey(receipts[0]);dialog.close();root.arbatOpenPayables(key)});
  dialog.querySelector('[data-stock-cancel-document]')?.addEventListener('click',()=>cancelDocument(documentId,baseline,openedActor,String(first.date).slice(0,10),first.note||documentId,Boolean(realization)));
  dialog.querySelector('[data-stock-realization]')?.addEventListener('click',event=>{const sourceId=event.currentTarget.dataset.stockRealization;dialog.close();root.arbatOpenFinancialSource?.('realizations',sourceId)});dialog.showModal();dialog.querySelector('[data-stock-close]').focus({preventScroll:true});
 }


 async function cancelDocument(documentId,baseline,openedActor,date,label,hasRealization){
  if(busy)return;
  try{
   if(actor()!==openedActor||!['admin','accountant'].includes(root.abIdentity?.role))throw Error('Сотрудник или права доступа изменились. Откройте документ повторно.');
   if(!root.ArbatPopup?.confirm)throw Error('Подтверждение операции ещё загружается. Повторите действие.');
   busy=true;dialog.inert=true;dialog.querySelectorAll('button').forEach(button=>button.disabled=true);
   const confirmed=await root.ArbatPopup.confirm('Отменить документ «'+label+'»? Будут удалены все связанные складские движения и себестоимость'+(hasRealization?' и реализация':'')+'. Платежи в ДДС сохранятся. Зависимые документы и оплаты проверяются перед отменой.',{title:'Отмена складского документа',danger:true});
   if(!confirmed)return;
   if(actor()!==openedActor)throw Error('Сотрудник или права доступа изменились. Откройте документ повторно.');
   await root.arbatApplyStockOperation({kind:'cancel',targetDocumentId:documentId,requestId:root.crypto.randomUUID(),date},baseline);
   busy=false;dialog.close();success(documentId,'cancel');root.ArbatPopup?.toast('Складской документ отменён. Связанные движения и начисления удалены; платежи в ДДС сохранены.');
  }catch(reason){error(reason.message||'Документ не отменён. Проверьте связанные документы.')}finally{busy=false;dialog.inert=false;dialog.querySelectorAll('button').forEach(button=>button.disabled=false)}
 }

 root.arbatOpenStockOperation=open;root.arbatOpenStockDocument=openDocument;root.ArbatStockOperationsUI=Object.freeze({open,openDocument});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})(window);
