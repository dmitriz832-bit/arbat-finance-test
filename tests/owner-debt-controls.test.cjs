const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core.js');
test('project receipts settle realization before becoming customer advances',()=>{
const data={deals:[{org:'АИР-КЛИМАТ',name:'Тест',order1c:'101'}],realizations:[],cash:[]};
const key=core.dealKey(data.deals[0]);data.realizations.push({projectKey:key,org:'АИР-КЛИМАТ',amount:1000,vatRate:0});data.cash.push({type:'in',projectKey:key,org:'АИР-КЛИМАТ',amount:1250});
const x=core.ownerDebtSnapshot(data);assert.equal(core.rubles(x.receivable),'0.00');assert.equal(core.rubles(x.advances),'250.00');assert.equal(core.rubles(x.unallocated),'0.00');
});
test('unallocated customer receipt must not silently settle project debt',()=>{
const data={deals:[{org:'АИР-КЛИМАТ',name:'Тест',order1c:'102'}],realizations:[],cash:[{type:'in',amount:300,org:'АИР-КЛИМАТ'}]};
data.realizations.push({projectKey:core.dealKey(data.deals[0]),org:'АИР-КЛИМАТ',amount:500,vatRate:0});
const x=core.ownerDebtSnapshot(data);assert.equal(core.rubles(x.receivable),'500.00');assert.equal(core.rubles(x.unallocated),'300.00');assert.ok(x.issues.some(i=>i.code==='unallocated-receipt'));
});
test('salary payable accounts for NDFL, deductions and payouts but not employer contributions',()=>{
const data={labor:[{personId:'P1',amount:1000,ndfl:130,otherDeductions:20,employerContributions:300}],cash:[{type:'out',personId:'P1',amount:400}]};
const x=core.ownerDebtSnapshot(data);assert.equal(core.rubles(x.payrollPayable),'450.00');
});

test('customer debt is valued gross with VAT rather than P&L net revenue',()=>{
 const deal={org:'АРБАТ.ГК',name:'НДС',order1c:'VAT1'},key=core.dealKey(deal);
 const x=core.ownerDebtSnapshot({deals:[deal],realizations:[{projectKey:key,org:'АРБАТ.ГК',amount:1220,vatRate:22}],cash:[{projectKey:key,org:'АРБАТ.ГК',type:'in',amount:1000}]});
 assert.equal(core.rubles(x.receivable),'220.00');
});
