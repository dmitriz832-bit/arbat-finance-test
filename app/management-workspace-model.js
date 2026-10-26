/* Read-only management workspaces. Debt and forecasts reuse posting source models.
 * Consolidation sums positive company liabilities, never nets them across owners. */
((root,factory)=>{const node=typeof module==='object'&&module.exports,api=factory(node?require('./finance-core.js'):root.ArbatFinanceCore,node?require('./payables-model.js'):root.ArbatPayables,node?require('./liquidity-model.js'):root.ArbatLiquidity);if(node)module.exports=api;else root.ArbatManagementWorkspaceModel=api})(typeof window==='object'?window:globalThis,(core,payables,liquidity)=>{
 'use strict';
 function bounds(period){if(!/^\d{4}-\d{2}$/.test(period||'')||Number(period.slice(5))<1||Number(period.slice(5))>12)throw RangeError('Выберите месяц');return {from:period+'-01',to:new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10),label:period}}
 function snapshot(data={},warehouse={},options={}){
  const today=options.today||new Date().toISOString().slice(0,10),period=options.period||today.slice(0,7),org=options.org||'',range=bounds(period),scoped=x=>!org||x.org===org;
  const supplierState=payables.snapshot(data,warehouse,today),documents=supplierState.documents.filter(scoped),reviewCount=documents.filter(x=>x.status==='review').length,knownRemaining=documents.filter(x=>x.status!=='review').reduce((sum,x)=>sum+x.remaining,0n);
  const issues=[],read=(name,fn,fallback)=>{try{return fn()}catch(error){issues.push({source:name,message:error.message});return fallback}};
  const customers=read('Расчёты с заказчиками',()=>core.ownerDebtSnapshot(data,org),{rows:[],receivable:null,advances:null,unallocated:null,issues:[]}),projectNames=new Map((data.deals||[]).map(d=>[core.dealKey(d),d.name||d.order1c||core.dealKey(d)]));
  customers.rows=customers.rows.map(row=>({...row,name:projectNames.get(row.key)||row.key}));
  const payrollState=core.payrollByOrganization({accruals:data.labor||[],payments:data.cash||[],workActs:data.workActs||[],settlements:data.crewSettlements||[]},org),people=payrollState.people,payrollIssues=payrollState.issues;
  const articles=new Map((data.articles||[]).map(a=>[String(a.id||a._id),a.name])),cash=read('ДДС',()=>core.cashFlow(data.cash||[],period,org),{income:null,outgoing:null,net:null,transfers:null,categories:[]});
  cash.categories=cash.categories.map(row=>({...row,name:articles.get(String(row.articleId))||(row.articleId==='no-article'?'Без статьи':String(row.articleId))}));
  return {today,org,period,bounds:range,issues,cash,result:read('ОПиУ',()=>core.ownerPeriodSnapshot(data,range,org),null),suppliers:{documents,knownRemaining,totalRemaining:reviewCount?null:knownRemaining,reviewCount,overdue:documents.filter(x=>x.status!=='review'&&x.overdue).reduce((sum,x)=>sum+x.remaining,0n)},customers,payroll:{people,issues:payrollIssues,payable:people.reduce((sum,p)=>sum+(p.payable>0n?p.payable:0n),0n),overpaid:people.reduce((sum,p)=>sum+(p.payable<0n?-p.payable:0n),0n)},planning:liquidity.snapshot(data,warehouse,org,today)};
 }
 return Object.freeze({snapshot,bounds});
});
