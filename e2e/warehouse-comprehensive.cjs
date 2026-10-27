/* Actual application, disposable local fixtures. Auth, sync and every external request are blocked. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
const W='arbat-warehouse-v1',F='arbat-finance-demo-live',org='АИР-КЛИМАТ',receiptKey='receipt:'+JSON.stringify([org,'UPD-WH']);
function fixture(){
 const date='2026-10-01',finance=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles','leaveEvents'].map(k=>[k,[]]));
 Object.assign(finance,{dealPlans:{},deals:[{_id:'project',name:'Складской проект',org,order1c:'WH-E2E',contractTotal:1000,cost:100,vatRate:0,dir:'Кондиционирование'}],cash:[{_id:'payment',org,date,type:'out',walletId:'wallet',customerId:'supplier',amount:50,supplierAllocations:[{documentKey:receiptKey,amount:'50.00'}]}],wallets:[{id:'wallet',org,name:'Счёт',verified:true,openingBalance:1000,openingBalanceDate:'2026-01-01'}],counterparties:[{id:'supplier',name:'Поставщик',isSupplier:true}]});
 const base={date,org,kind:'receipt',from:'',supplierId:'supplier',paymentDueDate:'2026-11-01'};
 const warehouse={items:[{id:'bolt',name:'Кронштейн',unit:'шт'},{id:'pipe',name:'Труба',unit:'м'}],places:[{id:'w',org,name:'Основной склад',type:'warehouse'},{id:'w2',org,name:'Дополнительный склад',type:'warehouse'},{id:'crew',org,name:'Тестовая бригада',type:'crew',linkedCrewId:'test-crew'}],moves:[{...base,id:'r-bolt',n:1,documentId:'UPD-WH',itemId:'bolt',to:'w',qty:2,price:10,note:'УПД с двумя товарами'},{...base,id:'r-pipe',n:2,documentId:'UPD-WH',itemId:'pipe',to:'w',qty:3,price:20,note:'УПД с двумя товарами'},{...base,id:'r-spare',n:3,documentId:'UPD-SPARE',itemId:'bolt',to:'w2',qty:4,price:10,note:'Запас второго склада'}],plans:[{id:'plan',dealId:'project',date,lines:[{itemId:'bolt',qty:5}]}],projectIssues:[],imports:[],folders:[]};
 return {finance,warehouse};
}
async function matrix(name,scenario){
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of (process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit])){
  const browser=await engine.launch({headless:true});
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* offline fixture: no remote access */'});return route.continue()});
   await context.addInitScript(({finance,warehouse})=>{if(localStorage.getItem('warehouse-e2e-seeded'))return;localStorage.setItem('arbat-finance-demo-live',JSON.stringify(finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(warehouse));localStorage.setItem('warehouse-e2e-seeded','1')},fixture());
   try{await page.goto(origin+'/app/',{waitUntil:'load'});await page.waitForFunction(()=>typeof window.arbatOpenReceipt==='function'&&typeof window.arbatNavigate==='function');await scenario(page);assert.deepEqual(errors,[],`${name}: ${engine.name()} ${width} page errors`);await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',`warehouse-${name}-${engine.name()}-${width}.png`),fullPage:true});}
   catch(error){await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',`warehouse-${name}-failed-${engine.name()}-${width}.png`),fullPage:true}).catch(()=>{});throw error}
   finally{await context.close()}
  }}finally{await browser.close()}
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
}
// Searchable selects retain native controls. Select the real option and dispatch the production change event.
const choose=(page,selector,value)=>page.locator(selector).selectOption(value,{force:true});
const navigate=(page,route)=>page.evaluate(route=>window.arbatNavigate(route),route);
async function openReceiptForm(page){await navigate(page,'materials:receipt');await page.locator('#arbatWarehouseIntro').getByRole('button',{name:/Оформить приход/i}).click();await page.locator('#whDialog.open').waitFor()}
async function fillReceipt(page,note,qty,price){await choose(page,'#whDlgForm [name=to]','w');await page.locator('#whDlgForm [name=note]').fill(note);await choose(page,'#whDlgForm [data-line-item]','bolt');await page.locator('#whDlgForm [data-line-qty]').fill(String(qty));await page.locator('#whDlgForm [data-line-price]').fill(String(price));await page.locator('#whDlgForm button[type=submit]').click();await page.locator('#payablesDialog[open]').waitFor()}
const readStores=page=>page.evaluate(({W,F})=>({warehouse:JSON.parse(localStorage.getItem(W)),finance:JSON.parse(localStorage.getItem(F))}),{W,F});

