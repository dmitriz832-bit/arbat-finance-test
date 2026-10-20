'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const f=require('../app/finance-core.js');
test('advance affects cash but not revenue',()=>{
 const payments=[{date:'2026-10-01',type:'in',walletId:'bank',amount:'300000'}];
 assert.equal(f.cashFlow(payments,'2026-10').net,30000000n);
 assert.equal(f.walletSnapshot('0',payments,'bank').balance,30000000n);
 assert.equal(f.preliminaryPeriod({realizations:[],expenses:[],costs:[],labor:[],workActs:[]},'2026-10').revenue,0n);
});
test('internal transfer preserves total balance',()=>{
 const entries=[{date:'2026-10-02',type:'transfer',walletId:'bank',toWalletId:'cash',amount:'40000'}];
 assert.equal(f.walletSnapshot('100000',entries,'bank').balance+f.walletSnapshot('5000',entries,'cash').balance,10500000n);
 assert.equal(f.cashFlow(entries,'2026-10').net,0n);
});
test('payroll payment reduces debt, not accrued expense',()=>{
 const p=f.payroll({gross:'100000',ndfl:'13000',contributions:'30000',paid:'87000'});
 assert.equal(p.expense,13000000n);
 assert.equal(p.payable,0n);
});
test('bank reconciliation flags discrepancy',()=>{
 const w={id:'bank',openingBalance:'100000',openingBalanceDate:'2026-09-30',bankStatementDate:'2026-10-31',bankStatementBalance:'120000'};
 const r=f.bankReconciliation(w,[{date:'2026-10-03',type:'in',walletId:'bank',amount:'30000'}]);
 assert.equal(r.status,'mismatch');
 assert.equal(r.difference,1000000n);
});
