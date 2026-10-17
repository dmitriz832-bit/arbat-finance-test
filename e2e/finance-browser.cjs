/* Offline application integration only. All non-local requests are denied. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function fixture(){
 const date=new Date().toISOString().slice(0,10),org='АИР-КЛИМАТ',projectKey=org+'::1C#AUDIT-20261017-browser',base={date,org};
 const state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','dealPlans','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements'].map(k=>[k,[]]));
 Object.assign(state,{
  deals:[{...base,_id:'AUDIT-20261017-browser',name:'AUDIT browser project',order1c:'AUDIT-20261017-browser',dir:'Кондиционирование',contractTotal:100000,cost:50000}],
  realizations:[{...base,_id:'AUDIT-sale',projectKey,amount:60000,document:'AUDIT-sale'}],
  expenses:[{...base,_id:'AUDIT-expense',projectKey,amount:10000}],
  workActs:[{...base,id:'AUDIT-act',projectKey,qty:1,rate:2000,status:'approved',memberIds:['AUDIT-person'],priceName:'AUDIT work'}],
  costs:[{...base,_id:'AUDIT-direction',dir:'Кондиционирование',amount:3000},{...base,_id:'AUDIT-common',amount:4000}],
  labor:[{...base,_id:'AUDIT-salary',personId:'AUDIT-person',expenseType:'administrative',amount:10000,ndfl:1300,employerContributions:3000}],
  people:[{id:'AUDIT-person',name:'AUDIT employee',expenseType:'administrative',annualLeaveDays:28}],
  wallets:[{id:'AUDIT-wallet',org,name:'AUDIT cash',verified:true,openingBalance:100}],
 });return state;
}
test('offline full application reconciles report, dashboard and project at desktop, tablet and phone widths',async()=>{
 const server=http.createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,1024,390]){
   const context=await browser.newContext({viewport:{width,height:1000}}),errors=[];
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(['/app/auth.js','/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* isolated offline test: no auth or remote state writes */'});return route.continue()});
   await context.addInitScript(data=>{localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data));localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[],folders:[],places:[],moves:[],plans:[],projectIssues:[],imports:[]}))},fixture());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack||e.message));await page.goto(origin+'/app/',{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.arbatDashboardSnapshot==='function');
   const vatForm=await page.evaluate(()=>{
    const form=document.getElementById('dealForm'),amount=form.elements.contractTotal,rate=form.elements.vatRate;
    amount.value='122000';rate.value='22';rate.dispatchEvent(new Event('change',{bubbles:true}));
    return {ratePresent:!!rate,net:form.elements.amountNet.value,tax:form.elements.vatAmount.value,source:form.elements.vatRateSource.value,salesRatePresent:!!document.getElementById('realizationForm').elements.vatRate};
   });
   assert.deepEqual(vatForm,{ratePresent:true,net:'100000.00',tax:'22000.00',source:'document-explicit',salesRatePresent:true});
   const expenseVat=await page.evaluate(()=>{
    const form=document.getElementById('expenseForm');
    form.elements.amount.value='24400';form.elements.vatRate.value='22';form.elements.vatDeductible.value='true';
    form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}));
    return {rate:form.elements.vatRate.value,deductible:form.elements.vatDeductible.value,gross:form.elements.amountGross.value,vat:form.elements.vatAmount.value,net:form.elements.amountNet.value};
   });
   assert.deepEqual(expenseVat,{rate:'22',deductible:'true',gross:'24400.00',vat:'4400.00',net:'20000.00'});

   const savedVat=await page.evaluate(()=>{
    const form=document.getElementById('realizationForm');
    form.elements.date.value=new Date().toISOString().slice(0,10);
    form.elements.projectKey.value=window.arbatDealKey(db.deals[0]);
    form.elements.document.value='AUDIT-VAT-REAL';
    form.elements.amount.value='12200';
    form.elements.vatRate.value='22';
    form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}));
    const before=db.realizations.length;form.requestSubmit();
    const item=db.realizations.find(x=>x.document==='AUDIT-VAT-REAL');
    if(!item)return {created:false,count:db.realizations.length-before};
    return {created:true,rate:item.vatRate,gross:item.amountGross,tax:item.vatAmount,net:item.amountNet,source:item.vatRateSource,count:db.realizations.length-before};
   });
   assert.deepEqual(savedVat,{created:true,rate:'22',gross:'12200.00',tax:'2200.00',net:'10000.00',source:'document-explicit',count:1});
   const editedVat=await page.evaluate(()=>{
    const item=db.realizations.find(x=>x.document==='AUDIT-VAT-REAL');
    openRecord('realizations',item._id);
    const editor=document.getElementById('genericEditForm');
    const loaded={rate:editor.elements.vatRate.value,gross:editor.elements.amountGross.value,tax:editor.elements.vatAmount.value};
    editor.elements.amount.value='10600';
    editor.elements.vatRate.value='5';
    editor.requestSubmit();
    const updated=db.realizations.find(x=>x._id===item._id);
    openRecord('realizations',updated._id);
    const reopened=document.getElementById('genericEditForm');
    return {loaded,updated:{rate:updated.vatRate,gross:updated.amountGross,tax:updated.vatAmount,net:updated.amountNet},reopened:{rate:reopened.elements.vatRate.value,gross:reopened.elements.amountGross.value,tax:reopened.elements.vatAmount.value}};
   });
   assert.deepEqual(editedVat,{loaded:{rate:'22',gross:'12200.00',tax:'2200.00'},updated:{rate:'5',gross:'10600.00',tax:'504.76',net:'10095.24'},reopened:{rate:'5',gross:'10600.00',tax:'504.76'}});
   const expenseCycle=await page.evaluate(()=>{
    const form=document.getElementById('expenseForm'),key=window.arbatDealKey(db.deals[0]);
    form.elements.date.value=new Date().toISOString().slice(0,10);
    form.elements.projectKey.value=key;
    form.elements.category.value='Оборудование';
    form.elements.note.value='AUDIT-VAT-EXPENSE';
    form.elements.amount.value='24400';
    form.elements.vatRate.value='22';
    form.elements.vatDeductible.value='true';
    form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}));
    const before=db.expenses.length;
    form.requestSubmit();
    const expense=db.expenses.find(x=>x.projectKey===key&&String(x.amountGross)==='24400.00');
    if(!expense)return {created:false};
    const created={gross:expense.amountGross,rate:expense.vatRate,deductible:expense.vatDeductible,net:expense.amountNet};
    openRecord('expenses',expense._id);
    const editor=document.getElementById('genericEditForm');
    editor.elements.amount.value='12600';
    editor.elements.vatRate.value='5';
    editor.elements.vatDeductible.value='false';
    editor.requestSubmit();
    const updated=db.expenses.find(x=>x._id===expense._id);
    openRecord('expenses',expense._id);
    const reopened=document.getElementById('genericEditForm');
    const result={created:true,count:db.expenses.length-before,createdFields:created,updated:{gross:updated.amountGross,rate:updated.vatRate,deductible:updated.vatDeductible,tax:updated.vatAmount,net:updated.amountNet},reopenedRate:reopened.elements.vatRate.value};
    db.expenses=db.expenses.filter(x=>x._id!==expense._id);
    return result;
   });
   assert.deepEqual(expenseCycle,{created:true,count:1,createdFields:{gross:'24400.00',rate:'22',deductible:'true',net:'20000.00'},updated:{gross:'12600.00',rate:'5',deductible:'false',tax:'600.00',net:'12000.00'},reopenedRate:'5'});
   await page.evaluate(()=>{db.realizations=db.realizations.filter(x=>x.document!=='AUDIT-VAT-REAL')});
   const result=await page.evaluate(()=>{
    document.getElementById('reportYear').value=String(new Date().getFullYear());document.getElementById('reportType').value='pnl';
    const month=new Date().getMonth()+1,before=JSON.stringify(db.labor),report=reportData(),dash=window.arbatDashboardSnapshot(),deal=dealMargin(db.deals[0]);
    reportData();reportData();
    return {report:report.rows.find(x=>x[0]==='ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ')[month],dashboard:dash.totals.operating,card:deal.actualProfit,project:dash.projects[0].result,cost:projectCost(window.arbatDealKey(db.deals[0])),laborUnchanged:before===JSON.stringify(db.labor),financialCoreLoaded:typeof window.ArbatFinanceCore?.preliminaryPeriod==='function'};
   });
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','finance-'+width+'.png'),fullPage:true});
   assert.equal(errors.length,0,'JavaScript errors at '+width+': '+errors.join('; '));
   assert.equal(Number(result.report.replace(/[^\d,.-]/g,'').replace(',','.')),28000);
   assert.equal(result.dashboard,28000);assert.equal(result.card,48000);assert.equal(result.project,48000);assert.equal(result.cost,12000);assert.equal(result.laborUnchanged,true);assert.equal(result.financialCoreLoaded,true);
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});

