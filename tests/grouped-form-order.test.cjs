const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Minimal DOM for exercising the production reparenting routine without a browser.
class Node {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.classList={add(){}};}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children.splice(n.parentElement.children.indexOf(n),1);this.children.push(n);n.parentElement=this;}}
 insertBefore(node,before){this.append(node);this.children.pop();this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);}
 prepend(...nodes){for(const n of [...nodes].reverse())this.insertBefore(n,this.firstElementChild);}
 get firstElementChild(){return this.children[0]||null;}
 closest(tag){return this.tagName===tag.toUpperCase()?this:this.parentElement?.closest(tag);}
 querySelectorAll(){return [];}
 querySelector(){return null;}
}
function setup(id='dealForm'){
 const source=fs.readFileSync(require('node:path').join(__dirname,'../app/document-ux.js'),'utf8');
 const start=source.indexOf('  const formGroups='),end=source.indexOf('  Object.keys(formGroups)',start);
 const context={document:{createElement:tag=>new Node(tag)}};vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.organize=organizeForm;',context);
 const form=new Node('form');form.id=id;const fields={};
 for(const name of ['name','order1c','customerSearch','org','dir','contractTotal','vatRate','cost','dealStage','projectStatus','taxMode']){const label=new Node('label'),input=new Node('input');input.name=name;input.value=name==='contractTotal'?'1234':'kept';label.append(input);form.append(label);fields[name]=input;}
 form.elements={namedItem:name=>fields[name]};return {form,fields,organize:context.organize};
}
test('document groups follow the specified reading order and keep existing controls',()=>{
 const {form,fields,organize}=setup();organize(form);
 assert.deepEqual(form.children.filter(n=>n.tagName==='FIELDSET').map(n=>n.children[0].textContent),['Основные данные','Условия договора']);
 assert.equal(fields.contractTotal.value,'1234');assert.equal(form.elements.namedItem('contractTotal'),fields.contractTotal);
 const original=[...form.children];organize(form);assert.deepEqual(form.children,original);
});
test('contract VAT is grouped beside the contract amount',()=>{
 const {form,fields,organize}=setup();organize(form);
 assert.equal(fields.vatRate.closest('fieldset'),fields.contractTotal.closest('fieldset'));
 assert.ok(fields.vatRate.closest('fieldset'));
});

test('edited contract VAT is grouped beside the editable contract amount',()=>{const {form,fields,organize}=setup('editDealForm');organize(form);assert.ok(fields.vatRate.closest('fieldset'));assert.equal(fields.vatRate.closest('fieldset'),fields.contractTotal.closest('fieldset'));});
