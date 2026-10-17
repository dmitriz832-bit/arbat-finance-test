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
