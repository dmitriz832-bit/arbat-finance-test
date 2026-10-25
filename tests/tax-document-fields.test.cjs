const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function model(){return require('../app/tax-document-fields.js')}
test('tax recognition requires evidence and cannot exceed payment',()=>{
 const m=model(),base={org:'АИР-КЛИМАТ',date:'2026-10-01',type:'out',amount:'1000',usnDeductible:'true',usnRecognitionDate:'2026-10-02',usnRecognizedAmount:'600',usnDocument:'УПД 12'};
 assert.equal(m.validate(base,'cash'),null);
 assert.match(m.validate({...base,usnRecognizedAmount:'1001'},'cash'),/сумм/i);
 assert.match(m.validate({...base,usnDocument:''},'cash'),/основан/i);
 assert.match(m.validate({...base,usnRecognitionDate:'2026-09-30'},'cash'),/дат/i);
});
test('unfinished recognition is allowed but exclusions require a reason',()=>{
 const m=model();assert.equal(m.validate({org:'АИР-КЛИМАТ',type:'out',date:'2026-10-01',amount:1000},'cash'),null);
 assert.match(m.validate({org:'АИР-КЛИМАТ',type:'in',usnTaxable:'false'},'cash'),/основан/i);
});
test('validation only examines fields relevant to organization and transaction',()=>{
 const m=model();assert.equal(m.validate({org:'АИР-КЛИМАТ',type:'transfer',profitTaxDeductible:'true',usnDeductible:'true'},'cash'),null);
 assert.equal(m.validate({org:'АРБАТ.ГК',date:'2026-10-01',amount:1000,usnDeductible:'true'},'expenses'),null);
});
test('profit recognition cap uses net purchase amount or payroll with contributions',()=>{
 const m=model(),base={org:'АРБАТ.ГК',date:'2026-10-01',amount:'1220',vatRate:'22',vatDeductible:'true',profitTaxDeductible:'true',profitTaxRecognitionDate:'2026-10-01',profitTaxDocument:'Акт',profitTaxRecognizedAmount:'1000'};
 assert.equal(m.validate(base,'expenses'),null);assert.match(m.validate({...base,profitTaxRecognizedAmount:'1000.01'},'expenses'),/сумм/i);
 assert.equal(m.validate({...base,amount:'1000',employerContributions:'300',profitTaxRecognizedAmount:'1300'},'labor'),null);
});
test('VAT deduction requires invoice and valid date; pending records remain editable',()=>{
 const m=model(),base={org:'АРБАТ.ГК',date:'2026-10-01',amount:'1220',vatRate:'22',vatDeductible:'true'};
 assert.equal(m.validate(base,'expenses'),null);
 assert.match(m.validate({...base,vatDeductionDate:'2026-10-02'},'expenses'),/основан|УПД|счёт/i);
 assert.match(m.validate({...base,vatDeductionDate:'2026-02-30',vatInvoice:'УПД'},'expenses'),/дат/i);
 assert.equal(m.validate({...base,vatDeductionDate:'2026-10-02',vatInvoice:'УПД'},'expenses'),null);
});
test('impossible dates return an error without throwing; partial zero is supported',()=>{
 const m=model(),row={org:'АИР-КЛИМАТ',date:'2026-10-01',type:'out',amount:'100',usnDeductible:'true',usnDocument:'Акт',usnRecognitionDate:'9999-99-99'};
 assert.match(m.validate(row,'cash'),/дат/i);assert.equal(m.validate({...row,usnRecognitionDate:'2026-10-02',usnRecognizedAmount:'0'},'cash'),null);
});
test('USN customer receipt VAT requires an explicit bounded amount and documentary basis',()=>{const m=model(),row={org:'АИР-КЛИМАТ',type:'in',date:'2026-10-01',amount:105,usnTaxable:true,usnVatAmount:'5',usnVatDocument:'СФ 5%'};assert.equal(m.validate(row,'cash'),null);assert.match(m.validate({...row,usnVatAmount:'106'},'cash'),/НДС/);assert.match(m.validate({...row,usnVatDocument:''},'cash'),/основан/);assert.equal(m.validate({...row,usnVatAmount:'0'},'cash'),null)});
test('recognition proposal reuses document evidence and calculates net amount without confirming',()=>{
 const row={org:'АРБАТ.ГК',date:'2026-10-02',amount:'1220',vatRate:'22',vatDeductible:'true',note:'УПД 42'},before=JSON.stringify(row);
 assert.deepEqual(model().proposal(row,'expenses'),{prefix:'profitTax',date:'2026-10-02',amount:'1000.00',document:'УПД 42'});
 assert.equal(JSON.stringify(row),before);assert.equal(row.profitTaxDeductible,undefined);
 assert.equal(model().proposal({...row,vatDeductible:''},'expenses'),null);
 assert.equal(model().proposal({...row,amount:'0'},'expenses'),null);
});
test('cash proposal never treats a payment purpose as proof of expense recognition',()=>{
 const row={org:'АИР-КЛИМАТ',type:'out',date:'2026-10-02',amount:'100',note:'Оплата поставщику'};
 assert.deepEqual(model().proposal(row,'cash'),{prefix:'usn',date:row.date,amount:'100.00',document:''});
 assert.equal(model().proposal({...row,date:'2026-02-30'},'cash'),null);
 assert.equal(model().proposal({...row,usnRecognitionEvents:[{id:'a'}]},'cash'),null);
 assert.equal(model().proposal({...row,type:'in'},'cash'),null);
});
test('proposal preserves explicit partial amount, later date and documentary basis',()=>{
 const row={org:'АИР-КЛИМАТ',type:'out',date:'2026-10-02',amount:'100',usnRecognitionDate:'2026-10-04',usnRecognizedAmount:'40',usnDocument:'Акт приёмки'};
 assert.deepEqual(model().proposal(row,'cash'),{prefix:'usn',date:'2026-10-04',amount:'40.00',document:'Акт приёмки'});
 assert.equal(model().proposal({...row,usnRecognizedAmount:'101'},'cash'),null);
 assert.equal(model().proposal({...row,usnRecognitionDate:'2026-10-01'},'cash'),null);
 assert.equal(model().proposal({org:'АРБАТ.ГК',date:'2026-10-02',amount:'1000',employerContributions:'300'},'labor').amount,'1300.00');
});
test('VAT deduction proposal reuses documentary evidence only when deduction was explicitly selected',()=>{
 const row={org:'АРБАТ.ГК',date:'2026-10-02',amount:'1220',vatRate:'22',vatDeductible:'true',profitTaxDocument:'УПД 42'},before=JSON.stringify(row);
 assert.deepEqual(model().vatProposal(row,'expenses'),{vatInvoice:'УПД 42',vatDeductionDate:'2026-10-02'});
 assert.equal(model().vatProposal({...row,vatDeductible:''},'expenses'),null);
 assert.equal(model().vatProposal({...row,profitTaxDocument:''},'costs'),null);
 assert.equal(model().vatProposal({...row,vatDeductionDate:'2026-10-01'},'expenses'),null);
 assert.equal(JSON.stringify(row),before);
});
test('VAT proposal supports serialized partial events from document FormData',()=>{
 const row={org:'АРБАТ.ГК',date:'2026-10-01',amount:'1220',vatRate:'22',vatDeductible:'true',profitTaxDeductible:'true',note:'УПД 42',profitTaxRecognitionEvents:JSON.stringify([{id:'e',date:'2026-10-02',amount:'1000',document:'УПД 42'}])};
 assert.deepEqual(model().vatProposal(row,'expenses'),{vatInvoice:'УПД 42',vatDeductionDate:'2026-10-01'});
 assert.equal(model().vatProposal({...row,vatRate:''},'expenses'),null);
});
test('single recognition proposal cannot replace serialized partial events',()=>{
 assert.equal(model().proposal({org:'АИР-КЛИМАТ',type:'out',date:'2026-10-01',amount:100,usnRecognitionEvents:JSON.stringify([{id:'e',date:'2026-10-01',amount:50,document:'Акт'}])},'cash'),null);
});
