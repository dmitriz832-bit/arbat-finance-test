const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('monthly WIP bridge defers costs before realization and releases precise period amount',()=>{
 const deal={org:'A',order1c:'B1',contractTotal:'100.00',vatRate:0,dir:'Сервис'},key=f.dealKey(deal);
 const data={deals:[deal],expenses:[{org:'A',date:'2026-09-08',projectKey:key,amount:'60.00'}],realizations:[{org:'A',date:'2026-10-01',projectKey:key,amount:'50.00',vatRate:0}]};
 const sep=f.wipPeriodBridge(data,'2026-09','A'),oct=f.wipPeriodBridge(data,'2026-10','A');
 assert.equal(f.rubles(sep.deferredChange),'60.00');
 assert.equal(f.rubles(sep.recognizedCost),'0.00');
 assert.equal(f.rubles(oct.deferredChange),'-30.00');
 assert.equal(f.rubles(oct.recognizedCost),'30.00');
 assert.equal(sep.issues.length,0);assert.equal(oct.issues.length,0);
});
test('incomplete contract raises review instead of zero-cost project result',()=>{
 const deal={org:'A',order1c:'B2'},key=f.dealKey(deal);
 const b=f.wipPeriodBridge({deals:[deal],expenses:[{org:'A',projectKey:key,date:'2026-10-01',amount:90}]},'2026-10','A');
 assert.equal(b.projects.length,0);assert.equal(b.issues[0].code,'wip-unverified-project');
});
