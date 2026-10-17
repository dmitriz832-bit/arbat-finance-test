const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dashboard=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');
test('executive financial and direction snapshot follows owner period selection',()=>{
 assert.match(dashboard,/financial=core\.ownerPeriodSnapshot\(db,bounds,org\)/);
 assert.match(dashboard,/selected=core\.ownerPeriodSnapshot\(db,bounds,org\)/);
 assert.match(dashboard,/ownerPeriodFrom/);
 assert.match(dashboard,/ownerPeriodTo/);
});
test('executive wallet total uses consolidation rather than counting shared wallet again',()=>{
 assert.match(dashboard,/core\.walletConsolidation\(db\.wallets\|\|\[\],db\.cash\|\|\[\]\)/);
 assert.match(dashboard,/walletMoney\.total/);
});
test('negative net cash flow is plotted below zero baseline',()=>{
 assert.match(dashboard,/netY=zero-net\/maximum\*half/);
 assert.doesNotMatch(dashboard,/Math\.max\(0,net\)/);
});
test('executive spending is based on actual categorized accrual ledger, not projects only',()=>{
 assert.match(dashboard,/const spends=data\.financial\.rows/);
 assert.match(dashboard,/x\.category\|\|'Без категории'/);
});
