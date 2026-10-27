const test = require('node:test');
const a = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('../app/finance-core.js');
const registers = require('../app/tax-register-model.js');
const workspace = require('../app/tax-workspace.js');
const pnl = require('../app/tax-pnl-model.js');
const oracle = JSON.parse(execFileSync('python3', [path.join(__dirname, 'helpers/all-operations-tax-oracle.py')], {encoding:'utf8'}));
const AIR='АИР-КЛИМАТ', ARBAT='АРБАТ.ГК';
const policy = (date, threshold, id=date) => ({_id:id,orgId:'air-climat',org:AIR,effectiveDate:date,threshold,reason:'Сценарий управленческой политики',createdBy:'offline-audit',createdAt:'2026-10-27T00:00:00Z'});

test('standalone Decimal controls cover all explicit VAT rates and signed kopeck rounding', () => {
  for (const e of oracle.vatCases) {
    const r=core.documentVat(e.gross,e.rate);
    a.equal(r.vatAmount,BigInt(e.vat),JSON.stringify(e));
    a.equal(r.amountNet,BigInt(e.net),JSON.stringify(e));
    a.equal(r.amountGross,r.amountNet+r.vatAmount);
  }
});

test('explicit VAT produces net revenue, net deductible expenses and gross non-deductible expenses', () => {
  for(const e of oracle.vatCases){
    const net=BigInt(e.net),gross=net+BigInt(e.vat),doc={org:ARBAT,amount:e.gross,vatRate:e.rate};
    a.equal(core.documentPnlAmount(doc),net);
    a.equal(core.documentPnlAmount({...doc,vatDeductible:true},true),net);
    a.equal(core.documentPnlAmount({...doc,vatDeductible:false},true),gross);
    a.equal(core.documentPnlAmount({...doc,vatDeductible:'false'},true),gross);
  }
});

test('AIR special-rate policy does not create ordinary supplier input VAT deductions', () => {
  const doc={_id:'purchase',org:AIR,date:'2026-01-01',amount:'122',vatRate:22,vatDeductible:true,vatInvoice:'УПД',vatDeductionDate:'2026-01-01'};
  const r=core.quarterTaxSnapshot({expenses:[doc]},'2026-03-31');
  a.equal(r.air.inputVat,0n);a.equal(r.arbat.inputVat,0n);
});

test('AIR income-type general entries include explicit output VAT in core and monthly workspace', () => {
  const data={costs:[{_id:'income',org:AIR,date:'2026-04-01',amount:'105',pnlType:'income',vatRate:5},
                     {_id:'correction',org:AIR,date:'2026-05-01',amount:'-21',pnlType:'income',vatRate:5}]};
  const r=core.quarterTaxSnapshot(data,'2026-06-30');
  a.equal(r.air.outputVat,400n,'5.00 output minus 1.00 output correction');
  a.equal(r.air.income,0n,'accrual income is not a USN cash receipt');
  const w=workspace.snapshot(data,{org:AIR,reference:'2026-06-30'});
  a.equal(w.vat[0].output,400n);
  a.deepEqual(w.vat[0].months.map(x=>x.output),[500n,-100n,0n]);
});

test('VAT document, deduction and profit recognition dates retain different quarters', () => {
  const data={realizations:[{_id:'s',org:ARBAT,date:'2026-03-31',amount:'122',vatRate:22}],expenses:[
    {_id:'e',org:ARBAT,date:'2026-03-31',amount:'61',vatRate:22,vatDeductible:true,vatInvoice:'УПД',vatDeductionDate:'2026-04-01',profitTaxDeductible:true,profitTaxRecognitionDate:'2026-04-01',profitTaxDocument:'Продажа материалов'}]};
  const q1=core.quarterTaxSnapshot(data,'2026-03-31'),q2=core.quarterTaxSnapshot(data,'2026-06-30');
  a.equal(q1.arbat.outputVat,2200n);a.equal(q1.arbat.inputVat,0n);a.equal(q1.arbat.profitTax,2500n);
  a.equal(q2.arbat.outputVat,0n);a.equal(q2.arbat.inputVat,1100n);a.equal(q2.arbat.profitRevenue,10000n);a.equal(q2.arbat.profitExpenses,5000n);a.equal(q2.arbat.profitTax,1250n);
});

