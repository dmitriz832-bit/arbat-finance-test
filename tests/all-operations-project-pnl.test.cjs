const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/finance-core.js');
const projects=require('../app/project-workspace-model.js');
const management=require('../app/management-workspace-model.js');
const reports=require('../app/report-analysis-model.js');

// Every expected money value below is a literal number of kopecks, calculated
// independently from the described business operation, never from another model.
const ORG='АРБАТ.ГК';
function plannedMaterial({deductible=true}={}){
 const deal={_id:'audit-project',org:ORG,order1c:'AUDIT-PLAN',name:'Сервис',dir:'Сервис',contractTotal:'12200.00',vatRate:22};
 const key=core.dealKey(deal);
 const data={deals:[deal],wipAccounting:true,dealPlans:{},expenses:[],workActs:[],labor:[],realizations:[],costs:[],cash:[]};
 const warehouse={items:[{id:'pipe',name:'Труба',unit:'м',category:'Материалы'}],places:[{id:'main',org:ORG}],plans:[{dealId:deal._id,org:ORG,lines:[{itemId:'pipe',qty:10}]}],moves:[{id:'purchase',org:ORG,kind:'receipt',itemId:'pipe',to:'main',qty:10,price:'122.00',amountGross:'1220.00',amountNet:'1000.00',vatAmount:'220.00',vatRate:22,vatDeductible:deductible,date:'2026-09-01'}]};
 const fifo={bins:new Map([['main::pipe',[{qty:10,cost:122,source:'purchase',date:'2026-09-01'}]]]),byMove:{},warnings:[]};
 return {deal,key,data,warehouse,fifo};
}

test('deductible material VAT has one basis in full plan, remaining forecast and accrued project cost',()=>{
 const f=plannedMaterial();let view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,100000n,'10 m × 122 / 1.22');
 assert.equal(view.forecast.remaining,100000n,'remaining cost must use the same deductible net basis');
 f.warehouse.moves.push({id:'consume',org:ORG,kind:'consume',dealId:f.deal._id,itemId:'pipe',from:'main',qty:4,date:'2026-09-02'});
 f.fifo.bins.get('main::pipe')[0].qty=6;
 f.fifo.byMove.consume={amount:488,invalid:false};
 f.data.expenses.push({_id:'consumed',warehouseMoveId:'consume',org:ORG,projectKey:f.key,category:'Материалы',amount:'488.00',amountGross:'488.00',amountNet:'400.00',vatAmount:'88.00',vatRate:22,vatDeductible:true,date:'2026-09-02'});
 view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.cost,40000n);assert.equal(view.budget.total,100000n);
 assert.equal(view.forecast.remaining,60000n);assert.equal(view.forecast.cost,100000n);
});

test('nondeductible VAT remains in full plan and EAC while missing source policy stays unknown',()=>{
 const f=plannedMaterial({deductible:false});let view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,122000n);assert.equal(view.forecast.cost,122000n);
 delete f.warehouse.moves[0].vatDeductible;
 view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,null);assert.equal(view.forecast.remaining,null);assert.equal(view.forecast.cost,null);
});

function operationFixture(){
 const a={_id:'a',org:ORG,order1c:'AUDIT-A',name:'Климат',dir:'Климат',contractTotal:'12200',vatRate:22};
 const b={_id:'b',org:ORG,order1c:'AUDIT-B',name:'Сервис',dir:'Сервис',contractTotal:'6100',vatRate:22};
 const foreign={_id:'foreign',org:'АИР-КЛИМАТ',order1c:'AUDIT-A',name:'Другой климат',dir:'Климат',contractTotal:'1000',vatRate:0};
 return {a,b,foreign,ka:core.dealKey(a),kb:core.dealKey(b),data:{deals:[a,b,foreign],wipAccounting:true,expenses:[],workActs:[],labor:[],costs:[],cash:[],realizations:[]}};
}
function checkMonth(f,month,expected){
 const period=core.preliminaryPeriod(f.data,month,ORG);
 const bounds=management.bounds(month);
 const owner=core.ownerPeriodSnapshot(f.data,bounds,ORG);
 const report=reports.snapshot(f.data,{...bounds,org:ORG,kind:'pnl',groupBy:'category',granularity:'month'},core);
 const managementView=management.snapshot(f.data,{}, {org:ORG,period:month,today:month+'-28'});
 for(const [field,amount] of Object.entries(expected))assert.equal(period[field],amount,month+' P&L '+field);
 assert.equal(owner.result,expected.result,month+' owner dashboard');
 assert.equal(report.totals.result,expected.result,month+' report result');
 assert.equal(report.rows.find(row=>row.id==='result').total.sources.reduce((sum,row)=>sum+row.amount,0n),expected.result,month+' report document drilldown');
 assert.equal(managementView.result.result,expected.result,month+' management dashboard');
 const reconciliation=core.directionReconciliation(f.data,month,ORG);
 assert.equal(reconciliation.totalResult,expected.result,month+' reconciliation total');
 assert.equal(reconciliation.difference,0n,month+' directions + unallocated = company');
 assert.equal(core.preliminaryPeriod(f.data,month,'АИР-КЛИМАТ').result,0n,'same direction in foreign company isolated');
}
const noActivity={revenue:0n,direct:0n,production:0n,administrative:0n,belowIncome:0n,belowExpenses:0n,result:0n};

