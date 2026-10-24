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
