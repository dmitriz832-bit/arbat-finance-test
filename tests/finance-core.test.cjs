const assert=require('node:assert/strict'),test=require('node:test'),f=require('../app/finance-core.js');
test('decimal cents and rounding',()=>{assert.equal(f.rubles(f.cents('0.1')+f.cents('0.2')),'0.30');assert.equal(f.rubles(f.cents('1.005')),'1.01')});
test('weighted allocation preserves exact cents',()=>{const x=f.allocate('100.00',[1,1,1]);assert.deepEqual(x.map(f.rubles),['33.33','33.33','33.34']);assert.equal(x.reduce((a,b)=>a+b),f.cents('100'))});
test('P&L current month 28000',()=>{const x=f.pnl({revenue:['60000'],direct:['10000','2000','3000'],administrative:['4000','13000']});assert.equal(f.rubles(x.result),'28000.00')});
test('P&L below EBITDA income increases result',()=>{const x=f.pnl({revenue:['100'],belowIncome:['10'],belowExpenses:['7']});assert.equal(f.rubles(x.result),'103.00')});
test('payroll gross, tax and employer contributions',()=>{let x=f.payroll({gross:'57471',ndfl:'7471',contributions:'14717',paid:'50000'});assert.equal(f.rubles(x.expense),'72188.00');assert.equal(f.rubles(x.payable),'0.00')});
test('unallocated wages exposed',()=>{const x=f.difference(['19500'],['19260']);assert.equal(f.rubles(x),'240.00')});

test('document expense cannot be counted again on payment',()=>{const recognized=f.pnl({revenue:['60000'],direct:['20000']});assert.equal(f.rubles(recognized.result),'40000.00');const cashOut=f.sum(['20000']);assert.equal(f.rubles(cashOut),'20000.00');assert.equal(f.rubles(recognized.result),'40000.00')});
test('project operating result sample',()=>{const cost=f.sum(['20000','5000','8000','10000','3000']);assert.equal(f.rubles(cost),'46000.00');assert.equal(f.rubles(f.cents('60000')-cost),'14000.00')});
test('invalid payroll deductions rejected',()=>assert.throws(()=>f.payroll({gross:'100',ndfl:'101'}),RangeError));
test('negative distribution reconciles',()=>{const parts=f.allocate('-1.00',[1,1,1]);assert.equal(parts.reduce((a,b)=>a+b),f.cents('-1.00'))});