test('document-by-document independent five-month control: expenses, realization, closeout, return and correction',()=>{
 const f=operationFixture(),sourceA={org:ORG,projectKey:f.ka},sourceB={org:ORG,projectKey:f.kb};
 const checkProject=(deal,key,month,expected)=>{const actual=core.projectWipSnapshot(f.data,deal,key,month);assert.equal(actual.status,'calculated');for(const [field,value]of Object.entries(expected))assert.equal(actual[field],value,month+' '+deal.name+' '+field)};
 checkMonth(f,'2026-09',noActivity);
 // Sept 01: deductible materials: 4,880 gross = 4,000 net, fully deferred.
 f.data.expenses.push({...sourceA,_id:'materials',date:'2026-09-01',category:'Материалы',amount:'4880',vatRate:22,vatDeductible:true});
 checkMonth(f,'2026-09',noActivity);checkProject(f.a,f.ka,'2026-09',{accruedCost:400000n,recognizedCost:0n,wip:400000n});
 // Sept 02: contractor act at the immutable agreed rate: 10 × 80 = 800.
 f.data.workActs.push({...sourceA,id:'approved-work',date:'2026-09-02',planItemId:'work',name:'Монтаж',unit:'шт',qty:10,rate:80,status:'approved'});
 checkMonth(f,'2026-09',noActivity);checkProject(f.a,f.ka,'2026-09',{accruedCost:480000n,recognizedCost:0n,wip:480000n});
 // Sept 03: second direction receives a 1,000 net expense.
 f.data.expenses.push({...sourceB,_id:'service-cost',date:'2026-09-03',amount:'1220',vatRate:22,vatDeductible:true});
 checkMonth(f,'2026-09',noActivity);checkProject(f.b,f.kb,'2026-09',{accruedCost:100000n,recognizedCost:0n,wip:100000n});
 // Sept 04: production overhead 100.01 split 2:1; last positive share gets cents.
 f.data.costs.push({org:ORG,_id:'overhead',date:'2026-09-04',amount:'100.01',vatRate:0,pnlGroup:'Общепроизводственные',pnlAllocationRule:'proportional',pnlAllocations:[{projectKey:f.ka,weight:2},{projectKey:f.kb,weight:1},{dir:'Исключённое',weight:0}]});
 checkMonth(f,'2026-09',{...noActivity,production:10001n,ebitda:-10001n,result:-10001n});
 assert.deepEqual(core.expenseLedger(f.data).rows.filter(x=>x.source._id==='overhead').map(x=>x.amount),[6667n,3334n,0n]);
 // Sept 05: administrative expense 122 gross = 100 net, left unallocated.
 f.data.costs.push({org:ORG,_id:'admin',date:'2026-09-05',amount:'122',vatRate:22,vatDeductible:true,pnlGroup:'Административные'});
 checkMonth(f,'2026-09',{...noActivity,production:10001n,administrative:10000n,ebitda:-20001n,result:-20001n});
 // Sept 06: other income of 122 gross is 100 net and stays below EBITDA.
 f.data.costs.push({...sourceA,_id:'interest',date:'2026-09-06',amount:'122',vatRate:22,pnlType:'income',pnlLevel:'below'});
 checkMonth(f,'2026-09',{...noActivity,production:10001n,administrative:10000n,belowIncome:10000n,ebitda:-20001n,result:-10001n});
 // Sept 07: nondeductible interest expense 12.20 stays gross below EBITDA.
 f.data.costs.push({...sourceB,_id:'interest-expense',date:'2026-09-07',amount:'12.20',vatRate:22,vatDeductible:false,pnlLevel:'below'});
 const september={...noActivity,production:10001n,administrative:10000n,belowIncome:10000n,belowExpenses:1220n,ebitda:-20001n,result:-11221n};
 checkMonth(f,'2026-09',september);
 const septemberDirections=core.directionReconciliation(f.data,'2026-09',ORG);
 assert.equal(septemberDirections.directions.find(x=>x.name==='Климат').result,3333n);
 assert.equal(septemberDirections.directions.find(x=>x.name==='Сервис').result,-4554n);
 assert.equal(septemberDirections.unallocatedResult,-10000n);
 // Oct 01: nondeductible transport adds 1,220; direct costs still await sales.
 checkMonth(f,'2026-10',noActivity);
 f.data.expenses.push({...sourceA,_id:'transport',date:'2026-10-01',category:'Транспорт',amount:'1220',vatRate:22,vatDeductible:false});
 checkMonth(f,'2026-10',noActivity);checkProject(f.a,f.ka,'2026-10',{accruedCost:602000n,recognizedCost:0n,wip:602000n});
 // Oct 02: 40% realization releases 2,408 of A's cumulative 6,020 cost.
 f.data.realizations.push({...sourceA,_id:'partial',date:'2026-10-02',amount:'4880',vatRate:22});
 checkMonth(f,'2026-10',{...noActivity,revenue:400000n,direct:240800n,result:159200n});
 checkProject(f.a,f.ka,'2026-10',{revenue:400000n,recognizedCost:240800n,currentCost:240800n,wip:361200n});
 // Oct 03: B is fully realized and releases all 1,000 cost.
 f.data.realizations.push({...sourceB,_id:'full-b',date:'2026-10-03',amount:'6100',vatRate:22});
 const october={...noActivity,revenue:900000n,direct:340800n,result:559200n};
 checkMonth(f,'2026-10',october);checkProject(f.b,f.kb,'2026-10',{recognizedCost:100000n,wip:0n,fullyRealized:true,closedCostReconciled:true});
 // Nov 01: a -244 gross correction reduces A's cost by 200. At 40%
 // realization this releases -80 previously recognized cost in November.
 checkMonth(f,'2026-11',noActivity);
 f.data.expenses.push({...sourceA,_id:'material-correction',date:'2026-11-01',amount:'-244',vatRate:22,vatDeductible:true});
 checkMonth(f,'2026-11',{...noActivity,direct:-8000n,result:8000n});
 checkProject(f.a,f.ka,'2026-11',{accruedCost:582000n,recognizedCost:232800n,currentCost:-8000n,wip:349200n});
 // Nov 02: final 60% realization closes WIP; November costs total 3,412.
 f.data.realizations.push({...sourceA,_id:'full-a',date:'2026-11-02',amount:'7320',vatRate:22});
 const november={...noActivity,revenue:600000n,direct:341200n,result:258800n};
 checkMonth(f,'2026-11',november);checkProject(f.a,f.ka,'2026-11',{recognizedCost:582000n,currentCost:341200n,wip:0n,fullyRealized:true,closedCostReconciled:true});
 // Dec 01: return of 1,220 gross reverses 1,000 sales and reopens 582 WIP.
 checkMonth(f,'2026-12',noActivity);
 f.data.realizations.push({...sourceA,_id:'return',date:'2026-12-01',amount:'-1220',vatRate:22,correctionOf:'full-a'});
 const december={...noActivity,revenue:-100000n,direct:-58200n,result:-41800n};
 checkMonth(f,'2026-12',december);checkProject(f.a,f.ka,'2026-12',{revenue:900000n,recognizedCost:523800n,currentCost:-58200n,wip:58200n,fullyRealized:false});
 // Jan 01: corrected return restores full sale and closes the same 582 WIP.
 checkMonth(f,'2027-01',noActivity);
 f.data.realizations.push({...sourceA,_id:'return-correction',date:'2027-01-01',amount:'1220',vatRate:22,correctionOf:'return'});
 const january={...noActivity,revenue:100000n,direct:58200n,result:41800n};
 checkMonth(f,'2027-01',january);checkProject(f.a,f.ka,'2027-01',{recognizedCost:582000n,currentCost:58200n,wip:0n,fullyRealized:true,closedCostReconciled:true});
 // All future documents above must leave every historical month unchanged.
 for(const [month,expected]of [['2026-09',september],['2026-10',october],['2026-11',november],['2026-12',december],['2027-01',january]])checkMonth(f,month,expected);
 const before=JSON.stringify(f.data);
 const a=projects.snapshot(f.data,f.a),b=projects.snapshot(f.data,f.b);
 assert.equal(a.revenue,1000000n);assert.equal(a.cost,588667n);assert.equal(a.recognizedCost,588667n);assert.equal(a.profit,421333n);assert.equal(a.wip,0n);
 assert.equal(b.revenue,500000n);assert.equal(b.cost,104554n);assert.equal(b.profit,395446n);assert.equal(b.wip,0n);
 assert.equal(core.ownerPeriodSnapshot(f.data,{from:'',to:''},ORG).result,806779n);
 assert.equal(core.preliminaryPeriod(f.data,'',ORG).result,806779n);
 for(const granularity of ['month','quarter','year']){
  const report=reports.snapshot(f.data,{from:'2026-09-01',to:'2027-01-31',org:ORG,kind:'pnl',groupBy:'category',granularity},core);
  assert.equal(report.totals.result,806779n,granularity+' exact report');
  if(granularity==='month')assert.deepEqual(report.rows.find(row=>row.id==='result').cells.map(cell=>cell.amount),[-11221n,559200n,258800n,-41800n,41800n]);
 }
 const directionReport=reports.snapshot(f.data,{from:'2026-09-01',to:'2027-01-31',org:ORG,kind:'pnl',groupBy:'direction',granularity:'month'},core);
 assert.equal(directionReport.rows.find(row=>row.groupKey==='Климат').total.amount,421333n);
 assert.equal(directionReport.rows.find(row=>row.groupKey==='Сервис').total.amount,395446n);
 assert.equal(directionReport.rows.find(row=>row.groupKey==='unassigned').total.amount,-10000n);

 assert.equal(JSON.stringify(f.data),before,'aggregations never change source documents');
});

