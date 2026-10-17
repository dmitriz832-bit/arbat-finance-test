const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('explicit VAT changes net recognized revenue and only deductible expenses',()=>{
 const deal={org:'AIR',order1c:'vat-1',dir:'Ventilation'},key=f.dealKey(deal);
 const data={deals:[deal],realizations:[{projectKey:key,org:'AIR',date:'2026-10-01',amountGross:'122000',vatRate:22,vatAmount:'22000',amountNet:'100000'}],expenses:[{projectKey:key,org:'AIR',date:'2026-10-01',amountGross:'24400',vatRate:22,vatAmount:'4400',amountNet:'20000',vatDeductible:true},{projectKey:key,org:'AIR',date:'2026-10-01',amountGross:'12200',vatRate:22,vatDeductible:false}]};
 const project=f.projectSnapshot(data,deal,key),report=f.preliminaryPeriod(data,'2026-10','AIR'),direction=f.directionSnapshot(data,'Ventilation','2026-10','AIR');
 assert.equal(f.rubles(project.revenue),'100000.00');assert.equal(f.rubles(project.cost),'32200.00');
 assert.equal(project.result,report.result);assert.equal(project.result,direction.result);
 assert.equal(f.rubles(project.result),'67800.00');
});
test('historical documents without VAT metadata remain unchanged',()=>{
 assert.equal(f.rubles(f.documentPnlAmount({amount:'12200',org:'AIR'})),'12200.00');
 assert.equal(f.rubles(f.documentPnlAmount({amount:'12200',org:'АРБАТ.ГК'})),'10000.00');
 assert.equal(f.rubles(f.documentPnlAmount({amount:'12200',org:'АРБАТ.ГК'},true)),'12200.00');
});
test('document VAT inconsistencies are rejected rather than silently adjusted',()=>{
 assert.throws(()=>f.documentPnlAmount({amountGross:'122',vatRate:22,vatAmount:'21'}),/mismatch/);
 assert.throws(()=>f.documentPnlAmount({amountGross:'122',vatRate:22,amountNet:'101'}),/mismatch/);
 assert.throws(()=>f.documentPnlAmount({amountGross:'122',amountNet:'100'}),/Incomplete/);
});

test('standalone project expense aggregation follows shared VAT deduction rules',()=>{
 const expenses=[{amountGross:'1220',vatRate:22,vatDeductible:true},{amountGross:'1220',vatRate:22,vatDeductible:false}];
 assert.equal(f.rubles(f.projectExpenseTotal(expenses,[])),'2220.00');
});

test('form-serialized VAT deductibility is respected',()=>{
 const deductible={amountGross:'1220',vatRate:'22',vatDeductible:'true'};
 const nonDeductible={...deductible,vatDeductible:'false'};
 assert.equal(f.rubles(f.documentPnlAmount(deductible,true)),'1000.00');
 assert.equal(f.rubles(f.documentPnlAmount(nonDeductible,true)),'1220.00');
});

test('historical and explicit VAT documents reconcile side by side without mutation',()=>{
 const deal={org:'АРБАТ.ГК',order1c:'history-1',dir:'Ventilation'},key=f.dealKey(deal);
 const legacySale={projectKey:key,org:deal.org,date:'2026-10-01',amount:'12200'};
 const explicitSale={projectKey:key,org:deal.org,date:'2026-10-02',amount:'10600',amountGross:'10600',vatRate:'5',vatAmount:'504.76',amountNet:'10095.24',vatRateSource:'document-explicit'};
 const legacyExpense={projectKey:key,org:deal.org,date:'2026-10-01',amount:'1000'};
 const deductibleExpense={projectKey:key,org:deal.org,date:'2026-10-02',amountGross:'1220',vatRate:'22',vatDeductible:'true',amountNet:'1000',vatAmount:'220'};
 const state={deals:[deal],realizations:[legacySale,explicitSale],expenses:[legacyExpense,deductibleExpense]};
 const before=JSON.stringify(state);
 const project=f.projectSnapshot(state,deal,key),pnl=f.preliminaryPeriod(state,'2026-10',deal.org),direction=f.directionSnapshot(state,'Ventilation','2026-10',deal.org);
 assert.equal(f.rubles(project.revenue),'20095.24');
 assert.equal(f.rubles(project.cost),'2000.00');
 assert.equal(f.rubles(project.result),'18095.24');
 assert.equal(project.result,pnl.result);assert.equal(project.result,direction.result);
 assert.equal(JSON.stringify(state),before,'financial reports must not rewrite historical VAT or amounts');
 assert.equal(f.rubles(f.documentPnlAmount(legacySale)),'10000.00');
 assert.equal(f.rubles(f.documentPnlAmount(explicitSale)),'10095.24');
});
test('explicit document VAT stays fixed when organization changes',()=>{
 const row={org:'АРБАТ.ГК',amountGross:'10500',vatRate:'5',vatAmount:'500',amountNet:'10000'};
 assert.equal(f.rubles(f.documentPnlAmount(row)),'10000.00');
 assert.equal(f.documentPnlAmount({...row,org:'АИР-КЛИМАТ'}),f.documentPnlAmount(row));
});
