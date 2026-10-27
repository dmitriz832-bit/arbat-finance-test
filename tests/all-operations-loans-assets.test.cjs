const test=require('node:test'),assert=require('node:assert/strict');
const loans=require('../app/loan-workspace-model.js'),assets=require('../app/asset-workspace-model.js'),core=require('../app/finance-core.js'),balance=require('../app/balance-workspace-model.js'),liquidity=require('../app/liquidity-model.js'),payables=require('../app/payables-model.js');
const ORG='АИР-КЛИМАТ',clone=x=>JSON.parse(JSON.stringify(x));
const loan=(patch={})=>({_id:'loan',version:1,name:'Заём',org:ORG,principal:'100.01',startDate:'2026-01-01',endDate:'2026-03-31',openingInterest:'4.50',schedule:[{id:'jan',dueDate:'2026-01-31',principal:'33.33',interest:'1.00'},{id:'feb',dueDate:'2026-02-28',principal:'33.33',interest:'0.67'},{id:'mar',dueDate:'2026-03-31',principal:'33.35',interest:'0.33'}],repayments:[],...patch});
const asset=(patch={})=>({_id:'asset',name:'Оборудование',org:ORG,cost:'100.01',liquidationValue:'10.00',inServiceDate:'2026-01-17',usefulLifeMonths:3,purchaseAmount:'120.01',purchaseDueDate:'2026-02-10',...patch});
const payment=(patch={})=>({_id:'payment',org:ORG,type:'out',date:'2026-01-31',amount:'25.00',walletId:'wallet',...patch});
function withRepayment(c,p,principal='24.00',interest='1.00',scheduleId='jan'){return {...c,repayments:[{id:'repayment',cashId:p._id,cashFingerprint:loans.cashFingerprint(p),scheduleId,principal,interest}]}}

