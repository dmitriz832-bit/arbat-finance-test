const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../app/finance-core.js');

function fixture(){
 const deal={_id:'p',org:'A',name:'Mixed project',dir:'Service',contractTotal:'1000',vatRate:0},key=core.dealKey(deal);
 const receipt={id:'receipt',kind:'receipt',org:'A',itemId:'goods',to:'stock',date:'2026-09-01',qty:10,price:10,vatRate:0};
 const move={id:'sale-move',kind:'consume',org:'A',itemId:'goods',from:'stock',date:'2026-10-05',qty:4,dealId:'p',documentId:'shipment',stockPurpose:'sale',saleRealizationId:'sale'};
 const realization={_id:'sale',org:'A',projectKey:key,date:'2026-10-05',amount:'200',vatRate:0,warehouseSale:true,warehouseDocumentId:'shipment',warehouseMoveIds:['sale-move']};
 const part={source:'receipt',qty:4,cost:10,valueCents:'4000',expenseValueCents:'4000',expenseValuationStatus:'verified',sourceGrossValueCents:'10000',sourceExpenseValueCents:'10000'};
 const expense={_id:'warehouse-consume-sale-move',org:'A',projectKey:key,date:'2026-10-05',warehouseMoveId:'sale-move',stockPurpose:'sale',saleRealizationId:'sale',amount:'40',amountGross:'40',amountNet:'40',vatRate:0,vatAmount:'0',vatDeductible:false,warehouseGrossAmount:'40',warehouseValuationParts:[{source:'receipt',qty:4,grossValueCents:'4000',expenseValueCents:'4000',sourceGrossValueCents:'10000',sourceExpenseValueCents:'10000',expenseValuationStatus:'verified'}]};
 const data={deals:[deal],realizations:[realization],expenses:[expense],warehouse:{moves:[receipt,move]},fifo:{byMove:{'sale-move':{amount:40,parts:[part]}}},wipAccounting:true};
 return {deal,key,data,move,realization,expense};
}

test('partial stock sale recognizes exact shipped FIFO cost in all management reports',()=>{
 const {deal,key,data}=fixture();
 const wip=core.projectWipSnapshot(data,deal,key,'2026-10');
 assert.equal(wip.status,'calculated');
 assert.equal(wip.accruedCost,4000n);assert.equal(wip.recognizedCost,4000n);assert.equal(wip.wip,0n);
 assert.equal(wip.operatingProfit,16000n);
 const bridge=core.wipPeriodBridge(data,'2026-10');assert.equal(bridge.recognizedCost,4000n);assert.equal(bridge.deferredChange,0n);
 const pnl=core.preliminaryPeriod(data,'2026-10');assert.equal(pnl.direct,4000n);assert.equal(pnl.result,16000n);
 const owner=core.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'});assert.equal(owner.result,16000n);
 assert.equal(core.projectSnapshot(data,deal,key).result,16000n);
});

test('sale cost remains in shipment period without being deferred or duplicated at later realizations',()=>{
 const {deal,key,data}=fixture();
 data.realizations.push({_id:'service',org:'A',projectKey:key,date:'2026-11-02',amount:'800',vatRate:0});
 assert.equal(core.preliminaryPeriod(data,'2026-09').direct,0n);
 assert.equal(core.preliminaryPeriod(data,'2026-10').direct,4000n);
 assert.equal(core.preliminaryPeriod(data,'2026-11').direct,0n);
 assert.equal(core.projectWipSnapshot(data,deal,key,'2026-11').recognizedCost,4000n);
 assert.equal(core.ownerPeriodSnapshot(data,{from:'2026-10-06',to:'2026-11-30'}).result,80000n);
});

