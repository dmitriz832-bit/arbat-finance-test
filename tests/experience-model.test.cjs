const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const filename=path.join(__dirname,'../app/experience-model.js');
const ux=fs.existsSync(filename)?require(filename):{};
const core=require('../app/finance-core.js');
test('seven-day plans include today and day six, exclude day seven and other organizations',()=>{
 assert.equal(typeof ux.plans,'function');
 const data={calendar:[{id:'today',dueDate:'2026-10-21',amount:10,type:'in',org:'A'},{id:'six',dueDate:'2026-10-27',amount:20,type:'in',org:'A'},{id:'seven',dueDate:'2026-10-28',amount:30,type:'in',org:'A'},{id:'old',dueDate:'2026-10-20',amount:5,org:'A'},{id:'other',dueDate:'2026-10-21',amount:500,org:'B'},{id:'disabled',active:'no',dueDate:'2026-10-21',amount:500,org:'A'}]};
 const p=ux.plans(data,'A','2026-10-21');assert.deepEqual(p.week.map(x=>x.id),['today','six']);assert.deepEqual(p.overdue.map(x=>x.id),['old']);assert.equal(p.to,'2026-10-27');
});
test('monthly plans advance from old dates without losing month-end anchor',()=>{
 assert.equal(typeof ux.plans,'function');
 const p=ux.plans({calendar:[{id:'r',dueDate:'2020-01-31',frequency:'monthly',amount:10}]},'','2026-03-01');
 assert.equal(p.future[0].occurrence,'2026-03-31');assert.equal(p.overdue.length,1,'show one reminder per rule, not invented debts for every month');
});
test('result drilldown reconciles with the exact core including WIP and below-income signs',()=>{
 assert.equal(typeof ux.financialRows,'function');
 const s={revenueDocuments:[{_id:'r',date:'2026-10-01',amount:100,vatRate:0}],rows:[{source:{_id:'c'},kind:'general-expense',category:'administrative',date:'2026-10-02',amount:2000n},{source:{_id:'i'},kind:'general-expense',category:'belowIncome',date:'2026-10-02',amount:500n}],deferredChange:1000n};
 const rows=ux.financialRows(s,'result',core);assert.equal(rows.reduce((s,r)=>s+r.amount,0n),9500n);assert.equal(rows[1].collection,'costs');assert.equal(rows.at(-1).collection,null);assert.match(rows.at(-1).label,/НЗП/);
});
test('period stepping clamps month end and keeps year and quarter semantics',()=>{
 assert.equal(typeof ux.shiftPeriod,'function');assert.equal(ux.shiftPeriod('2026-01-31','month',1),'2026-02-28');assert.equal(ux.shiftPeriod('2026-10-21','quarter',1),'2027-01-21');assert.equal(ux.shiftPeriod('2024-02-29','year',1),'2025-02-28');
});
test('report source rows use report categories, including production overhead and allocated costs',()=>{
 assert.equal(typeof ux.reportRows,'function');
 const d={deals:[],realizations:[{_id:'r',date:'2026-10-01',org:'A',amount:1000,vatRate:0}],costs:[{_id:'production',date:'2026-10-01',org:'A',amount:100,vatRate:0,pnlGroup:'Общепроизводственные'},{_id:'admin-dir',date:'2026-10-01',org:'A',dir:'Service',amount:50,vatRate:0,pnlGroup:'Административные'},{_id:'direct',date:'2026-10-01',org:'A',amount:60,vatRate:0,pnlAllocationRule:'proportional',pnlAllocations:[{dir:'Service',weight:1},{dir:'Build',weight:2}]}]};
 const snapshot=core.ownerPeriodSnapshot(d,core.ownerPeriodBounds('month','2026-10-01'),'A'),report=core.preliminaryPeriod(d,'2026-10','A');
 for(const [label,expected] of [['ВАЛОВАЯ ПРИБЫЛЬ',report.gross],['Расходы направлений',report.components.assignedExpenses],['Общехозяйственные расходы',report.components.generalCostTotal],['Общепроизводственные расходы',report.production]])assert.equal(ux.reportRows(snapshot,label,core).reduce((v,x)=>v+x.amount,0n),expected,label);
});
