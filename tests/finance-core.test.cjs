const assert=require('node:assert/strict'),test=require('node:test'),f=require('../app/finance-core.js');
test('decimal cents and rounding',()=>{assert.equal(f.rubles(f.cents('0.1')+f.cents('0.2')),'0.30');assert.equal(f.rubles(f.cents('1.005')),'1.01')});
test('weighted allocation preserves exact cents',()=>{const x=f.allocate('100.00',[1,1,1]);assert.deepEqual(x.map(f.rubles),['33.33','33.33','33.34']);assert.equal(x.reduce((a,b)=>a+b),f.cents('100'))});
test('P&L current month 28000',()=>{const x=f.pnl({revenue:['60000'],direct:['10000','2000','3000'],administrative:['4000','13000']});assert.equal(f.rubles(x.result),'28000.00')});
test('P&L below EBITDA income increases result',()=>{const x=f.pnl({revenue:['100'],belowIncome:['10'],belowExpenses:['7']});assert.equal(f.rubles(x.result),'103.00')});
test('payroll gross, tax and employer contributions',()=>{let x=f.payroll({gross:'57471',ndfl:'7471',contributions:'14717',paid:'50000'});assert.equal(f.rubles(x.expense),'72188.00');assert.equal(f.rubles(x.payable),'0.00')});
test('unallocated wages exposed',()=>{const x=f.difference(['19500'],['19260']);assert.equal(f.rubles(x),'240.00')});

test('document expense cannot be counted again on payment',()=>{const recognized=f.pnl({revenue:['60000'],direct:['20000']});assert.equal(f.rubles(recognized.result),'40000.00');const cashOut=f.sum(['20000']);assert.equal(f.rubles(cashOut),'20000.00');assert.equal(f.rubles(recognized.result),'40000.00')});
test('project operating result sample',()=>{const cost=f.sum(['20000','5000','8000','10000','3000']);assert.equal(f.rubles(cost),'46000.00');assert.equal(f.rubles(f.cents('60000')-cost),'14000.00')});
test('invalid payroll deductions rejected',()=>assert.throws(()=>f.payroll({gross:'100',ndfl:'101'}),RangeError));
test('negative distribution reconciles',()=>{const parts=f.allocate('-1.00',[1,1,1]);assert.equal(parts.reduce((a,b)=>a+b),f.cents('-1.00'))});

test('wallet: incoming, outgoing and internal transfer',()=>{const movements=[{type:'in',walletId:'a',amount:'100.10'},{type:'out',walletId:'a',amount:'20.20'},{type:'transfer',walletId:'a',toWalletId:'b',amount:'30.30'}];assert.equal(f.rubles(f.walletBalance('10.00',movements,'a')),'59.60');assert.equal(f.rubles(f.walletBalance('0',movements,'b')),'30.30');const consolidated=f.walletBalance('10',movements,'a')+f.walletBalance('0',movements,'b');assert.equal(f.rubles(consolidated),'89.90')});
test('wallet: fractional money stays exact',()=>{const entries=[{type:'in',walletId:'x',amount:'0.10'},{type:'in',walletId:'x',amount:'0.20'}];assert.equal(f.rubles(f.walletBalance('0',entries,'x')),'0.30')});

test('monthly report total retains exact cents',()=>{const row=f.reportRow(['0.10','0.20','0.03']);assert.equal(f.rubles(row.total),'0.33')});

test('shared project profit reconciles to the kopeck',()=>{assert.equal(f.rubles(f.projectResult('60000',['20000','5000','8000','10000','3000'])),'14000.00')});

test('shared P&L breakdown reconciles gross and EBITDA exactly',()=>{const x=f.pnl({revenue:['60000'],direct:['10000','2000','3000'],production:['4000'],commercial:['1000'],administrative:['12000']});assert.equal(f.rubles(x.gross),'45000.00');assert.equal(f.rubles(x.ebitda),'28000.00');assert.equal(x.gross-x.production-x.commercial-x.administrative,x.result)});

test('dashboard operating aggregation equals shared P&L engine',()=>{const data={revenue:['60000'],direct:['10000','2000','3000'],administrative:['4000','13000']};assert.equal(f.rubles(f.pnl(data).result),'28000.00');assert.equal(f.pnl(data).result,f.projectResult('60000',['10000','2000','3000','4000','13000']))});