test('mixed sale and ordinary project costs require a service WIP basis until combined closeout',()=>{
 const {deal,key,data}=fixture();
 data.expenses.push({_id:'service-cost',org:'A',projectKey:key,date:'2026-09-20',amount:'100',vatRate:0});
 const before=core.projectWipSnapshot(data,deal,key,'2026-09');assert.equal(before.status,'calculated');assert.equal(before.wip,10000n);
 const partial=core.projectWipSnapshot(data,deal,key,'2026-10');assert.equal(partial.status,'requires-review');assert.ok(partial.issues.includes('mixed-sale-service-wip-basis-unassigned'));
 assert.equal(core.preliminaryPeriod(data,'2026-10').status,'requires-review');
 assert.equal(core.preliminaryPeriod(data,'2026-10').confirmedResult,null);
 assert.ok(core.projectSnapshot(data,deal,key).issues.includes('mixed-sale-service-wip-basis-unassigned'));
 assert.equal(core.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'}).confirmedResult,null);
 assert.ok(core.directionSnapshot(data,'Service','2026-10').issues.some(x=>x.code==='wip-unverified-project'));
 assert.ok(core.directionReconciliation(data,'2026-10').issues.some(x=>x.code==='wip-unverified-project'));
 data.realizations.push({_id:'service',org:'A',projectKey:key,date:'2026-11-02',amount:'800',vatRate:0});
 const full=core.projectWipSnapshot(data,deal,key,'2026-11');assert.equal(full.status,'calculated');assert.equal(full.recognizedCost,14000n);assert.equal(full.wip,0n);
});

test('calendar shipment date matches ISO movement and expense timestamps',()=>{
 const {data,move,expense}=fixture();move.date='2026-10-05T10:15:00.000Z';expense.date=move.date;
 const result=core.preliminaryPeriod(data,'2026-10');assert.equal(result.status,'calculated');assert.equal(result.result,16000n);
});

test('an invalid future sale cannot mark an earlier closed period as uncertain',()=>{
 const {data,move,expense,realization}=fixture();
 move.date='2026-11-05';expense.date='2026-11-05';realization.date='2026-11-05';realization.warehouseMoveIds=[];
 const result=core.preliminaryPeriod(data,'2026-10');assert.equal(result.status,'calculated');assert.equal(result.confirmedResult,0n);assert.deepEqual(result.issues,[]);
 const owner=core.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'});assert.equal(owner.status,'calculated');assert.equal(owner.confirmedResult,0n);
});

test('multi-line shipment cost is exact and one damaged line quarantines the entire sale',()=>{
 const {data,move,expense,realization}=fixture();
 const secondMove={...move,id:'sale-second',qty:1};
 const secondExpense={...expense,_id:'warehouse-consume-sale-second',warehouseMoveId:'sale-second',amount:'10',amountGross:'10',amountNet:'10',warehouseGrossAmount:'10',warehouseValuationParts:[{...expense.warehouseValuationParts[0],qty:1,grossValueCents:'1000',expenseValueCents:'1000'}]};
 data.warehouse.moves.push(secondMove);data.expenses.push(secondExpense);realization.warehouseMoveIds.push('sale-second');
 data.fifo.byMove['sale-second']={amount:10,parts:[{...data.fifo.byMove['sale-move'].parts[0],qty:1,valueCents:'1000',expenseValueCents:'1000'}]};
 assert.equal(core.preliminaryPeriod(data,'2026-10').direct,5000n);assert.equal(core.preliminaryPeriod(data,'2026-10').result,15000n);
 secondExpense.amount='9';
 const result=core.preliminaryPeriod(data,'2026-10');assert.equal(result.direct,0n);assert.equal(result.revenue,0n);assert.equal(result.confirmedResult,null);
 assert.equal(core.warehouseSaleAudit(data).invalidExpenses.length,2);
});

test('invalid sale quarantine retains ordinary project costs and legacy realization documents',()=>{
 const {data,key,expense}=fixture();expense.amount='39';
 data.expenses.push({_id:'ordinary',org:'A',projectKey:key,date:'2026-10-05',amount:'100',vatRate:0});
 data.realizations.push({_id:'ordinary-income',org:'A',projectKey:key,date:'2026-10-05',amount:'300',vatRate:0});
 const result=core.preliminaryPeriod(data,'2026-10');assert.equal(result.revenue,30000n);assert.equal(result.direct,10000n);assert.equal(result.confirmedResult,null);
});

const invalidCases={
 'missing realization':x=>{x.data.realizations=[]},
 'missing movement':x=>{x.data.warehouse.moves.pop()},
 'missing expense':x=>{x.data.expenses=[]},
 'duplicate expense':x=>{x.data.expenses.push({...x.expense,_id:'duplicate'})},
 'foreign expense':x=>{x.expense.projectKey='other'},
 'foreign organization':x=>{x.move.org='B'},
 'foreign realization':x=>{x.realization.projectKey='other'},
 'date mismatch':x=>{x.realization.date='2026-11-01'},
 'document mismatch':x=>{x.move.documentId='other'},
 'move set mismatch':x=>{x.realization.warehouseMoveIds=['sale-move','absent']},
 'duplicate movement':x=>{x.data.warehouse.moves.push({...x.move})},
 'duplicate realization':x=>{x.data.realizations.push({...x.realization})},
 'duplicate deal identity':x=>{x.data.deals.push({...x.deal,name:'Other project',order1c:'other'})},
 'double claimed movement':x=>{x.data.realizations.push({...x.realization,_id:'other-sale'})},
 'sale flag alone':x=>{delete x.move.saleRealizationId},
 'expense flag alone':x=>{delete x.expense.saleRealizationId},
 'malformed sale flag':x=>{x.realization.warehouseSale='true'},
 'negative realization':x=>{x.realization.amount='-200'},
 'over contract':x=>{x.realization.amount='1200'},
 'tampered FIFO expense':x=>{x.expense.amount='39'},
 'missing FIFO':x=>{delete x.data.fifo},
 'wrong quantity':x=>{x.move.qty=5},
 'foreign FIFO lot':x=>{x.data.warehouse.moves[0].org='B'},
 'ordinary movement with sale link':x=>{x.move.stockPurpose='project'},
 'unknown purpose':x=>{x.move.stockPurpose='mystery'}
};
for(const [name,change] of Object.entries(invalidCases))test('quarantines sale graph with '+name,()=>{
 const x=fixture();change(x);
 const audit=core.warehouseSaleAudit(x.data);assert.ok(audit.issues.length);
 assert.equal(audit.validRealizations.length,0);assert.equal(audit.validExpenses.length,0);
 const ledger=core.expenseLedger(x.data);assert.equal(ledger.rows.reduce((n,r)=>n+r.amount,0n),0n);assert.ok(ledger.issues.length);
 const period=core.preliminaryPeriod(x.data,'2026-10');assert.equal(period.revenue,0n);assert.equal(period.direct,0n);assert.equal(period.status,'requires-review');
});
