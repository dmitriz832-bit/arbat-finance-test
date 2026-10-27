/* Read-only cash planning. All amounts are bigint kopecks; dates are explicit UTC calendar dates.
 * calendar.supplierDocumentKey is an explicit alias of a payable, not another obligation.
 * A linked document owns its amount and deadline. Legacy rows are never matched by name/amount.
 */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore,typeof module==='object'&&module.exports?require('./payables-model.js'):root.ArbatPayables,typeof module==='object'&&module.exports?require('./loan-workspace-model.js'):root.ArbatLoanWorkspaceModel,typeof module==='object'&&module.exports?require('./asset-workspace-model.js'):root.ArbatAssetWorkspaceModel,typeof module==='object'&&module.exports?require('./financial-payment-links.js'):root.ArbatFinancialPaymentLinks);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatLiquidity=api})(typeof window==='object'?window:globalThis,(core,payables,loans,assets,paymentLinks)=>{
 'use strict';
 const DAY=86400000;
 function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null}
 const sum=rows=>rows.reduce((n,r)=>n+r.amount,0n);
 function buckets(rows){return {total:sum(rows),due7:sum(rows.filter(r=>r.days!==null&&r.days>=0&&r.days<7)),due30:sum(rows.filter(r=>r.days!==null&&r.days>=0&&r.days<30)),overdue:sum(rows.filter(r=>r.days!==null&&r.days<0)),undated:sum(rows.filter(r=>r.days===null)),undatedCount:rows.filter(r=>r.days===null).length}}
 function snapshot(data={},warehouse={},org='',today=new Date().toISOString().slice(0,10)){
  const now=date(today);if(now===null)throw Error('Invalid forecast date');
  const state=payables.snapshot(data,warehouse,today),documents=state.documents.filter(d=>!org||d.org===org),byKey=new Map(state.documents.map(d=>[d.key,d])),supplierRows=[],manualRows=[],incomeRows=[],review=[],linkedCalendar=[];
  const days=value=>{const n=date(value);return n===null?null:(n-now)/DAY};
  for(const d of documents){
   if(d.status==='review'){review.push({source:'supplier',documentKey:d.key,org:d.org,amount:d.remaining,issues:d.issues});continue}
   if(d.remaining<=0n)continue;
   supplierRows.push({source:'supplier',documentKey:d.key,org:d.org,name:d.label,amount:d.remaining,dueDate:d.dueDate,occurrence:date(d.dueDate)===null?null:d.dueDate,days:days(d.dueDate),document:d});
  }
  const retiredCalendarIds=new Set((data.paymentRequests||[]).map(r=>String(r.calendarId||'')).filter(Boolean));
  for(const rule of data.calendar||[]){
   if(rule.requestId||rule.sourcePaymentRequestId||retiredCalendarIds.has(String(rule.id||rule._id||'')))continue;
   if(rule.active==='no'||org&&rule.org!==org)continue;
   const calendarId=String(rule.id||rule._id||''),problem=message=>review.push({source:'calendar',calendarId,org:rule.org||'',amount:null,issues:[message]});
   if(rule.supplierDocumentKey){
    const doc=byKey.get(rule.supplierDocumentKey);
    if(!doc||!doc.org||doc.org!==rule.org||(rule.type==='in'||rule.kind==='income')||rule.frequency==='monthly')problem('Проверьте явную связь календаря с документом поставщика');
    else linkedCalendar.push({calendarId,documentKey:doc.key});
    continue;
   }
   let amount;try{if(rule.amount==null||rule.amount==='')throw Error();amount=core.cents(rule.amount);if(amount<=0n)throw Error()}catch{problem('Уточните сумму плана');continue}
   const start=date(rule.dueDate),income=rule.type==='in'||rule.kind==='income',target=income?incomeRows:manualRows;
   const add=occurrence=>target.push({source:'calendar',calendarId,org:rule.org||'',name:rule.name||'',amount,dueDate:rule.dueDate,occurrence,days:days(occurrence),rule});
   if(start===null){add(null);continue}
   if(rule.frequency!=='monthly'){add(rule.dueDate);continue}
   // Recurring rules define future occurrences, not evidence that every past month is unpaid.
   const first=new Date(start),current=new Date(now),offset=Math.max(0,(current.getUTCFullYear()-first.getUTCFullYear())*12+current.getUTCMonth()-first.getUTCMonth());
   for(let i=offset;i<=offset+4;i++){
    const d=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+i,1));
    d.setUTCDate(Math.min(first.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
    const n=(+d-now)/DAY;if(n>=0&&n<=90)add(d.toISOString().slice(0,10));
   }
  }
  const registerRows=[];
  if(loans){const state=loans.snapshot(data,{org,today});registerRows.push(...state.rows.map(r=>({...r,document:(data.loanContracts||[]).find(c=>String(c._id||c.id)===r.documentKey)})));review.push(...state.review)}
  else if((data.loanContracts||[]).some(r=>!org||r.org===org))review.push({source:'loan',amount:null,issues:['Модуль кредитов недоступен']});
  for(const asset of data.fixedAssets||[]){if(org&&asset.org!==org)continue;try{if(!assets)throw Error('Модуль имущества недоступен');const postingIssues=assets.postingIssues?.(data,asset)||[];if(postingIssues.length)throw Error(postingIssues.join('; '));const p=assets.purchasePosition(data,asset,today);if(!p.known)throw Error(p.issues.join('; ')||'Уточните стоимость покупки');if(p.outstanding>0n)registerRows.push({source:'asset',documentKey:String(asset._id||asset.id),org:asset.org,name:asset.name,amount:p.outstanding,dueDate:asset.purchaseDueDate||'',occurrence:date(asset.purchaseDueDate)===null?null:asset.purchaseDueDate,days:days(asset.purchaseDueDate),document:asset})}catch(error){review.push({source:'asset',documentKey:String(asset._id||asset.id),org:asset.org,amount:null,issues:[error.message]})}}
  if(paymentLinks?.review)for(const issue of paymentLinks.review(data)){
   if(!issue.documents.some(d=>['loanContracts','fixedAssets'].includes(d.collection)))continue;
   const linked=issue.documents.filter(d=>['loanContracts','fixedAssets'].includes(d.collection));
   for(const doc of linked){const source=doc.collection==='loanContracts'?'loan':'asset',record=(data[doc.collection]||[]).find(r=>String(r._id||r.id)===doc.id);if(org&&record?.org!==org)continue;for(let i=registerRows.length-1;i>=0;i--)if(registerRows[i].source===source&&registerRows[i].documentKey===doc.id)registerRows.splice(i,1);review.push({source,documentKey:doc.id,org:record?.org||'',amount:null,issues:[issue.message]})}
   for(let i=supplierRows.length-1;i>=0;i--)if(supplierRows[i].document.links?.some(l=>String(l.paymentId)===issue.cashId)){const row=supplierRows.splice(i,1)[0];review.push({source:'supplier',documentKey:row.documentKey,org:row.org,amount:null,issues:[issue.message]})}
  }
  const supplier={...buckets(supplierRows),review:review.filter(r=>r.source==='supplier').length},manual=buckets(manualRows),income=buckets(incomeRows),rows=supplierRows.concat(manualRows,registerRows).sort((a,b)=>(a.occurrence||'9999').localeCompare(b.occurrence||'9999')),combined=buckets(rows);
  // Invalid monetary documents stay visible as review; their totals must not be presented as zero debt.
  const forecastComplete=review.length===0&&combined.undatedCount===0&&income.undatedCount===0;
  return {today,org,documents,supplier,manual,income,combined,rows,supplierRows,manualRows,registerRows,incomeRows,review,linkedCalendar,forecastComplete,completeness:forecastComplete?'known-entered-obligations':'unknown',obligations7:combined.overdue+combined.due7,obligations30:combined.overdue+combined.due30};
 }
 return Object.freeze({snapshot});
});