test('stable material item ID resolves the same composition in full plan and remaining forecast',()=>{
 const f=plannedMaterial();f.warehouse.plans=[];
 f.data.dealPlans[f.deal._id]={materials:[{itemId:'pipe',qty:10}]};
 const view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,100000n);
 assert.equal(view.forecast.remaining,100000n);
 assert.equal(view.forecast.rows[0].id,'pipe');
});

test('a future warehouse duplicate cannot invalidate the previously verified WIP month',()=>{
 const f=plannedMaterial();f.warehouse.moves.push({id:'consume',org:ORG,kind:'consume',dealId:f.deal._id,itemId:'pipe',from:'main',qty:4,date:'2026-09-02'});
 f.fifo.bins.get('main::pipe')[0].qty=6;f.fifo.byMove.consume={amount:488,invalid:false};
 f.data.expenses.push({_id:'original',warehouseMoveId:'consume',org:ORG,projectKey:f.key,amount:'488',amountGross:'488',vatRate:22,vatDeductible:true,date:'2026-09-02'});
 f.data.realizations.push({_id:'sale',org:ORG,projectKey:f.key,amount:'6100',vatRate:22,date:'2026-10-01'});
 const history=()=>core.projectWipSnapshot({...f.data,warehouse:f.warehouse,fifo:f.fifo},f.deal,f.key,'2026-10');
 assert.equal(history().status,'calculated');assert.equal(history().wip,20000n);
 f.data.expenses.push({_id:'future-duplicate',warehouseMoveId:'consume',org:ORG,projectKey:f.key,amount:'488',vatRate:22,vatDeductible:true,date:'2026-11-02'});
 assert.equal(history().status,'calculated','future invalid document may only affect its own/later snapshots');
 assert.equal(history().wip,20000n);
});

