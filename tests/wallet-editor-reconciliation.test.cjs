const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/business-system.js'),'utf8');

test('wallet editor preserves and validates opening date and bank statement fields',()=>{
 for(const field of ['openingBalanceDate','bankStatementDate','bankStatementBalance'])assert.match(source,new RegExp(field));
 assert.match(source,/walletOpeningValues\(raw,existing,db\.cash/);
 assert.match(source,/c\.walletId===existingId\|\|c\.toWalletId===existingId/);
 assert.match(source,/arbatEnsureOpenPeriodRange/);
});
