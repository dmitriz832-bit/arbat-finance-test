const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../app/finance-core.js');
function scenario(){
 const deal={_id:'deal-100',org:'АИР-КЛИМАТ',order1c:'100',name:'Монтаж вентиляции',dir:'Вентиляция',contractTotal:'122000'};
 const projectKey=c.dealKey(deal),date='2026-10-14',org=deal.org;
 const finance={
  deals:[deal],realizations:[{_id:'real-1',org,date,projectKey,amount:'122000',vatRate:22,vatDeductible:true}],
  expenses:[{_id:'exp-1',org,date,projectKey,amount:'10000',vatRate:0}],
  workActs:[{id:'act-1',org,date,projectKey,status:'approved',qty:1,rate:'2000',memberIds:['worker-1']}],
  costs:[{_id:'cost-1',org,date,amount:'4000',pnlGroup:'Административные'}],
  labor:[{_id:'labor-1',org,date,personId:'worker-1',amount:'10000',ndfl:'1300',employerContributions:'3000',expenseType:'administrative'}],
  cash:[{_id:'cash-1',org,date,projectKey,type:'in',walletId:'bank',amount:'80000'},
   {_id:'cash-2',org,date,personId:'worker-1',type:'out',walletId:'bank',amount:'4000'},
   {_id:'cash-3',org,date,type:'transfer',walletId:'bank',toWalletId:'cash',amount:'10000'}],
  wallets:[{id:'bank',org,verified:true,openingBalance:50000},{id:'cash',org,verified:true,openingBalance:0}],
  people:[{id:'worker-1',name:'Работник'}],wipAccounting:false
 };
 const warehouse={items:[{id:'materials',name:'Крепёж'}],places:[{id:'crew-1',name:'Бригада',org}],projectIssues:[{id:'issue-1',crewId:'crew-1',closed:false,lines:[{itemId:'materials',fromCrew:3}]}],moves:[{id:'receipt-1',kind:'receipt',to:'crew-1',itemId:'materials',qty:5,price:100,date}]};
 const fifo={bins:new Map([['crew-1::materials',[{qty:5,cost:100}]]]),warnings:[]};
 return {finance,warehouse,fifo,projectKey,deal};
}
test('isolated full transaction chain preserves P&L, cash, debt, salary and FIFO separately',()=>{
 const {finance,warehouse,fifo}=scenario(),before=JSON.stringify({finance,warehouse});
 const bounds=c.ownerPeriodBounds('month','2026-10-18');
 const owner=c.ownerPeriodSnapshot(finance,bounds),report=c.preliminaryPeriod(finance,'2026-10');
 assert.equal(owner.result,report.result);
 assert.equal(c.rubles(owner.revenue),'100000.00'); // 122k gross including 22% VAT
 assert.equal(c.rubles(owner.result),'71000.00'); // 100k - 10k - 2k - 4k - 13k
 const debts=c.ownerDebtSnapshot(finance);
 assert.equal(c.rubles(debts.receivable),'42000.00');
 assert.equal(c.rubles(debts.payrollPayable),'6700.00'); // 10k salary - 1.3k tax - 4k paid + 2k unpaid approved work
 const wallets=c.walletConsolidation(finance.wallets,finance.cash);
 assert.equal(c.rubles(wallets.total),'126000.00'); // 50k + 80k - 4k; internal transfer neutral
 assert.equal(c.rubles(owner.cash.net),'76000.00');
 assert.equal(wallets.issues.length,0);
 const stock=c.ownerWarehouseSnapshot(warehouse,fifo);
 assert.equal(stock.rows[0].qty,5);assert.equal(stock.rows[0].reserved,3);
 assert.equal(stock.rows[0].free,2);assert.equal(c.rubles(stock.totalValue),'500.00');
 assert.equal(JSON.stringify({finance,warehouse}),before);
});
test('financial source objects are never mutated across repeated calculations',()=>{
 const {finance,warehouse,fifo}=scenario(),before=JSON.stringify({finance,warehouse});
 for(let n=0;n<3;n++){
  c.ownerPeriodSnapshot(finance,c.ownerPeriodBounds('year','2026-10-18'));
  c.ownerDebtSnapshot(finance);c.payrollReconciliation({accruals:finance.labor,payments:finance.cash,workActs:finance.workActs});
  c.ownerWarehouseSnapshot(warehouse,fifo);
 }
 assert.equal(JSON.stringify({finance,warehouse}),before);
});
test('transfers and payroll payments must not inflate sales revenue',()=>{
 const {finance}=scenario();const p=c.ownerPeriodSnapshot(finance,c.ownerPeriodBounds('month','2026-10-18'));
 assert.equal(c.rubles(p.revenue),'100000.00');
 assert.equal(c.rubles(p.cash.income),'80000.00');
 assert.equal(c.rubles(p.cash.outgoing),'4000.00');
});
