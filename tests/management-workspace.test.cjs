const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/management-workspace-model.js');
const A='АИР-КЛИМАТ',B='АРБАТ.ГК',today='2026-10-26';
const opts={today,period:'2026-10'};
test('management workspace separates accrual result, real cash and known supplier debt without postings',()=>{
 const data={realizations:[{org:A,date:today,amount:100,vatRate:0}],expenses:[{_id:'e',org:A,date:today,amount:40,paymentDueDate:today}],cash:[{_id:'p',org:A,date:today,type:'out',amount:10,supplierAllocations:[{documentKey:'expenses:e',amount:10}]}]},before=JSON.stringify(data),s=model.snapshot(data,{},opts);
 assert.equal(s.cash.outgoing,1000n);assert.equal(s.result.revenue,10000n);assert.equal(s.suppliers.knownRemaining,3000n);assert.equal(s.planning.obligations7,3000n);assert.equal(JSON.stringify(data),before);
});
test('confirmed customer advances cannot net debt of another project or company',()=>{
 const deals=[{org:A,_id:'a',n:1},{org:B,_id:'b',n:2}],core=require('../app/finance-core');
 const s=model.snapshot({deals,realizations:[{org:A,projectKey:core.dealKey(deals[0]),amount:100,date:today}],cash:[{org:B,projectKey:core.dealKey(deals[1]),type:'in',amount:100,date:today}]},{},opts);
 assert.equal(s.customers.receivable,10000n);assert.equal(s.customers.advances,10000n);
});
test('payroll debt stays separated by organization even for the same employee',()=>{
 const s=model.snapshot({labor:[{personId:'p',org:A,amount:100}],cash:[{personId:'p',org:B,type:'out',amount:100}]},{},opts);
 assert.equal(s.payroll.payable,10000n);assert.equal(s.payroll.overpaid,10000n);assert.equal(s.payroll.people.length,2);assert.equal(s.payroll.people.find(p=>p.org===A).payable,10000n);
});
test('unknown supplier document is not shown as a complete zero total and scoping isolates other company',()=>{
 const d={expenses:[{_id:'bad',org:B,amount:'invalid'},{_id:'good',org:A,amount:20,paymentDueDate:today}]};
 const all=model.snapshot(d,{},opts);assert.equal(all.suppliers.totalRemaining,null);assert.equal(all.suppliers.knownRemaining,2000n);
 const air=model.snapshot(d,{}, {...opts,org:A});assert.equal(air.suppliers.totalRemaining,2000n);assert.equal(air.suppliers.reviewCount,0);
});
test('planning presents calendar aliases once and keeps expected receipts separate from debt',()=>{
 const d={expenses:[{_id:'e',org:A,amount:'0.30',paymentDueDate:today}],calendar:[{id:'alias',org:A,supplierDocumentKey:'expenses:e',dueDate:today,amount:'0.30'},{id:'income',org:A,type:'in',amount:'0.10',dueDate:today}]};
 const s=model.snapshot(d,{},opts);assert.equal(s.planning.obligations7,30n);assert.equal(s.planning.income.due7,10n);assert.equal(s.planning.linkedCalendar.length,1);
});
test('period uses actual month boundary and excludes transfers from income, payments and article totals',()=>{
 const s=model.snapshot({articles:[{id:'income',name:'Выручка'}],cash:[{type:'in',org:A,amount:10,date:'2026-02-28',articleId:'income'},{type:'out',org:A,amount:7,date:'2026-03-01'},{type:'transfer',org:A,amount:5,date:'2026-02-10'}]},{}, {...opts,period:'2026-02'});
 assert.equal(s.bounds.to,'2026-02-28');assert.equal(s.cash.income,1000n);assert.equal(s.cash.outgoing,0n);assert.equal(s.cash.transfers,500n);assert.equal(s.cash.categories[0].name,'Выручка');assert.throws(()=>model.snapshot({}, {},{...opts,period:'2026-13'}));
});
