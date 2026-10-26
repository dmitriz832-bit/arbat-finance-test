/* Project presentation aggregates. Accounting remains in finance-core; amounts are cents. */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore,typeof module==='object'&&module.exports?require('./payables-model.js'):root.ArbatPayables);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatProjectWorkspace=api})(typeof window==='object'?window:globalThis,(core,payables)=>{
 'use strict';
 const categories=Object.freeze([
  {id:'equipment',field:'planEquipment',label:'Оборудование'},
  {id:'materials',field:'planMaterials',label:'Материалы'},
  {id:'labor',field:'planLabor',label:'Работы монтажников'},
  {id:'contractors',field:'planContractors',label:'Подрядчики'},
  {id:'transport',field:'planTransport',label:'Транспорт'},
  {id:'machinery',field:'planMachinery',label:'Спецтехника'},
  {id:'other',field:'planOther',label:'Прочие прямые расходы'}
 ]);
 function budget(deal){
  const rows=categories.map(c=>{const raw=deal[c.field],plan=raw==null||raw===''?null:core.cents(raw);if(plan!==null&&plan<0n)throw Error('Сумма плана должна быть неотрицательной');return {...c,plan,actual:0n}});
  const detailed=rows.some(x=>x.plan!==null),legacy=deal.cost;
  return {detailed,total:detailed?rows.reduce((n,x)=>n+(x.plan||0n),0n):legacy==null||legacy===''?null:core.cents(legacy),rows};
 }
 function snapshot(data,deal,warehouse={},fifo){
  const key=core.dealKey(deal),input={...data,warehouse,fifo},project=core.projectSnapshot(input,deal,key),wip=core.projectWipSnapshot(input,deal,key),issues=[...project.issues,...wip.issues],plan=budget(deal);
  const cashRows=[];
  for(const source of data.cash||[]){
   if(source.type!=='in'&&source.type!=='out')continue;
   const parts=Array.isArray(source.allocations)?source.allocations:[];
   if(parts.length?!parts.some(p=>p.projectKey===key):source.projectKey!==key)continue;
   let n;
   try{const total=core.cents(source.amount),amounts=parts.map(p=>core.cents(p.amount));if(total<=0n||amounts.some(v=>v<=0n)||amounts.reduce((sum,v)=>sum+v,0n)>total){issues.push('cash-allocation-invalid');continue}n=parts.length?parts.reduce((sum,p,i)=>sum+(p.projectKey===key?amounts[i]:0n),0n):total}catch{issues.push('cash-allocation-invalid');continue}
   if(!n)continue;
   if(source.org!==deal.org){issues.push('cash-organization-mismatch');continue}
   cashRows.push({source,amount:n});
  }
  const total=type=>cashRows.filter(x=>x.source.type===type).reduce((n,x)=>n+x.amount,0n),income=total('in'),outcome=total('out');
  const ledger=core.expenseLedger(input).rows.filter(x=>x.projectKey===key&&x.category!=='belowIncome');
  const unclassified={id:'unclassified',label:'Не распределено по смете',plan:null,actual:0n};
  for(const row of ledger){let bucket;
   if(row.category==='direct'&&(row.kind==='payroll'||row.kind==='work-act'))bucket=plan.rows.find(x=>x.id==='labor');
   else bucket=plan.rows.find(x=>x.label===row.source?.category);
   (bucket||unclassified).actual+=row.amount;
  }
  if(unclassified.actual)plan.rows.push(unclassified);
  for(const row of plan.rows)row.remaining=row.plan===null?null:row.plan-row.actual;
  plan.actual=project.cost;plan.remaining=plan.total===null?null:plan.total-project.cost;
  const supplierDocuments=payables.snapshot(data,warehouse).documents.filter(d=>d.org===deal.org&&d.sources.some(s=>s.projectKey===key||s.dealId===deal._id));
  const valid=supplierDocuments.filter(d=>d.status!=='review');
  if(supplierDocuments.some(d=>d.status==='review'))issues.push('supplier-document-review');
  const supplierReviewCount=supplierDocuments.filter(d=>d.status==='review').length,supplierKnownRemaining=valid.reduce((n,d)=>n+(d.remaining||0n),0n),supplierRemaining=supplierReviewCount?null:supplierKnownRemaining,contractGross=core.cents(deal.contractTotal??deal.revenue??0),contractNet=wip.contractNet;
  return {key,deal,contractGross,contractNet,revenue:project.revenue,cost:project.cost,recognizedCost:wip.recognizedCost==null?null:wip.recognizedCost+(wip.nonDirectCost||0n),wip:wip.wip??null,profit:project.issues.length||wip.status!=='calculated'?null:wip.operatingProfit,remainingPayment:contractGross-income,remainingRevenue:contractNet===null?null:contractNet-project.revenue,cash:{income,outcome,balance:income-outcome,rows:cashRows},budget:plan,realizations:(data.realizations||[]).filter(x=>x.projectKey===key),ledger,supplierDocuments,supplierRemaining,supplierKnownRemaining,supplierReviewCount,issues:[...new Set(issues)]};
 }
 return Object.freeze({categories,budget,snapshot});
});
