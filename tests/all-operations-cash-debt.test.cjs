/* Independent controls: literal integer kopecks, no expected values derived from production outputs. */
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../app/finance-core'),pay=require('../app/payables-model'),liquidity=require('../app/liquidity-model'),cash=require('../app/cash-workspace-model'),tax=require('../app/tax-register-model');
const AIR='АИР-КЛИМАТ',ARBAT='АРБАТ.ГК';
function project(id='a',org=AIR){return {_id:id,org,name:'Контроль '+id,order1c:id,dir:'Вентиляция'}}
function refundFixture(){const deal=project(),key=core.dealKey(deal);return {deals:[deal],realizations:[],cash:[{_id:'receipt',org:AIR,type:'in',date:'2026-10-01',amount:'0.30',projectKey:key,customerId:'buyer'},{_id:'refund',org:AIR,type:'out',date:'2026-11-01',amount:'0.20',projectKey:key,customerId:'buyer'}],vatAdvanceEvents:[{_id:'advance',kind:'received',org:AIR,date:'2026-10-01',amount:'0.30',cashId:'receipt',vatRate:'0',document:'Аванс'}, { _id:'return',kind:'refund',org:AIR,date:'2026-11-01',amount:'0.20',cashId:'refund',advanceId:'advance',document:'Возврат покупателю'}]}}

test('cash control across two months: end-of-day anchor, external flows and intercompany transfer conserve literal kopecks',()=>{
 const entries=[{_id:'old',date:'2026-09-30',org:AIR,type:'in',walletId:'a',amount:999}, {_id:'r1',date:'2026-10-01',org:AIR,type:'in',walletId:'a',amount:'0.10'}, {_id:'r2',date:'2026-10-31',org:AIR,type:'in',walletId:'a',amount:'0.20'}, {_id:'p',date:'2026-10-31',org:AIR,type:'out',walletId:'a',amount:'0.15'}, {_id:'x',date:'2026-10-31',org:AIR,type:'transfer',walletId:'a',toWalletId:'b',destinationOrg:ARBAT,amount:'0.07'}, {_id:'next',date:'2026-11-01',org:AIR,type:'in',walletId:'a',amount:'0.11'}];
 const wallets=[{id:'a',org:AIR,verified:true,openingBalance:'1000.01',openingBalanceDate:'2026-09-30',bankStatementDate:'2026-10-31',bankStatementBalance:'1000.09'},{id:'b',org:ARBAT,verified:true,openingBalance:'0.00',openingBalanceDate:'2026-09-30',bankStatementDate:'2026-10-31',bankStatementBalance:'0.07'}];
 assert.equal(core.walletSnapshot('1000.01',entries,'a','2026-09-30','2026-10-31').balance,100009n);
 assert.equal(core.bankReconciliation(wallets[0],entries).difference,0n);assert.equal(core.bankReconciliation(wallets[1],entries).difference,0n);
 const all=core.walletConsolidation(wallets,entries);assert.equal(all.total,100027n);assert.equal(all.byOrg[AIR],100020n);assert.equal(all.byOrg[ARBAT],7n);
 const q=cash.snapshot({cash:entries,wallets},{org:AIR,from:'2026-10-01',to:'2026-10-31',groupBy:'month'});assert.deepEqual(q.totals,{income:30n,outgoing:15n,transfers:7n,net:15n});assert.equal(q.groups.length,1);
 assert.equal(core.preliminaryPeriod({cash:entries},'2026-10',AIR).revenue,0n,'receipts, advances and transfers alone never earn revenue');
});

