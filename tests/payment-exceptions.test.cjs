const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('unattached customer receipt 38957.40 enters exception register',()=>{
 const result=f.paymentExceptionRegister({cash:[{_id:'payment1',date:'2026-10-01',type:'in',walletId:'a',amount:'38957.40'}]});
 assert.ok(result.issues.some(x=>x.code==='incoming-without-project-or-counterparty'&&x.detail==='38957.40'));
});
test('unallocated 240 remains visible and cannot be silently assigned',()=>{
 const cash=[{_id:'pay',date:'2026-10-02',type:'out',walletId:'a',personId:'first',amount:'19500',payrollAllocations:[{personId:'first',amount:'9630'},{personId:'second',amount:'9630'}]}];
 const result=f.paymentExceptionRegister({cash,labor:[{personId:'first',amount:'9630'},{personId:'second',amount:'9630'}]});
 assert.equal(f.rubles(result.unallocatedPayroll),'240.00');
 assert.ok(result.issues.some(x=>x.code==='payment-allocation-difference'&&x.detail==='240.00'));
});
test('possible manual duplicate is warned but source payments unchanged',()=>{
 const cash=[{_id:'first',date:'2026-10-01',type:'out',walletId:'a',amount:'100',counterparty:'Supplier'}, {_id:'second',date:'2026-10-01',type:'out',walletId:'a',amount:'100',counterparty:'Supplier'}];
 const result=f.paymentExceptionRegister({cash});
 assert.ok(result.issues.some(x=>x.code==='possible-duplicate-payment'&&x.source===cash[1]));
 assert.equal(cash.length,2);
});
test('invalid project reference and missing required expense project are highlighted',()=>{
 const result=f.paymentExceptionRegister({cash:[{type:'in',amount:'100',projectKey:'UNKNOWN'}],expenses:[{amount:'50',projectRequired:true}]});
 assert.ok(result.issues.some(x=>x.code==='invalid-project-reference'));
 assert.ok(result.issues.some(x=>x.code==='required-expense-project-missing'));
});
