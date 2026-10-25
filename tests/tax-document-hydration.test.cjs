const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('cloned tax editors initialize and load together before reading intermediate hidden field values',()=>{
 const context={ArbatFinanceCore:require('../app/finance-core.js'),document:{getElementById:()=>null,addEventListener:()=>{}},FormData:class{constructor(form){return Object.entries(form.values)}}};context.window=context;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/tax-document-fields.js'),'utf8'),context);
 // Only the document boundary is stubbed; the actual module initializes and reads both editors.
 const form={dataset:{},values:{org:'АРБАТ.ГК',date:'2026-10-02',amount:'1220',vatRate:'22',vatDeductible:'true',note:'УПД 42'},elements:{namedItem:()=>null}};
 const groups=['usnExpense','profitExpense'].map(scope=>({dataset:{taxScope:scope},querySelectorAll:()=>[],hidden:false}));
 const editors=groups.map((group,i)=>{const nodes={'[data-tax-event-list]':{children:[],replaceChildren(){}},'input[type=hidden]':{value:''},'[data-tax-event-count]':{},'[data-tax-event-add]':{}};return {dataset:{taxEventEditor:i?'profitTax':'usn'},querySelector:s=>nodes[s],closest:s=>s==='form'?form:group}});
 const nodes={},panel={querySelectorAll:s=>s==='[data-tax-scope]'?groups:[],querySelector:s=>s.includes('data-tax-event-editor')?editors[s.includes('profitTax')?1:0]:(nodes[s]??={})};
 form.querySelectorAll=s=>s==='[data-tax-event-editor]'?editors:[];form.querySelector=s=>s==='[data-tax-fields]'?panel:s.includes('data-tax-event-editor')?editors[s.includes('profitTax')?1:0]:null;
 assert.doesNotThrow(()=>context.ArbatTaxDocumentFields.hydrate(form,form.values,'expenses'));
 // Legacy generic forwarding assigns an array to the input before calling hydrate.
 editors[1].querySelector('input[type=hidden]').value='[object Object]';
 assert.doesNotThrow(()=>context.ArbatTaxDocumentFields.hydrate(form,form.values,'expenses'));
 assert.equal(editors[1].events(),null);
});