test('the current month still rejects duplicate warehouse expense postings',()=>{
 const f=plannedMaterial();
 f.warehouse.moves.push({id:'consume',org:ORG,kind:'consume',dealId:f.deal._id,itemId:'pipe',from:'main',qty:4,date:'2026-09-02'});
 f.fifo.bins.get('main::pipe')[0].qty=6;f.fifo.byMove.consume={amount:488,invalid:false};
 const expense={warehouseMoveId:'consume',org:ORG,projectKey:f.key,amount:'488',vatRate:22,vatDeductible:true,date:'2026-09-02'};
 f.data.expenses=[{...expense,_id:'one'},{...expense,_id:'two'}];
 const wip=core.projectWipSnapshot({...f.data,warehouse:f.warehouse,fifo:f.fifo},f.deal,f.key,'2026-09');
 assert.equal(wip.status,'requires-review');assert.ok(wip.issues.includes('warehouse-duplicate-global-expense'));
});

test('full plan uses original acquisition pricing while EAC conserves remaining FIFO gross cents',()=>{
 const f=plannedMaterial();f.warehouse.moves[0]={id:'purchase',org:ORG,kind:'receipt',itemId:'pipe',to:'main',qty:3,price:'10.01',vatRate:0,date:'2026-09-01'};
 f.warehouse.plans[0].lines[0].qty=2.5;
 // A prior 0.5 issue received 5.01 of the rounded 30.03 receipt. The 2.5
 // remaining lot has exactly 25.02, not round(2.5 × 10.01) = 25.03.
 f.fifo.bins.get('main::pipe')[0]={qty:2.5,cost:10.01,valueCents:'2502',source:'purchase',date:'2026-09-01'};
 let view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,2503n,'original full-source price curve');assert.equal(view.forecast.remaining,2502n,'remaining FIFO carry');
 f.warehouse.plans[0].lines[0].qty=1.25;
 view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,1251n);assert.equal(view.forecast.remaining,1251n);
 // The same exact gross lot amount must be the basis before VAT stripping.
 f.warehouse.moves[0].vatRate=22;f.warehouse.moves[0].vatDeductible=true;
 view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,1025n);assert.equal(view.forecast.remaining,1025n);
});

