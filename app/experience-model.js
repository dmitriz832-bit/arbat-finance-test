/* Presentation model: dates and source rows, accounting remains in finance-core. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatExperience=api})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const date=s=>new Date(s+'T12:00:00');
 function shiftPeriod(reference,mode,step){const d=date(reference),day=d.getDate(),months=mode==='year'?12:mode==='quarter'?3:1;d.setDate(1);d.setMonth(d.getMonth()+months*step);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return iso(d)}
 function plans(data,org='',today=iso(new Date())){
  const end=date(today);end.setDate(end.getDate()+6);const to=iso(end),future=[],overdue=[];
  for(const rule of data.calendar||[]){
   if(rule.active==='no'||!/^\d{4}-\d{2}-\d{2}$/.test(rule.dueDate||'')||org&&rule.org!==org)continue;
   const start=date(rule.dueDate);if(!Number.isFinite(+start))continue;
   const entry=occurrence=>({...rule,occurrence,days:Math.round((date(occurrence)-date(today))/86400000)});
   if(rule.dueDate<today)overdue.push(entry(rule.dueDate));
   if(rule.frequency!=='monthly'){const row=entry(rule.dueDate);if(row.days>=0&&row.days<=90)future.push(row);continue}
   const now=date(today),offset=Math.max(0,(now.getFullYear()-start.getFullYear())*12+now.getMonth()-start.getMonth());
   for(let i=offset;i<=offset+4;i++){const d=new Date(start.getFullYear(),start.getMonth()+i,1,12);d.setDate(Math.min(start.getDate(),new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));const row=entry(iso(d));if(row.days>=0&&row.days<=90)future.push(row)}
  }
  future.sort((a,b)=>a.occurrence.localeCompare(b.occurrence));overdue.sort((a,b)=>a.occurrence.localeCompare(b.occurrence));
  return {from:today,to,future,week:future.filter(x=>x.occurrence<=to),overdue};
 }
 const kinds={'project-expense':['expenses','Расход проекта'],'general-expense':['costs','Общий расход'],'work-act':['workActs','Выполненная работа'],payroll:['labor','Начисление']};
 function financialRows(snapshot,metric,core){
  const revenue=snapshot.revenueDocuments.map(source=>({source,collection:'realizations',id:source._id||source.id,date:source.date,label:'Реализация',amount:core.documentPnlAmount(source)}));
  const expenses=snapshot.rows.map(row=>({source:row.source,collection:kinds[row.kind]?.[0]||null,id:row.source?._id||row.source?.id,date:row.date,label:kinds[row.kind]?.[1]||row.kind,category:row.category,amount:row.amount}));
  if(metric==='revenue')return revenue;
  if(metric==='direct')return expenses.filter(x=>['direct','production'].includes(x.category));
  if(metric==='expenses')return expenses.filter(x=>x.category!=='belowIncome');
  if(metric==='cash')return snapshot.cash.rows.filter(x=>x.type!=='transfer').map(source=>({source,collection:'cash',id:source._id||source.id,date:source.date,label:source.type==='in'?'Поступление':'Платёж',amount:core.cents(source.amount)*(source.type==='out'?-1n:1n)}));
  const filtered=metric==='gross'?expenses.filter(x=>['direct','production'].includes(x.category)):metric==='ebitda'?expenses.filter(x=>!['belowIncome','belowExpenses'].includes(x.category)):expenses;
  const rows=revenue.concat(filtered.map(x=>({...x,amount:x.category==='belowIncome'?x.amount:-x.amount})));
  if(snapshot.deferredChange)rows.push({collection:null,id:null,date:'',label:'Корректировка признания затрат / НЗП',amount:snapshot.deferredChange,explanation:'Расчётная корректировка финансового ядра: изменение незавершённого производства за выбранный период. Отдельного первичного документа нет.'});
  return rows;
 }
 return Object.freeze({iso,shiftPeriod,plans,financialRows});
});