test('warehouse receipt form switches operation cleanly and multiitem edit preserves its existing payment',{timeout:180000},async()=>{
 await matrix('receipt-edit',async page=>{
  await navigate(page,'materials:receipt');
  await page.locator('[data-wh-move="r-bolt"]').getByText('Кронштейн',{exact:true}).click();
  const dialog=page.locator('#payablesDialog');await dialog.locator('[data-receipt-form]').waitFor();assert.equal(await dialog.locator('[data-receipt-line]').count(),2);
  await dialog.locator('[name=receiptQty]').nth(0).fill('3');await dialog.locator('[name=receiptQty]').nth(1).fill('4');await dialog.locator('[data-receipt-form] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#payablesDialog .pay-error')?.textContent.includes('Накладная сохранена'));
  const corrected=await page.evaluate(key=>{const f=JSON.parse(localStorage.getItem('arbat-finance-demo-live')),w=JSON.parse(localStorage.getItem('arbat-warehouse-v1')),d=window.ArbatPayables.snapshot(f,w).documents.find(d=>d.key===key);return {key:d.key,total:String(d.total),paid:String(d.paid),remaining:String(d.remaining),payment:f.cash[0],quantities:d.sources.map(x=>x.qty)}},receiptKey);
  assert.deepEqual({key:corrected.key,total:corrected.total,paid:corrected.paid,remaining:corrected.remaining,quantities:corrected.quantities},{key:receiptKey,total:'11000',paid:'5000',remaining:'6000',quantities:[3,4]});
  assert.equal(corrected.payment._id,'payment');assert.equal(corrected.payment.amount,50);assert.deepEqual(corrected.payment.supplierAllocations,[{documentKey:receiptKey,amount:'50.00'}]);
  await dialog.locator('[data-receipt-pay]').click();assert.match(await dialog.innerText(),/60,00/);await dialog.locator('[data-pay-close]').click();
  await openReceiptForm(page);
  await choose(page,'#whDlgForm [name=kind]','transfer');await choose(page,'#whDlgForm [name=from]','w');await choose(page,'#whDlgForm [name=to]','crew');
  await choose(page,'#whDlgForm [name=kind]','consume');assert.equal(await page.locator('#whDlgForm [name=to]').inputValue(),'');assert.equal(await page.locator('#whDlgForm [name=from]').inputValue(),'w');await choose(page,'#whDlgForm [name=dealId]','project');
  await choose(page,'#whDlgForm [name=kind]','receipt');assert.equal(await page.locator('#whDlgForm [name=from]').inputValue(),'');assert.equal(await page.locator('#whDlgForm [name=dealId]').inputValue(),'');
  await fillReceipt(page,'Приход после смены операции',1,15);
  const saved=await readStores(page),created=saved.warehouse.moves.find(m=>m.note==='Приход после смены операции');assert.ok(created,'receipt saved through actual form');assert.equal(created.from,'');assert.equal(created.dealId,'');assert.equal(created.qty,1);assert.equal(created.price,15);assert.equal(saved.finance.cash.length,1);await dialog.locator('[data-pay-close]').click();
  await page.reload();await page.waitForFunction(()=>typeof window.ArbatPayables==='object');const reloaded=await readStores(page);assert.equal(reloaded.warehouse.moves.filter(m=>m.note==='Приход после смены операции').length,1);assert.deepEqual(reloaded.finance.cash[0].supplierAllocations,[{documentKey:receiptKey,amount:'50.00'}]);
 });
});