test('explicit zero plans, missing plans and partly priced scopes remain distinct',()=>{
 const f=operationFixture();
 const missing=projects.snapshot(f.data,f.a);
 assert.equal(missing.budget.total,null);assert.equal(missing.forecast.cost,null);
 const zero=projects.snapshot(f.data,{...f.a,planMaterials:'0',cost:'999'});
 assert.equal(zero.budget.total,0n);assert.equal(zero.budget.rows.find(x=>x.id==='materials').plan,0n);
 assert.equal(zero.budget.rows.find(x=>x.id==='labor').plan,null);assert.equal(zero.forecast.cost,0n);
 f.data.dealPlans={a:{items:[{id:'known',name:'Монтаж',unit:'шт',planned:10,priceLabel:'Монтаж · Климат · шт'},{id:'unknown',name:'Неоценённая работа',unit:'ч',planned:2}]}};
 f.data.priceCatalog=[{name:'Монтаж',section:'Климат',unit:'шт',rate:100}];
 const partial=projects.snapshot(f.data,f.a);
 assert.equal(partial.budget.total,null);assert.equal(partial.budget.knownTotal,100000n);
 assert.equal(partial.budget.unknownCount,1);assert.equal(partial.forecast.knownRemaining,100000n);assert.equal(partial.forecast.cost,null);
 f.data.dealPlans.a.items[1].planned=0;
 assert.equal(projects.snapshot(f.data,f.a).budget.total,100000n,'zero quantity requires no price');
});

