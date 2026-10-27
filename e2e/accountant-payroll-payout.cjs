/* Native accountant authentication, forms and CAS sync against an isolated fake backend. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const {chromium,webkit}=require('playwright'),core=require('../app/finance-core'),root=path.resolve(__dirname,'..'),A='АИР-КЛИМАТ',B='АРБАТ.ГК';
function fixture(){
 const data=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles','leaveEvents'].map(k=>[k,[]]));
 return {...data,dealPlans:{},people:[{_id:'person-row',id:'p',name:'Бухгалтерский контроль',expenseType:'administrative',status:'Трудовой договор'},{_id:'other-row',id:'q',name:'Другой сотрудник',expenseType:'administrative'}],
 labor:[{_id:'accrual-a',org:A,date:'2026-10-01',personId:'p',amount:1000,ndfl:130,otherDeductions:20,employerContributions:300,expenseType:'administrative'},{_id:'accrual-q',org:A,date:'2026-10-01',personId:'q',amount:80,expenseType:'administrative'},{_id:'accrual-b',org:B,date:'2026-10-01',personId:'p',amount:500,expenseType:'administrative'}],
 cash:[{_id:'partial',org:A,date:'2026-10-02',type:'out',personId:'p',amount:200,walletId:'wallet-a',articleId:'salary',payrollPayment:true,payrollAllocations:[{personId:'p',amount:120},{personId:'q',amount:80}]},{_id:'other',org:A,date:'2026-10-03',type:'out',personId:'p',amount:100,walletId:'wallet-a',articleId:'salary',payrollPayment:false},{_id:'overpayment',org:B,date:'2026-10-02',type:'out',personId:'p',amount:600,walletId:'wallet-b',articleId:'salary',payrollPayment:true}],
 wallets:[{id:'wallet-a',org:A,name:'Расчётный счёт АИР',verified:true,openingBalance:10000,openingBalanceDate:'2026-09-30'},{id:'wallet-b',org:B,name:'Расчётный счёт АРБАТ',verified:true,openingBalance:10000,openingBalanceDate:'2026-09-30'}],articles:[{id:'salary',name:'Заработная плата',group:'Выбытие',activity:'Операционная деятельность'}]};
}
async function serverFor(run){const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run('http://127.0.0.1:'+server.address().port)}finally{await new Promise(r=>server.close(r))}}
async function session(browser,origin,width=1440){
 const context=await browser.newContext({viewport:{width,height:932},reducedMotion:'reduce'}),page=await context.newPage(),backend={finance:fixture(),warehouse:{items:[],moves:[],places:[],projectIssues:[],plans:[],folders:[]},revisions:{finance:1,warehouse:1},writes:[],closed:[],periodBarrier:null,errors:[]};
 page.on('pageerror',e=>backend.errors.push(e.message));
 await context.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());if(u.origin===origin)return route.continue();
  if(u.origin!=='https://albkplrjiksydkjkivlm.supabase.co')return route.abort();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}),p=u.pathname;
  if(p==='/rest/v1/rpc/claim_staff_access')return json({role:'accountant',user_id:'local-accountant',email:'accountant@example.test',full_name:'Бухгалтер'});
  if(p==='/rest/v1/finance_state')return json([{payload:backend.finance,revision:backend.revisions.finance}]);
  if(p==='/rest/v1/warehouse_state')return json([{payload:backend.warehouse,revision:backend.revisions.warehouse}]);
  if(p==='/rest/v1/finance_periods'){if(backend.periodBarrier)await backend.periodBarrier();return json(backend.closed)}
  if(p==='/rest/v1/rpc/update_shared_state_batch'){
   const body=request.postDataJSON();for(const change of body.p_changes)assert.equal(change.expected_revision,backend.revisions[change.store],'native CAS revision');
   backend.writes.push(body);const result={};for(const change of body.p_changes){backend[change.store]=change.payload;result[change.store]=++backend.revisions[change.store]}return json(result);
  }
  return json([]);
 });
 await context.addInitScript(data=>{if(sessionStorage.getItem('payroll-fixture'))return;sessionStorage.setItem('payroll-fixture','1');localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data.finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(data.warehouse));localStorage.setItem('arbat-cloud-revision-v1',JSON.stringify({finance_state:1,warehouse_state:1}));localStorage.setItem('arbat-session-v1',JSON.stringify({access_token:'isolated-accountant-session',expires_at:4102444800}));},backend);
 await page.goto(origin+'/app/');await page.waitForFunction(()=>document.body.classList.contains('ab-ready')&&window.abIdentity?.role==='accountant');
 await page.evaluate(()=>arbatNavigate('labor:summary'));
 return {context,page,backend};
}
const row=page=>page.locator('#payrollWorkspaceHost tbody tr').filter({hasText:'Бухгалтерский контроль'}).filter({hasText:A});
async function openPayout(page){const button=row(page).getByRole('button',{name:'Выплатить',exact:true});assert.equal(await button.count(),1,'accountant can pay directly from the accrued net balance');await button.click();await page.locator('.ui-sheet-overlay:not([hidden]) #cashForm').waitFor();await page.waitForFunction(()=>document.getElementById('cashForm').elements.partyRef.value==='person:p');}
async function configure(page,amount){const form=page.locator('#cashForm');await form.locator('[name=walletId]').selectOption('wallet-a');await form.locator('[name=articleId]').selectOption('salary');if(amount!==undefined)await form.locator('[name=amount]').fill(String(amount));return form;}
async function cancel(page){await page.locator('[data-sheet-cancel]').click();const discard=page.locator('[data-sheet-discard]');if(await discard.isVisible())await discard.click();assert.equal(await page.locator('#cashForm [data-payroll-payment-context]').count(),0,'cancelling payroll clears the contextual payment before another document opens');}
test('accountant pays accrued net balance in part and in full through the native form and CAS sync', {timeout:180000},async()=>serverFor(async origin=>{
 for(const engine of process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit]){const browser=await engine.launch();try{for(const width of [390,1440]){const {context,page,backend}=await session(browser,origin,width);try{
  const initial=await page.evaluate(()=>({cash:db.cash,labor:db.labor,expense:ArbatFinanceCore.rubles(ArbatFinanceCore.expenseLedger(db).rows.reduce((n,r)=>n+r.amount,0n))}));
  assert.equal(await page.locator('#payrollWorkspaceHost [data-payroll-pay]').count(),1,'settled and overpaid employees have no payout action');
  await page.evaluate(()=>arbatNavigate('labor'));assert.equal(await page.locator('#payrollReconciliationTable [data-payroll-pay]').count(),1,'native accrual documents expose the same payout action');await page.locator('#labor [data-payroll-balances]').click();
  await openPayout(page);const form=await configure(page,230);assert.equal(await form.locator('[name=org]').inputValue(),A);assert.equal(await form.locator('[name=type]').inputValue(),'out');assert.equal(await form.locator('[name=payrollPurpose]').inputValue(),'salary');assert.match(await form.locator('[name=note]').inputValue(),/Зарплата/);
  assert.match(await form.innerText(),/730,00/,'remaining balance excludes employer contributions, non-payroll cash and other employee allocations');
  await page.locator('[data-sheet-save]').click();await page.waitForFunction(()=>db.cash.length===4);await page.waitForFunction(()=>!document.body.classList.contains('ui-sheet-open'));
  assert.match(await row(page).innerText(),/500,00/);assert.equal(backend.finance.cash.length,4);
  await openPayout(page);assert.equal(core.cents(await page.locator('#cashForm [name=amount]').inputValue().then(x=>x.replace(/\s/g,''))),50000n);await configure(page);await page.locator('[data-sheet-save]').click();await page.waitForFunction(()=>db.cash.length===5);await page.waitForFunction(()=>!document.body.classList.contains('ui-sheet-open'));
  assert.equal(await row(page).getByRole('button',{name:'Выплатить',exact:true}).count(),0);
  const final=await page.evaluate(()=>({cash:db.cash,labor:db.labor,expense:ArbatFinanceCore.rubles(ArbatFinanceCore.expenseLedger(db).rows.reduce((n,r)=>n+r.amount,0n))}));assert.deepEqual(final.labor,initial.labor);assert.equal(final.expense,initial.expense,'cash payout does not add payroll expense');assert.deepEqual(final.cash.slice(0,3),initial.cash,'existing allocation/purpose records remain intact');
  const added=backend.finance.cash.filter(p=>!initial.cash.some(x=>x._id===p._id));assert.equal(added.length,2);assert.deepEqual(added.map(p=>p.payrollAllocations),[[{personId:'p',amount:'230.00'}],[{personId:'p',amount:'500.00'}]]);assert.ok(added.every(p=>p.payrollPayment===true&&p.createdBy.email==='accountant@example.test'));
  await page.reload();await page.waitForFunction(()=>document.body?.classList.contains('ab-ready'));await page.evaluate(()=>arbatNavigate('labor:summary'));assert.equal(await row(page).getByRole('button',{name:'Выплатить',exact:true}).count(),0);assert.deepEqual(backend.errors,[]);
 }finally{await context.close()}}}finally{await browser.close()}}
}));
function eligibility(data,org=A,personId='p',allOrganizations=false){
 const source=require('node:fs').readFileSync(path.join(root,'app/business-system.js'),'utf8'),start=source.indexOf('function payrollPaymentEligibility('),end=source.indexOf('window.arbatPayrollPaymentEligibility=',start);
 assert.ok(start>=0&&end>start,'contextual payout must assess unresolved payroll reconciliation before using payable');
 const context={};vm.runInNewContext(source.slice(start,end),context);return context.payrollPaymentEligibility(org,personId,core.payrollByOrganization({accruals:data.labor||[],payments:data.cash||[],workActs:data.workActs||[],settlements:data.crewSettlements||[]},allOrganizations?'':org),data);
}
for(const [label,patch]of [['overallocated',{payrollAllocations:[{personId:'p',amount:1200}]}],['invalid allocation',{payrollAllocations:[{personId:'p',amount:'invalid'}]}],['unallocated',{payrollAllocations:[]}],['invalid payment',{amount:'invalid'}]])test('payout eligibility blocks '+label+' prior payroll cash instead of paying the excluded amount again',()=>{
 const payment={_id:'review',org:A,type:'out',personId:'p',amount:1000,payrollPayment:true,...patch},data={labor:[{org:A,personId:'p',amount:1000}],cash:[payment]},result=eligibility(data);assert.equal(result.allowed,false);assert.match(result.reason,/Сверьте/);assert.equal(result.source._id,'review');
});
test('payout eligibility scopes unresolved payroll issues and excludes non-salary cash',()=>{
 const bad={_id:'review',org:A,type:'out',personId:'p',amount:1000,payrollPayment:true,payrollAllocations:[{personId:'p',amount:1200}]},base={labor:[{org:A,personId:'p',amount:1000}],cash:[]};
 for(const cash of [[{...bad,payrollPayment:false}],[{...bad,org:B}],[{...bad,personId:'q',amount:'invalid',payrollAllocations:undefined}]])for(const allOrganizations of [false,true])assert.equal(eligibility({...base,cash},A,'p',allOrganizations).allowed,true);
 assert.equal(eligibility({...base,labor:[...base.labor,{org:A,personId:'q',amount:100,ndfl:200}]}).allowed,true,'another employee deduction error does not affect this employee');
 const linked={id:'settlement',cashId:'other-org',personId:'p',amount:'invalid'};assert.equal(eligibility({...base,cash:[{...bad,_id:'other-org',org:B,payrollAllocations:undefined}],crewSettlements:[linked]}).allowed,true,'settlement issues inherit the linked payment organization');
});
test('accountant can still prepare a payout with malformed non-payroll cash and unresolved payroll in another organization', {timeout:180000},async()=>serverFor(async origin=>{
 const browser=await chromium.launch();try{const {context,page,backend}=await session(browser,origin);try{
  await page.evaluate(()=>{const bad={type:'out',personId:'p',amount:1000,payrollAllocations:[{personId:'p',amount:1200}]};db.cash.push({_id:'nonpayroll',...bad,org:'АИР-КЛИМАТ',payrollPayment:false},{_id:'other-org-unallocated',...bad,org:'АРБАТ.ГК',payrollPayment:true});window.render();});
  assert.equal(await row(page).getByRole('button',{name:'Сверить выплаты',exact:true}).count(),0);await openPayout(page);assert.equal(core.cents(await page.locator('#cashForm [name=amount]').inputValue()),73000n);await cancel(page);assert.equal(backend.writes.length,0);assert.deepEqual(backend.errors,[]);
 }finally{await context.close()}}finally{await browser.close()}
}));
test('accountant sees an actionable reconciliation route for prior invalid or unallocated payroll cash', {timeout:180000},async()=>serverFor(async origin=>{
 const browser=await chromium.launch();try{const {context,page,backend}=await session(browser,origin);try{
  for(const allocations of [[{personId:'p',amount:1200}],[{personId:'p',amount:'invalid'}],[]]){
   await page.evaluate(({org,allocations})=>{db.labor=[{_id:'accrual-a',org,date:'2026-10-01',personId:'p',amount:1000,expenseType:'administrative'}];db.cash=[{_id:'review',org,date:'2026-10-02',type:'out',personId:'p',amount:1000,walletId:'wallet-a',articleId:'salary',payrollPayment:true,payrollAllocations:allocations}];window.render();arbatNavigate('labor:summary');},{org:A,allocations});
   assert.equal(await row(page).getByRole('button',{name:'Выплатить',exact:true}).count(),0,'uncertain prior paid amount must not be paid again');const review=row(page).getByRole('button',{name:'Сверить выплаты',exact:true});assert.equal(await review.count(),1);assert.match(await row(page).innerText(),/Сверьте.*выплат/);
   await page.evaluate(()=>arbatNavigate('labor'));assert.equal(await page.locator('#payrollReconciliationTable [data-payroll-pay]').count(),0);assert.equal(await page.locator('#payrollReconciliationTable [data-payroll-review]').count(),1);await page.locator('#labor [data-payroll-balances]').click();
   await page.evaluate(()=>arbatOpenPayrollPayment('АИР-КЛИМАТ','p'));assert.equal(await page.locator('.ui-sheet-overlay:not([hidden])').count(),0,'direct open also fails closed');assert.equal(await page.evaluate(()=>db.cash.length),1);
   await review.click();await page.locator('#genericModal.open').waitFor();assert.equal(await page.locator('#genericEditForm [name=amount]').inputValue().then(x=>core.cents(x)),100000n,'reconciliation action opens the existing payout');await page.locator('#genericCancel').click();
  }
  assert.equal(backend.writes.length,0);assert.deepEqual(backend.errors,[]);
 }finally{await context.close()}}finally{await browser.close()}
}));
test('unresolved payroll introduced during the asynchronous period check blocks the prepared payout', {timeout:180000},async()=>serverFor(async origin=>{
 const browser=await chromium.launch();try{const {context,page,backend}=await session(browser,origin);try{
  await openPayout(page);await configure(page);let release,entered;const waiting=new Promise(r=>release=r),checking=new Promise(r=>entered=r);backend.periodBarrier=()=>{entered();return waiting};await page.locator('[data-sheet-save]').click();await checking;
  await page.evaluate(()=>db.cash.push({_id:'late-unallocated',org:'АИР-КЛИМАТ',type:'out',amount:1000,payrollPayment:true,payrollAllocations:[]}));release();backend.periodBarrier=null;
  await page.locator('.ft-toast').filter({hasText:'Сверьте'}).waitFor();assert.equal(await page.evaluate(()=>db.cash.length),4);assert.equal(backend.writes.length,0);assert.deepEqual(backend.errors,[]);
 }finally{await context.close()}}finally{await browser.close()}
}));
test('contextual payroll payment rejects closed periods, changed balances, changed identity and excess amount', {timeout:180000},async()=>serverFor(async origin=>{
 const browser=await chromium.launch();try{const {context,page,backend}=await session(browser,origin);try{
  await openPayout(page);await configure(page,731);await page.locator('[data-sheet-save]').click();await page.locator('.ft-toast').filter({hasText:'остаток'}).waitFor();assert.equal(await page.evaluate(()=>db.cash.length),3);await cancel(page);
  await openPayout(page);await configure(page);backend.closed=[{period:new Date().toISOString().slice(0,7),status:'closed'}];await page.locator('[data-sheet-save]').click();await page.locator('#cashForm [data-tax-form-error]').filter({hasText:'закрыт'}).waitFor();assert.equal(await page.evaluate(()=>db.cash.length),3);assert.equal(backend.writes.length,0);backend.closed=[];await cancel(page);
  await openPayout(page);await configure(page);await page.evaluate(()=>db.cash.push({_id:'colleague-payment',org:'АИР-КЛИМАТ',type:'out',personId:'p',amount:1,payrollPayment:true}));await page.locator('[data-sheet-save]').click();await page.locator('.ft-toast').filter({hasText:'изменились'}).waitFor();assert.equal(await page.evaluate(()=>db.cash.length),4);assert.equal(backend.writes.length,0);await cancel(page);
  await openPayout(page);await configure(page);let release;const waiting=new Promise(r=>release=r);backend.periodBarrier=()=>waiting;await page.locator('[data-sheet-save]').click();await page.evaluate(()=>window.abIdentity={...window.abIdentity,role:'employee'});release();backend.periodBarrier=null;await page.locator('.ft-toast').filter({hasText:'права'}).waitFor();assert.equal(await page.evaluate(()=>db.cash.length),4);assert.equal(backend.writes.length,0);
  assert.deepEqual(backend.errors,[]);
 }finally{await context.close()}}finally{await browser.close()}
}));