test('period totals exclude other months and advances',()=>{
const data={realizations:[{date:'2026-10-02',amount:'60000',org:'АИР-КЛИМАТ'},{date:'2026-09-02',amount:'20000',org:'АИР-КЛИМАТ'}],expenses:[{date:'2026-10-04',amount:'10000',org:'АИР-КЛИМАТ'}],workActs:[{date:'2026-10-05',status:'approved',qty:'1',rate:'2000',org:'АИР-КЛИМАТ'}],costs:[{date:'2026-10-05',dir:'Service',amount:'3000',org:'АИР-КЛИМАТ'},{date:'2026-10-05',amount:'4000',org:'АИР-КЛИМАТ'}],labor:[{date:'2026-10-05',expenseType:'administrative',amount:'13000',org:'АИР-КЛИМАТ'}],cash:[{date:'2026-10-04',type:'in',amount:'500000',org:'АИР-КЛИМАТ'}]};
assert.equal(f.rubles(f.preliminaryPeriod(data,'2026-10','АИР-КЛИМАТ').result),'28000.00');
assert.equal(f.rubles(f.preliminaryPeriod(data,'2026-09','АИР-КЛИМАТ').result),'20000.00')});

test('report P&L component sum reconciles exactly to displayed result',()=>{const r=f.preliminaryPeriod({realizations:[{date:'2026-10-01',org:'A',amount:'60000'}],expenses:[{date:'2026-10-02',org:'A',amount:'10000'}],workActs:[{date:'2026-10-03',org:'A',status:'approved',rate:'2000',qty:'1'}],costs:[{date:'2026-10-04',org:'A',dir:'Installation',amount:'3000'},{date:'2026-10-05',org:'A',amount:'4000'}],labor:[{date:'2026-10-06',org:'A',expenseType:'administrative',amount:'13000'}]},'2026-10','A');const c=r.components;const costs=c.projectExpenses+c.productionLaborAndWorks+c.assignedExpenses+c.commonExpenses+c.commercialLabor;assert.equal(f.rubles(c.revenue-costs),'28000.00');assert.equal(r.result,c.revenue-costs);assert.equal(c.administrativeLabor, f.cents('13000'))});

test('deal expense core counts approved acts and fractional quantity once',()=>{const expenses=[{amount:'20000.00'}];const acts=[{status:'approved',rate:'1000.00',qty:'1.5'},{status:'draft',rate:'10000',qty:'1'}];assert.equal(f.rubles(f.projectExpenseTotal(expenses,acts)),'21500.00');assert.equal(f.rubles(f.projectResult('30000.00',[f.rubles(f.projectExpenseTotal(expenses,acts))])),'8500.00')});

test('project payroll uses stable key, not ambiguous free-text deal',()=>{
const rows=[{projectKey:'A::1C#42',amount:'10000.00',employerContributions:'3000.00'},{deal:'Same project label',amount:'5000.00'},{projectKey:'OTHER',amount:'4000.00'}];
const result=f.projectPayroll(rows,'A::1C#42');
assert.equal(f.rubles(result.total),'13000.00');assert.equal(result.unresolved.length,1);
});
test('project payroll excludes unrelated keys and uses explicit shares',()=>{
const rows=[{shares:[{projectKey:'one',amount:'300.01'},{projectKey:'two',amount:'400.02'}],amount:'700.03'}];
assert.equal(f.rubles(f.projectPayroll(rows,'one').total),'300.01');
assert.equal(f.rubles(f.projectPayroll(rows,'two').total),'400.02');
});

test('project wages and employer contributions included once in cost',()=>{const p=f.projectPayroll([{projectKey:'a',amount:'10000',employerContributions:'3000'},{projectKey:'b',amount:'5000'}],'a');const costs=f.projectExpenseTotal([{amount:'20000'}],[{status:'approved',rate:'8000',qty:1}])+p.total;assert.equal(f.rubles(costs),'41000.00');assert.equal(f.rubles(f.cents('60000')-costs),'19000.00')});

test('linked accrual is not counted again over its approved work act',()=>{const acts=[{id:'act-1',batchId:'batch-1',status:'approved',rate:'1000',qty:'1'}];const labor=[{projectKey:'p',amount:'1000',workActId:'act-1'},{projectKey:'p',amount:'500'}];const result=f.projectPayroll(labor,'p',acts);assert.equal(f.rubles(result.total),'500.00');assert.equal(result.conflicts.length,1)});

test('same date and crew membership signals possible payroll double count',()=>{const labor=[{id:'l1',projectKey:'p',personId:'e1',date:'2026-10-17',amount:'1000'}];const acts=[{id:'a1',status:'approved',date:'2026-10-17',memberIds:['e1'],projectKey:'p'}];const result=f.projectPayroll(labor,'p',acts);assert.equal(result.possibleOverlaps.length,1);assert.equal(result.conflicts.length,0);assert.equal(f.rubles(result.total),'1000.00')});