test('work pricing, cancellation, deletion and missing source plan preserve fact and unknown EAC',()=>{
 const f=operationFixture();
 f.data.dealPlans={a:{items:[{id:'work',name:'Монтаж',unit:'шт',planned:10,priceLabel:'Монтаж · Климат · шт'}]}};
 f.data.priceCatalog=[{name:'Монтаж',section:'Климат',unit:'шт',rate:100}];
 const act={id:'work-done',org:ORG,projectKey:f.ka,planItemId:'work',name:'Монтаж',unit:'шт',qty:4,rate:80,status:'draft',date:'2026-09-02'};
 f.data.workActs=[act];
 let view=projects.snapshot(f.data,f.a);assert.equal(view.cost,0n);assert.equal(view.budget.total,100000n);assert.equal(view.forecast.cost,100000n);
 act.status='approved';view=projects.snapshot(f.data,f.a);
 assert.equal(view.cost,32000n);assert.equal(view.forecast.remaining,60000n);assert.equal(view.forecast.cost,92000n);
 f.data.priceCatalog[0].rate=120;view=projects.snapshot(f.data,f.a);
 assert.equal(view.budget.total,120000n);assert.equal(view.cost,32000n);assert.equal(view.forecast.remaining,72000n);assert.equal(view.forecast.cost,104000n);assert.equal(act.rate,80);
 act.status='cancelled';view=projects.snapshot(f.data,f.a);
 assert.equal(view.cost,0n);assert.equal(view.forecast.remaining,120000n);assert.equal(view.forecast.cost,120000n);
 f.data.workActs=[];view=projects.snapshot(f.data,f.a);assert.equal(view.cost,0n);assert.equal(view.forecast.cost,120000n);
 f.data.workActs=[{...act,status:'approved'}];
 delete f.data.dealPlans.a;
 view=projects.snapshot(f.data,f.a);
 assert.equal(view.cost,32000n,'deleting source scope cannot erase the posted act');
 assert.equal(view.budget.total,null);assert.equal(view.forecast.unbudgeted.length,1);
 assert.equal(view.forecast.cost,null,'an act is not a complete estimate of remaining project scope');
});

test('duplicate or foreign material identity never produces a guessed forecast',()=>{
 for(const variant of ['duplicate','foreign']){
  const f=plannedMaterial();f.warehouse.plans=[];f.data.dealPlans[f.deal._id]={materials:[{itemId:'pipe',qty:10}]};
  if(variant==='duplicate')f.warehouse.items.push({...f.warehouse.items[0]});else f.warehouse.items[0].org='АИР-КЛИМАТ';
  const view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
  assert.equal(view.budget.total,null,variant);assert.equal(view.forecast.remaining,null,variant);assert.equal(view.forecast.cost,null,variant);
 }
});

test('a deleted or duplicated FIFO acquisition source cannot silently remove its VAT policy',()=>{
 for(const variant of ['deleted','duplicated']){
  const f=plannedMaterial();
  if(variant==='deleted')f.warehouse.moves=[];else f.warehouse.moves.push({...f.warehouse.moves[0],vatDeductible:false});
  const before=JSON.stringify(f.data),view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
  assert.equal(view.budget.total,null,variant+' receipt identity');
  assert.equal(view.forecast.remaining,null,variant+' receipt identity');
  assert.equal(view.forecast.cost,null,variant+' receipt identity');
  assert.equal(JSON.stringify(f.data),before);
 }
});

test('forecast validates saved VAT totals against the current contract, not an older valid gross amount',()=>{
 const f=plannedMaterial();
 Object.assign(f.deal,{amountGross:'1220',amountNet:'1000',vatAmount:'220'});
 // The saved VAT totals are internally valid for 1,220 but the current
 // contract is 12,200. They must be reconciled before confirming a margin.
 const view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.contractNet,null);assert.equal(view.profit,null);
 assert.equal(view.forecast.income,null);assert.equal(view.forecast.profit,null);
 assert.ok(view.forecast.issues.includes('forecast-contract-review'));
});

test('remaining net FIFO lot cents preserve deductible VAT rounding independently of gross lot cents',()=>{
 const f=plannedMaterial();f.warehouse.moves[0]={id:'purchase',org:ORG,kind:'receipt',itemId:'pipe',to:'main',qty:3,price:'10.01',vatRate:22,vatDeductible:true,date:'2026-09-01'};
 f.warehouse.plans[0].lines[0].qty=1.25;
 // Receipt 30.03 gross has 5.42 VAT and 24.61 acquisition cost. A prior .5
 // issue takes 4.10 net, leaving 20.51. Half of that net lot rounds to10.26;
 // stripping VAT again from allocated gross12.51 would incorrectly give10.25.
 f.fifo.bins.get('main::pipe')[0]={qty:2.5,cost:10.01,valueCents:'2502',expenseValueCents:'2051',expenseValuationStatus:'verified',source:'purchase',date:'2026-09-01'};
 let view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,1025n,'original receipt ratio 24.61 × 1.25 / 3');assert.equal(view.forecast.remaining,1026n,'remaining net carry 20.51 × 1.25 / 2.5');
 f.fifo.bins.get('main::pipe')[0].expenseValueCents=null;
 view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,null);assert.equal(view.forecast.cost,null);
});

