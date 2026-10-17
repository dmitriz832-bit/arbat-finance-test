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
 assert.match(dashboard,/core\.walletBalance\(/);
 assert.match(core,/item\.type==='transfer'/);
});
test('project warehouse valuation must distinguish unresolved FIFO',()=>{
 assert.match(core,/warehouse-fifo-unavailable/);
 assert.match(core,/warehouse-cross-project-reference/);
 assert.match(core,/warehouse-duplicate-global-expense/);
});

test('direction financial rollups delegate to shared expense ledger',()=>{assert.match(dashboard,/selected\.rows\.filter\(/);assert.match(core,/function expenseLedger\(/)});

test('P&L adapter never mutates source payroll to add contributions',()=>{const business=fs.readFileSync(path.join(root,'app/business-system.js'),'utf8');assert.ok(!business.includes('item.amount=Number(item.amount'));assert.match(core,/cents\(item.employerContributions/)});

test('finance core loads before every inline bootstrap and payroll adapter',()=>{const coreTag=html.indexOf('<script src="./finance-core.js');assert.ok(coreTag>=0&&coreTag<html.indexOf('<script>'));assert.ok(coreTag<html.indexOf('<script src="./business-system.js'));});