test('Decimal oracle: fractional annual rate, leap/month-end anchor and final principal cents',()=>{
 // Independent Python Decimal, ROUND_HALF_UP oracle: principal 123456.78 / 4,
 // floor regular principal 30864.19; monthly nominal 17.3259 / 1200.
 const rows=loans.generateSchedule({principal:'123456.78',annualRate:'17.3259',months:4,startDate:'2027-12-01',endDate:'2028-03-31',firstDueDate:'2027-12-31'});
 assert.deepEqual(rows.map(r=>[r.dueDate,r.principal,r.interest]),[['2027-12-31','30864.19','1782.50'],['2028-01-31','30864.19','1336.87'],['2028-02-29','30864.19','891.25'],['2028-03-31','30864.21','445.63']]);
});
test('loan cutoff: future-dated actual repayment cannot extinguish today debt or forecast',()=>{
 const p=payment({date:'2026-02-01'}),d={loanContracts:[withRepayment(loan(),p)],cash:[p]},before=JSON.stringify(d);
 const jan=loans.snapshot(d,{today:'2026-01-31'}),feb=loans.snapshot(d,{today:'2026-02-01'});
 assert.equal(jan.principalOutstanding,10001n);assert.equal(jan.interestOutstanding,650n);
 assert.equal(feb.principalOutstanding,7601n);assert.equal(feb.interestOutstanding,550n);
 assert.equal(liquidity.snapshot(d,{},ORG,'2026-01-31').combined.total,10651n);
 const b=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});assert.equal(b.loans.total,10001n);assert.equal(b.loanInterest.total,null);assert.equal(b.loanInterest.knownTotal,550n);
 assert.equal(JSON.stringify(d),before);
});
test('all-date allocation guard still rejects future repayments exceeding a schedule row',()=>{
 const p=payment({date:'2026-03-01',amount:'100.00'}),c=withRepayment(loan(),p,'34.00','1.00');
 assert.equal(loans.snapshot({loanContracts:[c],cash:[p]},{today:'2026-01-31'}).complete,false);
});
test('loan principal, opening interest, paid interest and accrual reconcile separately to P&L and balance',()=>{
 const p=payment(),d={loanContracts:[withRepayment(loan(),p)],cash:[p],costs:[]};
 const beforeCash=JSON.stringify(d.cash);loans.postInterest(d,'loan','2026-01',{expectedVersion:1});
 const v=loans.snapshot(d,{today:'2026-01-31'}),b=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'}),dash=core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-01-31'},ORG);
 assert.equal(v.principalOutstanding,7601n);assert.equal(v.interestOutstanding,550n);
 assert.equal(b.loans.total,7601n);assert.equal(b.loanInterest.total,450n);
 assert.equal(dash.ebitda,0n);assert.equal(dash.result,-100n);assert.equal(dash.cash.outgoing,2500n);
 assert.equal(core.expenseLedger(d).rows.reduce((n,r)=>n+r.amount,0n),100n);
 assert.equal(payables.snapshot(d,{},'2026-01-31').documents.length,0);
 assert.equal(liquidity.snapshot(d,{},ORG,'2026-01-31').combined.total,8151n);
 assert.equal(JSON.stringify(d.cash),beforeCash);
});
test('two interest rows in one month accrue one literal monthly total and preserve ledger on rejected edits',()=>{
 const c=loan({principal:'100.00',openingInterest:'0',schedule:[{id:'one',dueDate:'2026-01-15',principal:'40.00',interest:'0.20'},{id:'two',dueDate:'2026-01-31',principal:'60.00',interest:'0.30'}]}),d={loanContracts:[c],costs:[]};
 assert.equal(loans.postInterest(d,'loan','2026-01',{expectedVersion:1,date:'2026-01-20'}).amount,'0.50');
 const before=JSON.stringify(d);assert.throws(()=>loans.postInterest(d,'loan','2026-01',{expectedVersion:2}));
 assert.throws(()=>loans.saveContract(d,{...d.loanContracts[0],schedule:[{...c.schedule[0],interest:'0.21'},c.schedule[1]]},{expectedVersion:2}));assert.equal(JSON.stringify(d),before);
});
test('asset literal carrying values, payable, cash and monthly below-EBITDA costs conserve 100.01',()=>{
 const p=payment({amount:'40.00',date:'2026-02-01'}),a=asset({paymentLinks:[{cashId:p._id,amount:'40.00',cashFingerprint:assets.cashFingerprint(p)}]}),d={fixedAssets:[a],cash:[p],costs:[]};
 assert.deepEqual(assets.schedule(a).map(r=>r.amount),[3000n,3000n,3001n]);
 for(const month of ['2026-02','2026-03','2026-04'])assets.post(d,'asset',month,{org:ORG,confirmed:true});
 const b=balance.snapshot(d,{}, {org:ORG,today:'2026-04-30'}),dash=core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-04-30'},ORG);
 assert.equal(b.fixedAssets.total,1000n);assert.equal(b.assetPayables.total,8001n);
 assert.equal(dash.ebitda,0n);assert.equal(dash.result,-9001n);assert.equal(dash.cash.outgoing,4000n);
 assert.equal(payables.snapshot(d,{},'2026-04-30').documents.length,0);
 assert.equal(liquidity.snapshot(d,{},ORG,'2026-04-30').combined.total,8001n);
 assert.equal(assets.snapshot(a,'2026-04-30').bookValue+(-dash.result),10001n);
});
test('asset disposal after one depreciation period expends remaining literal value once',()=>{
 const a=asset({boughtEarlier:true,paymentLinks:[],disposalDate:'2026-03-05'}),d={fixedAssets:[a],costs:[]};
 assert.equal(assets.post(d,'asset','2026-02',{org:ORG,confirmed:true}).amount,'30.00');
 assert.equal(assets.postDisposal(d,'asset',{org:ORG,confirmed:true}).amount,'70.01');
 assert.equal(core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-03-31'},ORG).result,-10001n);
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-03-05'}).fixedAssets.total,0n);
 const before=JSON.stringify(d);assert.throws(()=>assets.postDisposal(d,'asset',{org:ORG,confirmed:true}));assert.throws(()=>assets.remove(d,'asset',assets.version(a)));assert.equal(JSON.stringify(d),before);
});
test('disposal generated expense identity collision is rejected atomically',()=>{
 const a=asset({disposalDate:'2026-03-05'}),d={fixedAssets:[a],costs:[{_id:'asset-disposal:asset',org:ORG,date:'2026-01-01',amount:'1.00'}]};assets.post(d,'asset','2026-02',{org:ORG,confirmed:true});const before=JSON.stringify(d);
 assert.throws(()=>assets.postDisposal(d,'asset',{org:ORG,confirmed:true}),/идентификатор|существует/i);assert.equal(JSON.stringify(d),before);
});
test('duplicate imported asset identity stays reviewable and cannot be overwritten, posted or removed',()=>{
 for(const operation of ['save','post','postDisposal','remove']){
  const a=asset({disposalDate:'2026-03-05'}),d={fixedAssets:[a,clone(a)],costs:[]},before=JSON.stringify(d);
  assert.ok(assets.postingIssues(d,a).length,'duplicate source identity must be reviewable');
  assert.throws(()=>operation==='save'?assets.save(d,{...a,name:'Changed'},assets.version(a)):operation==='remove'?assets.remove(d,'asset',assets.version(a)):operation==='post'?assets.post(d,'asset','2026-02',{org:ORG,confirmed:true}):assets.postDisposal(d,'asset',{org:ORG,confirmed:true}));assert.equal(JSON.stringify(d),before,operation);
 }
});
test('duplicate imported source cash identity cannot be selected for an asset acquisition',()=>{
 const p=payment(),a=asset({paymentLinks:[{cashId:p._id,amount:'25.00'}]}),d={fixedAssets:[a],cash:[p,clone(p)],costs:[]},before=JSON.stringify(d);
 assert.throws(()=>assets.purchasePosition(d,a),/плат[её]ж|идентификатор/i);assert.equal(JSON.stringify(d),before);
});
test('undated acquisition cash cannot discharge a payable or be persisted as a valid settlement',()=>{
 const p=payment({date:''}),a=asset({paymentLinks:[{cashId:p._id,amount:'25.00'}]}),d={fixedAssets:[a],cash:[p],costs:[]},before=JSON.stringify(d);
 assert.throws(()=>assets.purchasePosition(d,a),/дат/i);
 assert.throws(()=>assets.save(d,a,assets.version(a)),/дат/i);assert.equal(JSON.stringify(d),before);
});
test('multiple explicit partial loan allocations consume one cash cap and keep early future interest separate',()=>{
 const p=payment({amount:'51.00'}),c=loan({principal:'100.00',openingInterest:'0',schedule:[{id:'jan',dueDate:'2026-01-31',principal:'50.00',interest:'1.00'},{id:'feb',dueDate:'2026-02-28',principal:'50.00',interest:'0.50'}]}),d={loanContracts:[c],cash:[p],costs:[]};
 c.repayments=[{id:'a',cashId:p._id,cashFingerprint:loans.cashFingerprint(p),scheduleId:'jan',principal:'25.00',interest:'0.50'},{id:'b',cashId:p._id,cashFingerprint:loans.cashFingerprint(p),scheduleId:'feb',principal:'25.00',interest:'0.50'}];
 assert.equal(loans.snapshot(d,{today:'2026-01-31'}).principalOutstanding,5000n);
 assert.equal(loans.snapshot(d,{today:'2026-01-31'}).interestOutstanding,50n);
 const b=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});assert.equal(b.loans.total,5000n);assert.equal(b.loanInterest.total,null);assert.equal(b.loanInterest.knownTotal,50n);
 assert.equal(core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-03-31'},ORG).result,0n);
 const missing={...d,cash:[]};assert.equal(loans.snapshot(missing,{today:'2026-01-31'}).principalOutstanding,null);
 assert.equal(liquidity.snapshot(missing,{},ORG,'2026-01-31').forecastComplete,false);
});
test('cross-register overallocated cash marks both debt registers unknown and does not invent supplier debt',()=>{
 const p=payment({amount:'50.00'}),a=asset({paymentLinks:[{cashId:p._id,amount:'30.00',cashFingerprint:assets.cashFingerprint(p)}]}),d={fixedAssets:[a],loanContracts:[withRepayment(loan(),p)],cash:[p]};
 const l=liquidity.snapshot(d,{},ORG,'2026-01-31'),b=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});
 assert.equal(l.forecastComplete,false);assert.equal(l.registerRows.length,0);assert.equal(b.loans.total,null);assert.equal(b.assetPayables.total,null);assert.equal(b.suppliers.total,0n);
});
test('balance uses registered depreciation with explicit missing-posting review over multiple months',()=>{
 const a=asset({boughtEarlier:true}),d={fixedAssets:[a],costs:[]},before=JSON.stringify(d);
 const noPosts=balance.snapshot(d,{}, {org:ORG,today:'2026-03-31'});
 assert.equal(noPosts.fixedAssets.knownTotal,10001n);assert.equal(noPosts.fixedAssets.total,null);
 assert.ok(noPosts.fixedAssets.issues.some(i=>/2026-02.*2026-03|2026-03.*2026-02/.test(i.message)));assert.equal(JSON.stringify(d),before);
 assets.post(d,'asset','2026-02',{org:ORG,confirmed:true});
 const partial=balance.snapshot(d,{}, {org:ORG,today:'2026-03-31'});
 assert.equal(partial.fixedAssets.knownTotal,7001n);assert.equal(partial.fixedAssets.total,null);
 assert.equal(core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-03-31'},ORG).result,-3000n);
 assets.post(d,'asset','2026-03',{org:ORG,confirmed:true});
 const all=balance.snapshot(d,{}, {org:ORG,today:'2026-03-31'});
 assert.equal(all.fixedAssets.total,4001n);assert.equal(all.fixedAssets.total-core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-03-31'},ORG).result,10001n);
});
test('future asset manifest and future altered expense do not poison a valid earlier registered position',()=>{
 const d={fixedAssets:[asset({boughtEarlier:true})],costs:[]};
 assets.post(d,'asset','2026-02',{org:ORG,confirmed:true});assets.post(d,'asset','2026-03',{org:ORG,confirmed:true});
 Object.assign(d.costs[1],{amount:'99.00',amountGross:'99.00',amountNet:'99.00'});
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-02-28'}).fixedAssets.total,7001n);
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-03-31'}).fixedAssets.total,null);
});
test('future interest manifestation corruption does not poison earlier loan principal or interest',()=>{
 const d={loanContracts:[loan()],costs:[]};loans.postInterest(d,'loan','2026-01',{expectedVersion:1});loans.postInterest(d,'loan','2026-02',{expectedVersion:2});d.costs[1].amount='99';
 const earlier=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});assert.equal(earlier.loans.total,10001n);assert.equal(earlier.loanInterest.total,550n);
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-02-28'}).loans.total,null);
});
test('balance reviews orphan and ambiguous generated expense sources with organization and date cutoff',()=>{
 for(const field of ['sourceAssetId','sourceLoanId']){
  const component=field==='sourceAssetId'?'fixedAssets':'loans',cost={_id:'orphan',org:ORG,date:'2026-02-28',amount:'1',amountGross:'1',amountNet:'1',vatRate:0,pnlType:'expense',pnlLevel:'below',[field]:'missing'},d={costs:[cost]};
  assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-02-28'})[component].total,null);
  assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-02-27'})[component].total,0n);
  assert.equal(balance.snapshot(d,{}, {org:'АРБАТ.ГК',today:'2026-02-28'})[component].total,0n);
  const c=field==='sourceAssetId'?asset({_id:'missing',boughtEarlier:true}):loan({_id:'missing'});d[field==='sourceAssetId'?'fixedAssets':'loanContracts']=[c,clone(c)];
  assert.ok(balance.snapshot(d,{}, {org:ORG,today:'2026-02-28'})[component].issues.some(i=>i.collection==='costs'&&i.id==='orphan'));
 }
});
test('disposal cannot skip prior registered depreciation and permanently lose that expense',()=>{
 const a=asset({boughtEarlier:true,disposalDate:'2026-03-05'}),d={fixedAssets:[a],costs:[]},before=JSON.stringify(d);
 assert.throws(()=>assets.postDisposal(d,'asset',{org:ORG,confirmed:true}),/амортизац|начислен/i);assert.equal(JSON.stringify(d),before);
 assets.post(d,'asset','2026-02',{org:ORG,confirmed:true});assets.postDisposal(d,'asset',{org:ORG,confirmed:true});
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-03-05'}).fixedAssets.total,0n);
 assert.equal(core.ownerPeriodSnapshot(d,{from:'2026-01-01',to:'2026-03-05'},ORG).result,-10001n);
});
test('a fully depreciated zero-book-value disposal requires no invented zero expense',()=>{
 const a=asset({cost:'1.00',liquidationValue:'0.00',usefulLifeMonths:1,boughtEarlier:true,disposalDate:'2026-03-05'}),d={fixedAssets:[a],costs:[]};assets.post(d,'asset','2026-02',{org:ORG,confirmed:true});
 assert.equal(balance.snapshot(d,{}, {org:ORG,today:'2026-03-05'}).fixedAssets.total,0n);assert.equal(d.costs.length,1);
});
test('duplicate unposted asset cards cannot certify duplicate supplier amounts',()=>{
 const a=asset(),d={fixedAssets:[a,clone(a)],costs:[]};const s=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});
 assert.equal(s.fixedAssets.total,null);assert.equal(s.assetPayables.total,null);assert.equal(s.assetPayables.knownTotal,0n);
});
test('due loan interest without registered monthly expense stays an explicit estimate, with opening interest exempt',()=>{
 const d={loanContracts:[loan()],costs:[]};
 const before=balance.snapshot(d,{}, {org:ORG,today:'2026-01-15'});assert.equal(before.loanInterest.total,450n);
 const due=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});assert.equal(due.loans.total,10001n);assert.equal(due.loanInterest.total,null);assert.equal(due.loanInterest.knownTotal,550n);assert.ok(due.loanInterest.issues.some(i=>/2026-01/.test(i.message)));
 loans.postInterest(d,'loan','2026-01',{expectedVersion:1});const posted=balance.snapshot(d,{}, {org:ORG,today:'2026-01-31'});assert.equal(posted.loanInterest.total,550n);assert.equal(posted.loans.total,10001n);
});
