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
