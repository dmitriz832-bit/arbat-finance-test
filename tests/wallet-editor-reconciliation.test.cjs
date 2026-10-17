const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/business-system.js'),'utf8');

test('wallet editor preserves and validates opening date and bank statement fields',()=>{
 for(const field of ['openingBalanceDate','bankStatementDate','bankStatementBalance'])assert.match(source,new RegExp('form\\.elements\\.'+field));
 assert.match(source,/Дата выписки не может быть раньше даты начального остатка/);
 assert.match(source,/item\.walletId===wallet\.id\|\|item\.toWalletId===wallet\.id/);
 assert.match(source,/bankStatementBalance:statementRaw===''\?'':Number\(statementRaw\)/);
});
