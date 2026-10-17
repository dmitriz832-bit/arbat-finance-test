const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/finance-core.js');

test('administrator gross 57471 tax 7471 paid 50000 reconciles zero',()=>{
 const result=core.payrollReconciliation({accruals:[{personId:'admin',amount:'57471',ndfl:'7471'}],payments:[{type:'out',personId:'admin',amount:'50000',payrollPayment:true}]});
 assert.equal(core.rubles(result.people[0].payable),'0.00');
 assert.equal(core.rubles(result.expense),'57471.00');
});

test('single cash payout for two installers retains unmatched 240 rubles',()=>{
 const result=core.payrollReconciliation({accruals:[{personId:'a',amount:'9630'},{personId:'b',amount:'9630'}],payments:[{type:'out',personId:'a',amount:'19500',payrollAllocations:[{personId:'a',amount:'9630'},{personId:'b',amount:'9630'}]}]});
 assert.equal(core.rubles(result.unallocatedTotal),'240.00');
 assert.equal(core.rubles(result.paidTotal),'19260.00');
 assert.deepEqual(result.people.map(x=>core.rubles(x.payable)),['0.00','0.00']);
 assert.ok(result.issues.some(x=>x.code==='payroll-unallocated-payment'));
 assert.equal(core.rubles(result.expense),'19260.00');
});

test('production crew settlements reconcile legacy cash and retain unmatched 240 rubles',()=>{
 const payment={_id:'cash-1',type:'out',personId:'a',amount:'19500'};
 const settlements=[{cashId:'cash-1',personId:'a',amount:'9630'},{cashId:'cash-1',personId:'b',amount:'9630'}];
 const workActs=[{id:'act-1',status:'approved',qty:9,rate:2140,memberIds:['b','a']}];
 const result=core.payrollReconciliation({payments:[payment],settlements,workActs});
 assert.equal(core.rubles(result.unallocatedTotal),'240.00');
 assert.equal(core.rubles(result.paidTotal),'19260.00');
 assert.equal(core.rubles(result.grossTotal),'19260.00');
 assert.deepEqual(result.people.map(x=>core.rubles(x.payable)),['0.00','0.00']);
});

test('production payroll chain counts work-act earnings once and keeps P&L expense unchanged',()=>{
 const workActs=[{id:'act-1',status:'approved',qty:9,rate:2140,memberIds:['b','a'],projectKey:'p'}];
 const labor=[{personId:'admin',amount:57471,ndfl:7471,employerContributions:14717,expenseType:'administrative'}];
 const cash=[{_id:'salary',type:'out',personId:'admin',amount:50000},{_id:'crew',type:'out',personId:'a',amount:19500}];
 const settlements=[{cashId:'crew',personId:'a',amount:9630},{cashId:'crew',personId:'b',amount:9630}];
 const payroll=core.payrollReconciliation({accruals:labor,payments:cash,settlements,workActs});
 const ledger=core.expenseLedger({labor,workActs});
 assert.equal(core.rubles(payroll.expense),'91448.00');
 assert.equal(core.rubles(ledger.rows.reduce((sum,row)=>sum+row.amount,0n)),'91448.00');
 assert.equal(core.rubles(payroll.unallocatedTotal),'240.00');
 assert.equal(core.rubles(payroll.people.reduce((sum,row)=>sum+(row.payable>0n?row.payable:0n),0n)),'0.00');
});

test('allocation cannot exceed actual cash payout or silently credit employees',()=>{
 const result=core.payrollReconciliation({payments:[{type:'out',personId:'a',amount:'100',payrollAllocations:[{personId:'a',amount:'100.01'}]}]});
 assert.equal(result.people.length,0);
 assert.equal(core.rubles(result.unallocatedTotal),'100.00');
 assert.ok(result.issues.some(x=>x.code==='payroll-overallocated-payment'));
});

test('salary cash payout never decreases already recognized P&L profit twice',()=>{
 const data={realizations:[{org:'A',date:'2026-10-01',amount:'30000'}],labor:[{personId:'a',org:'A',date:'2026-10-01',amount:'9630',employerContributions:'3000'}],cash:[{type:'out',personId:'a',org:'A',date:'2026-10-01',amount:'9630'}]};
 const pnl=core.preliminaryPeriod(data,'2026-10','A');
 assert.equal(core.rubles(pnl.result),'17370.00');
 assert.equal(core.rubles(core.cashFlow(data.cash,'2026-10','A').outgoing),'9630.00');
});
