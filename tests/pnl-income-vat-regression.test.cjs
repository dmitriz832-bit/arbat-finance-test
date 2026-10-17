const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('other income with VAT is always recognized net; deduction flag is irrelevant',()=>{
  for(const deductible of [false,true]){
    const data={costs:[{org:'A',date:'2026-10-18',name:'Прочие доходы',amount:'1220',vatRate:22,amountGross:'1220',vatAmount:'220',amountNet:'1000',vatDeductible:deductible,pnlType:'income',pnlLevel:'below',dir:'Вентиляция'}]};
    const period=f.preliminaryPeriod(data,'2026-10','A');
    assert.equal(f.rubles(period.belowIncome),'1000.00');assert.equal(f.rubles(period.ebitda),'0.00');assert.equal(f.rubles(period.result),'1000.00');
    const recon=f.directionReconciliation(data,'2026-10','A');
    assert.equal(f.rubles(recon.directionResult),'1000.00');assert.equal(f.rubles(recon.difference),'0.00');assert.ok(recon.balanced);
  }
});
test('negative other-income correction reverses result without altering EBITDA',()=>{
 const data={costs:[{org:'A',date:'2026-10-18',amount:'-1220',vatRate:22,vatDeductible:false,pnlType:'income',pnlLevel:'below'}]};
 const x=f.preliminaryPeriod(data,'2026-10','A'),r=f.directionReconciliation(data,'2026-10','A');
 assert.equal(f.rubles(x.result),'-1000.00');assert.equal(f.rubles(x.ebitda),'0.00');assert.equal(f.rubles(r.unallocatedIncome),'-1000.00');assert.equal(r.difference,0n);
});
