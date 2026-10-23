const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../app/finance-core'),pay=require('../app/payables-model'),{specs,fixture,receiptKey,payment,inspect}=require('./helpers/business-cycle.cjs');
const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
function source(name,end){const start=html.indexOf('function '+name+'(');assert.ok(start>=0);return html.slice(start,html.indexOf(end,start+1))}
function engine(finance,warehouse){
 const storage=new Map([['arbat-warehouse-v1',JSON.stringify(warehouse)]]),context=vm.createContext({db:finance,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},window:{arbatDealKey:core.dealKey},console});
 vm.runInContext(source('calc','\nwindow.arbatAudit=')+';window.arbatFifo=calc;const read=()=>JSON.parse(localStorage.getItem("arbat-warehouse-v1"));'+source('reconcileProjectExpenses','\nfunction updateExpenseLinks'),context);
 return ()=>{storage.set('arbat-warehouse-v1',JSON.stringify(warehouse));context.reconcileProjectExpenses();return context.window.arbatFifo(warehouse)};
}
for(const s of specs)test('two-month business cycle: '+s.org,()=>{
 const {finance:f,warehouse:w}=fixture(),refresh=engine(f,w),deal=f.deals.find(d=>d._id===s.id),key=core.dealKey(deal);
 const cents=n=>BigInt(n)*100n;
 function check(stage,values,period){const a=inspect(f,w,refresh(),s,period);for(const [k,v] of Object.entries(values))assert.deepEqual(a[k],typeof v==='number'?cents(v):v,stage+': '+k);assert.equal(a.result,a.ownerResult,stage+': owner and P&L');assert.equal(a.directionDifference,0n,stage+': direction reconciliation');assert.equal(a.wipStatus,'calculated',stage+': '+a.wipIssues);assert.equal(a.supplierReview,0);assert.deepEqual(a.debtIssues,[]);return a}
 const move=(id,date,kind,itemId,qty,price,from='',to='')=>({id:s.id+'-'+id,n:w.moves.length+1,org:s.org,date,kind,itemId,qty,price,from,to});
 check('empty',{cash:100000,stock:0,supplier:0,result:0});
 w.moves.push({...move('r1','2026-10-01','receipt','unit',10,1000,'',s.id+'-store'),documentId:'UPD-'+s.id,paymentDueDate:'2026-10-05',supplierId:'supplier'}, {...move('r2','2026-10-01','receipt','pipe',20,100,'',s.id+'-store'),documentId:'UPD-'+s.id,paymentDueDate:'2026-10-05',supplierId:'supplier'});
 check('multiitem unpaid receipt',{cash:100000,stock:12000,supplier:12000,due7:12000,result:0,accrued:0});
 const partial=payment(s,'partial',5000);f.cash.push(partial);partial.supplierAllocations=pay.allocate(f,w,receiptKey(s),partial._id,5000);
 check('partial supplier payment',{cash:95000,stock:12000,supplier:7000,due7:7000,result:0,flow:-5000});
 const before=JSON.stringify(f);assert.throws(()=>pay.allocate(f,w,receiptKey(s),partial._id,1),/остаток/);assert.equal(JSON.stringify(f),before);
 const other=specs.find(x=>x.id!==s.id),foreign=payment(other,'foreign',1);f.cash.push(foreign);assert.throws(()=>pay.allocate(f,w,receiptKey(s),foreign._id,1),/организации/);f.cash.pop();
 w.moves.push({...move('r3','2026-10-04','receipt','unit',5,1200,'',s.id+'-store'),documentId:'SECOND-'+s.id,supplierId:'supplier',paymentDueDate:'2026-10-06'});
 check('second price lot',{stock:18000,supplier:13000,result:0});
 w.moves.push(move('issue-unit','2026-10-05','transfer','unit',13,0,s.id+'-store',s.id+'-crew'),move('issue-pipe','2026-10-05','transfer','pipe',12,0,s.id+'-store',s.id+'-crew'));
 check('issued but not consumed',{stock:18000,accrued:0,result:0});
 w.moves.push({...move('use-unit','2026-10-06','consume','unit',12,0,s.id+'-crew'),dealId:s.id},{...move('use-pipe','2026-10-06','consume','pipe',10,0,s.id+'-crew'),dealId:s.id},move('return-unit','2026-10-06','return','unit',1,0,s.id+'-crew',s.id+'-store'),move('return-pipe','2026-10-06','return','pipe',2,0,s.id+'-crew',s.id+'-store'));
 check('FIFO consumed with return',{stock:4600,accrued:13400,wip:13400,result:0,supplier:13000});
 assert.equal(f.expenses.length,2,'one expense per actual consumption');refresh();refresh();assert.equal(f.expenses.length,2,'reconciliation idempotent');
 assert.equal(refresh().warnings.length,0);
 f.expenses.push({_id:s.id+'-contractor',org:s.org,date:'2026-10-07',projectKey:key,category:'Подрядчики',amountGross:s.contractor,vatRate:s.rate,vatDeductible:true,supplierId:'supplier',paymentDueDate:'2026-10-08'});
 f.costs.push({_id:s.id+'-admin',org:s.org,date:'2026-10-07',name:'Административный расход',pnlGroup:'Административные',amountGross:s.general,vatRate:s.rate,vatDeductible:true,supplierId:'supplier',paymentDueDate:'2026-10-08'});
 check('unpaid contractor and general expense',{stock:4600,accrued:16400,wip:16400,result:-1000,supplier:13000+s.contractor+s.general});
 f.cash.push(payment(s,'advance',s.advance,'2026-10-09',true));
 check('customer advance is not revenue',{revenue:0,advance:s.advance,receivable:0,result:-1000});
 f.realizations.push({_id:s.id+'-real1',date:'2026-10-15',org:s.org,projectKey:key,amountGross:s.contract/2,vatRate:s.rate});
 check('half realization',{revenue:20000,recognized:8200,wip:8200,result:10800,advance:0,receivable:s.contract/2-s.advance});
 const historical=inspect(f,w,refresh(),s);
 f.realizations.push({_id:s.id+'-real2',date:'2026-11-02',org:s.org,projectKey:key,amountGross:s.contract/2,vatRate:s.rate});
 check('final realization',{revenue:20000,recognized:16400,wip:0,result:11800},'2026-11');
 check('later realization does not rewrite October',{revenue:20000,wip:8200,result:10800});
 for(const [i,doc] of pay.snapshot(f,w).documents.filter(d=>d.org===s.org&&d.remaining>0n).entries()){
  const p=payment(s,'settle-'+i,Number(core.rubles(doc.remaining)),'2026-11-03');f.cash.push(p);p.supplierAllocations=pay.allocate(f,w,doc.key,p._id,p.amount);
 }
 f.cash.push(payment(s,'final-receipt',s.contract-s.advance,'2026-11-04',true));
 check('fully settled',{cash:s.closingCash,supplier:0,stock:4600,receivable:0,advance:0,wip:0,result:11800,flow:s.closingCash-100000},'2026-11');
 assert.equal(core.preliminaryPeriod({...f,warehouse:w,fifo:refresh()},'',s.org).result,2260000n,'two-month net profit 40,000 - 16,400 - 1,000');
 assert.equal(core.preliminaryPeriod({...f,warehouse:w,fifo:refresh()},'2026-10',s.org).result,historical.result);
 assert.equal(core.preliminaryPeriod(f,'',other.org).result,0n,'other organization unaffected');
 const encoded=JSON.stringify({finance:f,warehouse:w}),reloaded=JSON.parse(encoded);assert.deepEqual(inspect(reloaded.finance,reloaded.warehouse,refresh(),s,'2026-11'),inspect(f,w,refresh(),s,'2026-11'),'reload preserves every control');
});
