const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core.js');
test('owner dashboard and P&L match when WIP recognition is enabled',()=>{
 const deal={_id:'project',org:'АИР-КЛИМАТ',order1c:'WIP-1',name:'Project',dir:'Сервис',contractTotal:'100000',cost:'50000'},key=core.dealKey(deal);
 const base={org:'АИР-КЛИМАТ',date:'2026-10-17'};
 const data={deals:[deal],people:[],realizations:[{...base,projectKey:key,amount:'60000'}],expenses:[{...base,projectKey:key,amount:'10000'}],workActs:[{...base,id:'act',projectKey:key,qty:1,rate:'2000',status:'approved',memberIds:['one','two','three']}],costs:[{...base,dir:'Сервис',amount:'3000'},{...base,amount:'4000'}],labor:[{...base,expenseType:'administrative',amount:'10000',employerContributions:'3000'}],cash:[],wipAccounting:true};
 const expected=core.preliminaryPeriod(data,'2026-10'),actual=core.ownerPeriodSnapshot(data,core.ownerPeriodBounds('month','2026-10-18'));
 assert.equal(actual.result,expected.result);
 assert.equal(core.rubles(actual.result),'32800.00');
 assert.equal(core.rubles(actual.deferredChange),'4800.00');
});
test('all-time WIP bridges are summed by accounting month, not the latest month only',()=>{
 const deal={_id:'d',org:'АИР-КЛИМАТ',order1c:'WIP-2',name:'Project 2',dir:'Сервис',contractTotal:100000,cost:50000},key=core.dealKey(deal);
 const data={deals:[deal],realizations:[{org:'АИР-КЛИМАТ',projectKey:key,date:'2026-10-15',amount:60000}],expenses:[{org:'АИР-КЛИМАТ',projectKey:key,date:'2026-09-17',amount:12000}],workActs:[],costs:[],labor:[],wipAccounting:true};
 const p=core.ownerPeriodSnapshot(data,core.ownerPeriodBounds('all','2026-10-18'));
 assert.equal(p.wipBridges.length,2);
 assert.equal(p.deferredChange,p.wipBridges.reduce((v,x)=>v+x.deferredChange,0n));
});
