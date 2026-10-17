const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('owner control: month 28k, all-time 43k with work, direction, general and payroll contributions',()=>{
 const data={deals:[],
 realizations:[{date:'2026-09-10',amount:20000,vatRate:0},{date:'2026-10-10',amount:60000,vatRate:0}],
 expenses:[{date:'2026-09-11',amount:5000,vatRate:0},{date:'2026-10-10',amount:10000,vatRate:0}],
 workActs:[{date:'2026-10-12',status:'approved',qty:1,rate:2000}],
 costs:[{date:'2026-10-14',amount:3000,vatRate:0,dir:'Сервис'},{date:'2026-10-14',amount:4000,vatRate:0,pnlGroup:'Административные'}],
 labor:[{date:'2026-10-15',amount:10000,employerContributions:3000,expenseType:'administrative'}]};
 const month=f.ownerPeriodSnapshot(data,f.ownerPeriodBounds('month','2026-10-18'));
 const all=f.ownerPeriodSnapshot(data,f.ownerPeriodBounds('all','2026-10-18'));
 assert.equal(f.rubles(month.revenue),'60000.00');
 assert.equal(f.rubles(month.byKind['work-act']),'2000.00');
 assert.equal(f.rubles(month.byKind['payroll']),'13000.00');
 assert.equal(f.rubles(month.result),'28000.00');
 assert.equal(f.rubles(all.result),'43000.00');
 assert.equal(month.revenueDocuments.length,1);
 assert.equal(month.rows.length,5);
});
test('cash drilldown exposes documents in selected date window only',()=>{
 const data={cash:[{date:'2026-09-03',type:'in',amount:'1000'},{date:'2026-10-03',type:'out',amount:'125'}]};
 const r=f.ownerPeriodSnapshot(data,f.ownerPeriodBounds('month','2026-10-18'));
 assert.equal(r.cash.rows.length,1);
 assert.equal(f.rubles(r.cash.net),'-125.00');
});
