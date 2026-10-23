/* Supplier settlements are links to existing cash, never new cash or P&L entries. */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatPayables=api})(typeof window==='object'?window:globalThis,core=>{
 'use strict';
 const id=x=>String(x._id||x.id||''),money=x=>core.cents(x),amount=x=>{try{return money(x)}catch{return null}};
 const receiptKey=x=>'receipt:'+JSON.stringify([x.org||'',x.documentId||x.importId||id(x)]);
 function lineCents(qty,price){
  const parts=[qty,price].map(value=>{const raw=String(value).trim().replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('Invalid quantity or price');const [whole,fraction='']=raw.split('.');return {n:BigInt(whole+fraction),scale:10n**BigInt(fraction.length)}}),scale=parts[0].scale*parts[1].scale;
  return (parts[0].n*parts[1].n*100n+scale/2n)/scale;
 }
 function documents(data={},warehouse={}){
  const rows=[];
  for(const collection of ['expenses','costs'])for(const source of data[collection]||[]){
   const article=(data.pnlArticles||[]).find(a=>a.id===source.pnlArticleId||a.name===source.name);
   if(!id(source)||source.warehouseMoveId||(source.pnlType||article?.type)==='income')continue;
   rows.push({key:collection+':'+id(source),collection,id:id(source),sources:[source],org:source.org||'',date:source.date||'',label:source.note||source.name||source.category||'Расход',supplierId:source.supplierId||'',dueDate:source.paymentDueDate||'',total:amount(source.amountGross??source.amount),issues:[],paid:0n,links:[]});
  }
  const groups=new Map();
  for(const source of warehouse.moves||[]){if(source.kind!=='receipt'||!id(source))continue;const key=receiptKey(source);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(source)}
  for(const [key,sources] of groups){const source=sources[0];let total=0n,valid=true;
   for(const line of sources){if(Number(line.qty)<=0||Number(line.price)<=0)valid=false;else try{total+=lineCents(line.qty,line.price)}catch{valid=false}}
   rows.push({key,collection:'receipt',id:id(source),sources,org:source.org||'',date:(source.date||'').slice(0,10),label:source.note||source.documentId||'Приход на склад',supplierId:source.supplierId||'',dueDate:source.paymentDueDate||'',total:valid?total:null,issues:[],paid:0n,links:[]});
  }
  return rows;
 }
 function eligible(payment,data){return payment.type==='out'&&!payment.personId&&!Array.isArray(payment.payrollAllocations)&&!(data.crewSettlements||[]).some(s=>String(s.cashId)===id(payment))&&amount(payment.amount)>0n}
 function snapshot(data={},warehouse={},today=new Date().toISOString().slice(0,10)){
  const rows=documents(data,warehouse),byKey=new Map(rows.map(d=>[d.key,d])),payments=[],issues=[];
  const issue=(message,doc,payment)=>{issues.push({message,documentKey:doc?.key,paymentId:payment&&id(payment)});if(doc)doc.issues.push(message)};
  for(const doc of rows){if(doc.total===null||doc.total<=0n)issue('Уточните сумму документа',doc);if(doc.sources.some(s=>(s.supplierId||'')!==doc.supplierId||(s.paymentDueDate||'')!==doc.dueDate))issue('У строк накладной различаются условия оплаты',doc)}
  for(const payment of data.cash||[]){
   const links=Array.isArray(payment.supplierAllocations)?payment.supplierAllocations:[],total=amount(payment.amount),used=links.reduce((s,l)=>s+(amount(l.amount)||0n),0n),valid=eligible(payment,data)&&total!==null&&used<=total&&links.every(l=>amount(l.amount)>0n);
   const entry={source:payment,id:id(payment),available:valid?total-used:0n,eligible:eligible(payment,data),valid};payments.push(entry);
   const seen=new Set();
   for(const link of links){const doc=byKey.get(link.documentKey),n=amount(link.amount);let reason='';
    if(!doc)reason='Платёж связан с удалённым или недоступным документом';
    else if(!valid)reason='Платёж изменён или распределён сверх суммы: проверьте связи';
    else if(!doc.org||doc.org!==payment.org)reason='Организация документа и платежа не совпадает';
    else if(doc.supplierId&&doc.supplierId!==payment.customerId)reason='Поставщик документа и получатель платежа не совпадают';
    else if(seen.has(doc.key))reason='Повторная связь с одним документом';
    if(reason)issue(reason,doc,payment);
    if(doc){doc.links.push({paymentId:id(payment),amount:n||0n,valid:!reason,source:payment});if(!reason)doc.paid+=n;seen.add(doc.key)}
   }
  }
  for(const doc of rows){if(doc.total!==null&&doc.paid>doc.total)issue('Привязано больше суммы документа — уточните распределение',doc);doc.remaining=doc.total===null?null:doc.total>doc.paid?doc.total-doc.paid:0n;doc.status=doc.issues.length?'review':doc.remaining===0n?'paid':doc.paid>0n?'partial':'unpaid';doc.overdue=doc.remaining>0n&&!!doc.dueDate&&doc.dueDate<today}
  return {documents:rows,payments,issues};
 }
 function allocate(data,warehouse,documentKey,paymentId,value){
  const state=snapshot(data,warehouse),doc=state.documents.find(d=>d.key===documentKey),payment=state.payments.find(p=>p.id===paymentId),n=money(value);
  if(!doc||doc.issues.length)throw Error('Сначала устраните замечания к документу');
  if(!payment?.valid||!payment.eligible||!doc.org||doc.org!==payment.source.org)throw Error('Выберите расходный платёж той же организации');
  if(doc.supplierId&&doc.supplierId!==payment.source.customerId)throw Error('Получатель платежа не совпадает с поставщиком');
  if(n<=0n||n>doc.remaining||n>payment.available)throw Error('Сумма должна быть больше нуля и не превышать остаток документа и платежа');
  const links=(payment.source.supplierAllocations||[]).map(l=>({...l})),existing=links.find(l=>l.documentKey===documentKey);
  if(existing)existing.amount=core.rubles(money(existing.amount)+n);else links.push({documentKey,amount:core.rubles(n)});
  return links;
 }
 function summary(data,warehouse,org='',today){
  const docs=snapshot(data,warehouse,today).documents.filter(d=>!org||d.org===org),valid=docs.filter(d=>d.status!=='review');
  return {remaining:valid.reduce((n,d)=>n+d.remaining,0n),overdue:valid.filter(d=>d.overdue).reduce((n,d)=>n+d.remaining,0n),review:docs.filter(d=>d.status==='review').length,open:valid.filter(d=>d.remaining>0n).length};
 }
 function editReceipt(warehouse,key,baseline,lines,note,uuid){
  const original=(warehouse.moves||[]).filter(m=>m.kind==='receipt'&&receiptKey(m)===key);
  if(!original.length||JSON.stringify(original)!==baseline)throw Error('Документ изменён другим сотрудником или удалён. Откройте его заново.');
  if(!lines.length)throw Error('В накладной должна остаться хотя бы одна позиция');
  const seen=new Set(),now=new Date().toISOString(),first=original[0];
  const result=lines.map((line,i)=>{
   const previous=original.find(m=>id(m)===line.id);
   if(line.id&&(!previous||seen.has(line.id)))throw Error('Некорректная строка документа');
   if(line.id)seen.add(line.id);
   const qty=Number(String(line.qty).replace(',','.')),price=Number(String(line.price).replace(',','.'));
   if(!(warehouse.items||[]).some(x=>x.id===line.itemId)||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0)throw Error('Проверьте товар, количество и цену каждой строки');
   return {...(previous||first),id:previous?.id||uuid(),n:previous?.n||Math.max(0,...warehouse.moves.map(m=>Number(m.n)||0))+i+1,documentId:first.documentId||(!first.importId?id(first):undefined),itemId:line.itemId,qty,price,note,documentLine:i+1,documentLines:lines.length,correctedAt:now,correctionHistory:[...(previous?.correctionHistory||[]),{at:now,previous:previous?{itemId:previous.itemId,qty:previous.qty,price:previous.price,note:previous.note}:null}]};
  });
  const byId=new Map(result.filter(m=>original.some(o=>id(o)===id(m))).map(m=>[id(m),m])),last=id(original.at(-1)),moves=[];
  for(const m of warehouse.moves){if(m.kind==='receipt'&&receiptKey(m)===key){if(byId.has(id(m)))moves.push(byId.get(id(m)));if(id(m)===last)moves.push(...result.filter(r=>!byId.has(id(r))))}else moves.push({...m})}
  return {...warehouse,moves,imports:(warehouse.imports||[]).map(x=>x.id===first.importId?{...x,count:lines.length}:x)};
 }
 return {documents,snapshot,allocate,receiptKey,id,summary,editReceipt};
});
