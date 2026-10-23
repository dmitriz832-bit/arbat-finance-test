const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core');
const deal={org:'A',name:'P',dir:'Service',contractTotal:100,vatRate:0},projectKey=f.dealKey(deal),base={org:'A',projectKey,vatRate:0};
test('financial drilldowns reconcile gross, direct, production and final result',()=>{
 const model=require('../app/experience-model'),data={deals:[deal],realizations:[{...base,date:'2026-10-20',amount:50}],expenses:[{...base,date:'2026-10-05',amount:60}],costs:[{...base,date:'2026-10-05',amount:10,pnlGroup:'Общепроизводственные'}],wipAccounting:true};
 const s=f.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'}),total=k=>model.financialRows(s,k,f).reduce((a,x)=>a+x.amount,0n);
 assert.equal(total('direct'),3000n);assert.equal(total('production'),1000n);assert.equal(total('gross'),s.grossProfit);assert.equal(total('result'),s.result);assert.equal(total('ebitda'),s.ebitda);
});
test('future inactive project does not invalidate historical WIP',()=>{
 const future={org:'A',name:'Future'},data={deals:[deal,future],realizations:[{...base,date:'2026-10-20',amount:50}],expenses:[{...base,date:'2026-10-05',amount:60}],wipAccounting:true};
 const s=f.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-10'});assert.equal(s.result,0n);assert.deepEqual(s.issues,[]);
});
test('exact owner range excludes subsequent realization from WIP recognition',()=>{
 const data={deals:[deal],realizations:[{...base,date:'2026-10-20',amount:50}],expenses:[{...base,date:'2026-10-05',amount:60}],wipAccounting:true};
 const early=f.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-10'}),late=f.ownerPeriodSnapshot(data,{from:'2026-10-11',to:'2026-10-31'}),month=f.preliminaryPeriod(data,'2026-10');
 assert.equal(early.result,0n);assert.equal(early.deferredChange,6000n);assert.equal(late.result,2000n);assert.equal(late.deferredChange,-3000n);assert.equal(early.result+late.result,month.result);
});
test('project result reconciles assigned non-direct expense and other income without capitalizing either',()=>{
 const data={deals:[deal],realizations:[{...base,date:'2026-10-20',amount:100}],expenses:[{...base,date:'2026-10-05',amount:50}],costs:[{...base,date:'2026-10-05',amount:39,pnlGroup:'Административные'},{...base,date:'2026-10-05',amount:20,pnlType:'income'}],wipAccounting:true};
 const p=f.projectSnapshot(data,deal,projectKey),w=f.projectWipSnapshot(data,deal,projectKey),total=f.preliminaryPeriod(data,'2026-10');
 assert.equal(p.cost,8900n);assert.equal(p.otherIncome,2000n);assert.equal(p.result,3100n);assert.equal(w.recognizedCost,5000n);assert.equal(w.wip,0n);assert.equal(w.nonDirectCost,3900n);assert.equal(w.otherIncome,2000n);assert.equal(w.directContribution,5000n);assert.equal(w.operatingProfit,p.result);assert.equal(w.operatingProfit,total.result);
});
test('owner and monthly P&L use identical gross and EBITDA with production overhead',()=>{
 const data={realizations:[{org:'A',date:'2026-10-01',amount:100,vatRate:0}],costs:[{org:'A',date:'2026-10-01',amount:20,pnlGroup:'Общепроизводственные'}]};
 const p=f.preliminaryPeriod(data,'2026-10'),o=f.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'});assert.equal(o.grossProfit,10000n);assert.equal(o.grossProfit,p.gross);assert.equal(o.ebitda,8000n);assert.equal(o.ebitda,p.ebitda);
});
test('partial member linkage preserves remaining crew obligations and flags amount mismatch',()=>{
 const workActs=[{id:'act',...base,date:'2026-10-01',status:'approved',qty:1,rate:100,memberIds:['p1','p2']}];
 let accruals=[{...base,date:'2026-10-01',amount:50,personId:'p1',workActId:'act'}];
 const r=f.payrollReconciliation({workActs,accruals});assert.equal(r.grossTotal,10000n);assert.equal(r.people.find(p=>p.personId==='p2').payable,5000n);assert.equal(r.expense,f.expenseLedger({workActs,labor:accruals}).rows.reduce((a,x)=>a+x.amount,0n));
 accruals=[{...accruals[0],amount:40}];const mismatch=f.payrollReconciliation({workActs,accruals});assert.equal(mismatch.people.find(p=>p.personId==='p2').payable,5000n);assert.ok(mismatch.issues.some(x=>x.code==='crew-payroll-linked-amount-mismatch'));
});
test('all members replaced exactly once do not duplicate crew payable',()=>{
 const workActs=[{id:'act',...base,status:'approved',qty:1,rate:100,memberIds:['p1','p2']}],accruals=['p1','p2'].map(personId=>({...base,personId,amount:50,workActId:'act'}));
 const r=f.payrollReconciliation({workActs,accruals});assert.equal(r.grossTotal,10000n);assert.equal(r.people.length,2);assert.ok(!r.issues.some(x=>x.code==='crew-payroll-linked-amount-mismatch'));
});
