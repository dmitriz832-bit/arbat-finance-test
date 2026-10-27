const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core');
const AIR='АИР-КЛИМАТ',ARBAT='АРБАТ.ГК';
const income=(date,amount,extra={})=>({org:AIR,date,type:'in',amount,usnTaxable:true,...extra});
const paid=(date,amount,extra={})=>({org:AIR,date,type:'out',amount,articleId:'supplier',usnDeductible:true,usnRecognitionDate:date,usnDocument:'Акт / УПД проверен бухгалтером',...extra});
const sale=(date,amount,extra={})=>({org:ARBAT,date,amountGross:amount,vatRate:22,...extra});
const expense=(date,amount,extra={})=>({org:ARBAT,date,amountGross:amount,vatRate:22,vatDeductible:true,vatDeductionDate:date,vatInvoice:'УПД 1',profitTaxDeductible:true,profitTaxRecognitionDate:date,profitTaxDocument:'Регистр признания расходов',...extra});

test('USN uses year-to-date income and expenses, but VAT stays within the quarter',()=>{
 const x=f.quarterTaxSnapshot({cash:[income('2026-02-01','100000'),paid('2026-05-01','40000'),income('2026-11-01','20000'),income('2025-12-01','900000')],realizations:[sale('2026-02-01','12200'),sale('2026-11-01','24400')]},'2026-11-01');
 assert.equal(x.air.income,12000000n);assert.equal(x.air.expenses,4000000n);assert.equal(x.air.accrued,1200000n);
 assert.equal(x.arbat.outputVat,440000n);assert.equal(x.arbat.profitRevenue,3000000n);assert.equal(x.arbat.profitTax,750000n);
 assert.deepEqual(x.yearBounds,{from:'2026-01-01',to:'2026-12-31'});
});
test('a supplier advance with a DDS article alone is not an accepted USN expense',()=>{
 const x=f.quarterTaxSnapshot({cash:[income('2026-10-01','100000'),{org:AIR,date:'2026-10-02',type:'out',articleId:'supplier',amount:'80000'}]},'2026-10-01');
 assert.equal(x.air.expenses,0n);assert.equal(x.air.unclassified,1);assert.ok(x.issues.some(x=>x.code==='usn-expense-unconfirmed'));
 assert.equal(x.air.ready,false);
});
test('USN recognition follows delivery/recognition date, including a payment from the preceding year',()=>{
 const data={cash:[paid('2025-12-20','10000',{usnRecognitionDate:'2026-04-01'}),paid('2026-02-01','6000',{usnRecognitionDate:'2026-07-01',usnRecognizedAmount:'2000'})]};
 assert.equal(f.quarterTaxSnapshot(data,'2026-02-01').air.expenses,0n);
 assert.equal(f.quarterTaxSnapshot(data,'2026-05-01').air.expenses,1000000n);
 assert.equal(f.quarterTaxSnapshot(data,'2026-08-01').air.expenses,1200000n);
});
test('USN does not accept recognition before payment or an amount exceeding the payment',()=>{
 for(const extra of [{usnRecognitionDate:'2026-01-01'},{usnRecognizedAmount:'10001'},{usnDocument:''},{usnRecognitionDate:'2026-02-30'}]){
  const x=f.quarterTaxSnapshot({cash:[paid('2026-02-01','10000',extra)]},'2026-10-01');assert.equal(x.air.expenses,0n);assert.equal(x.air.ready,false);
 }
});
test('annual minimum USN is not charged quarterly and is computed once at year end',()=>{
 const data={cash:[income('2026-01-01','100000'),paid('2026-02-01','99000')]};
 const q=f.quarterTaxSnapshot(data,'2026-03-01'),year=f.quarterTaxSnapshot(data,'2026-12-01');
 assert.equal(q.air.accrued,15000n);assert.equal(q.air.minimumApplicable,false);
 assert.equal(year.air.regularTax,15000n);assert.equal(year.air.minimumTax,100000n);assert.equal(year.air.accrued,100000n);assert.equal(year.air.minimumApplicable,true);
});
test('USN minimum survives an annual loss and internal transfers never enter its base',()=>{
 const x=f.quarterTaxSnapshot({cash:[income('2026-01-01','100000'),paid('2026-02-01','120000'),{org:AIR,date:'2026-03-01',type:'transfer',amount:'10000000'}]},'2026-12-01');
 assert.equal(x.air.base,0n);assert.equal(x.air.minimumTax,100000n);assert.equal(x.air.accrued,100000n);
});
test('serialized exclusion flags need an explicit reason; a wallet never excludes income',()=>{
 const x=f.quarterTaxSnapshot({cash:[income('2026-01-01','100',{usnTaxable:'false',taxExclusionReason:'Возврат основного долга по договору займа'}),income('2026-01-02','200',{usnTaxable:false}),income('2026-01-03','300',{walletId:'0000'})]},'2026-03-01');
 assert.equal(x.air.income,50000n);assert.ok(x.issues.some(x=>x.code==='tax-exclusion-without-reason'));
});
test('invalid document VAT cannot crash the tax panel or silently enter a deduction',()=>{
 for(const row of [expense('2026-10-01','1220',{vatRate:18}),expense('2026-10-01','1220',{vatAmount:'219'}),expense('2026-10-01','wrong')]){
  const x=f.quarterTaxSnapshot({expenses:[row]},'2026-10-01');assert.equal(x.arbat.inputVat,0n);assert.equal(x.arbat.vatReady,false);
 }
});
test('VAT deduction requires invoice evidence and a recognition date rather than the P&L checkbox alone',()=>{
 const x=f.quarterTaxSnapshot({expenses:[expense('2026-02-01','1220',{vatInvoice:''}),expense('2026-02-02','2440',{vatDeductionDate:'2026-04-01'})]},'2026-02-01');
 assert.equal(x.arbat.inputVat,0n);assert.ok(x.issues.some(x=>x.code==='vat-deduction-unconfirmed'));
 assert.equal(f.quarterTaxSnapshot({expenses:[expense('2026-02-02','2440',{vatDeductionDate:'2026-04-01'})]},'2026-04-01').arbat.inputVat,44000n);
});
test('missing VAT is not inferred from organization for taxable profit revenue',()=>{
 const x=f.quarterTaxSnapshot({realizations:[sale('2026-10-01','122000',{vatRate:undefined})]},'2026-10-01');
 assert.equal(x.arbat.profitRevenue,0n);assert.equal(x.arbat.profitReady,false);assert.equal(x.arbat.vatReady,false);
});
test('project costs and payroll cannot automatically bypass tax WIP recognition',()=>{
 const x=f.quarterTaxSnapshot({realizations:[sale('2026-10-01','122000')],expenses:[{org:ARBAT,date:'2026-09-01',amount:'50000',vatRate:0}],labor:[{org:ARBAT,date:'2026-09-30',amount:'10000',employerContributions:'3000'}]},'2026-10-01');
 assert.equal(x.arbat.profitExpenses,0n);assert.equal(x.arbat.profitReady,false);assert.ok(x.issues.some(x=>x.code==='profit-expense-unconfirmed'));
});
test('explicit profit recognition includes only the accepted amount on its tax date',()=>{
 const data={expenses:[expense('2025-12-01','12200',{profitTaxRecognitionDate:'2026-04-01',profitTaxRecognizedAmount:'4000'})]};
 assert.equal(f.quarterTaxSnapshot(data,'2026-01-01').arbat.profitExpenses,0n);
 assert.equal(f.quarterTaxSnapshot(data,'2026-04-01').arbat.profitExpenses,400000n);
});
test('warehouse receipt VAT enters exactly once and warehouse consumption is never another VAT invoice',()=>{
 const warehouse={moves:[{id:'r1',kind:'receipt',org:ARBAT,date:'2026-10-01',qty:2,price:610,vatRate:22,vatDeductible:true,vatDeductionDate:'2026-10-01',vatInvoice:'УПД 1'}]};
 const x=f.quarterTaxSnapshot({warehouse,expenses:[expense('2026-10-02','1220',{warehouseMoveId:'consume1'})]},'2026-10-01');
 assert.equal(x.arbat.inputVat,22000n);
 const missing=f.quarterTaxSnapshot({warehouse:{moves:[{id:'r1',kind:'receipt',org:ARBAT,date:'2026-10-01',qty:2,price:610}]}},'2026-10-01');
 assert.equal(missing.arbat.vatReady,false);assert.ok(missing.issues.some(x=>x.collection==='warehouse'));
});
test('unprocessed ARBAT receipts expose the advance VAT gap and never produce a confident total',()=>{
 const x=f.quarterTaxSnapshot({cash:[{org:ARBAT,type:'in',date:'2026-10-01',amount:'12200',projectKey:'test'}]},'2026-10-01');
 assert.equal(x.arbat.vatReady,false);assert.ok(x.issues.some(x=>x.code==='vat-cash-review'));
});
test('AIR threshold counts cash income and advances and starts VAT next month after strictly exceeding limit',()=>{
 const data={cash:[income('2026-01-01','19999999'),income('2026-10-24','1',{walletId:'cash'}),income('2026-10-25','0.01',{walletId:'cash'})]};
 const equal=f.quarterTaxSnapshot({...data,cash:data.cash.slice(0,2)},'2026-10-25');assert.equal(equal.air.vatThreshold.exceededOn,null);
 const x=f.quarterTaxSnapshot(data,'2026-10-25');assert.equal(x.air.vatThreshold.exceededOn,'2026-10-25');assert.equal(x.air.vatThreshold.effectiveFrom,'2026-11-01');
});
test('previous-year income and changing 2027 threshold are checked independently of the current quarter',()=>{
 const a=f.quarterTaxSnapshot({cash:[income('2025-01-01','20000000.01')]},'2026-03-01');assert.equal(a.air.vatThreshold.effectiveFrom,'2026-01-01');
 const b=f.quarterTaxSnapshot({cash:[income('2026-01-01','16000000')]},'2027-03-01');assert.equal(b.air.vatThreshold.effectiveFrom,null);assert.equal(b.air.vatThreshold.limit,2000000000n);
 const c=f.quarterTaxSnapshot({cash:[income('2029-01-01','16000000')]},'2030-03-01');assert.equal(c.air.vatThreshold.effectiveFrom,'2030-01-01');assert.equal(c.air.vatThreshold.limit,1500000000n);
});
test('future income is not used to declare that the AIR VAT threshold has already been crossed',()=>{
 const x=f.quarterTaxSnapshot({cash:[income('2026-12-01','21000000')]},'2026-10-24');assert.equal(x.air.vatThreshold.exceededOn,null);assert.equal(x.air.vatThreshold.observedIncome,0n);
});
test('all tax computations are read-only, handle malformed dates and keep organizations isolated',()=>{
 const data={cash:[income('2026-10-01','1000'),income('2026-02-30','500'),income('2026-10-01','900000',{org:'Общий'})],realizations:[sale('2026-10-01','1220')]};
 const before=JSON.stringify(data),x=f.quarterTaxSnapshot(data,'2026-10-24');assert.equal(JSON.stringify(data),before);assert.equal(x.air.income,100000n);assert.equal(x.arbat.profitRevenue,100000n);assert.ok(x.issues.some(x=>x.code==='invalid-tax-date'));
});
test('missing cash and payroll amounts cannot be silently treated as valid zero',()=>{
 for(const value of [undefined,null,'','  ']){
  const x=f.quarterTaxSnapshot({cash:[income('2026-10-01',value)],labor:[{org:ARBAT,date:'2026-10-01',amount:value,profitTaxDeductible:true,profitTaxRecognitionDate:'2026-10-01',profitTaxDocument:'Регистр'}]},'2026-10-01');
  assert.equal(x.air.ready,false);assert.equal(x.arbat.profitReady,false);assert.ok(x.issues.some(x=>x.code==='invalid-tax-amount'));
 }
});
test('unknown VAT recoverability cannot silently increase profit expenses to their gross amount',()=>{
 const x=f.quarterTaxSnapshot({expenses:[expense('2026-08-01','122000',{vatDeductible:undefined})]},'2026-10-01');
 assert.equal(x.arbat.profitExpenses,0n);assert.equal(x.arbat.profitReady,false);
});
test('approved work acts remain visible for tax reconciliation without being deducted twice',()=>{
 const x=f.quarterTaxSnapshot({workActs:[{_id:'work1',org:ARBAT,status:'approved',date:'2026-10-01',qty:1,rate:100000}]},'2026-10-01');
 assert.equal(x.arbat.profitExpenses,0n);assert.equal(x.arbat.profitReady,false);assert.ok(x.issues.some(x=>x.collection==='workActs'));
});
test('OSNO outgoing VAT at special USN rates cannot be displayed as confirmed',()=>{
 for(const rate of [5,7]){const x=f.quarterTaxSnapshot({realizations:[sale('2026-10-01','10500',{vatRate:rate})]},'2026-10-01');assert.equal(x.arbat.vatReady,false);assert.equal(x.arbat.profitReady,false);}
});