test('unauthenticated browser presents login gate without requesting cloud finance state',async()=>{
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let financialRequests=0;
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin)return route.continue();if(/finance_state|warehouse_state/.test(url.pathname))financialRequests++;return route.abort()});
  const page=await context.newPage();await page.goto(origin+'/app/',{waitUntil:'load'});
  await page.waitForSelector('#ab-email:visible');
  assert.equal(await page.locator('#ab-password:visible').count(),1);
  assert.equal(await page.locator('#ab-form button[type="submit"]').innerText(),'Войти');
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('ab-ready')),false);
  assert.equal(financialRequests,0,'financial cloud read before authentication');
  await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});

test('employee profile is isolated from finance database in mocked authenticated browser session',async()=>{
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:390,height:844}});const requests=[];
  await context.addInitScript(()=>localStorage.setItem('arbat-session-v1',JSON.stringify({access_token:'AUDIT-FAKE-NOT-A-REAL-TOKEN',refresh_token:'AUDIT-FAKE',expires_at:4102444800})));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin)return route.continue();
   requests.push(url.pathname);
   if(url.pathname.endsWith('/rpc/claim_staff_access'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({role:'employee',employee_id:'AUDIT-person',email:'audit@example.invalid',full_name:'Audit Employee'})});
   if(url.pathname.endsWith('/rpc/my_payroll'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({earned:100,withheld:13,paid:20,balance:67,rows:[]})});
   return route.abort();
  });
  const page=await context.newPage();await page.goto(origin+'/app/',{waitUntil:'load'});
  await page.waitForSelector('#ab-profile-overlay.open');
  await page.getByText('Мои начисления и выплаты').waitFor();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('ab-profile-only')),true);
  assert.equal(await page.locator('#ab-profile-tabs button').count(),1,'employee cannot see admin tabs');
  assert.equal(await page.getByText('67,00', {exact:false}).count()>0,true);
  assert.equal(requests.some(p=>/finance_state|warehouse_state|admin_staff_list|admin_set_staff/.test(p)),false,'employee must not query shared state or admin RPC');
  await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