test('project allocation is atomic across companies and edited/deleted receipts recalculate debt without duplicate revenue',()=>{
 const a=project(),b=project('b',ARBAT),ka=core.dealKey(a),kb=core.dealKey(b),db={deals:[a,b],realizations:[{_id:'sale',org:AIR,projectKey:ka,date:'2026-10-31',amount:'0.20',vatRate:0}],cash:[{_id:'in',org:AIR,type:'in',date:'2026-10-01',amount:'0.30',projectAllocations:[{projectKey:ka,amount:'0.20'}]}]};
 let s=core.ownerDebtSnapshot(db,AIR);assert.equal(s.receivable,0n);assert.equal(s.advances,0n);assert.equal(s.unallocated,10n);
 db.cash[0].projectAllocations=[{projectKey:ka,amount:'0.10'},{projectKey:kb,amount:'0.10'}];s=core.ownerDebtSnapshot(db,AIR);assert.equal(s.receivable,20n);assert.equal(s.unallocated,30n);assert.equal(s.issues.length,1);
 db.cash[0].projectAllocations=[{projectKey:ka,amount:'0.30'}];assert.equal(core.ownerDebtSnapshot(db,AIR).advances,10n);
 db.cash[0].amount='0.10';assert.equal(core.ownerDebtSnapshot(db,AIR).receivable,20n,'amount edit invalidates overallocated project settlement');
 db.cash=[];assert.equal(core.ownerDebtSnapshot(db,AIR).receivable,20n);assert.equal(core.preliminaryPeriod(db,'2026-10',AIR).revenue,20n);
});

test('partial and repeated supplier settlement, cancellation and aliases reconcile cash, debt and liquidity exactly',()=>{
 const db={expenses:[{_id:'e',org:AIR,date:'2026-10-01',amountGross:'0.03',amount:'0.03',vatRate:0,supplierId:'supplier',paymentDueDate:'2026-11-01'}],cash:[{_id:'p',org:AIR,type:'out',date:'2026-10-27',amount:'0.03',customerId:'supplier'}],calendar:[{id:'alias',org:AIR,supplierDocumentKey:'expenses:e',dueDate:'2026-10-27',amount:'0.03'}]};
 const original=JSON.stringify(db);const preview=pay.allocate(db,{},'expenses:e','p','0.01');assert.equal(JSON.stringify(db),original,'cancelled allocation preview is read-only');db.cash[0].supplierAllocations=preview;db.cash[0].supplierAllocations=pay.allocate(db,{},'expenses:e','p','0.01');
 const s=pay.snapshot(db,{},'2026-10-27');assert.equal(s.documents[0].paid,2n);assert.equal(s.documents[0].remaining,1n);assert.equal(db.cash[0].supplierAllocations.length,1);assert.equal(s.payments[0].available,1n);
 assert.equal(liquidity.snapshot(db,{},AIR,'2026-10-27').obligations7,1n);assert.equal(core.cashFlow(db.cash).outgoing,3n);assert.equal(core.preliminaryPeriod(db,'2026-10',AIR).components.projectExpenses,3n);
 db.cash[0].supplierAllocations=[];assert.equal(pay.summary(db,{},AIR).remaining,3n);assert.equal(core.cashFlow(db.cash).outgoing,3n,'unlink restores debt while actual cash remains');
 db.cash=[];assert.equal(pay.summary(db,{},AIR).remaining,3n);assert.equal(core.cashFlow(db.cash).outgoing,0n);
});

test('fractional receipt lines use independent half-up kopecks and exclude foreign organization, inventory movements and income',()=>{
 const wh={moves:[{id:'a',documentId:'invoice',org:AIR,kind:'receipt',qty:'0.005',price:'1.00',paymentDueDate:'2026-10-27'},{id:'b',documentId:'invoice',org:AIR,kind:'receipt',qty:'0.005',price:'1.00',paymentDueDate:'2026-10-27'},{id:'c',org:ARBAT,kind:'receipt',qty:1,price:900,paymentDueDate:'2026-10-27'},{id:'opening',org:AIR,kind:'opening',qty:10,price:20},{id:'consume',org:AIR,kind:'consume',qty:1,price:20}]};
 const db={costs:[{_id:'income',org:AIR,pnlType:'income',amount:400}]};assert.equal(pay.summary(db,wh,AIR).remaining,2n);const s=liquidity.snapshot(db,wh,AIR,'2026-10-27');assert.equal(s.obligations7,2n);assert.equal(s.supplierRows.length,1);
});

