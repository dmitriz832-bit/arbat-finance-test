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
 assert.match(html,/const monthlyFinancials=revenue\.map\(\(v,i\)=>window\.ArbatFinanceCore\.preliminaryPeriod\(/);
 assert.match(dashboard,/core\.preliminaryPeriod\(/);
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

test('direction financial rollups use shared net VAT and project arithmetic',()=>{assert.match(dashboard,/core\.netAmount\(item\.amount,item\.org,item\.vatRate\)/);assert.match(dashboard,/revenueC-costC/)});

test('direction wages are not double counted when explicitly allocated to project',()=>{assert.match(dashboard,/!item\.projectKey/);assert.match(dashboard,/!\(Array\.isArray\(item\.shares\)\&\&item\.shares\.length\)/)});

test('direction costs allocate project payroll through shared helper',()=>{assert.match(dashboard,/core\.projectPayroll\(labor,projectKey\(deal\),acts\.filter/);assert.ok(!dashboard.includes('labor.filter(item=>keys.has(item.projectKey)).map(item=>item.amount'))});