test('an absent contract amount does not turn into zero forecast income or a confirmed negative margin',()=>{
 const f=operationFixture();delete f.a.contractTotal;f.a.planMaterials='100';
 const view=projects.snapshot(f.data,f.a);
 assert.equal(view.contractNet,null);assert.equal(view.forecast.cost,10000n);
 assert.equal(view.forecast.income,null);assert.equal(view.forecast.profit,null);
 assert.ok(view.forecast.issues.includes('forecast-contract-review'));
});

test('full-scope plan remains at the original source price curve after fractional net FIFO allocation',()=>{
 const f=plannedMaterial();f.warehouse.moves[0]={id:'purchase',org:ORG,kind:'receipt',itemId:'pipe',to:'main',qty:3,price:'10.01',amountGross:'30.03',vatRate:22,vatDeductible:true,date:'2026-09-01'};
 f.warehouse.plans[0].lines[0].qty=3;
 f.fifo.bins.get('main::pipe')[0]={qty:3,cost:10.01,valueCents:'3003',expenseValueCents:'2461',sourceGrossValueCents:'3003',sourceExpenseValueCents:'2461',expenseValuationStatus:'verified',source:'purchase',date:'2026-09-01'};
 assert.equal(projects.plannedBudget(f.data,f.deal,f.warehouse,f.fifo).total,2461n);
 const lot=f.fifo.bins.get('main::pipe')[0];lot.qty=2.5;lot.valueCents='2502';lot.expenseValueCents='2051';
 f.warehouse.moves.push({id:'fractional-use',org:ORG,kind:'consume',dealId:f.deal._id,itemId:'pipe',from:'main',qty:.5,date:'2026-09-02'});
 assert.equal(projects.plannedBudget(f.data,f.deal,f.warehouse,f.fifo).total,2461n,'consumption residue is not a change of acquisition price');
 const forecast=projects.forecast(f.data,f.deal,f.warehouse,f.fifo,410n);
 assert.equal(forecast.remaining,2051n);assert.equal(forecast.cost,2461n);
});

test('the latest source exact invoice price curve also prices forecast shortages without unit-price rounding',()=>{
 const f=plannedMaterial();f.warehouse.moves[0]={id:'purchase',org:ORG,kind:'receipt',itemId:'pipe',to:'main',qty:3,price:100/3,amountGross:'100',amountNet:'100',vatAmount:'0',vatRate:0,date:'2026-09-01'};
 f.warehouse.plans[0].lines[0].qty=3;f.fifo.bins.clear();
 let view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,10000n);assert.equal(view.forecast.remaining,10000n,'full printed invoice is 100.00, not 99.99');
 f.warehouse.moves[0].price=0;view=projects.snapshot(f.data,f.deal,f.warehouse,f.fifo);
 assert.equal(view.budget.total,null);assert.equal(view.forecast.remaining,null);
});

function customerRefundFixture(){
 const org='АИР-КЛИМАТ',deal={_id:'refund-project',org,order1c:'REFUND-CARD',name:'Возврат аванса',contractTotal:'30',vatRate:0},key=core.dealKey(deal);
 return {deal,key,data:{deals:[deal],cash:[{_id:'customer-receipt',org,type:'in',date:'2026-10-01',amount:'30',projectKey:key,customerId:'buyer'},{_id:'customer-refund',org,type:'out',date:'2026-11-01',amount:'20',customerId:'buyer'}],vatAdvanceEvents:[{_id:'advance',org,kind:'received',date:'2026-10-01',amount:'30',cashId:'customer-receipt',vatRate:0,document:'Аванс'},{_id:'refund-event',org,kind:'refund',date:'2026-11-01',amount:'20',cashId:'customer-refund',advanceId:'advance',document:'Возврат'}]}};
}

