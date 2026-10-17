const test=require('node:test'),assert=require('node:assert/strict');
const f=require('../app/finance-core.js');
test('all approved document VAT rates reconcile gross, tax and net to one kopeck',()=>{
  for(const rate of [0,5,7,10,20,22]){
    const r=f.documentVat('123456.79',rate,true);
    assert.equal(r.amountNet+r.vatAmount,r.amountGross);
    assert.equal(r.vatRate,rate);assert.equal(r.vatDeductible,true);
    const negative=f.documentVat('-123456.79',rate);
    assert.equal(negative.amountGross,-r.amountGross);
    assert.equal(negative.vatAmount,-r.vatAmount);
    assert.equal(negative.amountNet,-r.amountNet);
  }
});
test('explicit VAT 22% exact specification sample',()=>{
 const r=f.documentVat('122000',22);
 assert.equal(f.rubles(r.vatAmount),'22000.00');
 assert.equal(f.rubles(r.amountNet),'100000.00');
 assert.equal(f.rubles(f.documentVat('73200',22).amountNet),'60000.00');
});
test('rejects unsupported VAT rate instead of inferring from company',()=>{
 assert.throws(()=>f.documentVat('100',null),RangeError);
 assert.throws(()=>f.documentVat('100',18),RangeError);
 assert.throws(()=>f.documentVat('100',-1),RangeError);
});
