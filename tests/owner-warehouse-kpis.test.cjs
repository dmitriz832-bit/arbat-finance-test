const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core.js');
test('FIFO inventory count, valuation and active crew reservation are not conflated',()=>{
 const wh={items:[{id:'bolt',name:'Крепёж'}],places:[{id:'crew1',name:'Бригада №1',org:'АИР-КЛИМАТ'}],projectIssues:[{closed:false,crewId:'crew1',lines:[{itemId:'bolt',fromCrew:3}]}]};
 const fifo={warnings:[],bins:new Map([['crew1::bolt',[{qty:5,cost:100}]]])};
 const x=core.ownerWarehouseSnapshot(wh,fifo);
 assert.equal(x.rows[0].qty,5);assert.equal(x.rows[0].reserved,3);assert.equal(x.rows[0].free,2);
 assert.equal(x.reservedQty,3);assert.equal(core.rubles(x.totalValue),'500.00');
});
test('reservation beyond balance is a deficit, never negative free stock',()=>{
 const wh={items:[],places:[],projectIssues:[{crewId:'c',lines:[{itemId:'m',fromCrew:9}]}]};
 const fifo={warnings:[],bins:new Map([['c::m',[{qty:4,cost:2}]]])};
 const x=core.ownerWarehouseSnapshot(wh,fifo);assert.equal(x.deficitQty,5);assert.equal(x.rows[0].free,0);
});
test('unpriced FIFO lots suppress false precision of total warehouse valuation',()=>{
 const x=core.ownerWarehouseSnapshot({items:[],places:[],projectIssues:[]},{warnings:[],bins:new Map([['p::a',[{qty:3,cost:0}]]])});
 assert.equal(x.totalValue,null);assert.equal(x.rows[0].value,null);assert.equal(x.issues.length,1);
});

test('an open crew reservation without any FIFO lots is reported as shortage',()=>{
 const warehouse={items:[{id:'i',name:'Крепёж'}],places:[{id:'crew',name:'Бригада',org:'АИР-КЛИМАТ'}],projectIssues:[{closed:false,crewId:'crew',lines:[{itemId:'i',fromCrew:4}]}]};
 const result=core.ownerWarehouseSnapshot(warehouse,{bins:new Map(),warnings:[]},'АИР-КЛИМАТ');
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].qty,0);
 assert.equal(result.rows[0].reserved,4);
 assert.equal(result.rows[0].deficit,4);
 assert.equal(result.deficitQty,4);
});

test('all stock committed by an open issue is reserved, including warehouse-issued materials',()=>{
 const wh={items:[{id:'i'}],places:[{id:'crew'}],projectIssues:[{crewId:'crew',lines:[{itemId:'i',issued:7,fromCrew:2}]}]};
 const x=core.ownerWarehouseSnapshot(wh,{bins:new Map([['crew::i',[{qty:10,cost:2}]]]),warnings:[]});
 assert.equal(x.rows[0].reserved,7);assert.equal(x.rows[0].free,3);
});
test('explicit zero issue and closed returned issue do not reserve stock; legacy fromCrew remains supported',()=>{
 const wh={items:[],places:[],projectIssues:[{crewId:'c',lines:[{itemId:'i',issued:0,fromCrew:8}]},{closed:true,crewId:'c',lines:[{itemId:'i',issued:9}]},{crewId:'c',lines:[{itemId:'i',fromCrew:2}]}]};
 const x=core.ownerWarehouseSnapshot(wh,{bins:new Map([['c::i',[{qty:5,cost:2}]]]),warnings:[]});
 assert.equal(x.rows[0].reserved,2);assert.equal(x.rows[0].free,3);
});
test('unassigned warehouse stock and shortages are not attributed to either organization',()=>{
 const wh={places:[{id:'air',org:'АИР-КЛИМАТ'},{id:'arbat',org:'АРБАТ.ГК'},{id:'unknown'}],items:[],projectIssues:[{crewId:'missing',lines:[{itemId:'i',issued:3}]}]};
 const fifo={bins:new Map([['air::i',[{qty:1,cost:10}]],['arbat::i',[{qty:1,cost:20}]],['unknown::i',[{qty:1,cost:30}]]]),warnings:[]};
 const air=core.ownerWarehouseSnapshot(wh,fifo,'АИР-КЛИМАТ'),arbat=core.ownerWarehouseSnapshot(wh,fifo,'АРБАТ.ГК'),all=core.ownerWarehouseSnapshot(wh,fifo);
 assert.equal(air.totalValue,1000n);assert.equal(arbat.totalValue,2000n);assert.equal(all.totalValue,6000n);assert.equal(air.deficitQty,0);assert.equal(arbat.deficitQty,0);assert.equal(all.deficitQty,3);
});