test('USN 15% uses cash income and documented paid expense recognition independently of accrual', () => {
  const data={cash:[{_id:'in',org:AIR,type:'in',date:'2026-03-31',amount:'105',usnTaxable:true,usnVatAmount:'5',usnVatDocument:'НДС в платеже'},
    {_id:'out',org:AIR,type:'out',date:'2026-03-31',amount:'70',usnDeductible:true,usnRecognizedAmount:'60',usnRecognitionDate:'2026-04-01',usnDocument:'Выполнены условия признания'}],
    realizations:[{_id:'later',org:AIR,date:'2026-04-01',amount:'105',vatRate:5}]};
  const q1=core.quarterTaxSnapshot(data,'2026-03-31'),q2=core.quarterTaxSnapshot(data,'2026-06-30');
  a.equal(q1.air.income,10000n);a.equal(q1.air.expenses,0n);a.equal(q1.air.regularTax,1500n);
  a.equal(q2.air.income,10000n);a.equal(q2.air.expenses,6000n);a.equal(q2.air.regularTax,600n);
});

test('USN minimum tax is annual 1 percent and cannot be applied as quarterly minimum', () => {
  const data={cash:[{_id:'in',org:AIR,type:'in',date:'2026-01-01',amount:'1000',usnTaxable:true},
    {_id:'out',org:AIR,type:'out',date:'2026-01-02',amount:'1200',usnDeductible:true,usnRecognitionDate:'2026-01-02',usnDocument:'Расход'}]};
  const q1=core.quarterTaxSnapshot(data,'2026-03-31'),annual=core.quarterTaxSnapshot(data,'2026-12-31');
  a.equal(q1.air.regularTax,0n);a.equal(q1.air.minimumTax,1000n);a.equal(q1.air.accrued,0n);a.equal(q1.air.minimumApplicable,false);
  a.equal(annual.air.accrued,1000n);a.equal(annual.air.minimumApplicable,true);
  a.ok(annual.limitations.some(x=>x.includes('перенос убытков')),'loss carryforward remains explicitly unsupported');
});

test('dated configurable threshold follows independent controls, exact equality and sticky crossing after return', () => {
  const data={usnVatPolicies:[policy('2026-01-01','100')]};
  const events=oracle.thresholdEvents.map(e=>({date:e.date,amount:BigInt(e.amountCents)}));
  for(const expected of oracle.thresholdCases){const r=core.usnVatThreshold(data,expected.reference,events);a.equal(r.observedIncome,BigInt(expected.observed));a.equal(r.previousIncome,BigInt(expected.previous));a.equal(r.exceededOn,expected.exceeded);a.equal(r.effectiveFrom,expected.effective);a.equal(r.coverageConfirmed,false);}
});

test('threshold versions lower on a no-receipt date, higher future versions never rewrite historic result', () => {
  const data={usnVatPolicies:[policy('2026-01-01','100'),policy('2026-02-15','70'),policy('2026-04-01','200')]};
  const events=[{date:'2026-01-10',amount:8000n}],before=JSON.stringify(data);
  a.equal(core.usnVatThreshold(data,'2026-01-31',events).effectiveFrom,null);
  const feb=core.usnVatThreshold(data,'2026-02-28',events);a.equal(feb.exceededOn,'2026-02-15');a.equal(feb.effectiveFrom,'2026-03-01');
  a.equal(core.usnVatThreshold(data,'2026-04-30',events).effectiveFrom,'2026-03-01');a.equal(JSON.stringify(data),before);
  a.equal(core.usnVatThreshold(data,'2026-01-31',[{date:'2025-12-31',amount:10001n}]).effectiveFrom,'2026-01-01');
  a.throws(()=>core.usnVatThreshold({usnVatPolicies:[policy('2026-01-01','100'),policy('2026-01-01','200','other')]},'2026-02-01'),/дат/);
});

