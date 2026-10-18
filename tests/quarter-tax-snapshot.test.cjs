const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');

test('quarter tax snapshot separates AIR USN 15% and ARBAT VAT 22%',()=>{
 const data={
  cash:[
   {org:'АИР-КЛИМАТ',date:'2026-10-02',type:'in',articleId:'sales',amount:'100000'},
   {org:'АИР-КЛИМАТ',date:'2026-11-02',type:'out',articleId:'materials',amount:'40000'},
   {org:'АИР-КЛИМАТ',date:'2026-12-02',type:'transfer',amount:'500000'},
   {org:'АИР-КЛИМАТ',date:'2027-01-02',type:'in',articleId:'sales',amount:'900000'}
  ],
  realizations:[{org:'АРБАТ.ГК',date:'2026-10-10',amountGross:'122000',vatRate:22}],
  expenses:[{org:'АРБАТ.ГК',date:'2026-11-10',amountGross:'24400',vatRate:22,vatDeductible:true}],
  costs:[{org:'АРБАТ.ГК',date:'2026-12-10',amountGross:'12200',vatRate:22,vatDeductible:false}]
 };
 const x=f.quarterTaxSnapshot(data,'2026-10-18');
 assert.equal(x.bounds.from,'2026-10-01');assert.equal(x.bounds.to,'2026-12-31');
 assert.equal(f.rubles(x.air.income),'100000.00');assert.equal(f.rubles(x.air.expenses),'40000.00');assert.equal(f.rubles(x.air.accrued),'9000.00');
 assert.equal(f.rubles(x.arbat.outputVat),'22000.00');assert.equal(f.rubles(x.arbat.inputVat),'4400.00');assert.equal(f.rubles(x.arbat.payable),'17600.00');
});

test('unconfirmed VAT and unclassified USN expenses stay visible instead of becoming deductions',()=>{
 const x=f.quarterTaxSnapshot({
  cash:[{org:'АИР-КЛИМАТ',date:'2026-10-02',type:'out',amount:'100'}],
  realizations:[{org:'АРБАТ.ГК',date:'2026-10-10',amount:'122000'}],
  expenses:[{org:'АРБАТ.ГК',date:'2026-10-11',amount:'24400',vatDeductible:true}]
 },'2026-10-18');
 assert.equal(x.air.unclassified,1);assert.equal(f.rubles(x.air.expenses),'0.00');
 assert.equal(x.arbat.unconfirmed,2);assert.equal(f.rubles(x.arbat.payable),'0.00');
});

