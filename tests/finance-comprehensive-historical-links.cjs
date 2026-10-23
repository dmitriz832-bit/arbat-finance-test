const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
function fixture(){
  const deal={org:'A',name:'Cutoff',dir:'Service',contractTotal:1000,vatRate:0},key=f.dealKey(deal);
  return {deal,key,data:{deals:[deal],wipAccounting:true,labor:[{org:'A',projectKey:key,date:'2026-01-15',amount:100,workActId:'future'}],workActs:[{id:'future',org:'A',projectKey:key,date:'2026-02-01',status:'approved',qty:1,rate:100}]}};
}
test('future linked act cannot remove payroll already accrued in historical WIP',()=>{
  const {deal,key,data}=fixture();
  const jan=f.projectWipSnapshot(data,deal,key,'2026-01');
  assert.equal(jan.accruedCost,10000n);
  assert.equal(jan.wip,10000n);
  assert.equal(jan.status,'calculated');
  assert.equal(f.preliminaryPeriod(data,'2026-01','A').result,0n);
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-01-01',to:'2026-01-31'},'A').result,0n);
  assert.equal(f.directionSnapshot(data,'Service','2026-01','A').result,0n);
  assert.equal(f.directionReconciliation(data,'2026-01','A').difference,0n);
});
test('prior recognized cost uses prior cutoff before a later act replaces linked payroll',()=>{
  const {deal,key,data}=fixture();
  data.realizations=[{org:'A',projectKey:key,date:'2026-01-20',amount:500,vatRate:0}];
  const feb=f.projectWipSnapshot(data,deal,key,'2026-02');
  assert.equal(feb.accruedCost,10000n);
  assert.equal(feb.previouslyRecognizedCost,5000n);
  assert.equal(feb.currentCost,0n);
  assert.equal(feb.wip,5000n);
});
test('cross-month replacement does not expense the same gross a second time in February',()=>{
  const {data}=fixture();data.wipAccounting=false;
  const before=JSON.stringify(data);
  assert.equal(f.preliminaryPeriod(data,'2026-01','A').direct,10000n);
  assert.equal(f.preliminaryPeriod(data,'2026-02','A').direct,0n);
  assert.equal(f.directionSnapshot(data,'Service','2026-02','A').cost,0n);
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-02-01',to:'2026-02-28'},'A').result,0n);
  assert.equal(f.preliminaryPeriod(data,'','A').direct,10000n);
  assert.equal(f.directionReconciliation(data,'2026-02','A').difference,0n);
  const feb=f.ownerPeriodSnapshot(data,{from:'2026-02-01',to:'2026-02-28'},'A');
  const adjustment=feb.rows.find(row=>row.calculated);
  assert.equal(adjustment.amount,-10000n);
  assert.equal(adjustment.adjustment,'linked-work-reclassification');
  assert.equal(adjustment.source,data.labor[0]);
  assert.equal(adjustment.date,'2026-02-01');
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-01-01',to:'2026-01-31'},'A').result+feb.result,f.ownerPeriodSnapshot(data,{from:'',to:''},'A').result);
  assert.equal(JSON.stringify(data),before);
});
test('same-month link preserves approved deduction and employer contributions',()=>{
  const {deal,key,data}=fixture();data.labor[0].date='2026-02-15';data.labor[0].employerContributions=30;
  assert.equal(f.preliminaryPeriod(data,'2026-02','A').direct,13000n);
  assert.equal(f.projectWipSnapshot(data,deal,key,'2026-02').accruedCost,13000n);
  assert.equal(f.projectWipSnapshot(data,deal,key,'2026-01').accruedCost,0n);
});
test('future invalid work data is not parsed while checking historical project relevance',()=>{
  const {data}=fixture();data.workActs[0].qty='invalid-import';
  assert.equal(f.preliminaryPeriod(data,'2026-01','A').result,0n);
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-01-01',to:'2026-01-31'},'A').result,0n);
});
test('calculated reclassification retains its source overlap warning in monthly report and owner range',()=>{
  const {data}=fixture();data.wipAccounting=false;
  const report=f.preliminaryPeriod(data,'2026-02','A');
  const owner=f.ownerPeriodSnapshot(data,{from:'2026-02-01',to:'2026-02-28'},'A');
  assert.ok(report.issues.some(issue=>issue.code==='linked-work-overlap'&&issue.source===data.labor[0]));
  assert.ok(owner.issues.some(issue=>issue.code==='linked-work-overlap'&&issue.source===data.labor[0]));
  assert.equal(f.preliminaryPeriod(data,'2026-02','B').issues.length,0);
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-02-01',to:'2026-02-28'},'B').issues.length,0);
});
