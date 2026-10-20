'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const f=require('../app/finance-core.js');

// End-to-end accounting invariant across two periods; no production writes.
test('advance, realization and final payment reconcile without duplicate revenue',()=>{
 const deal={_id:'scenario-1',org:'АРБАТ.ГК',name:'Контрольная сделка'};
 const key=f.dealKey(deal);
 const payments=[
  {date:'2026-09-05',type:'in',walletId:'bank',org:deal.org,amount:'300000',articleId:'customer-advance'},
  {date:'2026-10-20',type:'in',walletId:'bank',org:deal.org,amount:'200000',articleId:'customer-final-payment'}
 ];
 const data={deals:[deal],realizations:[{date:'2026-10-15',org:deal.org,projectKey:key,amount:'500000',vatRate:'0'}],expenses:[],costs:[],labor:[],workActs:[]};
 assert.equal(f.cashFlow(payments,'2026-09',deal.org).net,30000000n);
 assert.equal(f.cashFlow(payments,'2026-10',deal.org).net,20000000n);
 assert.equal(f.walletSnapshot('0',payments,'bank').balance,50000000n);
 assert.equal(f.preliminaryPeriod(data,'2026-09',deal.org).revenue,0n);
 assert.equal(f.preliminaryPeriod(data,'2026-10',deal.org).revenue,50000000n);
 assert.equal(f.projectSnapshot(data,deal,key).revenue,50000000n);
});
test('approved work act counts once as project cost',()=>{
 const deal={_id:'scenario-2',org:'АРБАТ.ГК',name:'Монтаж'};
 const key=f.dealKey(deal);
 const data={deals:[deal],realizations:[],expenses:[],costs:[],labor:[],workActs:[{id:'act-1',date:'2026-10-16',org:deal.org,projectKey:key,status:'approved',qty:2,rate:15000}]};
 const result=f.projectSnapshot(data,deal,key);
 assert.equal(result.cost,3000000n);
 assert.equal(result.result,-3000000n);
});
