const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dashboard=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');
test('executive financial and direction snapshot follows owner period selection',()=>{
 assert.match(dashboard,/financial=core\.ownerPeriodSnapshot\(\{\.\.\.db,wipAccounting:true\},bounds,org\)/);
 assert.match(dashboard,/selected=core\.ownerPeriodSnapshot\(\{\.\.\.db,wipAccounting:true\},bounds,org\)/);
 assert.match(dashboard,/ownerPeriodFrom/);
 assert.match(dashboard,/ownerPeriodTo/);
});
test('executive wallet total uses consolidation rather than counting shared wallet again',()=>{
 assert.match(dashboard,/core\.walletConsolidation\(db\.wallets\|\|\[\],db\.cash\|\|\[\]\)/);
 assert.match(dashboard,/walletMoney\.total/);
 assert.match(dashboard,/walletRows\(org,walletMoney\)/);
 assert.doesNotMatch(dashboard,/core\.walletBalance\(/);
});
test('executive cash KPI never calls an unreconciled balance confirmed',()=>{
 assert.match(dashboard,/cashCertified:unverified===0&&unreconciled===0/);
 assert.match(dashboard,/Расчётно — требуется сверка/);
 assert.match(dashboard,/Денежные остатки не подтверждены/);
 assert.match(dashboard,/label='Деньги не сверены'/);
});
test('executive result discloses legacy documents without explicit VAT',()=>{
 assert.match(dashboard,/core\.vatControlRegister\(wipData,\{projectKey:key\}\)/);
 assert.match(dashboard,/vatUnconfirmed:vatControl\.count/);
 assert.match(dashboard,/НДС документов не подтверждён/);
 assert.match(dashboard,/label='НДС требует сверки'/);
});
test('negative net cash flow is plotted below zero baseline',()=>{
 assert.match(dashboard,/netY=zero-net\/maximum\*half/);
 assert.doesNotMatch(dashboard,/Math\.max\(0,net\)/);
});
test('executive spending is based on actual categorized accrual ledger, not projects only',()=>{
 assert.match(dashboard,/const spends=data\.financial\.rows/);
 assert.match(dashboard,/x\.category\|\|'Без категории'/);
});
