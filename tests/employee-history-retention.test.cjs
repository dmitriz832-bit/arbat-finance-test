const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
const start=html.indexOf("document.getElementById('genericDelete').onclick="),end=html.indexOf("document.getElementById('genericModal').onclick=",start);
test('deleting a used employee preserves payroll, work and payment history',()=>{
 for(const link of [{labor:[{personId:'p',amount:100}]},{cash:[{payrollAllocations:[{personId:'p',amount:100}]}]},{workActs:[{memberIds:['p']}]},{crewSettlements:[{personId:'p'}]}]){
  const button={},db={people:[{_id:'row',id:'p',name:'Employee'}],labor:[],cash:[],workActs:[],crewSettlements:[],...link},before=JSON.stringify(db),messages=[];
  const context={db,genericTarget:{key:'people',id:'row'},document:{getElementById:()=>button},alert:m=>messages.push(m),confirm:()=>{throw Error('Deletion must stop before confirmation')},save:()=>{throw Error('Must not save')}};
  vm.runInNewContext(html.slice(start,end),context);button.onclick();
  assert.equal(JSON.stringify(db),before);assert.equal(messages.length,1);assert.match(messages[0],/Не работает/);
 }
});
