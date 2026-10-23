/* Read-only cash planning. All amounts are bigint kopecks; dates are explicit UTC calendar dates.
 * calendar.supplierDocumentKey is an explicit alias of a payable, not another obligation.
 * A linked document owns its amount and deadline. Legacy rows are never matched by name/amount.
 */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore,typeof module==='object'&&module.exports?require('./payables-model.js'):root.ArbatPayables);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatLiquidity=api})(typeof window==='object'?window:globalThis,(core,payables)=>{
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
  for(const rule of data.calendar||[]){
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
  const supplier={...buckets(supplierRows),review:review.filter(r=>r.source==='supplier').length},manual=buckets(manualRows),income=buckets(incomeRows),rows=supplierRows.concat(manualRows).sort((a,b)=>(a.occurrence||'9999').localeCompare(b.occurrence||'9999')),combined=buckets(rows);
  // Invalid monetary documents stay visible as review; their totals must not be presented as zero debt.
  const forecastComplete=review.length===0&&combined.undatedCount===0&&income.undatedCount===0;
  return {today,org,documents,supplier,manual,income,combined,rows,supplierRows,manualRows,incomeRows,review,linkedCalendar,forecastComplete,completeness:forecastComplete?'known-entered-obligations':'unknown',obligations7:combined.overdue+combined.due7,obligations30:combined.overdue+combined.due30};
 }
 return Object.freeze({snapshot});
});
