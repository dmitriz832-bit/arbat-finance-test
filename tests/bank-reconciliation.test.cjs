const assert=require('node:assert/strict');const test=require('node:test');const f=require('../app/finance-core.js');
test('opening date excludes all prior and same-day movements',()=>{
 const rows=[{date:'2026-09-30',type:'in',walletId:'w',amount:'50'},{date:'2026-10-01',type:'in',walletId:'w',amount:'100'},{date:'2026-10-02',type:'out',walletId:'w',amount:'20.01'}];
 const r=f.walletSnapshot('1000',rows,'w','2026-10-01');
 assert.equal(f.rubles(r.balance),'979.99');
});
test('legacy wallet without opening date retains historical behavior',()=>{
 const x=f.walletSnapshot('1000',[{date:'2026-10-01',type:'in',walletId:'w',amount:'100'}],'w');
 assert.equal(f.rubles(x.balance),'1100.00');
});
test('bank reconciliation calculates difference exactly, never overwrites statement',()=>{
 const w={id:'w',openingBalance:'1000',openingBalanceDate:'2026-10-01',bankStatementDate:'2026-10-03',bankStatementBalance:'1040'};
 const rows=[{date:'2026-10-02',type:'in',walletId:'w',amount:'50.10'},{date:'2026-10-04',type:'out',walletId:'w',amount:'900'}];
 const r=f.bankReconciliation(w,rows);
 assert.equal(r.status,'mismatch');
 assert.equal(f.rubles(r.calculated),'1050.10');
 assert.equal(f.rubles(r.statement),'1040.00');
 assert.equal(f.rubles(r.difference),'10.10');
 assert.equal(w.bankStatementBalance,'1040');
});
test('matched bank statement gives true zero and date cutoff remains inclusive for statement date',()=>{
 const w={id:'w',openingBalance:'100',openingBalanceDate:'2026-10-01',bankStatementDate:'2026-10-02',bankStatementBalance:'99.99'};
 const r=f.bankReconciliation(w,[{date:'2026-10-02',type:'out',walletId:'w',amount:'.01'}].map(x=>({...x,amount:'0.01'})));
 assert.equal(r.status,'matched');assert.equal(r.difference,0n);
});
test('consolidation applies distinct per-wallet cutoff dates',()=>{
 const w=[{id:'a',org:'АИР-КЛИМАТ',verified:true,openingBalance:'100',openingBalanceDate:'2026-10-01'},{id:'b',org:'Общий',verified:true,openingBalance:'200',openingBalanceDate:'2026-10-03'}];
 const r=f.walletConsolidation(w,[{date:'2026-10-02',type:'in',walletId:'a',amount:'10'},{date:'2026-10-02',type:'in',walletId:'b',amount:'10'}]);
 assert.equal(f.rubles(r.total),'310.00');
});
