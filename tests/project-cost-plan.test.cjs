const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/project-workspace-model.js'),core=require('../app/finance-core.js');
const deal={_id:'p',org:'АИР-КЛИМАТ',name:'Проект',order1c:'1',contractTotal:10000,vatRate:0,cost:900};
const key=core.dealKey(deal);
function fixture(){return {data:{deals:[deal],dealPlans:{p:{items:[{id:'w',name:'Монтаж',unit:'шт',planned:10,priceLabel:'Монтаж · Система · шт'}]}},priceCatalog:[{name:'Монтаж',section:'Система',unit:'шт',rate:100}],cash:[],expenses:[],workActs:[],labor:[],costs:[],realizations:[]},warehouse:{items:[{id:'m',name:'Труба',unit:'м',category:'Материалы'}],places:[{id:'s',org:deal.org}],plans:[{dealId:'p',org:deal.org,lines:[{itemId:'m',qty:10}]}],moves:[{id:'r',org:deal.org,kind:'receipt',itemId:'m',to:'s',qty:20,price:50,date:'2026-10-01'}]},fifo:{bins:new Map([['s::m',[{qty:20,cost:50,source:'r',date:'2026-10-01'}]]]),byMove:{},warnings:[]}}}
function plan(f,d=deal){return model.snapshot(f.data,d,f.warehouse,f.fifo).budget}
// A forecast of remaining quantities or a stale deal.cost must fail this full-plan contract.
test('full plan is calculated before any actual documents exist and sources remain unchanged',()=>{
 const f=fixture(),before=JSON.stringify([f.data,f.warehouse]),p=plan(f);
 assert.equal(p.total,150000n);assert.equal(p.rows.find(x=>x.id==='labor').plan,100000n);assert.equal(p.rows.find(x=>x.id==='materials').plan,50000n);assert.equal(p.automatic,true);assert.equal(p.lines[0].plannedQty,10);assert.equal(JSON.stringify([f.data,f.warehouse]),before);
});
test('execution and cash never subtract planned quantities or add actual costs to the plan',()=>{
 const f=fixture();f.data.workActs=[{id:'a',org:deal.org,projectKey:key,status:'approved',planItemId:'w',qty:10,rate:80,date:'2026-10-02'}];f.warehouse.moves.push({id:'c',kind:'consume',org:deal.org,dealId:'p',itemId:'m',qty:10,from:'s',date:'2026-10-02'});f.fifo.bins.get('s::m')[0].qty=10;f.data.cash=[{type:'out',org:deal.org,projectKey:key,amount:999,date:'2026-10-02'}];
 assert.equal(plan(f).total,150000n);assert.equal(plan(f).lines.find(x=>x.kind==='work').plannedQty,10);
 f.fifo.bins.clear();assert.equal(plan(f).total,150000n);assert.equal(plan(f).lines.find(x=>x.kind==='material').estimated,true);
});
test('current prices revalue all planned quantities and actual work rates remain fixed',()=>{
 const f=fixture();f.data.priceCatalog[0].rate=120;f.warehouse.moves[0].price=70;f.fifo.bins.get('s::m')[0].cost=70;
 assert.equal(plan(f).total,190000n);
});
test('missing work price leaves total unknown while exposing priced part, not a stale manual fallback',()=>{
 const f=fixture();f.data.priceCatalog=[];const p=plan(f,{...deal,planLabor:2000,planTransport:100});
 assert.equal(p.total,null);assert.equal(p.knownTotal,60000n);assert.equal(p.unknownCount,1);assert.equal(p.rows.find(x=>x.id==='labor').plan,null);
});
test('ambiguous or foreign prices cannot silently match another work',()=>{
 const f=fixture();f.data.priceCatalog.push({...f.data.priceCatalog[0]});assert.equal(plan(f).total,null);
 f.data.priceCatalog=[{...f.data.priceCatalog[0],org:'Другая организация'}];assert.equal(plan(f).total,null);
});
test('zero work rate is explicit, missing acquisition price is unknown and missing quantity is not zero',()=>{
 const f=fixture();f.data.priceCatalog[0].rate=0;assert.equal(plan(f).total,50000n);
 f.warehouse.moves[0].price=0;f.fifo.bins.get('s::m')[0].cost=0;assert.equal(plan(f).total,null);
 const g=fixture();delete g.data.dealPlans.p.items[0].planned;assert.equal(plan(g).total,null);
});
test('material plans aggregate repeated rows, isolate organizations and retain supplementary budgets',()=>{
 const f=fixture();f.warehouse.plans[0].lines=[{itemId:'m',qty:6},{itemId:'m',qty:4}];f.warehouse.plans.push({dealId:'p',org:'Другая организация',lines:[{itemId:'m',qty:100}]});
 const p=plan(f,{...deal,planMaterials:9999,planLabor:9999,planTransport:100,planOther:0});assert.equal(p.total,160000n);assert.equal(p.lines.find(x=>x.kind==='material').plannedQty,10);
 f.warehouse.places[0].org='Другая организация';f.warehouse.moves[0].org='Другая организация';assert.equal(plan(f).total,null);
});
test('full material plan uses explicit input VAT metadata without applying invoice net total to a unit price',()=>{
 const f=fixture();f.warehouse.moves[0]=Object.assign(f.warehouse.moves[0],{price:122,vatRate:22,vatDeductible:true,amountGross:2440,amountNet:2000,vatAmount:440});f.fifo.bins.get('s::m')[0].cost=122;
 assert.equal(plan(f).total,200000n);f.warehouse.moves[0].vatDeductible=false;assert.equal(plan(f).total,222000n);
 delete f.warehouse.moves[0].vatDeductible;assert.equal(plan(f).total,null);
});
test('material composition fallback requires a unique item and zero planned quantity needs no price',()=>{
 const f=fixture();f.warehouse.plans=[];f.data.dealPlans.p.materials=[{name:'Труба',unit:'м',qty:10}];assert.equal(plan(f).total,150000n);
 f.warehouse.items.push({id:'other',name:'Труба',unit:'м'});assert.equal(plan(f).total,null);
 f.data.dealPlans.p.materials=[{name:'Не требуется',unit:'шт',qty:0}];assert.equal(plan(f).total,100000n);
});
test('equipment is separate from materials and no-composition legacy budgets remain editable',()=>{
 const f=fixture();f.warehouse.items[0].category='Оборудование';assert.equal(plan(f).rows.find(x=>x.id==='equipment').plan,50000n);
 f.data.dealPlans={};f.warehouse.plans=[];assert.equal(plan(f).total,90000n);assert.equal(plan(f).automatic,false);
});
test('FIFO fallback valuation never confirms an acquisition whose recorded price is zero',()=>{
 const f=fixture();f.warehouse.moves[0].kind='opening';f.warehouse.moves[0].price=0;f.fifo.bins.get('s::m')[0].estimated=true;f.warehouse.moves.push({id:'later',kind:'receipt',org:deal.org,itemId:'m',to:'s',qty:20,price:50,date:'2026-10-02'});
 assert.equal(plan(f).total,null);assert.equal(plan(f).unknownCount,1);
});
test('contradictory source VAT totals require review before any planned net valuation',()=>{
 const f=fixture();Object.assign(f.warehouse.moves[0],{price:122,vatRate:22,vatDeductible:true,amountGross:2440,amountNet:2440,vatAmount:0});f.fifo.bins.get('s::m')[0].cost=122;
 assert.equal(plan(f).total,null);assert.equal(plan(f).unknownCount,1);
});
test('a partly priced material retains known lot value without presenting the line as complete',()=>{
 const f=fixture();f.data.dealPlans={};f.warehouse.moves.push({id:'unpriced',kind:'receipt',org:deal.org,itemId:'m',to:'s',qty:5,price:0,date:'2026-10-02'});f.fifo.bins.set('s::m',[{qty:5,cost:50,source:'r',date:'2026-10-01'},{qty:5,cost:0,source:'unpriced',date:'2026-10-02'}]);const p=plan(f);
 assert.equal(p.total,null);assert.equal(p.knownTotal,25000n);assert.equal(p.lines[0].amount,null);
 f.fifo.bins.set('s::m',[{qty:5,cost:0,source:'unpriced',date:'2026-10-01'},{qty:5,cost:50,source:'r',date:'2026-10-02'}]);assert.equal(plan(f).knownTotal,25000n);
});