test('unvalued supplier document stays unknown while explicit zero wallet is a known zero',()=>{
 const s=liquidity.snapshot({}, {moves:[{id:'r',org:AIR,kind:'receipt',qty:1,price:''}]},AIR,'2026-10-27');assert.equal(s.forecastComplete,false);assert.equal(s.review[0].amount,null);assert.equal(pay.snapshot({}, {moves:[{id:'r',org:AIR,kind:'receipt',qty:1,price:''}]}).documents[0].remaining,null);
 const values=core.walletOpeningValues({name:'Нулевая касса',org:AIR,kind:'Касса',openingBalance:'0',openingBalanceDate:'2026-10-27'});assert.equal(values.openingBalance,'0.00');assert.throws(()=>core.walletOpeningValues({...values,openingBalance:''}),/остаток/);
});

test('accepted customer advance refund reduces owner debt advance by exact gross cents across months',()=>{
 const db=refundFixture(),register=tax.advances(db);assert.equal(register.issues.length,0);assert.equal(register.balances[0].remaining,10n);assert.equal(core.cashFlow(db.cash).net,10n);assert.equal(core.preliminaryPeriod(db,'2026-11',AIR).revenue,0n);
 assert.equal(core.ownerDebtSnapshot(db,AIR).advances,10n,'0.30 received - 0.20 explicitly registered customer refund = 0.10 customer advance');
});

test('a future-dated supplier payment cannot discharge a current liquidity obligation before payment date',()=>{
 const db={expenses:[{_id:'e',org:AIR,date:'2026-10-01',amount:'100.01',paymentDueDate:'2026-10-28'}],cash:[{_id:'future',org:AIR,date:'2026-11-01',type:'out',amount:'100.01',supplierAllocations:[{documentKey:'expenses:e',amount:'100.01'}]}]};
 assert.equal(liquidity.snapshot(db,{},AIR,'2026-10-27').obligations7,10001n,'cash not executed at forecast date remains an obligation');
 assert.equal(liquidity.snapshot(db,{},AIR,'2026-11-01').combined.total,0n);
});

test('registered repeated refunds follow original receipt allocations, conserve cents and ignore unrelated cash out',()=>{
 const db=refundFixture(),second=project('second');db.deals.push(second);const firstKey=core.dealKey(db.deals[0]),secondKey=core.dealKey(second);delete db.cash[0].projectKey;db.cash[0].projectAllocations=[{projectKey:firstKey,amount:'0.10'},{projectKey:secondKey,amount:'0.20'}];
 db.cash[1].amount='0.10';db.cash[1].projectKey=secondKey;db.vatAdvanceEvents[1].amount='0.10';db.cash.push({...db.cash[1],_id:'refund2',amount:'0.20',date:'2026-11-02'});db.vatAdvanceEvents.push({...db.vatAdvanceEvents[1],_id:'return2',cashId:'refund2',amount:'0.20',date:'2026-11-02'});db.cash.push({_id:'unrelated',org:AIR,type:'out',date:'2026-11-02',amount:'500.00',projectKey:firstKey});
 const before=JSON.stringify(db);assert.equal(tax.advances(db).issues.length,0);const s=core.ownerDebtSnapshot(db,AIR);assert.equal(s.advances,0n);assert.equal(s.unallocated,0n);assert.deepEqual(s.rows.map(r=>r.received),[0n,0n]);assert.equal(JSON.stringify(db),before);
});

test('partial advance refund reduces unallocated receipts while rejected refund evidence cannot reduce project advance',()=>{
 const db=refundFixture();delete db.cash[0].projectKey;assert.equal(core.ownerDebtSnapshot(db,AIR).unallocated,10n);
 const allocated=refundFixture();allocated.cash[1].org=ARBAT;assert.equal(tax.advances(allocated).issues.length,1);const s=core.ownerDebtSnapshot(allocated,AIR);assert.equal(s.advances,30n);assert.ok(s.issues.some(i=>i.code==='advance-refund-review'));
});

