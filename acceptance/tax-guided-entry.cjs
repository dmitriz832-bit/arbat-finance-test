const {acceptConfirmation,closeCard,dismissToast,rejectNativeDialogs}=require('../tests/helpers/popup-ui.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{fixture}=require('../tests/helpers/business-cycle.cjs'),root=path.resolve(__dirname,'..');
test('guided tax entry confirms drafts once, preserves overrides and links source documents on six browser/device combinations',{timeout:180000},async()=>{
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of (process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit])){const browser=await engine.launch();try{for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));rejectNativeDialogs(page,errors);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:"window.abIdentity={user_id:'fixture',role:'admin'};document.body.classList.add('ab-ready');"});if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return route.fulfill({body:''});return route.continue()});
  const data=fixture(),org='АРБАТ.ГК',projectKey=org+'::1C#CYCLE-arbat';
  data.finance.cash=[{_id:'advance',org,type:'in',date:'2026-10-01',amount:1220,vatRate:'22',walletId:'arbat',articleId:'in',customerId:'customer',note:'Аванс покупателя'},{_id:'tax',org,type:'out',date:'2026-10-03',amount:100,walletId:'arbat',articleId:'out',customerId:'supplier',note:'Налоговый платёж'}];
  data.finance.cash.push({_id:'advance-other',org,type:'in',date:'2026-10-05',amount:105,vatRate:'5',note:'Другой платёж'});
  data.finance.expenses=[{_id:'purchase',org,projectKey,date:'2026-10-02',amount:1220,amountGross:1220,vatRate:'22',vatDeductible:'true',category:'Материалы',note:'УПД 42'}];
  data.finance.realizations=[{_id:'sale',org,projectKey,date:'2026-10-04',amount:610,vatRate:'22',document:'Акт 12'}];
  await context.addInitScript(data=>{if(!localStorage.getItem('arbat-finance-demo-live'))localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data.finance));if(!localStorage.getItem('arbat-warehouse-v1'))localStorage.setItem('arbat-warehouse-v1',JSON.stringify(data.warehouse))},data);
  await page.clock.setFixedTime(new Date('2026-10-24T10:00:00Z'));await page.goto(origin+'/app/');await page.locator('#dashboardTaxes').waitFor();
  const form=page.locator('#genericEditForm'),dialog=page.locator('#taxRegistersDialog'),eventForm=dialog.locator('form');
  await page.evaluate(()=>openRecord('expenses','purchase'));await form.locator('[data-tax-fields]').evaluate(el=>{el.open=true});
  assert.match(await form.locator('[data-tax-proposal=profitTax]').innerText(),/1000,00.*2026-10-02.*УПД 42/);
  assert.equal(await page.evaluate(()=>db.expenses[0].profitTaxDeductible),undefined);
  assert.equal(await form.locator('[name=profitTaxDocument]').isVisible(),false,'source evidence needs no repeated entry');
  assert.equal(await form.locator('[name=vatInvoice]').isVisible(),false,'VAT overrides are optional');
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});await form.locator('[data-tax-fields]').screenshot({path:path.join(root,'test-results',`tax-guided-document-${engine.name()}-${width}.png`)});
  await form.locator('[data-tax-confirm=profitTax]').click();await form.locator('[data-tax-confirm-vat]').click();
  assert.equal(await form.locator('[name=profitTaxDocument]').inputValue(),'УПД 42');assert.equal(await form.locator('[name=vatInvoice]').inputValue(),'УПД 42');
  assert.equal(await form.locator('[name=profitTaxRecognitionDate]').inputValue(),'2026-10-02');assert.equal(await form.locator('[name=vatDeductionDate]').inputValue(),'2026-10-02');
  assert.equal(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+2),true);
  await form.locator('button[type=submit]').click();await page.locator('#genericModal.open').waitFor({state:'hidden'});
  await page.reload();await page.locator('#dashboardTaxes').waitFor();assert.equal(await page.evaluate(()=>db.expenses[0].profitTaxRecognizedAmount),'1000.00');assert.equal(await page.evaluate(()=>db.expenses[0].vatInvoice),'УПД 42');
  await page.evaluate(()=>openRecord('expenses','purchase'));await form.locator('[data-tax-fields]').evaluate(el=>{el.open=true});await form.locator('[name=amount]').fill('2440');
  assert.equal(await form.locator('[name=profitTaxRecognizedAmount]').inputValue(),'1000.00','editing gross must not silently confirm extra expense');
  await closeCard(page,'#genericClose');
  // Existing partial recognition has no legacy single date. VAT confirmation still reuses the UПД.
  await page.evaluate(()=>openRecord('expenses','purchase'));await form.locator('[data-tax-fields]').evaluate(el=>{el.open=true});
  await form.locator('[data-tax-scope=profitExpense] [data-tax-manual]').evaluate(el=>{el.open=true});
  await form.locator('[name=profitTaxRecognitionDate]').fill('');await form.locator('[name=profitTaxRecognizedAmount]').fill('');
  const parts=form.locator('[data-tax-event-editor=profitTax]');await parts.evaluate(el=>{el.open=true});await parts.locator('[data-tax-event-add]').click();
  await parts.locator('[data-event-date]').fill('2026-10-03');await parts.locator('[data-event-amount]').fill('1000');await parts.locator('[data-event-document]').fill('УПД 42');
  await form.locator('[data-tax-vat-manual]').evaluate(el=>{el.open=true});
  await form.locator('[name=vatInvoice]').fill('');await form.locator('[name=vatDeductionDate]').fill('');await form.locator('[data-tax-confirm-vat]').click();
  assert.equal(await form.locator('[name=vatInvoice]').inputValue(),'УПД 42');assert.equal(await form.locator('[name=vatDeductionDate]').inputValue(),'2026-10-02');
  assert.equal(await parts.locator('.tax-event-row').count(),1);
  const draft=await form.evaluate(el=>Object.fromEntries(new FormData(el)));assert.equal(JSON.parse(draft.profitTaxRecognitionEvents).length,1,'event must reach FormData');
  await form.locator('button[type=submit]').click();await page.locator('#genericModal.open').waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>({row:db.expenses[0]}));assert.equal(saved.row.profitTaxRecognitionEvents?.length,1,JSON.stringify(saved));
  await page.reload();await page.locator('#dashboardTaxes').waitFor();assert.equal(await page.evaluate(()=>db.expenses[0].profitTaxRecognitionEvents?.length),1);

  // Context action refuses unsaved document changes; source data is never silently saved.
  await page.evaluate(()=>openRecord('cash','advance'));await form.locator('[name=amount]').fill('1200');await form.locator('[data-tax-source=advances]').click();assert.match(await form.locator('[data-tax-source-error]').innerText(),/Сначала сохраните/);assert.equal(await dialog.evaluate(el=>el.open),false);await closeCard(page,'#genericClose');
  await page.evaluate(()=>openRecord('cash','advance'));await form.locator('[data-tax-source=advances]').click();
  assert.equal(await eventForm.locator('[name=org]').inputValue(),org);assert.equal(await eventForm.locator('[name=cashId]').inputValue(),'advance');assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'1220.00');assert.equal(await eventForm.locator('[name=date]').inputValue(),'2026-10-01');assert.equal(await eventForm.locator('[name=vatRate]').inputValue(),'22');assert.equal(await eventForm.locator('[name=document]').inputValue(),'');
  await eventForm.locator('[name=cashId]').selectOption('advance-other');assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'105.00');assert.equal(await eventForm.locator('[name=date]').inputValue(),'2026-10-05');assert.equal(await eventForm.locator('[name=vatRate]').inputValue(),'5');assert.equal(await eventForm.locator('[name=vatRate]').evaluate(el=>el.closest('.smart-combobox').querySelector('.smart-combobox-input').value),'5%');
  await eventForm.locator('[name=cashId]').selectOption('advance');assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'1220.00');assert.equal(await eventForm.locator('[name=date]').inputValue(),'2026-10-01');
  await eventForm.locator('[name=document]').fill('Авансовый СФ 1');await eventForm.locator('button[type=submit]').click();await eventForm.waitFor({state:'hidden'});await dialog.locator('[data-close]').click();await closeCard(page,'#genericClose');
  await page.evaluate(()=>openRecord('realizations','sale'));await form.locator('[data-tax-source=advances]').click();const advanceId=await page.evaluate(()=>db.vatAdvanceEvents[0]._id);await eventForm.locator('[name=advanceId]').selectOption(advanceId);
  assert.equal(await eventForm.locator('[name=realizationId]').inputValue(),'sale');assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'610.00');assert.equal(await eventForm.locator('[name=date]').inputValue(),'2026-10-04');
  await eventForm.locator('[name=taxAmount]').fill('305');await eventForm.locator('[name=advanceId]').selectOption('');await eventForm.locator('[name=advanceId]').selectOption(advanceId);assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'305','manual partial overrides survive reselection');
  await eventForm.locator('[data-use-source]').click();assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'610.00');await eventForm.locator('[name=document]').fill('Зачёт по акту 12');await eventForm.locator('button[type=submit]').click();await eventForm.waitFor({state:'hidden'});await dialog.locator('[data-close]').click();await closeCard(page,'#genericClose');
  await page.evaluate(()=>openRecord('cash','tax'));await form.locator('[data-tax-source=obligations]').click();
  assert.equal(await eventForm.locator('[name=taxAmount]').inputValue(),'100.00');assert.equal(await eventForm.locator('[name=confirmed]').inputValue(),'');assert.equal(await eventForm.locator('[name=period]').inputValue(),'');assert.equal(await eventForm.locator('[name=tax]').inputValue(),'');
  await eventForm.locator('[name=document]').fill('Подтверждённая уплата НДС');await eventForm.locator('[name=tax]').selectOption('vat');await eventForm.locator('[name=period]').fill('2026-Q4');await eventForm.locator('[name=confirmed]').selectOption('true');await eventForm.locator('button[type=submit]').click();await eventForm.waitFor({state:'hidden'});
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',`tax-guided-${engine.name()}-${width}.png`)});assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2),true);
  await dialog.locator('[data-close]').click();await closeCard(page,'#genericClose');await page.reload();await page.locator('#dashboardTaxes').waitFor();assert.equal(await page.evaluate(()=>db.vatAdvanceEvents.length),2);assert.equal(await page.evaluate(()=>db.taxObligationEvents.length),1);assert.equal(await page.evaluate(()=>ArbatTaxRegisters.advances(db).issues.length),0);assert.equal(await page.evaluate(()=>ArbatTaxRegisters.obligations(db).issues.length),0);assert.deepEqual(errors,[]);await context.close();
 } }finally{await browser.close()}}}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
