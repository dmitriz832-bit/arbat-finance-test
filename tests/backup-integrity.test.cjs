const test=require('node:test'),assert=require('node:assert/strict');
const {inspect,packageBackup,verifyBackup}=require('../scripts/verify-backup.cjs');
const fixture=()=>({finance:{deals:[],realizations:[],expenses:[],cash:[{_id:'x1',type:'transfer',walletId:'w1',toWalletId:'w2',amount:'123.45',date:'2026-10-18'}],labor:[],costs:[],workActs:[],crewSettlements:[],wallets:[{id:'w1'},{id:'w2'}],people:[]},warehouse:{items:[],places:[],moves:[],projectIssues:[]}});
test('isolated backup verifies both stores without touching production',()=>{
 const {finance,warehouse}=fixture(),before=JSON.stringify({finance,warehouse});
 const backup=packageBackup(finance,warehouse,{revisions:{finance:66,warehouse:21}});
 const restore=verifyBackup(JSON.parse(JSON.stringify(backup)));
 assert.equal(restore.findings.ok,true);assert.deepEqual(restore.finance,finance);assert.deepEqual(restore.warehouse,warehouse);
 assert.equal(JSON.stringify({finance,warehouse}),before);
});
test('tampered backup is rejected by checksum',()=>{const {finance,warehouse}=fixture();const backup=packageBackup(finance,warehouse);backup.stores.finance.cash[0].amount='999';assert.throws(()=>verifyBackup(backup),/checksum mismatch/i)});
test('duplicate movement IDs and missing transfer destination are invalid',()=>{const {finance,warehouse}=fixture();finance.cash[0].toWalletId='';warehouse.moves=[{id:'duplicate',kind:'receipt'},{id:'duplicate',kind:'receipt'}];const result=inspect(finance,warehouse);assert.ok(result.errors.some(x=>x.code==='transfer-missing-destination'));assert.ok(result.errors.some(x=>x.code==='duplicate-id'))});
test('invalid financial amounts are flagged',()=>{const {finance,warehouse}=fixture();finance.cash[0].amount='one hundred';assert.ok(inspect(finance,warehouse).errors.some(x=>x.code==='invalid-money'))});
test('unvalued stock is a warning not a fabricated financial number',()=>{const {finance,warehouse}=fixture();finance.expenses.push({_id:'e1',valuationStatus:'requires-review'});const findings=inspect(finance,warehouse);assert.ok(findings.warnings.some(x=>x.code==='unresolved-warehouse-cost'))});
