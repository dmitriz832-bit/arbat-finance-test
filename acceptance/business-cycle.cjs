const {acceptConfirmation,closeCard,dismissToast,rejectNativeDialogs}=require('../tests/helpers/popup-ui.cjs');
/* Complete application workflow. Disposable data; every external request is denied. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{fixture,specs}=require('../tests/helpers/business-cycle.cjs'),root=path.resolve(__dirname,'..');
const choose=(p,selector,value)=>p.locator(selector).selectOption(value,{force:true});
const navigate=(p,route)=>p.evaluate(route=>window.arbatNavigate(route),route);
async function openForm(p,id){await p.evaluate(id=>window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:id}})),id);await p.locator('#'+id).waitFor({state:'visible'})}
async function dashboardDebt(p,amount){await navigate(p,'overview');await p.waitForFunction(amount=>{const value=document.querySelector('#supplierObligations [data-pay-dashboard]')?.textContent||'';return Number(value.replace(/[^\d,.-]/g,'').replace(',','.'))===amount},amount);assert.equal(await p.locator('#supplierObligations').isVisible(),true)}
async function closePay(p,expected=false){const d=p.locator('#payablesDialog');if(expected)await d.waitFor({state:'visible'});if(await d.isVisible()){await d.locator('[data-pay-close]').click();await d.waitFor({state:'hidden'})}}
async function saveForm(p,id){const invalid=await p.locator('#'+id).evaluate(form=>[...form.elements].filter(f=>f.willValidate&&!f.checkValidity()).map(f=>({name:f.name,value:f.value})));assert.deepEqual(invalid,[],id+' required fields');await p.locator('[data-sheet-save]').click()}
async function controls(p,s,expected,period='2026-10'){
 const actual=await p.evaluate(({s,period})=>{const f=JSON.parse(localStorage.getItem('arbat-finance-demo-live')),w=JSON.parse(localStorage.getItem('arbat-warehouse-v1')),c=window.ArbatFinanceCore,fifo=window.arbatFifo(w),d={...f,warehouse:w,fifo},deal=f.deals.find(x=>x._id===s.id),key=c.dealKey(deal),wip=c.projectWipSnapshot(d,deal,key,period),pnl=c.preliminaryPeriod(d,period,s.org),owner=c.ownerPeriodSnapshot(d,{from:period+'-01',to:period==='2026-10'?'2026-10-31':'2026-11-30'},s.org),debt=c.ownerDebtSnapshot(d,s.org),pay=window.ArbatPayables.summary(f,w,s.org),stock=c.ownerWarehouseSnapshot(w,fifo,s.org),wallet=c.walletSnapshot(100000,f.cash,s.id,'2026-09-30');return {supplier:String(pay.remaining),stock:String(stock.totalValue),cash:String(wallet.balance),wip:String(wip.wip),accrued:String(wip.accruedCost),result:String(pnl.result),ownerResult:String(owner.result),receivable:String(debt.receivable),advance:String(debt.advances),revenue:String(pnl.revenue),wipIssues:wip.issues,audit:window.arbatAudit(w,f).errors}}, {s,period});
 for(const [key,value] of Object.entries(expected))assert.equal(actual[key],String(value*100),s.org+' '+period+' '+key);
 assert.equal(actual.result,actual.ownerResult);assert.deepEqual(actual.wipIssues,[]);assert.equal(actual.audit,0);return actual;
}
async function move(p,s,kind,lines,note,reject=false){
 await navigate(p,'materials:receipt');await p.locator('#arbatWarehouseIntro').getByRole('button',{name:/Оформить приход/i}).click();await p.locator('#whDialog.open').waitFor();
 await choose(p,'#whDlgForm [name=kind]',kind);await choose(p,'#whDlgForm [name=org]',s.org);
 if(kind==='receipt')await choose(p,'#whDlgForm [name=to]',s.id+'-store');
 else{await choose(p,'#whDlgForm [name=from]',s.id+'-store');await choose(p,'#whDlgForm [name=dealId]',s.id)}
 await p.locator('#whDlgForm [name=note]').fill(note);
 for(let i=0;i<lines.length;i++){if(i)await p.locator('#whDlgForm [data-add-line]').click();const row=p.locator('#whDlgForm .wh-document-line').nth(i);await row.locator('[data-line-item]').selectOption(lines[i][0],{force:true});await row.locator('[data-line-qty]').fill(String(lines[i][1]));if(kind==='receipt')await row.locator('[data-line-price]').fill(String(lines[i][2]||0))}
 await p.locator('#whDlgForm button[type=submit]').click();if(reject){assert.equal(await p.locator('#whDialog.open').count(),1);await p.locator('.ft-toast-message').filter({hasText:/Недостаточно остатка/}).waitFor();await dismissToast(p,/Недостаточно остатка/);await closeCard(p,'#whCancel');await p.locator('#whDialog.open').waitFor({state:'hidden'});return}await p.locator('#whDialog.open').waitFor({state:'hidden'});if(kind==='receipt')await p.locator('#payablesDialog[open]').waitFor();await closePay(p);
}
async function cash(p,s,amount,note,date,incoming=false){
 await openForm(p,'cashForm');await choose(p,'#cashForm [name=org]',s.org);await choose(p,'#cashForm [name=type]',incoming?'in':'out');await choose(p,'#cashForm [name=walletId]',s.id);await choose(p,'#cashForm [name=partyRef]',incoming?'cp:customer':'cp:supplier');await choose(p,'#cashForm [name=articleId]',incoming?'in':'out');await p.locator('#cashForm [name=date]').fill(date);await p.locator('#cashForm [name=amount]').fill(String(amount));await p.locator('#cashForm [name=note]').fill(note);await saveForm(p,'cashForm');await p.waitForFunction(note=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).cash.some(x=>x.note===note),note);
 const saved=await p.evaluate(note=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).cash.find(x=>x.note===note),note);assert.ok(saved,'cash form saved '+note);return saved;
}
async function link(p,key,paymentId,amount){await p.evaluate(key=>window.arbatOpenPayables(key),key);const d=p.locator('#payablesDialog');await d.locator('[name=paymentId]').selectOption(paymentId,{force:true});await d.locator('[name=settlementAmount]').fill(String(amount));await d.locator('[data-pay-allocation] button[type=submit]').click();assert.doesNotMatch(await d.locator('.pay-error').innerText(),/не превышать|ошибк/i);await closePay(p)}
async function realization(p,s,date,number){await openForm(p,'realizationForm');await choose(p,'#realizationForm [name=projectKey]',s.org+'::1C#CYCLE-'+s.id);await p.locator('#realizationForm [name=date]').fill(date);await p.locator('#realizationForm [name=document]').fill(number);await p.locator('#realizationForm [name=amount]').fill(String(s.contract/2));await choose(p,'#realizationForm [name=vatRate]',String(s.rate));await saveForm(p,'realizationForm');await p.waitForFunction(number=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).realizations.some(x=>x.document===number),number);assert.ok(await p.evaluate(number=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).realizations.some(x=>x.document===number),number))}
test('full receipt-to-profit cycle through actual forms for two organizations and two months',{timeout:180000},async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of (process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit])){const browser=await engine.launch();try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),p=await context.newPage(),errors=[];p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));rejectNativeDialogs(p,errors);
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname==='/app/auth.js')return r.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return r.fulfill({body:''});return r.continue()});
  await context.addInitScript(data=>{if(localStorage.getItem('cycle-seeded'))return;localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data.finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(data.warehouse));localStorage.setItem('cycle-seeded','1')},fixture());
  await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
  try{await p.goto(origin+'/app/');await p.waitForFunction(()=>typeof window.arbatOpenPayables==='function');
   for(const s of specs){
    await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
    console.log('business cycle',engine.name(),width,s.org);
    await controls(p,s,{cash:100000,supplier:0,stock:0,result:0});
    await move(p,s,'receipt',[['unit',10,1000],['pipe',20,100]],'УПД цикл '+s.id);
    const key=await p.evaluate(org=>{const w=JSON.parse(localStorage.getItem('arbat-warehouse-v1'));return window.ArbatPayables.receiptKey(w.moves.find(x=>x.org===org&&x.kind==='receipt'))},s.org);
    await controls(p,s,{cash:100000,supplier:12000,stock:12000,result:0});await dashboardDebt(p,12000);
    await move(p,s,'consume',[['unit',6],['unit',6]],'Недопустимое повторное списание',true);await controls(p,s,{stock:12000,accrued:0,supplier:12000});
    const partial=await cash(p,s,5000,'Частичная оплата '+s.id,'2026-10-03');await link(p,key,partial._id,5000);
    await controls(p,s,{cash:95000,supplier:7000,stock:12000,result:0});await dashboardDebt(p,7000);
    await p.clock.setFixedTime(new Date('2026-10-04T10:00:00Z'));await move(p,s,'receipt',[['unit',5,1200]],'Вторая партия '+s.id);
    await p.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));await move(p,s,'consume',[['unit',12],['pipe',10]],'Расход цикл '+s.id);
    await controls(p,s,{stock:4600,accrued:13400,wip:13400,result:0,supplier:13000});
    await openForm(p,'expenseForm');await choose(p,'#expenseForm [name=projectKey]',s.org+'::1C#CYCLE-'+s.id);await p.locator('#expenseForm [name=date]').fill('2026-10-07');await choose(p,'#expenseForm [name=category]','Подрядчики');await p.locator('#expenseForm [name=amount]').fill(String(s.contractor));await p.locator('#expenseForm [name=note]').fill('Подрядчик '+s.id);await choose(p,'#expenseForm [name=vatRate]',String(s.rate));await choose(p,'#expenseForm [name=vatDeductible]','true');await saveForm(p,'expenseForm');await closePay(p,true);
    await openForm(p,'costForm');await choose(p,'#costForm [name=org]',s.org);await choose(p,'#costForm [name=name]','Административный расход');await p.locator('#costForm [name=date]').fill('2026-10-07');await p.locator('#costForm [name=amount]').fill(String(s.general));await choose(p,'#costForm [name=vatRate]',String(s.rate));await choose(p,'#costForm [name=vatDeductible]','true');await saveForm(p,'costForm');await closePay(p,true);
    await controls(p,s,{accrued:16400,wip:16400,result:-1000,supplier:13000+s.contractor+s.general});
    // Cash form has no automatic project allocation: assign the receipt through its production editor.
    const advance=await cash(p,s,s.advance,'Аванс '+s.id,'2026-10-09',true);
    await p.evaluate(({id,key})=>{openRecord('cash',id);const f=document.getElementById('genericEditForm');if(!f.elements.projectKey)throw Error('Cash editor has no project allocation');f.elements.projectKey.value=key;f.requestSubmit()},{id:advance._id,key:s.org+'::1C#CYCLE-'+s.id});
    await controls(p,s,{advance:s.advance,revenue:0,result:-1000});
    await realization(p,s,'2026-10-15','АКТ-1-'+s.id);await controls(p,s,{revenue:20000,result:10800,wip:8200,receivable:s.contract/2-s.advance,advance:0});
    await realization(p,s,'2026-11-02','АКТ-2-'+s.id);await controls(p,s,{result:11800,wip:0,receivable:s.contract-s.advance},'2026-11');
    const documents=await p.evaluate(org=>window.ArbatPayables.snapshot(JSON.parse(localStorage.getItem('arbat-finance-demo-live')),JSON.parse(localStorage.getItem('arbat-warehouse-v1'))).documents.filter(d=>d.org===org&&d.remaining>0n).map(d=>({key:d.key,amount:Number(d.remaining)/100})),s.org);
    for(let i=0;i<documents.length;i++){const doc=documents[i],paid=await cash(p,s,doc.amount,'Окончательная оплата '+s.id+' '+i,'2026-11-03');await link(p,doc.key,paid._id,doc.amount)}
    const final=await cash(p,s,s.contract-s.advance,'Расчёт покупателя '+s.id,'2026-11-04',true);await p.evaluate(({id,key})=>{openRecord('cash',id);const f=document.getElementById('genericEditForm');f.elements.projectKey.value=key;f.requestSubmit()},{id:final._id,key:s.org+'::1C#CYCLE-'+s.id});
    await controls(p,s,{cash:s.closingCash,supplier:0,stock:4600,wip:0,result:11800,receivable:0,advance:0},'2026-11');await dashboardDebt(p,0);await controls(p,s,{result:10800,wip:8200});
   }
   await p.reload();await p.waitForFunction(()=>typeof window.arbatOpenPayables==='function');for(const s of specs)await controls(p,s,{cash:s.closingCash,supplier:0,stock:4600,result:11800,wip:0,receivable:0,advance:0},'2026-11');
   assert.deepEqual(errors,[]);await navigate(p,'overview');await fs.mkdir(path.join(root,'test-results'),{recursive:true});await p.screenshot({path:path.join(root,'test-results',`business-cycle-${engine.name()}-${width}.png`),fullPage:true});
  }catch(error){await fs.mkdir(path.join(root,'test-results'),{recursive:true});await p.screenshot({path:path.join(root,'test-results',`business-cycle-failed-${engine.name()}-${width}.png`),fullPage:true}).catch(()=>{});throw error}finally{await context.close()}
 }}finally{await browser.close()}}}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
