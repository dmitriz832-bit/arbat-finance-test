const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const form=fs.readFileSync(path.join(__dirname,'../app/vat-forms.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
test('VAT fields are present on contract and realization forms and prevent implicit rate',()=>{
 assert.match(form,/\['dealForm','realizationForm','expenseForm','costForm'\]/);
 assert.match(form,/select\.required=true/);
 assert.match(form,/placeholder\.value=''/);
 assert.ok(form.includes("core.documentVat(amount,rate,deductible?.value==='true')"));
 for(const field of ['amountGross','vatAmount','amountNet','vatRateSource'])assert.ok(form.includes(field));
 assert.ok(html.includes('vat-forms.js'));
 assert.ok(html.indexOf('vat-forms.js')<html.search(/sync\.js\?v=\d+/));
});

test('generic journal editor recalculates VAT instead of keeping stale totals',()=>{
 assert.ok(form.includes("document.getElementById('genericEditForm')"));
 assert.ok(form.includes("editor.addEventListener('submit'"));
 assert.ok(form.includes("core.documentVat(grossField.value,rate.value"));
 assert.ok(form.includes("source.value='document-explicit'"));
});

test('general P&L expense form receives explicit rate and deductibility',()=>{assert.ok(form.includes("id==='expenseForm'||id==='costForm'"));assert.ok(form.includes("deductible.name='vatDeductible'"));});
