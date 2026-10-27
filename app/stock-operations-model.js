/* Pure preparation: stock and its financial sources form one immutable command. */
((root,factory)=>{const common=typeof module==='object'&&module.exports;const api=factory(common?require('./finance-core.js'):root.ArbatFinanceCore,common?require('./warehouse-workspace.js'):root.ArbatWarehouseWorkspace);if(common)module.exports=api;else root.ArbatStockOperations=api})(globalThis,(core,warehouseModel)=>{
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),id=x=>String(x?._id||x?.id||''),day=x=>String(x||'').slice(0,10);
 const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')&&!Number.isNaN(Date.parse(x))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 function qty(value){const s=(typeof value==='number'&&value>0&&value<0.00001?value.toFixed(6):String(value??'')).trim().replace(',','.');if(!/^\d+(?:\.\d{1,6})?$/.test(s)||!Number.isFinite(Number(s))||Number(s)<=0||Number(s)>Number.MAX_SAFE_INTEGER/1e6)throw Error('Проверьте положительное количество (до 6 знаков)');return Number(s)}
 function price(value){const s=String(value??'').trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(s)||core.cents(s)<=0n)throw Error('Укажите положительную цену с точностью до копейки');return core.rubles(core.cents(s))}
 function lineAmount(q,p){const s=q<0.00001?q.toFixed(6):String(q),[a,b='']=s.split('.'),den=10n**BigInt(b.length),n=BigInt(a+b)*core.cents(p);const v=(n+den/2n)/den;if(v<=0n||v>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Сумма строки вне допустимой точности');return v}
 function prepare(state,command,options={}){
  const actor=options.actor;if(!actor||!['admin','accountant'].includes(actor.role))throw Error('Недостаточно прав для складской операции');
  if(typeof options.fifo!=='function')throw Error('Расчёт FIFO ещё не загружен');
  const c=clone(command),kind=c.kind;
  if(kind==='cancel'){
   const finance=clone(state.finance),warehouse=clone(state.warehouse),target=String(c.targetDocumentId||''),moves=(warehouse.moves||[]).filter(m=>m.documentId===target&&m.stockOperationId);
   if(!moves.length)throw Error('Связанный документ не найден или уже отменён');
   const ids=new Set(moves.map(m=>m.id)),keys=new Set(moves.filter(m=>m.kind==='receipt').map(m=>'receipt:'+JSON.stringify([m.org,m.documentId])));
   if((finance.cash||[]).some(p=>(p.supplierAllocations||[]).some(a=>keys.has(a.documentKey))))throw Error('Сначала снимите привязку оплаты к поступлению');
   warehouse.moves=warehouse.moves.filter(m=>!ids.has(m.id));finance.expenses=(finance.expenses||[]).filter(e=>!ids.has(e.warehouseMoveId));finance.realizations=(finance.realizations||[]).filter(r=>r.warehouseDocumentId!==target);
   const before=options.fifo(state.warehouse),after=options.fifo(warehouse),priorWarnings=new Set(before.warnings.map(w=>JSON.stringify(w)));
   if(after.warnings.some(w=>!priorWarnings.has(JSON.stringify(w)))||warehouse.moves.some(m=>m.from&&JSON.stringify(before.byMove[m.id]?.parts)!==JSON.stringify(after.byMove[m.id]?.parts)))throw Error('Есть зависимые движения. Сначала исправьте или отмените их');
   return {finance,warehouse,documentId:target,cancelled:true,affectedDates:[...new Set(moves.map(m=>day(m.date)))].sort()};
  }
  if(!['sale','consume','receipt-consume'].includes(kind))throw Error('Неизвестная складская операция');
  if(!date(c.date))throw Error('Проверьте дату документа');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(c.requestId||''))throw Error('Не задан уникальный номер операции');
  if(!String(c.document||'').trim())throw Error('Укажите документ-основание');
  const finance=clone(state.finance),warehouse=clone(state.warehouse),documentId='STOCK-'+c.requestId;
  if((warehouse.moves||[]).some(m=>m.stockOperationId===c.requestId||m.documentId===documentId)||(finance.realizations||[]).some(r=>r.warehouseDocumentId===documentId))throw Error('Операция уже существует: повторное проведение запрещено');
  const deals=(finance.deals||[]).filter(d=>id(d)===String(c.dealId)),places=(warehouse.places||[]).filter(p=>id(p)===String(c.placeId));
  if(deals.length!==1||deals[0].org!==c.org)throw Error('Сделка не найдена в выбранной организации');
  if(places.length!==1||places[0].org!==c.org)throw Error('Место хранения не найдено в организации сделки');
  const deal=deals[0],projectKey=core.dealKey(deal),rate=Number(c.vatRate);
  if(!Number.isInteger(rate)||![0,5,7,10,20,22].includes(rate))throw Error('Выберите ставку НДС');
  if(kind==='receipt-consume'){
   if(!(finance.counterparties||[]).some(p=>id(p)===String(c.supplierId)))throw Error('Выберите поставщика');
   if(typeof c.vatDeductible!=='boolean'||rate>0&&!String(c.vatDocument||'').trim())throw Error('Укажите политику вычета НДС и документ');
  }
  if(!Array.isArray(c.lines)||!c.lines.length)throw Error('Добавьте хотя бы один материал');
  const lines=c.lines.map((line,index)=>{const items=(warehouse.items||[]).filter(i=>id(i)===String(line.itemId));if(items.length!==1||items[0].org&&items[0].org!==c.org)throw Error('Номенклатура отсутствует или относится к другой организации');return {itemId:String(line.itemId),qty:qty(line.qty),price:kind==='receipt-consume'?price(line.price):null,salePrice:kind==='sale'?price(line.salePrice):null,index}});
  if(kind!=='receipt-consume'){
   const historical={...warehouse,moves:(warehouse.moves||[]).filter(m=>day(m.date)<=c.date),plans:(warehouse.plans||[]).filter(p=>!p.date||day(p.date)<=c.date)},view=warehouseModel.snapshot(historical,finance,options.fifo(historical)),requested=new Map();
   for(const l of lines)requested.set(l.itemId,(requested.get(l.itemId)||0)+l.qty);
   for(const [itemId,requestedQty] of requested){
    const row=view.rows.find(r=>r.placeId===String(c.placeId)&&r.itemId===itemId),used=new Map();let own=0;
    for(const project of view.projects.filter(p=>p.org===c.org&&p.itemId===itemId)){let left=project.reserved;
     for(const place of historical.places.filter(p=>p.type==='warehouse'&&p.org===c.org)){const r=view.rows.find(r=>r.placeId===String(place.id)&&r.itemId===itemId),taken=Math.min(left,Math.max(0,(r?.qty||0)-(used.get(place.id)||0)));used.set(place.id,(used.get(place.id)||0)+taken);left-=taken;if(project.dealId===String(c.dealId)&&place.id===c.placeId)own+=taken;}
    }
    if(requestedQty>(row?.free||0)+own+1e-8)throw Error('Недостаточно свободного остатка: проверьте резерв других проектов и открытые выдачи');
   }
  }
  const now=options.now||new Date().toISOString(),author={id:actor.user_id||actor.id||'',name:actor.full_name||actor.name||'',email:actor.email||''};
  warehouse.moves||=[];finance.expenses||=[];finance.realizations||=[];
  const base={org:c.org,date:c.date,documentId,stockOperationId:c.requestId,stockOperationKind:kind,dealId:id(deal),note:String(c.document).trim(),createdAt:now,createdBy:author},realizationId=kind==='sale'?'warehouse-sale-'+c.requestId:null,consumes=[];
  for(const line of lines){
   let receipt=null;
   if(kind==='receipt-consume'){
    const gross=lineAmount(line.qty,line.price),net=core.netAmount(core.rubles(gross),c.org,rate);
    receipt={...base,id:documentId+'-receipt-'+line.index,n:warehouse.moves.length+1,kind:'receipt',itemId:line.itemId,qty:line.qty,price:line.price,amountGross:core.rubles(gross),amountNet:core.rubles(net),vatRate:rate,vatAmount:core.rubles(gross-net),vatDeductible:c.vatDeductible,vatDocument:rate?String(c.vatDocument).trim():'',supplierId:c.supplierId,supplierName:finance.counterparties.find(p=>id(p)===String(c.supplierId)).name,from:'',to:c.placeId};warehouse.moves.push(receipt);
   }
   const move={...base,id:documentId+'-consume-'+line.index,n:warehouse.moves.length+1,kind:'consume',stockPurpose:kind==='sale'?'sale':'project',itemId:line.itemId,qty:line.qty,price:0,from:c.placeId,to:'',...(realizationId?{saleRealizationId:realizationId}:{}),...(receipt?{receiptConsumptionId:receipt.id}:{})};warehouse.moves.push(move);consumes.push(move);
  }
  const before=options.fifo(state.warehouse),calculated=options.fifo(warehouse),priorWarnings=new Set(before.warnings.map(w=>JSON.stringify(w)));
  if(calculated.warnings.some(w=>!priorWarnings.has(JSON.stringify(w))))throw Error('Недостаточно остатка или нарушена оценка партий FIFO');
  // A backdated document must never reprice an existing later consumption.
  for(const m of state.warehouse.moves||[])if(m.from&&JSON.stringify(before.byMove[m.id]?.parts)!==JSON.stringify(calculated.byMove[m.id]?.parts))throw Error('Дата изменяет партии зависимого движения. Выберите корректную дату или исправьте связанные документы');
  for(const move of consumes){
   const v=core.warehouseMovementValuation(warehouse,move,calculated);if(v.status!=='calculated')throw Error(v.reason||'Стоимость партии требует сверки');
   const value=core.rubles(v.expenseAmount);finance.expenses.push({_id:'warehouse-consume-'+move.id,date:c.date,org:c.org,projectKey,category:'Материалы',amount:value,amountGross:value,amountNet:value,vatRate:0,vatAmount:'0.00',vatDeductible:false,warehouseMoveId:move.id,warehouseGrossAmount:core.rubles(v.grossAmount),warehouseValuationStatus:v.expenseValuationStatus,warehouseValuationParts:v.parts,valuationStatus:'calculated',stockOperationId:c.requestId,stockOperationKind:kind,stockPurpose:move.stockPurpose,...(realizationId?{saleRealizationId:realizationId}:{}),note:kind==='sale'?'Себестоимость отгрузки · '+c.document:'Складской расход · '+c.document,createdAt:now,createdBy:author});
  }
  if(realizationId){
   const saleLines=lines.map(l=>({itemId:l.itemId,qty:l.qty,price:l.salePrice,amountGross:core.rubles(lineAmount(l.qty,l.salePrice))})),gross=saleLines.reduce((n,l)=>n+core.cents(l.amountGross),0n),net=core.netAmount(core.rubles(gross),c.org,rate);
   finance.realizations.push({_id:realizationId,org:c.org,projectKey,date:c.date,document:String(c.document).trim(),amount:core.rubles(gross),amountGross:core.rubles(gross),amountNet:core.rubles(net),vatRate:rate,vatAmount:core.rubles(gross-net),customerId:deal.customerId||'',warehouseSale:true,warehouseDocumentId:documentId,warehouseMoveIds:consumes.map(m=>m.id),lines:saleLines,createdAt:now,createdBy:author});
   const graph=core.warehouseSaleAudit({...finance,warehouse,fifo:calculated});if(graph.issues.some(i=>i.source?.warehouseDocumentId===documentId||i.source?.documentId===documentId||i.source?.stockOperationId===c.requestId))throw Error('Связи отгрузки и реализации требуют сверки');
  }
  return {finance,warehouse,documentId,realizationId};
 }
 return Object.freeze({prepare});
});
