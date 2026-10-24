const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
function attempt(amount){
 let delegated=0;const messages=[],row={_id:'x',amount},form={elements:{namedItem:()=>({value:''})},requestSubmit:()=>delegated++},c=vm.createContext({db:{expenses:[row]},genericTarget:{key:'expenses',id:'x',baseline:'{"_id":"x","amount":10}'},moneyForm:()=>({amount:30}),document:{getElementById:()=>form},alert:m=>messages.push(m),closeGeneric(){},console});
 const versionStart=html.indexOf('function recordVersion(');if(versionStart>=0)vm.runInContext(html.slice(versionStart,html.indexOf('function openRecord(',versionStart)),c);
 const start=html.indexOf("document.getElementById('genericEditForm').onsubmit="),end=html.indexOf(';function applyEdit(',start);vm.runInContext(html.slice(start,end),c);form.onsubmit({preventDefault(){},target:{}});return {delegated,messages,row};
}
test('an open editor cannot submit an outdated document after a colleague change reached the app',()=>{const r=attempt(20);assert.equal(r.delegated,0);assert.match(r.messages.join(' '),/изменён.*другим|другим.*изменён/);assert.equal(r.row.amount,20)});
test('an unchanged document still submits normally from the same editor',()=>{const r=attempt(10);assert.equal(r.delegated,1);assert.deepEqual(r.messages,[])});

function dealAttempt(changed){
 let saved=0;const messages=[],initial={_id:'d',name:'Project',org:'A',order1c:'1',contractTotal:10,cost:0},row={...initial,contractTotal:changed?20:10},form={dataset:{},elements:{}},c=vm.createContext({db:{deals:[row]},modalDealId:'d',moneyForm:()=>({...initial,contractTotal:30,customerSearch:'Customer'}),getCp:()=>({id:'cp',name:'Customer'}),parseMoney:Number,window:{arbatDealKey:()=> 'A::1'},renameDealReferences(){},hideDealModal(){},save:()=>saved++,alert:m=>messages.push(m),document:{getElementById:()=>form},console});
 const i=html.indexOf('function recordVersion(');vm.runInContext(html.slice(i,html.indexOf('function openRecord(',i)),c);c.initial=initial;form.dataset.recordVersion=vm.runInContext('recordVersion(initial)',c);
 const start=html.indexOf("document.getElementById('editDealForm').onsubmit="),end=html.indexOf(';let cpEditingId=',start);vm.runInContext(html.slice(start,end),c);form.onsubmit({preventDefault(){},target:form});return {saved,row,messages};
}
test('an outdated deal editor cannot overwrite the current contract after a colleague update',()=>{const r=dealAttempt(true);assert.equal(r.saved,0);assert.equal(r.row.contractTotal,20);assert.match(r.messages.join(' '),/изменена другим/)});
test('an unchanged deal editor can still save its contract',()=>{const r=dealAttempt(false);assert.equal(r.saved,1);assert.equal(r.row.contractTotal,30)});