test('prior-year taxed advance refund reduces current net USN income, without changing prior year', () => {
  const data={cash:[{_id:'a',org:AIR,type:'in',date:'2025-12-31',amount:'105',usnTaxable:true},
    {_id:'r',org:AIR,type:'out',date:'2026-01-01',amount:'42'}],vatAdvanceEvents:[
    {_id:'a',org:AIR,kind:'received',date:'2025-12-31',cashId:'a',amount:'105',vatRate:5,document:'СФ'},
    {_id:'r',org:AIR,kind:'refund',date:'2026-01-01',cashId:'r',advanceId:'a',amount:'42',document:'Расторжение'}]};
  const r=core.quarterTaxSnapshot(data,'2026-03-31');a.equal(r.air.income,-4000n);a.equal(r.air.inputVat,200n);a.equal(r.air.vatThreshold.previousIncome,10000n);a.equal(r.air.vatThreshold.observedIncome,-4000n);
  a.equal(registers.advances(data,{to:'2025-12-31'}).balances[0].remaining,10500n);
});

test('old 20 percent advance offsets and refunds conserve original VAT over quarter boundary', () => {
  const data={cash:[{_id:'a',org:ARBAT,type:'in',date:'2025-12-31',amount:'120'},
    {_id:'r',org:ARBAT,type:'out',date:'2026-04-01',amount:'60'}],realizations:[{_id:'s',org:ARBAT,date:'2026-03-31',amount:'61',vatRate:22}],vatAdvanceEvents:[
    {_id:'a',org:ARBAT,kind:'received',date:'2025-12-31',cashId:'a',amount:'120',vatRate:20,document:'СФ2025'},
    {_id:'s',org:ARBAT,kind:'offset',date:'2026-03-31',advanceId:'a',realizationId:'s',amount:'60',document:'Зачёт'},
    {_id:'r',org:ARBAT,kind:'refund',date:'2026-04-01',advanceId:'a',cashId:'r',amount:'60',document:'Возврат'}]};
  const q1=core.quarterTaxSnapshot(data,'2026-03-31'),q2=core.quarterTaxSnapshot(data,'2026-06-30');
  a.equal(q1.arbat.outputVat,1100n);a.equal(q1.arbat.inputVat,1000n);a.equal(q2.arbat.outputVat,0n);a.equal(q2.arbat.inputVat,1000n);
  a.equal(registers.advances(data).balances[0].vatRemaining,0n);
});

test('tax liability events retain tax period while movements retain payment date and ENS is separate', () => {
  const data={cash:[{_id:'p',org:ARBAT,type:'out',date:'2026-04-01',amount:'40'},{_id:'r',org:ARBAT,type:'in',date:'2026-04-02',amount:'2'}],taxObligationEvents:[
    {_id:'debt',org:ARBAT,kind:'openingDebt',date:'2026-01-01',tax:'vat',period:'2025-Q4',amount:'20',document:'Остаток',confirmed:true},
    {_id:'credit',org:ARBAT,kind:'openingCredit',date:'2026-01-01',tax:'vat',period:'2025-Q4',amount:'5',document:'Переплата',confirmed:true},
    {_id:'accrual',org:ARBAT,kind:'accrual',date:'2026-03-31',tax:'vat',period:'2026-Q1',amount:'100',document:'Декларация',confirmed:true},
    {_id:'p',org:ARBAT,kind:'payment',date:'2026-04-01',cashId:'p',tax:'vat',period:'2026-Q1',amount:'40',document:'Принадлежность платежа',confirmed:true},
    {_id:'o',org:ARBAT,kind:'offset',date:'2026-04-01',tax:'vat',period:'2026-Q1',amount:'10',document:'Решение ЕНС',confirmed:true,ensConfirmed:true},
    {_id:'r',org:ARBAT,kind:'refund',date:'2026-04-02',cashId:'r',tax:'vat',period:'2026-Q1',amount:'2',document:'Возврат переплаты',confirmed:true},
    {_id:'ens',org:ARBAT,kind:'ensBalance',date:'2026-04-03',amount:'500',document:'Выписка',confirmed:true}]};
  const r=workspace.snapshot(data,{org:ARBAT,reference:'2026-06-30'});
  a.equal(r.obligations.opening,11500n);a.equal(r.obligations.paid,4000n);a.equal(r.obligations.offset,1000n);a.equal(r.obligations.refund,200n);a.equal(r.obligations.closing,6700n);a.equal(r.obligations.ens[0].balance,50000n);
  a.equal(r.obligations.rows.find(x=>x.period==='2026-Q1').balance,5200n);a.equal(r.obligations.months[0].paid,4000n);
  a.equal(core.quarterTaxSnapshot(data,'2026-06-30').arbat.profitTax,0n,'confirmed tax payment is not a profit tax expense document');
});

