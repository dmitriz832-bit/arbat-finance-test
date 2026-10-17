const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core.js');

test('legacy contract and realization remain calculable but cannot be certified',()=>{
 const deal={org:'АИР-КЛИМАТ',order1c:'1',contractTotal:'568897.87'},key=core.dealKey(deal);
 const data={deals:[deal],realizations:[{org:deal.org,projectKey:key,date:'2026-10-17',amount:'38597.40'}]};
 assert.equal(core.rubles(core.documentPnlAmount(data.realizations[0])),'38597.40');
 const control=core.vatControlRegister(data,{projectKey:key});
 assert.equal(control.count,2);
 assert.deepEqual(control.issues.map(x=>x.documentKind),['contract','realization']);
});

test('explicit zero VAT is confirmed and is not treated as missing',()=>{
 const deal={org:'АИР-КЛИМАТ',order1c:'2',contractTotal:'100',vatRate:0},key=core.dealKey(deal);
 const control=core.vatControlRegister({deals:[deal],realizations:[{org:deal.org,projectKey:key,date:'2026-10-17',amountGross:'100',vatRate:0}]},{projectKey:key});
 assert.equal(control.count,0);
});

test('VAT control follows owner date and organization filters',()=>{
 const data={realizations:[{org:'A',date:'2026-09-30',amount:1},{org:'A',date:'2026-10-01',amount:2},{org:'B',date:'2026-10-01',amount:3,vatRate:0}]};
 const control=core.vatControlRegister(data,{org:'A',from:'2026-10-01',to:'2026-10-31'});
 assert.equal(control.count,1);assert.equal(control.issues[0].source.amount,2);
});
