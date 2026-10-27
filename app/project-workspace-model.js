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
 const stageStatuses=Object.freeze({planned:'Планируется',active:'В работе',completed:'Выполнен',cancelled:'Отменён'});
 function stageAmount(value){if(value==null||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw Error('Укажите неотрицательную сумму этапа, не более двух знаков после точки');return core.cents(value)}
 function stageDate(value){const date=String(value??'');if(!date)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,4)==='0000')throw Error('Укажите корректную дату этапа');const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('Укажите корректную дату этапа');return date}
 function normalizeStages(raw){
  if(!Array.isArray(raw)||raw.length>500)throw Error('Этапы должны быть массивом, не более 500 строк');
  const ids=new Set();return raw.map((row,index)=>{if(!row||typeof row!=='object')throw Error('Проверьте этап '+(index+1));const id=String(row.id||'stage-'+(index+1)),name=String(row.name??'').trim(),status=row.status||'planned',startDate=stageDate(row.startDate),endDate=stageDate(row.endDate);if(ids.has(id))throw Error('Идентификатор этапа повторяется');ids.add(id);if(!name)throw Error('Укажите название этапа '+(index+1));if(!Object.hasOwn(stageStatuses,status))throw Error('Проверьте состояние этапа');if(startDate&&endDate&&endDate<startDate)throw Error('Дата окончания этапа раньше даты начала');return {id,name,amount:core.rubles(stageAmount(row.amount)),startDate,endDate,status}});
 }
 function stages(deal){const rows=normalizeStages(deal.projectStages??[]),sum=status=>rows.filter(x=>status?x.status===status:x.status!=='cancelled').reduce((n,x)=>n+core.cents(x.amount),0n),total=sum(),contract=deal.contractTotal??deal.revenue;return {rows,total,completed:sum('completed'),cancelled:sum('cancelled'),difference:contract==null||contract===''?null:core.cents(contract)-total,undated:rows.filter(x=>x.status!=='cancelled'&&(!x.startDate||!x.endDate)).length}}
 function splitStages({amount,startDate,months,name='Этап'}){
  const total=stageAmount(amount),anchor=stageDate(startDate),count=Number(months);if(!anchor)throw Error('Укажите дату первого этапа');if(!Number.isInteger(count)||count<1||count>120)throw Error('Укажите число месяцев от 1 до 120');
  const [year,month,day]=anchor.split('-').map(Number),base=total/BigInt(count),rest=total%BigInt(count),batch=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  return normalizeStages(Array.from({length:count},(_,i)=>{const date=new Date(anchor+'T00:00:00Z');date.setUTCDate(1);date.setUTCFullYear(year,month-1+i,1);const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1,0);date.setUTCDate(Math.min(day,last.getUTCDate()));const at=date.toISOString().slice(0,10);return {id:'stage-'+batch+'-'+i,name:String(name||'Этап')+' · '+(i+1)+'/'+count,amount:core.rubles(base+(BigInt(i)<rest?1n:0n)),startDate:at,endDate:at,status:'planned'}}));
 }
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
 return Object.freeze({categories,budget,snapshot,stageStatuses,normalizeStages,stages,splitStages});
});
