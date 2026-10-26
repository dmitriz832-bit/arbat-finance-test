const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/cash-workspace-model.js');
const fixture=()=>({wallets:[{id:'a',name:'Основной счёт',org:'АИР-КЛИМАТ'},{id:'b',name:'Касса',org:'АИР-КЛИМАТ'},{id:'other',name:'Другой счёт',org:'АРБАТ.ГК'}],articles:[{id:'sales',name:'Оплата клиента'},{id:'rent',name:'Длинная статья аренды склада'}],counterparties:[{id:'client',name:'ООО Север'},{id:'supplier',name:'Арендодатель'}],deals:[{org:'АИР-КЛИМАТ',name:'Объект',order1c:'ORDER-1'}],cash:[
 {_id:'prior',org:'АИР-КЛИМАТ',date:'2026-09-30',type:'in',walletId:'a',articleId:'sales',customerId:'client',amount:'90.00'},
 {_id:'in1',org:'АИР-КЛИМАТ',date:'2026-10-01',type:'in',walletId:'a',articleId:'sales',customerId:'client',amount:'0.10',note:'Первый платёж',projectKey:'АИР-КЛИМАТ::1C#ORDER-1'},
 {_id:'in2',org:'АИР-КЛИМАТ',date:'2026-10-01',type:'in',walletId:'a',articleId:'sales',customerId:'client',amount:'0.20',note:'Второй платёж'},
 {_id:'out',org:'АИР-КЛИМАТ',date:'2026-10-02',type:'out',walletId:'a',articleId:'rent',customerId:'supplier',amount:'12.34',allocations:[{projectKey:'АИР-КЛИМАТ::1C#ORDER-1',amount:'2.34'}]},
 {_id:'refund',org:'АИР-КЛИМАТ',date:'2026-10-02',type:'out',walletId:'b',articleId:'rent',amount:'-1.11'},
 {_id:'transfer',org:'АИР-КЛИМАТ',date:'2026-10-03',type:'transfer',walletId:'a',toWalletId:'b',amount:'50.01'},
 {_id:'foreign',org:'АРБАТ.ГК',date:'2026-10-01',type:'in',walletId:'other',articleId:'sales',amount:'1000.00'},
 {_id:'future',org:'АИР-КЛИМАТ',date:'2026-11-01',type:'in',walletId:'a',amount:'200.00'}
]});
const state={org:'АИР-КЛИМАТ',from:'2026-10-01',to:'2026-10-31',groupBy:'date'};
test('DDS query reconciles exact filtered journal, chart groups and transfers without changing source records',()=>{
 const data=fixture(),before=JSON.stringify(data),view=model.snapshot(data,state);
 assert.deepEqual(view.rows.map(x=>x._id),['in1','in2','out','refund','transfer']);
 assert.deepEqual(view.totals,{income:30n,outgoing:1123n,transfers:5001n,net:-1093n});
 assert.deepEqual(view.groups.map(g=>[g.key,g.totals.income,g.totals.outgoing,g.totals.transfers]),[['2026-10-01',30n,0n,0n],['2026-10-02',0n,1123n,0n],['2026-10-03',0n,0n,5001n]]);
 assert.equal(view.rows[0],data.cash[1],'native edit source identity remains intact');assert.equal(JSON.stringify(data),before);
 assert.equal(model.snapshot(data,{...state,org:''}).totals.income,100030n);
});
test('type, text, article, destination wallet, party and project filters all select the same monetary sources',()=>{
 const data=fixture();
 for(const [filter,ids,values] of [
  [{type:'in'},['in1','in2'],[30n,0n,0n]],
  [{type:'transfer'},['transfer'],[0n,0n,5001n]],
  [{search:'СЕВЕР второй'},['in2'],[20n,0n,0n]],
  [{search:'0,10 ₽'},['in1'],[10n,0n,0n]],
  [{articleId:'rent'},['out','refund'],[0n,1123n,0n]],
  [{walletId:'b'},['refund','transfer'],[0n,-111n,5001n]],
  [{partyId:'cp:supplier'},['out'],[0n,1234n,0n]],
  [{projectKey:'АИР-КЛИМАТ::1C#ORDER-1'},['in1','out'],[10n,1234n,0n]],
  [{day:'2026-10-01'},['in1','in2'],[30n,0n,0n]]
 ]){const view=model.snapshot(data,{...state,...filter});assert.deepEqual(view.rows.map(x=>x._id),ids);assert.deepEqual([view.totals.income,view.totals.outgoing,view.totals.transfers],values);}
 assert.deepEqual(model.snapshot(data,{...state,search:'невозможный запрос'}).groups,[]);
 const invalid=model.snapshot(data,{...state,from:'2026-11-01',to:'2026-10-01'});assert.equal(invalid.error,'Укажите начало периода не позже окончания.');assert.equal(invalid.complete,false);
 assert.deepEqual(model.snapshot(data,state).options.project,[{id:'АИР-КЛИМАТ::1C#ORDER-1',label:'Объект'}]);
 const missing=fixture();missing.cash.push({_id:'unassigned',org:'АИР-КЛИМАТ',date:'2026-10-10',type:'in',amount:0});assert.deepEqual(model.snapshot(missing,{...state,walletId:'no-wallet'}).rows.map(row=>row._id),['unassigned']);
});
test('grouping remains exhaustive for exact large, negative and zero monetary values',()=>{
 const data=fixture();data.cash.push({_id:'large',org:'АИР-КЛИМАТ',date:'2026-10-04',type:'in',amount:'123456789012.34',articleId:'sales'}, {_id:'zero',org:'АИР-КЛИМАТ',date:'2026-10-05',type:'in',amount:0});
 for(const groupBy of ['date','month','article','wallet','party']){const view=model.snapshot(data,{...state,groupBy});assert.equal(view.totals.income,12345678901264n);assert.equal(view.groups.reduce((n,g)=>n+g.totals.income,0n),12345678901264n);assert.equal(view.groups.reduce((n,g)=>n+g.count,0),7);}
 data.cash.push({_id:'invalid',org:'АИР-КЛИМАТ',date:'2026-10-06',type:'out',amount:'broken'});const view=model.snapshot(data,state);assert.equal(view.complete,false);assert.equal(view.rows.length,8);assert.deepEqual(view.issues,['invalid']);
});
