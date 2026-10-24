const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../app/finance-core.js');
const base={cash:[{_id:'payment-1',org:'АИР-КЛИМАТ',date:'2026-01-10',type:'out',amount:1000,usnDeductible:true,usnRecognitionDate:'2026-01-10',usnRecognizedAmount:1000,usnDocument:'legacy'}]};
const calculate=(row,reference='2026-10-24')=>core.quarterTaxSnapshot({...base,cash:[row]},reference);
const payment=(events)=>({...base.cash[0],usnRecognitionEvents:events});
test('two distinct tax-recognition events from one expense do not double count legacy fields',()=>{
 const snapshot=calculate(payment([{id:'a',date:'2026-02-10',amount:300,document:'УПД 1'},{id:'b',date:'2026-09-12',amount:500,document:'УПД 2'}]));
 assert.equal(snapshot.air.expenses,80000n);
 assert.equal(snapshot.rows.filter(r=>r.scope==='usn').length,2);
});
test('recognition follows tax date, not payment quarter',()=>{
 const row=payment([{id:'a',date:'2026-02-10',amount:300,document:'УПД 1'},{id:'b',date:'2026-10-12',amount:500,document:'УПД 2'}]);
 assert.equal(calculate(row,'2026-03-25').air.expenses,30000n);
 assert.equal(calculate(row,'2026-10-24').air.expenses,80000n);
});
test('duplicate event identifiers and over-recognition cannot enter tax calculation',()=>{
 for(const events of [
  [{id:'a',date:'2026-02-10',amount:600,document:'УПД'},{id:'a',date:'2026-03-10',amount:300,document:'УПД'}],
  [{id:'a',date:'2026-02-10',amount:600,document:'УПД'},{id:'b',date:'2026-03-10',amount:500,document:'УПД'}],
  [{id:'a',date:'2026-01-01',amount:100,document:'УПД'}],
  [{id:'a',date:'2026-02-01',amount:-100,document:'УПД'}]
 ]){const x=calculate(payment(events));assert.equal(x.air.expenses,0n);assert.ok(x.issues.some(i=>i.code==='usn-expense-unconfirmed'))}
});
test('old single-event recognition remains unchanged',()=>{
 const x=calculate(base.cash[0]);assert.equal(x.air.expenses,100000n);assert.equal(x.rows.filter(r=>r.scope==='usn').length,1);
});

test('profit-tax partial recognition uses two events and excludes legacy recognized amount',()=>{
 const expense={_id:'arbat-expense',org:'АРБАТ.ГК',date:'2026-01-10',amount:1220,vatRate:22,vatDeductible:true,profitTaxDeductible:true,profitTaxRecognitionDate:'2026-01-10',profitTaxRecognizedAmount:1000,profitTaxDocument:'legacy',
 profitTaxRecognitionEvents:[{id:'a',date:'2026-02-01',amount:300,document:'Акт 1'},{id:'b',date:'2026-09-01',amount:500,document:'Акт 2'}]};
 const x=core.quarterTaxSnapshot({expenses:[expense]},'2026-10-24');
 assert.equal(x.arbat.profitExpenses,80000n);
 assert.equal(x.rows.filter(r=>r.scope==='profit').length,2);
 const invalid=core.quarterTaxSnapshot({expenses:[{...expense,profitTaxRecognitionEvents:[{id:'a',date:'2026-02-01',amount:1100,document:'Акт'}]}]},'2026-10-24');
 assert.equal(invalid.arbat.profitExpenses,0n);
 assert.ok(invalid.issues.some(i=>i.code==='profit-expense-unconfirmed'));
});
