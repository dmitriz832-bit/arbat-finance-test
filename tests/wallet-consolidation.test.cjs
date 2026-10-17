const assert=require('node:assert/strict');
const test=require('node:test');
const f=require('../app/finance-core.js');
const wallets=[
 {id:'air',org:'АИР-КЛИМАТ',verified:true,openingBalance:'1000.01'},
 {id:'arbat',org:'АРБАТ.ГК',verified:true,openingBalance:'2000.02'},
 {id:'shared',org:'Общий',verified:true,openingBalance:'3000.03'}
];
test('three separate wallet buckets sum exactly to consolidated balance',()=>{
 const x=f.walletConsolidation(wallets,[]);
 assert.equal(f.rubles(x.byOrg['АИР-КЛИМАТ']),'1000.01');
 assert.equal(f.rubles(x.byOrg['АРБАТ.ГК']),'2000.02');
 assert.equal(f.rubles(x.byOrg['Общий']),'3000.03');
 assert.equal(f.rubles(x.total),'6000.06');
 assert.equal(x.rows.length,3);
});
test('shared money is not simultaneously assigned to either company',()=>{
 const x=f.walletConsolidation(wallets,[{type:'in',walletId:'shared',amount:'100.12'}]);
 assert.equal(f.rubles(x.byOrg['Общий']),'3100.15');
 assert.equal(f.rubles(x.byOrg['АИР-КЛИМАТ']),'1000.01');
 assert.equal(f.rubles(x.byOrg['АРБАТ.ГК']),'2000.02');
 assert.equal(f.rubles(x.total),'6100.18');
});
test('internal transfer from shared to company changes ownership but not consolidated money',()=>{
 const x=f.walletConsolidation(wallets,[{type:'transfer',walletId:'shared',toWalletId:'air',amount:'250.07'}]);
 assert.equal(f.rubles(x.byOrg['Общий']),'2749.96');
 assert.equal(f.rubles(x.byOrg['АИР-КЛИМАТ']),'1250.08');
 assert.equal(f.rubles(x.total),'6000.06');
 assert.equal(x.issues.length,0);
});
test('duplicate ids cannot double-count the same wallet',()=>{
 const x=f.walletConsolidation([...wallets,{...wallets[2]}],[]);
 assert.equal(f.rubles(x.total),'6000.06');
 assert.ok(x.issues.some(i=>i.code==='duplicate-or-missing-wallet-id'));
});
test('unclassified wallet funds must not be silently assigned to a company',()=>{
 const x=f.walletConsolidation([...wallets,{id:'unknown',org:'?',verified:true,openingBalance:'500'}],[]);
 assert.equal(f.rubles(x.total),'6000.06');
 assert.ok(x.issues.some(i=>i.code==='unclassified-wallet-organization'));
});
