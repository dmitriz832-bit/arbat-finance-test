const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'app/dashboard.js'),'utf8');
const core=fs.readFileSync(path.join(root,'app/finance-core.js'),'utf8');

test('shared finance core loads before the dashboard',()=>{
 const finance=html.indexOf('<script src="./finance-core.js');
 const dash=html.indexOf('<script src="./dashboard.js');
 assert.ok(finance>=0&&dash>finance,'finance-core must load before dashboard');
});
test('deal margin and dashboard use the exact same project snapshot',()=>{
 assert.match(html.slice(html.indexOf('function dealMargin(d)'),html.indexOf('function projectCost(key)')),/core\.projectSnapshot\(/);
 assert.match(dashboard,/core\.projectSnapshot\(/);
 assert.match(core,/function projectSnapshot\(/);
});
test('monthly P&L and dashboard derive from the same period engine',()=>{
 assert.match(html,/const monthlyFinancials=monthNumbers\(m=>window\.ArbatFinanceCore\.preliminaryPeriod\(/);
 assert.match(dashboard,/core\.ownerPeriodSnapshot\(/);
});
test('wallet balances use core and preserve internal transfers',()=>{
 assert.match(dashboard,/core\.walletConsolidation\(/);
 assert.match(dashboard,/core\.rubles\(wallet\.balance\)/);
 assert.match(core,/item\.type==='transfer'/);
});
test('project warehouse valuation must distinguish unresolved FIFO',()=>{
 assert.match(core,/warehouse-fifo-unavailable/);
 assert.match(core,/warehouse-cross-project-reference/);
 assert.match(core,/warehouse-duplicate-global-expense/);
});

test('direction financial rollups delegate to shared expense ledger',()=>{assert.match(dashboard,/selected\.rows\.filter\(/);assert.match(core,/function expenseLedger\(/)});

test('P&L ledger preserves source payroll and recognizes employer contributions once',()=>{
 const finance=require('../app/finance-core.js'),entry=Object.freeze({personId:'p',org:'A',date:'2026-10-04',amount:'100.01',employerContributions:'30.02'}),data={labor:[entry]},before=JSON.stringify(data);
 assert.equal(finance.expenseLedger(data).rows.reduce((n,row)=>n+row.amount,0n),13003n);
 assert.equal(finance.preliminaryPeriod(data,'2026-10','A').direct,13003n);
 assert.equal(JSON.stringify(data),before);
});

test('finance core loads before every inline bootstrap and payroll adapter',()=>{const coreTag=html.indexOf('<script src="./finance-core.js');assert.ok(coreTag>=0&&coreTag<html.indexOf('<script>'));assert.ok(coreTag<html.indexOf('<script src="./business-system.js'));});
