const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('proportional P&L expenses distribute 100.00% to exact kopeck',()=>{
 const item={date:'2026-10-18',org:'A',amount:'100.00',pnlGroup:'Общепроизводственные',pnlAllocationRule:'proportional',pnlAllocations:[{dir:'Кондиционирование',weight:1},{dir:'Вентиляция',weight:1},{dir:'Сервис и ТО',weight:1}]};
 const data={costs:[item]};const ledger=f.expenseLedger(data);
 assert.deepEqual(ledger.rows.map(r=>f.rubles(r.amount)),['33.33','33.33','33.34']);
 assert.equal(ledger.rows.reduce((s,r)=>s+r.amount,0n),f.cents('100.00'));
 assert.equal(f.rubles(f.preliminaryPeriod(data,'2026-10').production),'100.00');
 assert.equal(f.rubles(f.directionSnapshot(data,'Сервис и ТО').cost),'33.34');
 assert.equal(ledger.issues.length,0);
});
test('invalid allocation is flagged and total is not silently lost',()=>{
 const data={costs:[{org:'A',date:'2026-10-18',amount:100,pnlAllocationRule:'proportional',pnlAllocations:[{dir:'Кондиционирование',weight:0},{dir:'Вентиляция',weight:0}]}]};
 const ledger=f.expenseLedger(data);assert.equal(ledger.issues[0].code,'invalid-pnl-allocation-weights');
 assert.equal(f.rubles(ledger.rows.reduce((s,r)=>s+r.amount,0n)),'100.00');
});
test('missing allocations are disclosed without hiding expense',()=>{
 const data={costs:[{org:'A',date:'2026-10-18',amount:55,pnlAllocationRule:'proportional'}]};
 assert.equal(f.expenseLedger(data).issues[0].code,'missing-pnl-allocation');
 assert.equal(f.rubles(f.preliminaryPeriod(data,'2026-10').result),'-55.00');
});