test('project snapshot reconciles revenue, works, salary and contributions',()=>{const deal={name:'Object',org:'AIR'},key='AIR::1C#123',data={realizations:[{projectKey:key,org:'AIR',amount:'60000'}],expenses:[{projectKey:key,amount:'20000'}],workActs:[{projectKey:key,status:'approved',rate:'8000',qty:1}],labor:[{projectKey:key,amount:'10000',employerContributions:'3000'}]};const p=f.projectSnapshot(data,deal,key);assert.equal(f.rubles(p.cost),'41000.00');assert.equal(f.rubles(p.result),'19000.00');assert.deepEqual(p.issues,[])});

test('shared project snapshot flags unverified valuation for both dashboard and deal',()=>{const key='A::1C#1',deal={org:'A',name:'Contract'};const state={realizations:[{projectKey:key,org:'A',amount:'10000'}],expenses:[{projectKey:key,amount:'2000',valuationStatus:'requires-review'}],labor:[],workActs:[]};const result=f.projectSnapshot(state,deal,key);assert.equal(f.rubles(result.result),'8000.00');assert.deepEqual(result.issues,['expense-valuation'])});

test('FIFO linked expense matches confirmed value and never adds cost twice',()=>{const exp=[{warehouseMoveId:'m1',amount:'150.25'}],moves=[{id:'m1',kind:'consume',projectIssueId:'issue1'}],fifo={byMove:{m1:{amount:150.25}}};assert.deepEqual(f.warehouseCostAudit(exp,moves,fifo),[]);assert.equal(f.rubles(f.projectExpenseTotal(exp,[])),'150.25')});
test('FIFO mismatch, absent expense and duplicate expense flagged',()=>{const moves=[{id:'m1',kind:'consume',projectIssueId:'p'},{id:'m2',kind:'consume',projectIssueId:'p'}];const exp=[{warehouseMoveId:'m1',amount:'10'},{warehouseMoveId:'m1',amount:'10'}];const issues=f.warehouseCostAudit(exp,moves,{byMove:{m1:{amount:10},m2:{amount:20}}});assert.deepEqual(issues.map(x=>x.reason),['duplicate-expense','missing-expense'])});

test('project snapshot propagates FIFO mismatch to dashboard and deal',()=>{const key='A::1C#22',deal={_id:'deal1',name:'Site',org:'A'},data={realizations:[{projectKey:key,org:'A',amount:'12000'}],expenses:[{projectKey:key,warehouseMoveId:'m1',amount:'500'}],workActs:[],labor:[],warehouse:{moves:[{id:'m1',dealId:'deal1',kind:'consume',projectIssueId:'pi1'}]},fifo:{byMove:{m1:{amount:650}}}};const result=f.projectSnapshot(data,deal,key);assert.ok(result.issues.includes('warehouse-fifo-mismatch'));assert.equal(f.rubles(result.cost),'500.00')});

test('project profit cannot be certified with stock consumption and unavailable FIFO',()=>{const key='A::1C#23';const result=f.projectSnapshot({realizations:[{projectKey:key,org:'A',amount:'10000'}],expenses:[],labor:[],workActs:[],warehouse:{moves:[{id:'m9',dealId:'deal9',kind:'consume',projectIssueId:'pi9'}]},fifo:null},{_id:'deal9',org:'A',name:'Site'},key);assert.ok(result.issues.includes('warehouse-fifo-unavailable'))});

test('project snapshot flags warehouse expense without corresponding movement',()=>{const key='A::1C#33';const result=f.projectSnapshot({realizations:[],expenses:[{projectKey:key,warehouseMoveId:'missing',amount:'123.45'}],labor:[],workActs:[],warehouse:{moves:[]},fifo:{byMove:{}}},{_id:'deal33',org:'A',name:'Site'},key);assert.ok(result.issues.includes('warehouse-missing-movement'));assert.equal(f.rubles(result.cost),'123.45')});

test('warehouse-linked expense must point to a project consumption, not a receipt',()=>{const problems=f.warehouseCostAudit([{warehouseMoveId:'receipt1',amount:'100'}],[{id:'receipt1',kind:'receipt'}],{byMove:{receipt1:{amount:100}}});assert.equal(problems.length,1);assert.equal(problems[0].reason,'expense-without-project-consumption')});

