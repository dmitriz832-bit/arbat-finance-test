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
