const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/project-workspace-model.js'),core=require('../app/finance-core.js');
test('project stage schedule totals exclude cancelled scope without creating financial facts',()=>{
 const deal={org:'АРБАТ.ГК',order1c:'1',contractTotal:'10.01',projectStages:[{id:'a',name:'Подготовка',amount:'3.33',startDate:'2026-01-31',endDate:'2026-02-28',status:'completed'},{id:'b',name:'Монтаж',amount:'6.68',status:'planned'},{id:'c',name:'Отмена',amount:'4',status:'cancelled'}]};
 const copy=JSON.stringify(deal),result=model.stages(deal);
 assert.equal(result.total,1001n);assert.equal(result.completed,333n);assert.equal(result.cancelled,400n);assert.equal(result.difference,0n);assert.equal(result.undated,1);assert.equal(JSON.stringify(deal),copy);
 const empty={deals:[deal],cash:[],expenses:[],costs:[],realizations:[],labor:[],workActs:[]};
 const view=model.snapshot(empty,deal);assert.equal(view.revenue,0n);assert.equal(view.cash.income,0n);assert.equal(view.cost,0n);assert.equal(empty.realizations.length,0);
});
test('stage validation retains incomplete dates and exact decimal amounts, rejects negative or ambiguous input',()=>{
 const [stage]=model.normalizeStages([{id:'a',name:' Этап ',amount:'1.2',startDate:'2026-01-01',status:'active'}]);
 assert.deepEqual(stage,{id:'a',name:'Этап',amount:'1.20',startDate:'2026-01-01',endDate:'',status:'active'});
 for(const amount of ['-1','0.001','1e3','',null])assert.throws(()=>model.normalizeStages([{id:'a',name:'Этап',amount}]),/сумм/i);
 for(const stage of [{startDate:'2026-02-29'},{startDate:'2026-05-02',endDate:'2026-05-01'},{status:'unknown'},{name:''}])assert.throws(()=>model.normalizeStages([{id:'a',name:'Этап',amount:'1',...stage}]));
 assert.throws(()=>model.normalizeStages([{id:'a',name:'А',amount:'1'},{id:'a',name:'Б',amount:'2'}]),/повтор/i);
 assert.throws(()=>model.normalizeStages('{}'),/массив/i);
});
test('monthly splitting keeps every kopek and clamps month days from the original anchor',()=>{
 const rows=model.splitStages({amount:'10.01',startDate:'2026-01-31',months:3,name:'Монтаж'});
 assert.deepEqual(rows.map(x=>x.amount),['3.34','3.34','3.33']);
 assert.deepEqual(rows.map(x=>x.startDate),['2026-01-31','2026-02-28','2026-03-31']);
 assert.equal(new Set(rows.map(x=>x.id)).size,3);assert.equal(rows.reduce((n,x)=>n+core.cents(x.amount),0n),1001n);
 const leap=model.splitStages({amount:'0.01',startDate:'2028-01-31',months:3});
 assert.deepEqual(leap.map(x=>x.amount),['0.01','0.00','0.00']);assert.equal(leap[1].startDate,'2028-02-29');
 const large=model.splitStages({amount:'90071992547409.93',startDate:'2026-12-31',months:7});assert.equal(large.reduce((n,x)=>n+core.cents(x.amount),0n),9007199254740993n);
 for(const args of [{amount:'-1'},{startDate:''},{startDate:'2026-02-30'},{months:0},{months:1.5},{months:121}])assert.throws(()=>model.splitStages({amount:'1',startDate:'2026-01-31',months:3,...args}));
});