test('fully refunded three-way one-kopeck allocation never leaves a negative project receipt',()=>{
 const db=refundFixture(),b=project('b'),c=project('c');db.deals.push(b,c);delete db.cash[0].projectKey;db.cash[0].amount='0.03';db.cash[0].projectAllocations=db.deals.map(d=>({projectKey:core.dealKey(d),amount:'0.01'}));db.vatAdvanceEvents[0].amount='0.03';db.cash[1].amount='0.02';db.vatAdvanceEvents[1].amount='0.02';
 let s=core.ownerDebtSnapshot(db,AIR);assert.equal(s.advances,1n);assert.ok(s.rows.every(r=>r.received>=0n));db.cash[1].amount='0.03';db.vatAdvanceEvents[1].amount='0.03';s=core.ownerDebtSnapshot(db,AIR);assert.equal(s.advances,0n);assert.deepEqual(s.rows.map(r=>r.received),[0n,0n,0n]);
});

// Exercise the actual bank upload handler with local ASCII TSV bytes; no server,
// cloud session, network, or parallel reimplementation of its parsing rules.
async function bankPreview(rows,wallets){
 const fs=require('node:fs'),vm=require('node:vm'),html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
 const nodes=new Map(),document={getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},textContent:'',innerHTML:'',querySelector(){return null},querySelectorAll(){return []}});return nodes.get(id)}};
 const context=vm.createContext({db:{cash:[],articles:[],deals:[],wallets},document,TextDecoder,ArbatFinanceCore:core,window:{ArbatFinanceCore:core},esc:x=>String(x),f:x=>String(x)});
 vm.runInContext(html.slice(html.indexOf('function parseMoney('),html.indexOf('function moneyForm(')),context);
 vm.runInContext(html.slice(html.indexOf('let bankImportRows=[];'),html.indexOf('window.reviewBankCounterparties=')),context);
 const headers=['date_oper','plat_inn','d_c','Rch','plat_acc','pol_acc','Pol_inn','plat_name','pol_name','sum_rur','Inn','number','text70'];
 const defaults={date_oper:'27.10.2026',plat_inn:'7707083893',d_c:'C',Rch:'40702810000000000001',plat_acc:'40702810000000000999',pol_acc:'40702810000000000001',Pol_inn:'7707083893',plat_name:'Buyer',pol_name:'Seller',sum_rur:'0.10',Inn:'5401000000',number:'1',text70:'Payment'};
 const content=headers.join('\t')+'\n'+rows.map(p=>headers.map(k=>({...defaults,...p})[k]).join('\t')).join('\n');
 await document.getElementById('bankCsvFile').onchange({target:{files:[{name:'control.tsv',arrayBuffer:async()=>new TextEncoder().encode(content).buffer}]}});
 return {rows:JSON.parse(vm.runInContext('JSON.stringify(bankImportRows)',context)),status:document.getElementById('bankImportStatus').textContent};
}
const bankWallets=()=>[{id:'a',org:AIR,name:'Control account 0001',account:'40702810000000000001',verified:true},{id:'b',org:ARBAT,name:'Control account 0002',account:'40702810000000000002',verified:true}];

test('bank upload never assigns another statement account to the first row organization or wallet',async()=>{
 const s=await bankPreview([{}, {Rch:'40702810000000000002',pol_acc:'40702810000000000002',number:'2'}],bankWallets());
 assert.equal(s.rows.length,0,'mixed accounts must be rejected before committing any statement');assert.match(s.status,/Ошибка/);
});

test('bank upload rejects invalid business date, nonpositive amount and missing account instead of creating usable cash',async()=>{
 for(const patch of [{date_oper:'31.02.2026'},{sum_rur:'garbage'},{sum_rur:'0'},{sum_rur:'-0.10'},{Rch:''}]){
  const s=await bankPreview([patch],bankWallets());assert.ok(s.rows.length===0||s.rows.every(r=>r.skip===true),'invalid bank input must not become a selectable/committable row: '+JSON.stringify(patch));assert.match(s.status,/Ошибка/);
 }
});

