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
