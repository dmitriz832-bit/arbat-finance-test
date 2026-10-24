const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
function attempt(amount){
 let delegated=0;const messages=[],row={_id:'x',amount},form={elements:{namedItem:()=>({value:''})},requestSubmit:()=>delegated++},c=vm.createContext({db:{expenses:[row]},genericTarget:{key:'expenses',id:'x',baseline:'{"_id":"x","amount":10}'},moneyForm:()=>({amount:30}),document:{getElementById:()=>form},alert:m=>messages.push(m),closeGeneric(){},console});
 const versionStart=html.indexOf('function recordVersion(');if(versionStart>=0)vm.runInContext(html.slice(versionStart,html.indexOf('function openRecord(',versionStart)),c);
 const start=html.indexOf("document.getElementById('genericEditForm').onsubmit="),end=html.indexOf(';function applyEdit(',start);vm.runInContext(html.slice(start,end),c);form.onsubmit({preventDefault(){},target:{}});return {delegated,messages,row};
}
test('an open editor cannot submit an outdated document after a colleague change reached the app',()=>{const r=attempt(20);assert.equal(r.delegated,0);assert.match(r.messages.join(' '),/изменён.*другим|другим.*изменён/);assert.equal(r.row.amount,20)});
test('an unchanged document still submits normally from the same editor',()=>{const r=attempt(10);assert.equal(r.delegated,1);assert.deepEqual(r.messages,[])});
