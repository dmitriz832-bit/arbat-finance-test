const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8'),core=require('../app/finance-core');
function fn(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const markers=name==='calc'?['\nwindow.arbatAudit=']:name==='editMovement'?['\nwindow.arbatCascadeRemove=']:['\nfunction '];const next=html.indexOf(markers[0],start+1);return html.slice(start,next<0?undefined:next)}
function setup(){
 const org='АИР-КЛИМАТ',d={items:[{id:'bolt',name:'Bolt',unit:'шт'}],places:[{id:'w',org,type:'warehouse'},{id:'c',org,type:'crew'}],moves:[],plans:[],projectIssues:[]},data={deals:[{_id:'p',org,order1c:'P'}],expenses:[]},storage=new Map(),listeners={},nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',elements:{itemId:{}},querySelector(){return null},dispatchEvent(){},querySelectorAll(){return []}});return nodes.get(id)};
 const c=vm.createContext({console,db:data,initial:d,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Event:class{constructor(type){this.type=type}},document:{getElementById:node},alert(){},confirm:()=>true});
 c.window={arbatDealKey:core.dealKey,addEventListener:(type,cb)=>(listeners[type]||=[]).push(cb),dispatchEvent:e=>(listeners[e.type]||[]).forEach(cb=>cb(e))};
 vm.runInContext(fn('calc')+';window.arbatFifo=calc;const KEY="arbat-warehouse-v1",$=id=>document.getElementById(id);let wh=initial;function draw(){};const read=()=>JSON.parse(localStorage.getItem(KEY));function render(){};function renderReservations(){};',c);
 storage.set('arbat-warehouse-v1',JSON.stringify(d));storage.set('arbat-finance-demo-live',JSON.stringify(data));
 const receipt=(id,qty,price=10)=>({id,date:'2026-10-01',kind:'receipt',org,itemId:'bolt',to:'w',qty,price});
 return {c,d,data,storage,receipt,org};
}
test('direct project consumption creates one FIFO expense and repeated reconciliation is idempotent',()=>{
 const {c,d,data,receipt,storage}=setup();d.moves=[receipt('r1',2,10),receipt('r2',3,20),{id:'use',date:'2026-10-02',kind:'consume',org:data.deals[0].org,itemId:'bolt',from:'w',qty:3,dealId:'p'}];storage.set('arbat-warehouse-v1',JSON.stringify(d));
 vm.runInContext(fn('reconcileProjectExpenses'),c);c.reconcileProjectExpenses();c.reconcileProjectExpenses();
 assert.equal(data.expenses.length,1);assert.equal(data.expenses[0].amount,40);assert.equal(data.expenses[0].warehouseMoveId,'use');assert.equal(data.expenses[0].valuationStatus,'verified');
});
test('FIFO reconciliation refreshes expense date after source movement correction',()=>{
 const {c,d,data,receipt,storage}=setup();d.moves=[receipt('r',5),{id:'use',date:'2026-10-02',kind:'consume',org:data.deals[0].org,itemId:'bolt',from:'w',qty:3,dealId:'p',projectIssueId:'issue'}];storage.set('arbat-warehouse-v1',JSON.stringify(d));
 vm.runInContext(fn('reconcileProjectExpenses'),c);c.reconcileProjectExpenses();d.moves[1].date='2026-10-03';storage.set('arbat-warehouse-v1',JSON.stringify(d));c.reconcileProjectExpenses();assert.equal(data.expenses[0].date,'2026-10-03');
});
test('cascade deletion rejects removing receipt needed by later transfer and preserves both stores',()=>{
 const {c,d,receipt,storage}=setup();d.moves=[receipt('r',5),{id:'transfer',date:'2026-10-02',kind:'transfer',itemId:'bolt',from:'w',to:'c',qty:4}];storage.set('arbat-warehouse-v1',JSON.stringify(d));const before=storage.get('arbat-warehouse-v1'),f=storage.get('arbat-finance-demo-live');
 const start=html.indexOf('window.arbatCascadeRemove=function'),end=html.indexOf(';window.arbatBulkDeleteWarehouseMoves=',start);vm.runInContext(html.slice(start,end),c);
 const result=c.window.arbatCascadeRemove({moveIds:['r']});assert.equal(result.ok,false);assert.equal(storage.get('arbat-warehouse-v1'),before);assert.equal(storage.get('arbat-finance-demo-live'),f);
});
test('alternate deletion commit rejects a FIFO shortage before writing either store',()=>{
 const {c,d,receipt,storage}=setup();d.moves=[receipt('r',5),{id:'use',date:'2026-10-02',kind:'consume',itemId:'bolt',from:'w',qty:4}];storage.set('arbat-warehouse-v1',JSON.stringify(d));const before=storage.get('arbat-warehouse-v1'),f=storage.get('arbat-finance-demo-live');vm.runInContext('const W=KEY,F="arbat-finance-demo-live";'+fn('commit'),c);
 assert.throws(()=>c.commit({...d,moves:[d.moves[1]]},{expenses:[]}),/FIFO|парти|остат/i);assert.equal(storage.get('arbat-warehouse-v1'),before);assert.equal(storage.get('arbat-finance-demo-live'),f);
});
test('warehouse closure refreshes after another warehouse workflow writes storage',()=>{
 const {c,d,storage}=setup(),start=html.indexOf("$('whNewItem').onclick="),end=html.indexOf('\nfunction editMovement',start);vm.runInContext(html.slice(start,end),c);
 const changed={...d,projectIssues:[{id:'new-issue'}],moves:[{id:'new-movement'}]};storage.set('arbat-warehouse-v1',JSON.stringify(changed));c.window.dispatchEvent({type:'arbat-warehouse-changed'});assert.equal(vm.runInContext('wh.projectIssues.length',c),1);assert.equal(vm.runInContext('wh.moves[0].id',c),'new-movement');
});
test('project stock save broadcasts its committed state to other warehouse adapters',()=>{
 const {c,d}=setup();let count=0;c.window.addEventListener('arbat-warehouse-changed',()=>count++);const start=html.indexOf('const save=d=>'),end=html.indexOf('\n',start);vm.runInContext(html.slice(start,end)+';save(initial)',c);assert.equal(count,1);
});
test('raw editor does not detach a project-issue movement from its source document',()=>{
 const {c}=setup();vm.runInContext('let opened=false;function dialog(){opened=true};'+fn('editMovement'),c);c.editMovement({id:'issued',projectIssueId:'batch',qty:5});assert.equal(vm.runInContext('opened',c),false);
});
test('FIFO preserves acquisition cost through issue, partial consumption and return',()=>{
 const {c,d,receipt}=setup();d.moves=[receipt('a',2,10),receipt('b',3,20),{id:'issue',date:'2026-10-02',kind:'transfer',itemId:'bolt',from:'w',to:'c',qty:4},{id:'use',date:'2026-10-03',kind:'consume',itemId:'bolt',from:'c',qty:3},{id:'ret',date:'2026-10-03',kind:'return',itemId:'bolt',from:'c',to:'w',qty:1}];const x=c.window.arbatFifo(d);assert.equal(x.byMove.use.amount,40);assert.equal(x.byMove.ret.amount,20);assert.equal([...x.bins.values()].flat().reduce((s,l)=>s+l.qty*l.cost,0),40);assert.equal(x.warnings.length,0);
});
test('finance core requires expense reconciliation for direct project consumption',()=>{
 const deal={_id:'p',org:'АИР-КЛИМАТ',order1c:'P'},move={id:'direct',kind:'consume',dealId:'p'},fifo={byMove:{direct:{amount:40}}};
 assert.deepEqual(core.warehouseCostAudit([], [move], fifo).map(x=>x.reason),['missing-expense']);
 const x=core.projectSnapshot({expenses:[],warehouse:{moves:[move]},fifo},deal,core.dealKey(deal));assert.ok(x.issues.includes('warehouse-fifo-mismatch'));
});
test('cascade deletion removes its linked expense from the active finance model',async()=>{
 const {c,d,data,receipt,storage}=setup();d.moves=[receipt('r',5),{id:'use',kind:'consume',date:'2026-10-02',itemId:'bolt',from:'w',qty:3,dealId:'p'}];data.expenses=[{_id:'warehouse-consume-use',warehouseMoveId:'use',amount:30}];storage.set('arbat-warehouse-v1',JSON.stringify(d));storage.set('arbat-finance-demo-live',JSON.stringify(data));
 const start=html.indexOf('window.arbatCascadeRemove=function'),end=html.indexOf(';window.arbatBulkDeleteWarehouseMoves=',start);vm.runInContext(html.slice(start,end),c);assert.equal((await require('./helpers/deletion-backup-fixture.cjs')(c.window,data,d,()=>c.window.arbatCascadeRemove({moveIds:['use']}))).ok,true);assert.equal(data.expenses.length,0);assert.equal(JSON.parse(storage.get('arbat-finance-demo-live')).expenses.length,0);
});
test('alternate deletion commit synchronizes the active finance model',()=>{
 const {c,d,data}=setup();data.expenses=[{_id:'warehouse-consume-use',warehouseMoveId:'use',amount:30}];vm.runInContext('const W=KEY,F="arbat-finance-demo-live";'+fn('commit'),c);c.commit(d,{expenses:[]});assert.equal(data.expenses.length,0);
});
test('multiitem receipt correction retains payable key and payment while total and stock recalculate',()=>{
 const pay=require('../app/payables-model'),{c,d,data,receipt}=setup();d.items.push({id:'pipe',name:'Pipe'});d.moves=[{...receipt('r1',2,10),documentId:'DOC'}, {...receipt('r2',3,20),itemId:'pipe',documentId:'DOC'}];
 const key=pay.receiptKey(d.moves[0]);data.cash=[{_id:'paid',type:'out',org:data.deals[0].org,amount:50,supplierAllocations:[{documentKey:key,amount:50}]}];
 const baseline=JSON.stringify(d.moves),edited=pay.editReceipt(d,key,baseline,[{id:'r1',itemId:'bolt',qty:3,price:10},{id:'r2',itemId:'pipe',qty:4,price:20}],'Corrected',()=>assert.fail('No new identifiers expected'));
 const doc=pay.snapshot(data,edited).documents[0];assert.equal(doc.key,key);assert.equal(doc.total,11000n);assert.equal(doc.paid,5000n);assert.equal(doc.remaining,6000n);assert.equal(c.window.arbatFifo(edited).lots('w','bolt').reduce((s,l)=>s+l.qty,0),3);assert.equal(d.moves[0].qty,2,'model editing must not mutate original before save');assert.throws(()=>pay.editReceipt(edited,key,baseline,[{id:'r1',itemId:'bolt',qty:1,price:10}],'Stale',()=>''),/изменён/);
});
test('switching warehouse document kind clears values hidden by the new operation',()=>{
 const field=value=>({value,closest:()=>({style:{}})}),ctx=vm.createContext({kind:field('receipt'),from:field('c'),to:field('w'),deal:field('p'),host:{querySelectorAll:()=>[]}}),start=html.indexOf('const mode=()=>{const receipt'),end=html.indexOf(';kind.onchange=mode',start);vm.runInContext(html.slice(start,end)+';mode()',ctx);assert.equal(ctx.from.value,'');assert.equal(ctx.deal.value,'');ctx.kind.value='consume';ctx.from.value='w';ctx.to.value='c';vm.runInContext('mode()',ctx);assert.equal(ctx.to.value,'');assert.equal(ctx.from.value,'w');
});
test('deleting receipt cannot worsen a pre-existing FIFO shortage on the same movement',()=>{
 const {c,d,receipt,storage}=setup();d.moves=[receipt('r',5),{id:'use',date:'2026-10-02',kind:'consume',itemId:'bolt',from:'w',qty:6}];storage.set('arbat-warehouse-v1',JSON.stringify(d));const start=html.indexOf('window.arbatCascadeRemove=function'),end=html.indexOf(';window.arbatBulkDeleteWarehouseMoves=',start);vm.runInContext(html.slice(start,end),c);assert.equal(c.window.arbatCascadeRemove({moveIds:['r']}).ok,false);
});
test('project issue collects split warehouse stock, then closes with FIFO consumption and return',()=>{
 const {c,d,data,receipt,storage,org}=setup();d.places.push({id:'w2',org,type:'warehouse'});d.moves=[receipt('r',2),{...receipt('r2',4),to:'w2'}];d.plans=[{dealId:'p',lines:[{itemId:'bolt',qty:5}]}];storage.set('arbat-warehouse-v1',JSON.stringify(d));
 vm.runInContext("let seq=0;const id=()=>String(++seq),fmt=String,esc=String,qty=(d,i,p)=>d.moves.reduce((n,m)=>m.itemId!==i?n:n+(m.to===p?Number(m.qty):0)-(m.from===p?Number(m.qty):0),0);const crewPlaces=d=>d,deal=()=>db.deals[0];let submit,saved;function modal(t,b,cb){submit=cb};const save=d=>{saved=d;localStorage.setItem(KEY,JSON.stringify(d))};$('psCrew').value='c';"+['unitCost','allocations','planned','crewFree','sameCrewPlaces','selectedCrewFree','warehouseFree','projectAvailability','issue'].map(fn).join('\n'),c);
 c.issue();vm.runInContext("submit({elements:{warehouse:{value:'w'},q0:{value:'5'},own0:{value:'0'}}})",c);const saved=vm.runInContext('saved',c);assert.equal(saved.projectIssues.length,1);assert.equal(saved.moves.filter(m=>m.to==='c').reduce((n,m)=>n+m.qty,0),5);assert.equal(c.window.arbatFifo(saved).warnings.length,0);const auditStart=html.indexOf('window.arbatAudit=function'),auditEnd=html.indexOf('\nwindow.arbatFifo=calc',auditStart);vm.runInContext(html.slice(auditStart,auditEnd),c);assert.equal(c.window.arbatAudit(saved,data).errors,0);
 const form={elements:{batch:{value:saved.projectIssues[0].id},used0:{value:'3'}},querySelector:()=>({innerHTML:''})},getElement=c.document.getElementById;c.document.getElementById=id=>id==='psForm'?form:getElement(id);c.closingForm=form;
 const closeStart=html.indexOf('function close(){let d=read(),project=deal(),crew='),closeEnd=html.indexOf("\n$('psDeal').onchange",closeStart);vm.runInContext(fn('reconcileProjectExpenses')+html.slice(closeStart,closeEnd),c);c.close();vm.runInContext('submit(closingForm)',c);
 const closed=vm.runInContext('saved',c),fifo=c.window.arbatFifo(closed);assert.equal(closed.projectIssues[0].closed,true);assert.equal(closed.projectIssues[0].lines[0].used,3);assert.equal(closed.projectIssues[0].lines[0].returned,2);assert.equal(data.expenses[0].amount,30);assert.equal(fifo.lots('c','bolt').length,0);assert.equal(c.window.arbatAudit(closed,data).errors,0);
});
test('per-location donor availability distributes another project reserve only once across warehouses',()=>{
 const {c,d,data,receipt,org}=setup();d.places.push({id:'w2',org,type:'warehouse'},{id:'w3',org,type:'warehouse'});d.moves=[receipt('r',2),{...receipt('r2',2),to:'w2'},{...receipt('r3',2),to:'w3'}];data.deals.push({_id:'other',org});d.plans=[{dealId:'other',lines:[{itemId:'bolt',qty:3}]},{dealId:'p',lines:[{itemId:'bolt',qty:3}]}];
 vm.runInContext("const qty=(d,i,p)=>d.moves.reduce((n,m)=>m.itemId!==i?n:n+(m.to===p?Number(m.qty):0)-(m.from===p?Number(m.qty):0),0);"+fn('allocations')+fn('warehouseFree'),c);assert.equal(c.warehouseFree(d,'bolt','w','p'),0);assert.equal(c.warehouseFree(d,'bolt','w2','p'),1);assert.equal(c.warehouseFree(d,'bolt','w3','p'),2);
});
test('integrity audit detects unavailable stock committed by an open warehouse issue',()=>{
 const {c,d,data,receipt,org}=setup();d.moves=[receipt('r',7),{id:'issue',kind:'transfer',date:'2026-10-02',itemId:'bolt',from:'w',to:'c',qty:7,projectIssueId:'batch'},{id:'other-use',kind:'consume',date:'2026-10-03',itemId:'bolt',from:'c',qty:2}];d.projectIssues=[{id:'batch',org,dealId:'p',crewId:'c',closed:false,lines:[{itemId:'bolt',issued:7,warehouseQty:7,fromCrew:0}]}];const start=html.indexOf('window.arbatAudit=function'),end=html.indexOf('\nwindow.arbatFifo=calc',start);vm.runInContext(html.slice(start,end),c);assert.ok(c.window.arbatAudit(d,data).issues.some(x=>x.category==='Двойной резерв'));
});