test('project remaining payment and customer advance use validated refunds traced to the original receipt',()=>{
 const f=customerRefundFixture();let view=projects.snapshot(f.data,f.deal);
 assert.equal(view.cash.income,3000n,'gross receipt stays a receipt');
 assert.equal(view.remainingPayment,2000n,'valid return leaves 20.00 to receive against the contract');
 assert.equal(view.settlement.received,1000n);assert.equal(view.settlement.advance,1000n);
 // Native allocation editor spelling must resolve identically; refund itself
 // has no project key and is linked only through the registered original cash.
 delete f.data.cash[0].projectKey;f.data.cash[0].allocations=[{projectKey:f.key,amount:'30'}];
 view=projects.snapshot(f.data,f.deal);assert.equal(view.cash.income,3000n);assert.equal(view.remainingPayment,2000n);assert.equal(view.settlement.advance,1000n);
 f.data.vatAdvanceEvents=[];view=projects.snapshot(f.data,f.deal);
 assert.equal(view.remainingPayment,0n,'an arbitrary outgoing payment is not evidence of a customer return');
 assert.equal(view.settlement.advance,3000n);
});

test('invalid approved linked and unplanned act values remain visible and make forecast actuals unknown',()=>{
 for(const linked of [true,false])for(const malformed of [{qty:'oops',rate:80},{qty:4,rate:'oops'},{qty:4,rate:''}]){
  const f=operationFixture();f.data.dealPlans={a:{items:[{id:'w',name:'Монтаж',planned:10,rate:100,unit:'шт'}]}};
  const source={id:'invalid-act',org:ORG,projectKey:f.ka,date:'2026-10-01',status:'approved',name:linked?'Монтаж':'Вне сметы',unit:'шт',...(linked?{planItemId:'w'}:{}),...malformed};f.data.workActs=[source];
  let view;assert.doesNotThrow(()=>{view=projects.snapshot(f.data,f.a)},'a single invalid source cannot erase the card');
  assert.equal(view.forecast.cost,null);assert.equal(view.forecast.actualCost,null);
  assert.ok(view.forecast.issues.includes('forecast-actual-review'));
  assert.ok(view.forecast.invalidActualSources.includes(source));
  const row=view.forecast.rows.find(row=>linked?row.id==='w':row.id==='invalid-act');
  assert.equal(row.actualCost,null);if(!linked)assert.equal(row.source,source);
 }
});

test('project DDS includes an unbound validated refund once and flags a contradictory explicit project',()=>{
 const f=customerRefundFixture();let view=projects.snapshot(f.data,f.deal);
 assert.equal(view.cash.income,3000n);assert.equal(view.cash.outcome,2000n);assert.equal(view.cash.balance,1000n);
 assert.equal(view.cash.rows.filter(row=>row.source._id==='customer-refund').length,1);
 f.data.cash[1].projectKey=f.key;view=projects.snapshot(f.data,f.deal);
 assert.equal(view.cash.outcome,2000n,'an explicit same-project outgoing payment must not be counted twice');
 const other={...f.deal,_id:'other-refund-project',order1c:'OTHER',name:'Другой проект'};f.data.deals.push(other);f.data.cash[1].projectKey=core.dealKey(other);
 view=projects.snapshot(f.data,f.deal);
 assert.equal(view.cash.outcome,0n,'a contradictory explicit binding cannot also be silently assigned to this card');
 assert.ok(view.issues.includes('cash-refund-project-mismatch'));
 assert.equal(view.remainingPayment,null,'contradictory cash assignment requires settlement review');
 assert.equal(view.settlement.advance,null);assert.equal(view.settlement.review,true);
});

test('an invalid other allocation leg cannot leave a confirmed project settlement against rejected owner debt',()=>{
 const f=customerRefundFixture();f.data.vatAdvanceEvents=[];f.data.cash[0].amount='100';delete f.data.cash[0].projectKey;
 f.data.cash[0].allocations=[{projectKey:f.key,amount:'50'},{projectKey:'missing-project',amount:'50'}];
 const view=projects.snapshot(f.data,f.deal);
 assert.equal(view.cash.income,5000n,'assigned raw DDS share remains visible as a source amount');
 assert.equal(view.cash.netReceived,null);assert.equal(view.remainingPayment,null);
 assert.equal(view.settlement.received,0n,'the debt core atomically rejects the whole allocation');
 assert.equal(view.settlement.advance,null);assert.equal(view.settlement.receivable,null);assert.equal(view.settlement.review,true);
 assert.ok(view.issues.includes('cash-settlement-review'));
});