test('valid bank upload preserves literal large kopecks and cannot choose an ambiguous account suffix',async()=>{
 const s=await bankPreview([{sum_rur:'90071992547409.93'}],bankWallets());assert.equal(s.rows.length,1);assert.equal(s.rows[0].amount,'90071992547409.93');assert.match(s.rows[0].bankFingerprint,/\|9007199254740993$/);
 const ambiguous=await bankPreview([{}],[{id:'a',org:AIR,name:'First 0001',verified:true},{id:'b',org:ARBAT,name:'Second 0001',verified:true}]);assert.equal(ambiguous.rows.length,0);assert.match(ambiguous.status,/Ошибка/);
 const partial=await bankPreview([{}, {date_oper:'31.02.2026',number:'2'}],bankWallets());assert.equal(partial.rows.length,0,'late error clears earlier draft rows');assert.match(partial.status,/Ошибка/);
});

test('supplier card and supplier dashboard summary cannot call cross-register overallocated cash a valid settlement',()=>{
 const db={expenses:[{_id:'e',org:AIR,date:'2026-10-01',amount:'50.00',paymentDueDate:'2026-10-27'}],cash:[{_id:'p',org:AIR,type:'out',date:'2026-10-27',amount:'100.00',supplierAllocations:[{documentKey:'expenses:e',amount:'50.00'}]}],fixedAssets:[{_id:'asset',org:AIR,paymentLinks:[{cashId:'p',amount:'51.00'}]}]};
 assert.equal(require('../app/financial-payment-links').review(db).length,1);assert.equal(pay.snapshot(db,{},'2026-10-27').documents[0].status,'review','the source payment has 101.00 claims against 100.00 actual cash');assert.equal(pay.summary(db,{},AIR).review,1);assert.throws(()=>pay.allocate(db,{},'expenses:e','p','0.01'));
});

test('duplicate source payment identity stays reviewable rather than crediting the same supplier cash twice',()=>{
 const payment={_id:'duplicated',org:AIR,date:'2026-10-27',type:'out',amount:'0.01',supplierAllocations:[{documentKey:'expenses:e',amount:'0.01'}]},db={expenses:[{_id:'e',org:AIR,amount:'0.02'}],cash:[payment,{...payment}]};
 const s=pay.snapshot(db);assert.equal(s.documents[0].status,'review');assert.equal(s.documents[0].paid,0n);assert.throws(()=>pay.allocate(db,{},'expenses:e','duplicated','0.01'));
});

test('bank internal transfer uses exact destination account instead of a conflicting configured suffix',async()=>{
 const wallets=bankWallets();wallets[1].org=AIR;
 const transfer=await bankPreview([{d_c:'D',plat_acc:wallets[0].account,pol_acc:wallets[1].account,Pol_inn:'5401000000',sum_rur:'0.03'}],wallets);assert.equal(transfer.rows[0].type,'transfer');assert.equal(transfer.rows[0].walletId,'a');assert.equal(transfer.rows[0].toWalletId,'b');assert.equal(transfer.rows[0].amount,'0.03');
 const different=await bankPreview([{d_c:'D',plat_acc:wallets[0].account,pol_acc:'40702810000000010002',Pol_inn:'5401000000'}],wallets);assert.equal(different.rows[0].type,'out','known wallet full account differs, so matching last four cannot invent a destination transfer');assert.equal(different.rows[0].toWalletId,'');
});

test('supplier prepayment is cash without a second P&L expense; later invoice consumes only its linked part',()=>{
 const db={cash:[{_id:'prepay',org:AIR,type:'out',date:'2026-10-01',amount:'0.30',customerId:'supplier'}],expenses:[]};assert.equal(core.cashFlow(db.cash).outgoing,30n);assert.equal(core.preliminaryPeriod(db,'2026-10',AIR).result,0n);assert.equal(pay.snapshot(db).payments[0].available,30n);
 db.expenses.push({_id:'later',org:AIR,date:'2026-10-31',amount:'0.20',vatRate:0,supplierId:'supplier',paymentDueDate:'2026-11-01'});db.cash[0].supplierAllocations=pay.allocate(db,{},'expenses:later','prepay','0.20');const s=pay.snapshot(db);assert.equal(s.documents[0].remaining,0n);assert.equal(s.payments[0].available,10n);assert.equal(core.cashFlow(db.cash).outgoing,30n);assert.equal(core.preliminaryPeriod(db,'2026-10',AIR).result,-20n);
});