test('warehouse issue consumes and returns FIFO stock before a new receipt without losing the closed issue',{timeout:180000},async()=>{
 await matrix('issue-close-receipt',async page=>{
  await navigate(page,'materials:movement');await choose(page,'#psDeal','project');await choose(page,'#psCrew','crew');await page.locator('#psIssue').click();
  const issueForm=page.locator('#psForm');await issueForm.waitFor();await choose(page,'#psForm [name=warehouse]','w');await issueForm.locator('[name=own0]').fill('0');await issueForm.locator('[name=q0]').fill('5');await issueForm.locator('button[type=submit]').click();await issueForm.waitFor({state:'hidden'});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arbat-warehouse-v1')).projectIssues.length===1);await page.locator('#psClose').click();await page.locator('#psForm [name=used0]').fill('3');await page.locator('#psForm button[type=submit]').click();await page.locator('#psForm').waitFor({state:'hidden'});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arbat-warehouse-v1')).projectIssues[0]?.closed===true);
  const before=await readStores(page),batch=before.warehouse.projectIssues[0],batchMoveIds=before.warehouse.moves.filter(m=>m.projectIssueId===batch.id).map(m=>m.id).sort();assert.equal(batch.lines[0].issued,5);assert.equal(batch.lines[0].used,3);assert.equal(batch.lines[0].returned,2);assert.equal(batchMoveIds.length,4,'staging transfer, crew issue, consumption and return');const expense=before.finance.expenses.find(x=>x.warehouseMoveId);assert.equal(expense.amount,30);assert.equal(expense.valuationStatus,'verified');
  await openReceiptForm(page);await fillReceipt(page,'Приход после закрытия выдачи',2,15);await page.locator('#payablesDialog [data-pay-close]').click();
  const after=await readStores(page);assert.equal(after.warehouse.projectIssues.length,1);assert.equal(after.warehouse.projectIssues[0].id,batch.id);assert.equal(after.warehouse.projectIssues[0].closed,true);assert.deepEqual(after.warehouse.moves.filter(m=>m.projectIssueId===batch.id).map(m=>m.id).sort(),batchMoveIds,'new receipt cannot overwrite committed project movements');assert.equal(after.warehouse.moves.filter(m=>m.note==='Приход после закрытия выдачи').length,1);assert.equal(after.finance.expenses.filter(x=>x.warehouseMoveId).length,1);assert.equal(after.finance.expenses.find(x=>x.warehouseMoveId)._id,expense._id);
  const control=await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('arbat-warehouse-v1')),f=JSON.parse(localStorage.getItem('arbat-finance-demo-live')),fifo=window.arbatFifo(w);return {warnings:fifo.warnings,crewQty:fifo.lots('crew','bolt').reduce((s,l)=>s+l.qty,0),warehouseQty:['w','w2'].reduce((s,p)=>s+fifo.lots(p,'bolt').reduce((n,l)=>n+l.qty,0),0),warehouseValue:['w','w2'].reduce((s,p)=>s+fifo.lots(p,'bolt').reduce((n,l)=>n+l.qty*l.cost,0),0),auditErrors:window.arbatAudit(w,f).errors}});
  assert.deepEqual(control,{warnings:[],crewQty:0,warehouseQty:5,warehouseValue:60,auditErrors:0});
  await page.reload();await page.waitForFunction(()=>typeof window.arbatOpenReceipt==='function');const reloaded=await readStores(page);assert.equal(reloaded.warehouse.projectIssues[0].id,batch.id);assert.equal(reloaded.warehouse.projectIssues[0].closed,true);assert.equal(reloaded.finance.expenses.filter(x=>x.warehouseMoveId).length,1);assert.equal(reloaded.finance.expenses.find(x=>x.warehouseMoveId).amount,30);
 });
});