test('warehouse expense linked to another deal flags project profit',()=>{const key='A::1C#100';const result=f.projectSnapshot({realizations:[],expenses:[{projectKey:key,warehouseMoveId:'m-other',amount:'99'}],labor:[],workActs:[],warehouse:{moves:[{id:'m-other',dealId:'another-deal',kind:'consume',projectIssueId:'pi'}]},fifo:{byMove:{'m-other':{amount:99}}}},{_id:'deal-100',org:'A',name:'Site'},key);assert.ok(result.issues.includes('warehouse-cross-project-reference'))});

test('same warehouse movement charged twice across projects is flagged',()=>{const key='org::a',deal={_id:'dealA',org:'org',name:'A'},expenses=[{projectKey:key,warehouseMoveId:'m1',amount:'100'},{projectKey:'org::b',warehouseMoveId:'m1',amount:'100'}];const data={realizations:[],expenses,labor:[],workActs:[],warehouse:{moves:[{id:'m1',dealId:'dealA',kind:'consume',projectIssueId:'issue1'}]},fifo:{byMove:{m1:{amount:100}}}};assert.ok(f.projectSnapshot(data,deal,key).issues.includes('warehouse-duplicate-global-expense'))});

test('contract and recognized revenue use identical VAT rounding',()=>{assert.equal(f.rubles(f.netAmount('122000','АРБАТ.ГК')),'100000.00');assert.equal(f.rubles(f.netAmount('-122.00','АРБАТ.ГК')),'-100.00');assert.equal(f.rubles(f.netAmount('1000','АИР-КЛИМАТ')),'1000.00');assert.throws(()=>f.netAmount('100','АРБАТ.ГК',-1),RangeError)});

test('deal contract net and realized net use identical tax method',()=>{const contract=f.netAmount('122000','АРБАТ.ГК');const key='АРБАТ.ГК::1C#1';const deal={org:'АРБАТ.ГК',name:'Тест'};const snap=f.projectSnapshot({realizations:[{projectKey:key,org:'АРБАТ.ГК',amount:'122000'}]},deal,key);assert.equal(contract,snap.revenue);assert.equal(f.rubles(contract),'100000.00')});

test('monthly P&L applies the same VAT to sales and negative corrections',()=>{const rows={realizations:[{date:'2026-10-01',org:'АРБАТ.ГК',amount:'1220.00'},{date:'2026-10-02',org:'АРБАТ.ГК',amount:'-122.00'}]};const p=f.preliminaryPeriod(rows,'2026-10','АРБАТ.ГК');assert.equal(f.rubles(p.revenue),'900.00');assert.equal(p.revenue,f.netAmount('1220.00','АРБАТ.ГК')+f.netAmount('-122.00','АРБАТ.ГК'))});

