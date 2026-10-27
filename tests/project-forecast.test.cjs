const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/project-workspace-model.js'),core=require('../app/finance-core.js');
const deal={_id:'p',name:'Вентиляция',org:'АИР-КЛИМАТ',order1c:'Заказ / 1',contractTotal:10000,vatRate:0,cost:900};
const key=core.dealKey(deal),base=()=>({deals:[deal],dealPlans:{p:{docNo:'Смета 1',items:[{id:'w',name:'Монтаж',unit:'шт',planned:10,priceLabel:'Монтаж · Система · шт'}]}},priceCatalog:[{name:'Монтаж',section:'Система',unit:'шт',rate:100}],workActs:[],cash:[],expenses:[],costs:[],labor:[],realizations:[]});
test('realization project title resolves stable identity, same names and organizations without changing source',()=>{
 const other={...deal,_id:'q',org:'АРБАТ.ГК'},state={deals:[deal,other]},source={projectKey:key,org:deal.org};
 assert.equal(model.projectTitle(state,source),'Вентиляция');assert.equal(source.projectKey,key);
 assert.equal(model.projectTitle(state,{projectKey:core.dealKey(other),org:other.org}),'Вентиляция');
 assert.match(model.projectTitle(state,{projectKey:key,org:other.org}),/Требует сверки/);
 assert.match(model.projectTitle(state,{projectKey:'gone::1C#ID'}),/Проект не найден/);
 assert.match(model.projectTitle(state,{}),/Без проекта/);
});
test('forecast uses approved completed quantity and current rate while preserving explicit baseline and actual ledger',()=>{
 const state=base();state.workActs=[{id:'a',projectKey:key,org:deal.org,planItemId:'w',name:'Монтаж',qty:4,rate:80,status:'approved',date:'2026-10-01'},{id:'draft',projectKey:key,org:deal.org,planItemId:'w',qty:2,rate:90,status:'draft'}];
 const before=JSON.stringify(state),view=model.snapshot(state,deal),f=view.forecast;
 assert.equal(f.rows.find(r=>r.kind==='work').remainingQty,6);assert.equal(f.remaining,60000n);assert.equal(f.cost,92000n);assert.equal(f.income,1000000n);assert.equal(f.profit,908000n);assert.equal(view.budget.total,90000n);assert.equal(view.cost,32000n);assert.equal(JSON.stringify(state),before);
 state.priceCatalog[0].rate=120;assert.equal(model.snapshot(state,deal).forecast.cost,104000n);
 state.workActs[0].qty=7;assert.equal(model.snapshot(state,deal).forecast.remaining,36000n);
});
test('reimported plan reconciles a stale work item ID through a unique exact work label without counting completed work twice',()=>{
 const state=base();state.dealPlans.p.initialEstimateItems=structuredClone(state.dealPlans.p.items);state.dealPlans.p.items[0].id='reimported';state.workActs=[{id:'done',projectKey:key,org:deal.org,planItemId:'w',priceName:'Монтаж',section:'Система',unit:'шт',qty:4,rate:100,status:'approved',date:'2026-10-01'}];
 const before=JSON.stringify(state),forecast=model.snapshot(state,deal).forecast;
 assert.equal(forecast.rows.find(r=>r.id==='reimported').remainingQty,6);
 assert.equal(forecast.cost,100000n);assert.equal(forecast.unbudgeted.length,0);assert.equal(JSON.stringify(state),before);
});
function warehouse(){return {items:[{id:'m',name:'Труба',unit:'м',category:'Материалы'}],places:[{id:'s',org:deal.org,type:'warehouse'}],plans:[{dealId:'p',org:deal.org,lines:[{itemId:'m',qty:10,price:0}]}],moves:[{id:'r',kind:'receipt',itemId:'m',org:deal.org,to:'s',qty:20,price:50,date:'2026-10-01'},{id:'c',kind:'consume',dealId:'p',org:deal.org,itemId:'m',from:'s',qty:4,date:'2026-10-02'}]}}
function fifo(wh){const price=wh.moves[0].price;return {bins:new Map([['s::m',[{qty:16,cost:price,date:'2026-10-01',source:'r'}]]]),byMove:{c:{amount:4*price,invalid:false}},warnings:[]}}
test('receipt price changes update remaining material forecast, returns do not become consumption and actual is not posted',()=>{
 const state=base();state.dealPlans={};const wh=warehouse();state.expenses=[{_id:'expense',projectKey:key,org:deal.org,category:'Материалы',amount:200,vatRate:0,warehouseMoveId:'c',date:'2026-10-02'}];
 assert.equal(model.snapshot(state,deal,wh,fifo(wh)).forecast.remaining,30000n);
 wh.moves[0].price=70;assert.equal(model.snapshot(state,deal,wh,fifo(wh)).forecast.remaining,42000n);assert.equal(state.expenses[0].amount,200);
 wh.moves.push({id:'return',kind:'return',dealId:'p',org:deal.org,itemId:'m',qty:2,from:'crew',to:'s'});assert.equal(model.snapshot(state,deal,wh,fifo(wh)).forecast.rows[0].remainingQty,6);
 wh.moves[1].qty=2;assert.equal(model.snapshot(state,deal,wh,fifo(wh)).forecast.rows[0].remainingQty,8);
});
test('missing or ambiguous work price and unpriced FIFO remain unknown, never zero or foreign organization prices',()=>{
 const state=base();state.priceCatalog=[];assert.equal(model.snapshot(state,deal).forecast.cost,null);assert.equal(model.snapshot(state,deal).forecast.rows[0].remainingCost,null);
 const wh=warehouse();state.dealPlans={};wh.moves[0].price=0;const f=fifo(wh);assert.equal(model.snapshot(state,deal,wh,f).forecast.cost,null);
 wh.places[0].org='АРБАТ.ГК';f.bins.get('s::m')[0].cost=50;assert.equal(model.snapshot(state,deal,wh,f).forecast.cost,null);
});
test('same named unrelated work is not completed by another project and unbudgeted work has useful sources',()=>{
 const state=base();state.dealPlans.p.initialEstimateItems=structuredClone(state.dealPlans.p.items);state.dealPlans.p.items.push({id:'extra',name:'Пусконаладка',unit:'час',planned:2,rate:300});
 state.workActs=[{id:'foreign',projectKey:'else',org:deal.org,planItemId:'w',name:'Монтаж',qty:5,rate:100,status:'approved'}, {id:'extra-act',projectKey:key,org:deal.org,name:'Дополнительный выезд',unit:'час',qty:1,rate:200,status:'approved',date:'2026-10-02'}];
 const f=model.snapshot(state,deal).forecast;assert.equal(f.rows.find(r=>r.id==='w').remainingQty,10);assert.equal(f.unbudgeted.length,2);assert.ok(f.unbudgeted.some(r=>r.name==='Пусконаладка'&&r.sourceCollection==='dealPlans'));assert.ok(f.unbudgeted.some(r=>r.source.id==='extra-act'&&r.actualCost===20000n));
});
test('forecast uses accrued cost plus remaining without counting recognized expense and WIP again',()=>{
 const state=base();state.realizations=[{projectKey:key,org:deal.org,amount:5000,vatRate:0,date:'2026-10-03'}];state.workActs=[{id:'a',projectKey:key,org:deal.org,planItemId:'w',qty:4,rate:100,status:'approved',date:'2026-10-01'}];
 const v=model.snapshot(state,deal);assert.equal(v.recognizedCost,20000n);assert.equal(v.wip,20000n);assert.equal(v.forecast.cost,100000n);
});
test('partly priced materials stay unknown and explicit other budgets add only the unspent portion',()=>{
 const state=base();state.dealPlans={};const d={...deal,planMaterials:1000,planTransport:500};state.deals=[d];state.expenses=[{_id:'transport',projectKey:key,org:deal.org,category:'Транспорт',amount:200,vatRate:0,date:'2026-10-01'}];
 const wh=warehouse(),f=fifo(wh);f.bins.get('s::m').splice(0,1,{qty:2,cost:50,date:'2026-10-01'},{qty:14,cost:0,date:'2026-10-02'});
 const v=model.snapshot(state,d,wh,f);assert.equal(v.forecast.remaining,null);assert.equal(v.forecast.knownRemaining,30000n);assert.equal(v.forecast.cost,null);assert.equal(v.budget.total,150000n);
});
test('equipment acquisition is separate and forecast does not double its explicit original budget',()=>{
 const state=base();state.dealPlans={};const d={...deal,planEquipment:2000};state.deals=[d];const wh=warehouse();wh.items[0].category='Оборудование';const v=model.snapshot(state,d,wh,fifo(wh));assert.equal(v.forecast.rows.length,1);assert.equal(v.forecast.rows[0].category,'equipment');assert.equal(v.forecast.remaining,30000n);assert.equal(v.budget.total,200000n);
});
test('initial estimate snapshot copies rows and remains immutable when the current plan changes',()=>{
 const plan=base().dealPlans.p;const baseline=model.initialEstimate(plan);plan.initialEstimateItems=baseline;plan.items[0].planned=15;plan.items.push({id:'extra',name:'Дополнение',unit:'шт',planned:1,rate:20});assert.equal(model.initialEstimate(plan)[0].planned,10);const state=base();state.dealPlans.p=plan;const f=model.snapshot(state,deal).forecast;assert.equal(f.rows.find(r=>r.id==='extra').unbudgeted,true);
});
test('same name with another price section is unbudgeted and ambiguous matching cannot consume remaining quantity',()=>{
 const state=base();state.workActs=[{id:'a',projectKey:key,org:deal.org,name:'Монтаж',section:'Другая система',unit:'шт',qty:4,rate:80,status:'approved'}];const f=model.snapshot(state,deal).forecast;assert.equal(f.rows.find(r=>r.id==='w').remainingQty,10);assert.equal(f.unbudgeted.length,1);
 state.priceCatalog.push({...state.priceCatalog[0]});assert.equal(model.snapshot(state,deal).forecast.remaining,null);
});
test('missing quantities and nonfinite acquisition prices require review instead of fabricated zero',()=>{
 const state=base();state.dealPlans.p.items[0].planned=null;assert.equal(model.snapshot(state,deal).forecast.remaining,null);
 state.dealPlans={};const wh=warehouse(),f=fifo(wh);f.bins.get('s::m')[0].cost=Infinity;assert.equal(model.snapshot(state,deal,wh,f).forecast.remaining,null);
});
test('an extra completed act alone does not discard the explicit legacy cost plan',()=>{
 const state=base();state.dealPlans={};state.workActs=[{id:'extra',projectKey:key,org:deal.org,name:'Выезд',unit:'час',qty:1,rate:200,status:'approved'}];const v=model.snapshot(state,deal);assert.equal(v.budget.total,90000n);assert.equal(v.forecast.cost,90000n);assert.equal(v.forecast.remaining,70000n);assert.equal(v.forecast.unbudgeted.length,1);
});
test('contradictory stable project IDs do not display a guessed title',()=>{const state={deals:[deal,{...deal,_id:'q',order1c:'other'}]};assert.match(model.projectTitle(state,{projectKey:key,dealId:'q',org:deal.org}),/Требует сверки/)});
test('FIFO preserves acquisition order for same-day lots and shortage uses the most recent same-day receipt',()=>{
 const state=base();state.dealPlans={};const wh=warehouse();wh.plans[0].lines[0].qty=6;wh.moves=[{id:'z-first',kind:'receipt',itemId:'m',org:deal.org,to:'s',qty:1,price:50,date:'2026-10-01'},{id:'a-second',kind:'receipt',itemId:'m',org:deal.org,to:'s',qty:10,price:100,date:'2026-10-01'}];
 const f={bins:new Map([['s::m',[{qty:1,cost:50,date:'2026-10-01',source:'z-first'},{qty:10,cost:100,date:'2026-10-01',source:'a-second'}]]]),byMove:{},warnings:[]};assert.equal(model.snapshot(state,deal,wh,f).forecast.remaining,55000n);
 f.bins=new Map();assert.equal(model.snapshot(state,deal,wh,f).forecast.remaining,60000n);
});