test('refund propagation exposes chronological positive project shares and original cash identity for each partial source',()=>{
 const db=refundFixture(),b=project('b'),ka=core.dealKey(db.deals[0]),kb=core.dealKey(b);db.deals.push(b);delete db.cash[0].projectKey;db.cash[0].projectAllocations=[{projectKey:ka,amount:'0.10'},{projectKey:kb,amount:'0.20'}];delete db.cash[1].projectKey;db.cash[1].amount='0.10';db.vatAdvanceEvents[1].amount='0.10';
 db.cash.push({...db.cash[1],_id:'refund2',date:'2026-11-02'},{...db.cash[1],_id:'refund3',date:'2026-11-03'});db.vatAdvanceEvents.push({...db.vatAdvanceEvents[1],_id:'return2',cashId:'refund2',date:'2026-11-02'},{...db.vatAdvanceEvents[1],_id:'return3',cashId:'refund3',date:'2026-11-03'});db.vatAdvanceEvents.reverse();
 const before=JSON.stringify(db),s=core.ownerDebtSnapshot(db,AIR);assert.ok(Array.isArray(s.refundRows),'validated project refund allocations must be available to card DDS');assert.deepEqual(s.refundRows.map(r=>[r.eventId,r.projectKey,r.amount]),[['return',ka,3n],['return',kb,7n],['return2',ka,3n],['return2',kb,7n],['return3',ka,4n],['return3',kb,6n]]);
 for(const source of db.cash.slice(1)){const rows=s.refundRows.filter(r=>r.source===source);assert.equal(rows.reduce((n,r)=>n+r.amount,0n),10n);assert.ok(rows.every(r=>r.originalCashId==='receipt'&&r.amount>0n))}assert.equal(s.advances,0n);assert.deepEqual(s.rows.map(r=>r.received),[0n,0n]);assert.equal(JSON.stringify(db),before);
});

test('refund propagation retains unallocated share, conserves each accepted event and never invents unrelated expense rows',()=>{
 const db=refundFixture(),key=core.dealKey(db.deals[0]);delete db.cash[0].projectKey;db.cash[0].projectAllocations=[{projectKey:key,amount:'0.10'}];delete db.cash[1].projectKey;db.cash.push({_id:'unrelated',org:AIR,type:'out',date:'2026-11-02',amount:'1.00'});
 const s=core.ownerDebtSnapshot(db,AIR);assert.ok(Array.isArray(s.refundRows));assert.deepEqual(s.refundRows.map(r=>[r.projectKey,r.amount]),[[key,6n],['',14n]]);assert.equal(s.rows[0].received,4n);assert.equal(s.unallocated,6n);assert.ok(s.refundRows.every(r=>r.source===db.cash[1]&&r.eventId==='return'&&r.originalCashId==='receipt'));
 const invalid=refundFixture();invalid.vatAdvanceEvents[1].amount='0.31';const rejected=core.ownerDebtSnapshot(invalid,AIR);assert.deepEqual(rejected.refundRows,[]);assert.ok(rejected.issues.some(i=>i.code==='advance-refund-review'));assert.deepEqual(core.ownerDebtSnapshot({deals:[],cash:[]}).refundRows,[]);
});

test('refund propagation cannot repeat a one-kopeck project when successive tiny refunds exhaust its original share',()=>{
 const db=refundFixture();db.deals.push(project('b'),project('c'));db.cash[0].amount='0.03';delete db.cash[0].projectKey;db.cash[0].projectAllocations=db.deals.map(d=>({projectKey:core.dealKey(d),amount:'0.01'}));db.vatAdvanceEvents[0].amount='0.03';db.cash[1].amount='0.01';delete db.cash[1].projectKey;db.vatAdvanceEvents[1].amount='0.01';db.cash.push({...db.cash[1],_id:'refund2',date:'2026-11-02'},{...db.cash[1],_id:'refund3',date:'2026-11-03'});db.vatAdvanceEvents.push({...db.vatAdvanceEvents[1],_id:'return2',cashId:'refund2',date:'2026-11-02'},{...db.vatAdvanceEvents[1],_id:'return3',cashId:'refund3',date:'2026-11-03'});
 const s=core.ownerDebtSnapshot(db,AIR);assert.ok(Array.isArray(s.refundRows));assert.deepEqual(s.refundRows.map(r=>[r.source._id,r.projectKey,r.amount]),[['refund',core.dealKey(db.deals[2]),1n],['refund2',core.dealKey(db.deals[1]),1n],['refund3',core.dealKey(db.deals[0]),1n]]);assert.deepEqual(s.rows.map(r=>r.received),[0n,0n,0n]);
});