test('period expenses include employer contributions exactly once, without mutating payroll',()=>{
 const labor=[{date:'2026-10-17',org:'A',amount:'57471',ndfl:'7471',employerContributions:'14717',expenseType:'administrative'}];
 const original=JSON.stringify(labor),d={labor};
 assert.equal(f.rubles(f.preliminaryPeriod(d,'2026-10','A').result),'-72188.00');
 assert.equal(f.rubles(f.preliminaryPeriod(d,'2026-10','A').result),'-72188.00');
 assert.equal(JSON.stringify(labor),original);
});
test('linked payroll skips duplicate gross but retains employer contributions in every view',()=>{
 const deal={org:'A',order1c:'1',dir:'Service'},key=f.dealKey(deal),d={deals:[deal],realizations:[{projectKey:key,date:'2026-10-17',org:'A',amount:5000}],workActs:[{id:'act',projectKey:key,date:'2026-10-01',org:'A',rate:1000,qty:1,status:'approved'}],labor:[{projectKey:key,date:'2026-10-17',org:'A',workActId:'act',amount:1000,employerContributions:300}]};
 assert.equal(f.rubles(f.projectSnapshot(d,deal,key).cost),'1300.00');
 assert.equal(f.rubles(f.directionSnapshot(d,'Service').cost),'1300.00');
 assert.equal(f.rubles(f.preliminaryPeriod(d,'2026-10','A').direct),'1300.00');
});
test('payroll allocations conserve gross and contributions across directions including residual',()=>{
 const a={org:'A',order1c:'1',dir:'One'},b={org:'A',order1c:'2',dir:'Two'};
 const d={deals:[a,b],labor:[{date:'2026-10-17',org:'A',amount:'100.00',employerContributions:'30.01',shares:[{projectKey:f.dealKey(a),amount:'33.33'},{projectKey:f.dealKey(b),amount:'66.67'}]}]};
 const one=f.directionSnapshot(d,'One').cost,two=f.directionSnapshot(d,'Two').cost;
 assert.equal(f.rubles(one),'43.33');assert.equal(f.rubles(two),'86.68');
 assert.equal(one+two,f.preliminaryPeriod(d,'2026-10','A').direct);
 assert.equal(f.projectSnapshot(d,a,f.dealKey(a)).cost,one);
 d.labor[0].shares.pop();
 const ledger=f.expenseLedger(d);assert.equal(f.rubles(ledger.rows.reduce((a,x)=>a+x.amount,0n)),'130.01');assert.ok(ledger.issues.some(x=>x.code==='unallocated-payroll'));
});
test('common costs, project costs and directional payroll appear once in consolidated P&L',()=>{
 const deal={org:'A',order1c:'1',dir:'Service'},key=f.dealKey(deal),base={org:'A',date:'2026-10-17'};
 const d={deals:[deal],costs:[{...base,projectKey:key,dir:'Service',amount:300},{...base,amount:400}],labor:[{...base,projectKey:key,dir:'Service',amount:1000,employerContributions:300},{...base,dir:'Service',amount:500,employerContributions:150}]};
 assert.equal(f.rubles(f.projectSnapshot(d,deal,key).cost),'1600.00');
 assert.equal(f.rubles(f.directionSnapshot(d,'Service').cost),'2250.00');
 assert.equal(f.rubles(f.preliminaryPeriod(d,'2026-10','A').result),'-2650.00');
});
test('quantity retains precision beyond hundredths and negative corrections round symmetrically',()=>{
 assert.equal(f.rubles(f.workAmount({qty:'0.125',rate:'1000'})),'125.00');
 assert.equal(f.rubles(f.workAmount({qty:'-0.125',rate:'0.04'})),'-0.01');
});
test('legacy employee category resolves identically for directions and monthly reports',()=>{
 const d={people:[{id:'e',expenseType:'administrative'}],labor:[{personId:'e',date:'2026-10-17',org:'A',amount:1000,employerContributions:300}]};
 const p=f.preliminaryPeriod(d,'2026-10','A');assert.equal(f.rubles(p.administrative),'1300.00');assert.equal(f.rubles(p.direct),'0.00');
});
test('a link to work on another project cannot suppress this project payroll expense',()=>{
 const deal={org:'A',order1c:'1',dir:'One'},key=f.dealKey(deal),data={deals:[deal],workActs:[{id:'other-act',projectKey:'A::1C#2',org:'A',status:'approved',rate:1000,qty:1}],labor:[{projectKey:key,org:'A',amount:1000,employerContributions:300,workActId:'other-act'}]};
 const p=f.projectSnapshot(data,deal,key);assert.equal(f.rubles(p.cost),'1300.00');assert.ok(p.issues.includes('work-link-project-mismatch'));
});
test('direction rollups exclude other organizations and periods',()=>{
 const a={org:'A',order1c:'1',dir:'Same'},b={org:'B',order1c:'1',dir:'Same'},data={deals:[a,b],realizations:[{org:'A',date:'2026-10-17',projectKey:f.dealKey(a),amount:'100'},{org:'B',date:'2026-10-17',projectKey:f.dealKey(b),amount:'200'},{org:'A',date:'2026-09-17',projectKey:f.dealKey(a),amount:'300'}],costs:[{org:'A',date:'2026-10-17',dir:'Same',amount:'10'}]};
 assert.equal(f.rubles(f.directionSnapshot(data,'Same','2026-10','A').result),'90.00');assert.equal(f.rubles(f.directionSnapshot(data,'Same').result),'590.00');
});
test('cash flow categories reconcile fractional receipts, negative net and excluded transfers',()=>{
 const cash=[{date:'2026-10-17',org:'A',type:'in',amount:'0.10'},{date:'2026-10-17',org:'A',type:'in',amount:'0.20'},{date:'2026-10-17',org:'A',type:'out',amount:'1.00',articleId:'supplier'},{date:'2026-10-17',org:'A',type:'transfer',amount:'100.00'},{date:'2026-09-17',org:'A',type:'in',amount:'500.00'},{date:'2026-10-17',org:'B',type:'in',amount:'200.00'}];
 const r=f.cashFlow(cash,'2026-10','A');assert.equal(f.rubles(r.income),'0.30');assert.equal(f.rubles(r.net),'-0.70');assert.equal(f.rubles(r.transfers),'100.00');assert.equal(r.categories.reduce((a,c)=>a+c.income-c.outgoing,0n),r.net);
});
