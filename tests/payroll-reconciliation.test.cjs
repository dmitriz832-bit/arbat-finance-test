const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('administrator gross 57471 tax 7471 and paid 50000 leaves zero',()=>{
 const r=f.payrollReconciliation({accruals:[{personId:'admin',gross:57471,ndfl:7471}],payments:[{type:'out',personId:'admin',amount:50000}]});
 assert.equal(r.people[0].payable,0n);assert.equal(r.expense,f.cents(57471));assert.equal(r.issues.length,0);
});
test('two installers paid exactly their gross have no balance',()=>{
 const accruals=['a','b'].map(personId=>({personId,gross:9630}));
 const payments=['a','b'].map(personId=>({personId,type:'out',amount:9630}));
 const r=f.payrollReconciliation({accruals,payments});
 assert.equal(r.people.length,2);assert.ok(r.people.every(x=>x.payable===0n));assert.equal(r.expense,f.cents(19260));
});
test('cash payment 19500 with allocation 19260 reports explicit 240 remainder',()=>{
 const r=f.payrollReconciliation({accruals:[{personId:'a',gross:19260}],payments:[{type:'out',personId:'a',amount:19500,payrollAllocations:[{personId:'a',amount:19260}]}]});
 assert.equal(r.people[0].payable,0n);assert.equal(r.unallocatedPayments[0].amount,f.cents(240));assert.equal(r.issues[0].code,'payroll-unallocated-payment');
});
test('deductions do not alter employer expense; contributions do',()=>{
 const r=f.payrollReconciliation({accruals:[{personId:'p',gross:10000,ndfl:1300,otherDeductions:1500,employerContributions:3000}],payments:[{type:'out',personId:'p',amount:7200}]});
 assert.equal(r.people[0].payable,0n);assert.equal(r.expense,f.cents(13000));
});
test('rejects tax exceeding gross and flags payment beyond payable',()=>{
 let r=f.payrollReconciliation({accruals:[{personId:'p',gross:100,ndfl:70,otherDeductions:40}]});
 assert.equal(r.issues[0].code,'payroll-invalid-deductions');
 r=f.payrollReconciliation({accruals:[{personId:'p',gross:100}],payments:[{type:'out',personId:'p',amount:120}]});
 assert.equal(r.issues[0].code,'payroll-overpayment');assert.equal(r.people[0].payable,f.cents(-20));
});

test('one payment allocates to two employees and leaves the unmatched cash separately',()=>{
 const result=f.payrollReconciliation({accruals:[{personId:'a',gross:9630},{personId:'b',gross:9630}],payments:[{type:'out',personId:'a',amount:19500,payrollAllocations:[{personId:'a',amount:9630},{personId:'b',amount:9630}]}]});
 assert.equal(result.people.find(x=>x.personId==='a').payable,0n);
 assert.equal(result.people.find(x=>x.personId==='b').payable,0n);
 assert.equal(result.unallocatedPayments[0].amount,f.cents(240));
});
test('project cash allocations cannot accidentally become payroll allocation',()=>{
 const r=f.payrollReconciliation({accruals:[{personId:'p',gross:500}],payments:[{type:'out',personId:'p',amount:500,allocations:[{projectKey:'job',amount:100}]}]});
 assert.equal(r.people[0].payable,0n);assert.equal(r.unallocatedPayments.length,0);
});
test('excess or negative payroll allocation cannot change employee balances',()=>{
 for(const amount of [110,-5]){
 const r=f.payrollReconciliation({accruals:[{personId:'p',gross:100}],payments:[{type:'out',personId:'p',amount:100,payrollAllocations:[{personId:'p',amount}]}]});
 assert.equal(r.people[0].payable,f.cents(100));assert.equal(r.unallocatedPayments[0].amount,f.cents(100));
 }
});