test('several accepted refund events may share one outgoing cash without repeating its unrecognized residual',()=>{
 const db=refundFixture();delete db.cash[1].projectKey;db.vatAdvanceEvents[1].amount='0.05';db.vatAdvanceEvents.push({...db.vatAdvanceEvents[1],_id:'return2',amount:'0.05'});const s=core.ownerDebtSnapshot(db,AIR);assert.equal(tax.advances(db).issues.length,0);assert.deepEqual(s.refundRows.map(r=>[r.eventId,r.amount]),[['return',5n],['return2',5n]]);assert.ok(s.refundRows.every(r=>r.source===db.cash[1]));assert.equal(s.refundRows.reduce((n,r)=>n+r.amount,0n),10n,'only accepted 0.10 of the 0.20 outgoing cash is a traceable project refund');assert.equal(s.rows[0].received,20n);assert.equal(s.advances,20n);
});

test('owner dashboard accepts the native receipt allocation alias with the same exact refund result as canonical shares',()=>{
 const canonical=refundFixture(),b=project('b');canonical.deals.push(b);delete canonical.cash[0].projectKey;canonical.cash[0].projectAllocations=[{projectKey:core.dealKey(canonical.deals[0]),amount:'0.10'},{projectKey:core.dealKey(b),amount:'0.20'}];delete canonical.cash[1].projectKey;const native=JSON.parse(JSON.stringify(canonical));native.cash[0].allocations=native.cash[0].projectAllocations;delete native.cash[0].projectAllocations;
 const before=JSON.stringify(native),c=core.ownerDebtSnapshot(canonical,AIR),n=core.ownerDebtSnapshot(native,AIR);assert.deepEqual(n.rows.map(r=>r.received),[4n,6n]);assert.deepEqual(n.rows,c.rows);assert.equal(n.unallocated,0n);assert.deepEqual(n.refundRows.map(r=>[r.projectKey,r.amount,r.originalCashId,r.eventId]),c.refundRows.map(r=>[r.projectKey,r.amount,r.originalCashId,r.eventId]));assert.equal(JSON.stringify(native),before);
});

test('native receipt allocations take precedence while an explicitly cleared native list restores direct header assignment',()=>{
 const db=refundFixture(),b=project('b');db.deals.push(b);const aKey=core.dealKey(db.deals[0]),bKey=core.dealKey(b);db.cash[0].projectAllocations=[{projectKey:aKey,amount:'0.30'}];db.cash[0].allocations=[{projectKey:bKey,amount:'0.30'}];let s=core.ownerDebtSnapshot(db,AIR);assert.deepEqual(s.rows.map(r=>r.received),[0n,10n]);assert.equal(s.refundRows[0].projectKey,bKey);
 db.cash[0].allocations=[];db.cash[0].projectAllocations=[{projectKey:bKey,amount:'0.30'}];s=core.ownerDebtSnapshot(db,AIR);assert.deepEqual(s.rows.map(r=>r.received),[10n,0n]);assert.equal(s.refundRows[0].projectKey,aKey);
 const foreign=project('foreign',ARBAT);db.deals.push(foreign);db.cash[0].allocations=[{projectKey:aKey,amount:'0.10'},{projectKey:core.dealKey(foreign),amount:'0.20'}];s=core.ownerDebtSnapshot(db,AIR);assert.deepEqual(s.rows.map(r=>r.received),[0n,0n]);assert.equal(s.unallocated,10n);assert.ok(s.issues.some(i=>i.code==='invalid-receipt-allocation'));assert.equal(s.refundRows[0].projectKey,'');
});
