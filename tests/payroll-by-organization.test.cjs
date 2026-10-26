const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core');
const A='АИР-КЛИМАТ',B='АРБАТ.ГК';
test('shared payroll reconciliation preserves company debt and overpayment for one employee',()=>{
 const options={accruals:[{personId:'p',org:A,amount:100,ndfl:13,otherDeductions:7,employerContributions:30}],payments:[{_id:'b',personId:'p',org:B,type:'out',amount:80}]};
 const s=core.payrollByOrganization(options);assert.equal(s.payableTotal,8000n);assert.equal(s.overpaidTotal,8000n);assert.equal(s.expense,13000n);assert.equal(s.people.length,2);assert.equal(s.people.find(x=>x.org===A).payable,8000n);assert.equal(s.people.find(x=>x.org===B).payable,-8000n);
 const a=core.payrollByOrganization(options,A);assert.equal(a.payableTotal,8000n);assert.equal(a.overpaidTotal,0n);assert.equal(a.paidTotal,0n);assert.ok(a.people.every(x=>x.org===A));
});
test('company reconciliation includes approved works and linked existing settlement payments once',()=>{
 const s=core.payrollByOrganization({workActs:[{id:'act',org:A,status:'approved',memberIds:['p'],rate:100,qty:1}],payments:[{_id:'cash',org:A,type:'out',amount:40}],settlements:[{cashId:'cash',personId:'p',amount:40}]});
 assert.equal(s.grossTotal,10000n);assert.equal(s.paidTotal,4000n);assert.equal(s.payableTotal,6000n);assert.equal(s.unallocatedTotal,0n);assert.equal(s.people[0].org,A);
});
test('payment exception register reports company overpayment even when another company owes same person',()=>{
 const s=core.paymentExceptionRegister({labor:[{personId:'p',org:A,amount:100}],cash:[{_id:'c',personId:'p',org:B,type:'out',amount:100,payrollPayment:true}],people:[],articles:[],deals:[]});
 assert.ok(s.issues.some(x=>x.code==='payroll-overpayment'));
});
