const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('allocated directions, other income and unallocated costs reconcile to exact penny',()=>{
 const a={org:'A',order1c:'1',dir:'Вентиляция'},b={org:'A',order1c:'2',dir:'Сервис и ТО'};
 const data={deals:[a,b],realizations:[{org:'A',date:'2026-10-18',projectKey:f.dealKey(a),amount:'1000',vatRate:0},{org:'A',date:'2026-10-18',amount:'100',vatRate:0}],costs:[
 {org:'A',date:'2026-10-18',amount:'100',pnlGroup:'Общепроизводственные',pnlAllocationRule:'proportional',pnlAllocations:[{dir:'Вентиляция',weight:1},{dir:'Сервис и ТО',weight:1}]},
 {org:'A',date:'2026-10-18',amount:'15',pnlType:'income',pnlGroup:'Прочие',dir:'Вентиляция'},
 {org:'A',date:'2026-10-18',amount:'30',pnlGroup:'Административные'}
 ]};
 const r=f.directionReconciliation(data,'2026-10','A');
 assert.equal(f.rubles(r.totalResult),'985.00');
 assert.equal(f.rubles(r.directionResult),'915.00');
 assert.equal(f.rubles(r.unallocatedResult),'70.00');
 assert.equal(f.rubles(r.difference),'0.00');assert.equal(r.balanced,true);
 assert.equal(f.rubles(r.directions.find(x=>x.name==='Вентиляция').otherIncome),'15.00');
 assert.equal(f.rubles(r.directions.find(x=>x.name==='Вентиляция').result),'965.00');
});
test('reconciliation preserves an undistributed expense and emits issue',()=>{
 const d={costs:[{org:'A',date:'2026-10-18',amount:'40.01',pnlAllocationRule:'proportional'}]};
 const r=f.directionReconciliation(d,'2026-10','A');assert.equal(f.rubles(r.unallocatedExpense),'40.01');assert.equal(r.balanced,true);assert.equal(r.issues[0].code,'missing-pnl-allocation');
});
