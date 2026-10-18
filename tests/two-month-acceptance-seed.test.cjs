const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../app/finance-core.js');
const {financePatch:db,warehousePatch:warehouse,expected}=require('../scripts/build-two-month-acceptance-seed.cjs');

const rub=value=>Number(core.rubles(value));

test('two-month acceptance seed reconciles P&L, WIP and cash independently',()=>{
  const september=core.preliminaryPeriod(db,'2026-09');
  const october=core.preliminaryPeriod(db,'2026-10');
  assert.equal(rub(september.result),expected.septemberResult);
  assert.equal(rub(october.revenue),expected.octoberRevenueNet);
  assert.equal(rub(october.result),expected.octoberResult);
  assert.deepEqual(september.issues,[]);
  assert.deepEqual(october.issues,[]);
  assert.equal(rub(core.cashFlow(db.cash,'2026-10').net),expected.octoberCashNet);
  const wallets=core.walletConsolidation(db.wallets,db.cash);
  assert.equal(rub(wallets.total),expected.closingCash);
  assert.deepEqual(wallets.issues,[]);
  assert.ok(wallets.rows.every(row=>row.reconciliation.status==='matched'));
});

test('two-month acceptance seed reconciles debt, advances and payroll payable',()=>{
  const debt=core.ownerDebtSnapshot(db);
  assert.equal(rub(debt.receivable),expected.receivable);
  assert.equal(rub(debt.advances),expected.clientAdvances);
  assert.equal(rub(debt.unallocated),expected.unallocatedReceipts);
  assert.equal(rub(debt.payrollPayable),expected.payrollPayable);
  assert.deepEqual(debt.issues.map(x=>x.code),['unallocated-receipt']);
});

test('inactive zero-value deal does not create a false WIP warning',()=>{
  const bridge=core.wipPeriodBridge(db,'2026-10');
  assert.deepEqual(bridge.issues,[]);
  assert.ok(!bridge.projects.some(x=>x.projectKey.endsWith('ACC-OCT-005')));
});

test('warehouse FIFO and the browser integrity audit reconcile the complete scenario',()=>{
  const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
  const start=html.indexOf('<script>(function(){\nfunction calc');
  const end=html.indexOf('\n})();',start)+6;
  assert.ok(start>=0&&end>6,'warehouse calculation script must be present');
  const context={window:{}};
  vm.createContext(context);
  vm.runInContext(html.slice(start+8,end),context);
  const items=['item-order-1792235466465-0','item-order-1792235466465-1','item-order-1792235466465-2'].map(id=>({id}));
  const places=[
    {id:'place-main-air',type:'warehouse'},
    {id:'place-main-arbat',type:'warehouse'},
    {id:'workcrew-crew-1792056861912-tm2skbavks-АИР-КЛИМАТ',type:'crew'},
    {id:'workcrew-crew-1792077062293-ruriftk72s-АИР-КЛИМАТ',type:'crew'}
  ];
  const state={...warehouse,items,places};
  const fifo=context.window.arbatFifo(state);
  const audit=context.window.arbatAudit(state,db);
  let value=0;
  for(const lots of fifo.bins.values())for(const lot of lots)value+=lot.qty*lot.cost;
  assert.equal(value,expected.warehouseValue);
  assert.equal(fifo.warnings.length,0);
  assert.equal(audit.errors,0);
  assert.equal(audit.warnings,0);
  assert.equal(audit.movements,12);
  assert.ok(Math.abs(audit.cashBalance-expected.closingCash)<0.005);
});

test('payment calendar counts only outflows as obligations and adds incoming cash to forecast',()=>{
  const dashboard=fs.readFileSync(require.resolve('../app/dashboard.js'),'utf8');
  const page=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
  assert.match(dashboard,/payments30=calendar\.filter\(item=>item\.days<=30&&!isCalendarIncome\(item\)\)/);
  assert.match(page,/sum30=within30\.filter\(x=>!isIncome\(x\)\)/);
  assert.match(page,/f\(total\+income30-sum30\)/);
  assert.match(page,/rem\+=parseMoney\(x\.amount\)\*\(isIncome\(x\)\?1:-1\)/);
});
