const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const modelPath=path.join(__dirname,'../app/project-workspace-model.js');
const model=()=>{assert.ok(fs.existsSync(modelPath),'Project workspace model must exist');return require(modelPath)};
const core=require('../app/finance-core.js');
const deal={_id:'p1',org:'АРБАТ.ГК',order1c:'1',name:'Вентиляция',contractTotal:122000,vatRate:22,cost:60000};
const key=core.dealKey(deal);
function data(){return {deals:[deal],realizations:[{_id:'r',projectKey:key,org:deal.org,amount:61000,vatRate:22,date:'2026-10-02'}],expenses:[{_id:'e',org:deal.org,projectKey:key,amount:24400,vatRate:22,vatDeductible:true,category:'Материалы',date:'2026-10-01'}],cash:[],labor:[],workActs:[],costs:[],pnlArticles:[]}}
test('project workspace distinguishes cash, accrued costs, recognized costs and WIP',()=>{
 const state=data(),other={...deal,_id:'p2',order1c:'2',name:'Другой проект'};state.deals.push(other);state.cash=[{_id:'c',type:'in',org:deal.org,amount:100000,allocations:[{projectKey:key,amount:50000},{projectKey:core.dealKey(other),amount:50000}]},{_id:'o',type:'out',org:deal.org,projectKey:key,amount:12000},{_id:'t',type:'transfer',org:deal.org,projectKey:key,amount:5000}];
 const result=model().snapshot(state,deal,{});
 assert.equal(result.cash.income,5000000n);assert.equal(result.cash.outcome,1200000n);assert.equal(result.cash.balance,3800000n);assert.equal(result.cash.rows.length,2);
 assert.equal(result.contractNet,10000000n);assert.equal(result.revenue,5000000n);assert.equal(result.cost,2000000n);assert.equal(result.recognizedCost,1000000n);assert.equal(result.wip,1000000n);assert.equal(result.profit,4000000n);assert.equal(result.remainingPayment,7200000n);
 assert.equal(result.budget.rows.find(x=>x.id==='materials').actual,2000000n);
});
test('allocations override project header, repeated matching shares sum once, foreign organization is flagged',()=>{
 const state=data();state.cash=[{_id:'c',type:'in',org:deal.org,projectKey:key,amount:1000,allocations:[{projectKey:key,amount:200},{projectKey:key,amount:300},{projectKey:'other',amount:500}]},{_id:'wrong',type:'in',org:'АИР-КЛИМАТ',projectKey:key,amount:400}];
 const result=model().snapshot(state,deal,{});assert.equal(result.cash.income,50000n);assert.ok(result.issues.includes('cash-organization-mismatch'));
});
test('supplier commitments use remaining linked amount without adding debt to P&L costs',()=>{
 const state=data();state.cash=[{_id:'pay',type:'out',org:deal.org,projectKey:key,amount:4000,supplierAllocations:[{documentKey:'expenses:e',amount:4000}]}];
 const result=model().snapshot(state,deal,{});assert.equal(result.supplierRemaining,2040000n);assert.equal(result.cost,2000000n);assert.equal(result.profit,4000000n);
});
test('empty detail budget retains legacy total; explicit zero is a real plan',()=>{
 assert.equal(model().budget(deal).total,6000000n);assert.equal(model().budget(deal).detailed,false);
 const planned={...deal,planEquipment:'0',planMaterials:'10000.10',planLabor:'5000'};
 const result=model().budget(planned);assert.equal(result.total,1500010n);assert.equal(result.detailed,true);assert.equal(result.rows.find(x=>x.id==='equipment').plan,0n);assert.equal(result.rows.find(x=>x.id==='contractors').plan,null);
 assert.equal(model().budget({...deal,planMaterials:'0'}).total,0n);
 assert.throws(()=>model().budget({...deal,planMaterials:'-1'}),/неотрицательной/);
});
test('unclassified costs remain visible and sum of categories equals project costs',()=>{
 const state=data();state.expenses.push({_id:'unknown',org:deal.org,projectKey:key,amount:100,vatRate:0,category:'Новая статья',date:'2026-10-01'});
 const result=model().snapshot(state,deal,{});assert.equal(result.budget.rows.find(x=>x.id==='unclassified').actual,10000n);assert.equal(result.budget.rows.reduce((n,x)=>n+x.actual,0n),result.cost);
});
test('stale contract VAT keeps source documents available without inventing profit',()=>{
 const stale={...deal,amountGross:100,amountNet:100,vatAmount:0};
 const result=model().snapshot(data(),stale,{});assert.equal(result.profit,null);assert.equal(result.wip,null);assert.ok(result.issues.includes('invalid-project-contract-vat'));assert.equal(result.realizations.length,1);
});
test('payment allocation exceeding changed source amount is excluded and flagged',()=>{
 const state=data();state.cash=[{_id:'invalid',type:'in',org:deal.org,amount:100,allocations:[{projectKey:key,amount:1000}]}];
 const result=model().snapshot(state,deal,{});assert.equal(result.cash.income,0n);assert.equal(result.cash.rows.length,0);assert.ok(result.issues.includes('cash-allocation-invalid'));
});
test('supplier documents on review cannot turn uncertain debt into a zero total',()=>{
 const state=data();state.cash=[{_id:'bad-link',org:deal.org,type:'out',amount:100,supplierAllocations:[{documentKey:'expenses:e',amount:101}]}];
 const result=model().snapshot(state,deal,{});assert.equal(result.supplierRemaining,null);assert.equal(result.supplierKnownRemaining,0n);assert.equal(result.supplierReviewCount,1);
});
test('administrative payroll is not classified as installation labor in the budget',()=>{
 const state=data();state.labor=[{_id:'admin',org:deal.org,projectKey:key,personId:'manager',amount:1000,date:'2026-10-03',expenseType:'administrative'}];
 const result=model().snapshot(state,deal,{});assert.equal(result.budget.rows.find(x=>x.id==='labor').actual,0n);assert.equal(result.budget.rows.find(x=>x.id==='unclassified').actual,100000n);
});