test('unknown amounts and unsupported source metadata remain visible instead of certified zero', () => {
  const data={cash:[{_id:'missing',org:AIR,type:'in',date:'2026-01-01',usnTaxable:true}],realizations:[{_id:'bad',org:ARBAT,date:'2026-01-01',amount:'122',vatRate:''}]};
  const r=core.quarterTaxSnapshot(data,'2026-03-31');a.equal(r.air.ready,false);a.equal(r.arbat.vatReady,false);a.equal(r.arbat.profitReady,false);
  a.ok(r.issues.some(x=>x.code==='invalid-tax-amount'));a.ok(r.issues.some(x=>x.code==='vat-metadata-invalid'));
  a.equal(pnl.snapshot({}, {org:AIR,reference:'2026-03-31'}).total,null,'missing monthly tax accruals stay unknown');
  a.equal(core.usnVatThreshold({},'2032-01-01').limit,1000000000n,'published schedule continues from2031; dated policy can override');
  a.equal(core.usnVatThreshold({},'2024-01-01').limit,null,'outside supported historical schedule remains unknown');
});

test('a current tax document without organization requires attribution while a foreign organization stays outside scope', () => {
  const doc={_id:'unattributed',date:'2026-01-01',amount:'122',vatRate:22};
  const r=core.quarterTaxSnapshot({realizations:[doc]},'2026-03-31');
  a.equal(r.air.ready,false,'unattributed document cannot certify either organization');
  a.equal(r.arbat.vatReady,false);a.equal(r.arbat.profitReady,false);
  a.ok(r.issues.some(x=>x.code==='tax-organization-unassigned'&&x.source===doc));
  a.equal(r.arbat.outputVat,0n,'unknown scope does not fabricate an assigned amount');
  const foreign=core.quarterTaxSnapshot({realizations:[{...doc,org:'Отдельная сторонняя организация'}]},'2026-03-31');
  a.equal(foreign.issues.length,0,'foreign organization is legitimately out of scope');
  a.equal(core.quarterTaxSnapshot({realizations:[{...doc,date:'2027-01-01'}]},'2026-03-31').issues.length,0,'future document does not affect current year');
  a.equal(core.quarterTaxSnapshot({cash:[{...doc,type:'transfer'}]},'2026-03-31').issues.length,0,'internal transfer is not a tax source');
  const unassignedAdvance=core.quarterTaxSnapshot({vatAdvanceEvents:[{...doc,kind:'received',document:'СФ',cashId:'missing'}]},'2026-03-31');
  a.equal(unassignedAdvance.air.ready,false);a.equal(unassignedAdvance.arbat.vatReady,false);
});

test('documented excluded loans do not enter USN; disabled BDDS BDR and requests never enter taxes', () => {
  const data={cash:[{_id:'loan',org:AIR,type:'in',date:'2026-01-01',amount:'1000000',usnTaxable:false,taxExclusionReason:'Договор займа'}]};
  const r=core.quarterTaxSnapshot(data,'2026-03-31');a.equal(r.air.income,0n);a.equal(r.air.vatThreshold.observedIncome,0n);
  const disabled={...data,bdds:[{org:AIR,amount:'999999'}],bdr:[{org:ARBAT,amount:'999999',vatRate:22}],paymentRequests:[{org:ARBAT,amount:'999999',date:'2026-01-01'}]};
  a.deepEqual(core.quarterTaxSnapshot(disabled,'2026-03-31'),r);
});
