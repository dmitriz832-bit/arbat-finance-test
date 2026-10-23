/* Offline application integration only. All non-local requests are denied. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
test('document editing and searchable lists fit desktop, tablet and phone in Chromium and WebKit',async()=>{
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true});
  try{for(const width of [1440,834,430,390,375]){
   const context=await browser.newContext({viewport:{width,height:932},reducedMotion:'reduce'}),page=await context.newPage();
   const origin='http://127.0.0.1:'+server.address().port;
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* offline fixture */'});return route.continue()});
   await context.addInitScript(data=>localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data)),fixture());
   await page.goto(origin+'/app/',{waitUntil:'load'});
   await page.evaluate(()=>{window.reviewResult=null;window.reviewBankCounterparties([{type:'in',cpName:'Тестовый контрагент с длинным названием',cpInn:'1234567890'}],{counterparties:[]}).then(value=>window.reviewResult=value)});
   const modal=page.locator('.bank-review-overlay'),name=modal.getByRole('textbox',{name:'Наименование контрагента',exact:true});
   await name.waitFor();
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});
   await page.screenshot({path:path.join(root,'test-results',`counterparty-initial-${engine.name()}-${width}.png`)});
   assert.ok((await name.boundingBox()).width>=150,engine.name()+' '+width+': name is readable');
   const overflow=await modal.evaluate(el=>{const shell=el.querySelector('.modal');return {client:shell.clientWidth,scroll:shell.scrollWidth,offenders:[...shell.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>shell.getBoundingClientRect().right).map(n=>n.tagName+'.'+n.className)}});
   assert.ok(overflow.scroll<=overflow.client+2,engine.name()+' '+width+': dialog overflow '+JSON.stringify(overflow));
   await name.fill('Исправленное название');assert.equal(await name.inputValue(),'Исправленное название');
   const combo=modal.getByRole('combobox',{name:'Тип контрагента',exact:true});
   await combo.click();await combo.pressSequentially('Физ');
   assert.equal(await combo.inputValue(),'Физ','typing replaces previous selection');
   const options=page.locator('.smart-combobox-list[data-open="1"]');
   assert.equal(await options.getByRole('option').count(),1);
   const box=await options.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=933,'options fit viewport');
   await options.getByRole('option',{name:'Физлицо',exact:true}).click();
   assert.equal(await combo.inputValue(),'Физлицо');assert.equal(await modal.locator('select').inputValue(),'person');
   await combo.click();await combo.press('ArrowDown');assert.equal(await page.locator(':focus').getAttribute('role'),'option');
   await page.keyboard.press('Escape');assert.equal(await options.count(),0);assert.equal(await modal.count(),1,'escape closes list before dialog');
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});
   await page.screenshot({path:path.join(root,'test-results',`counterparty-${engine.name()}-${width}.png`)});
   await modal.getByRole('button',{name:'Отмена',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.reviewResult),false);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'cashForm'}})));
   await page.locator('.ui-sheet-overlay:not([hidden])').waitFor();
   await page.waitForFunction(()=>document.activeElement?.classList.contains('ui-sheet'));
   assert.equal(await page.locator(':focus').evaluate(el=>el.classList.contains('ui-sheet')),true,'opening does not focus input and summon keyboard');
   if(width<=700){const sheet=await page.locator('.ui-sheet').boundingBox();assert.ok(sheet.width>=width-2);assert.ok(sheet.height>=930);assert.equal(await page.locator('#cashForm').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1)}
   await context.close();
  }}finally{await browser.close()}
 }}finally{await new Promise(resolve=>server.close(resolve))}
});
function fixture(){
 const date=new Date().toISOString().slice(0,10),org='АИР-КЛИМАТ',projectKey=org+'::1C#AUDIT-20261017-browser',base={date,org};
 const state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','dealPlans','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements'].map(k=>[k,[]]));
 Object.assign(state,{
  deals:[{...base,_id:'AUDIT-20261017-browser',name:'AUDIT browser project',order1c:'AUDIT-20261017-browser',dir:'Кондиционирование',contractTotal:100000,cost:50000,vatRate:0}],
  realizations:[{...base,_id:'AUDIT-sale',projectKey,amount:60000,document:'AUDIT-sale',vatRate:0}],
  expenses:[{...base,_id:'AUDIT-expense',projectKey,amount:10000,vatRate:0}],
  workActs:[{...base,id:'AUDIT-act',projectKey,qty:1,rate:2000,status:'approved',memberIds:['AUDIT-person'],priceName:'AUDIT work'}],
  costs:[{...base,_id:'AUDIT-direction',dir:'Кондиционирование',amount:3000,vatRate:0},{...base,_id:'AUDIT-common',amount:4000,vatRate:0}],
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
  for(const width of [1440,1024,834,430,390]){
   const context=await browser.newContext({viewport:{width,height:1000}}),errors=[];
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready"); /* isolated authenticated shell */'});if(['/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* isolated offline test: no remote state writes */'});return route.continue()});
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

   const generalVat=await page.evaluate(()=>{
    const form=document.getElementById('costForm');
    form.elements.amount.value='1220';form.elements.vatRate.value='22';
    form.elements.vatDeductible.value='true';
    form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}));
    return {gross:form.elements.amountGross.value,vat:form.elements.vatAmount.value,net:form.elements.amountNet.value,deductible:form.elements.vatDeductible.value};
   });
   assert.deepEqual(generalVat,{gross:'1220.00',vat:'220.00',net:'1000.00',deductible:'true'});
   const generalSaved=await page.evaluate(()=>{
    const form=document.getElementById('costForm');
    form.elements.date.value=new Date().toISOString().slice(0,10);
    const first=form.elements.name.options[1];
    if(!first)return {error:'no P&L articles in fixture'};
    form.elements.name.value=first.value;
    form.elements.org.value='АИР-КЛИМАТ';
    form.elements.amount.value='1220';
    form.elements.vatRate.value='22';
    form.elements.vatDeductible.value='true';
    form.elements.vatRate.dispatchEvent(new Event('change',{bubbles:true}));
    const before=db.costs.length;form.requestSubmit();
    const row=db.costs.find(x=>String(x.amountGross)==='1220.00'&&String(x.vatRate)==='22');
    if(!row)return {error:'not saved',count:db.costs.length-before};
    const pnlCost=window.ArbatFinanceCore.documentPnlAmount(row,true);
    const result={count:db.costs.length-before,gross:row.amountGross,tax:row.vatAmount,net:row.amountNet,deductible:row.vatDeductible,pnl:window.ArbatFinanceCore.rubles(pnlCost)};
    db.costs=db.costs.filter(x=>x._id!==row._id);
    return result;
   });
   assert.deepEqual(generalSaved,{count:1,gross:'1220.00',tax:'220.00',net:'1000.00',deductible:'true',pnl:'1000.00'});
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
   await page.locator('#genericClose').click();
   const result=await page.evaluate(()=>{
    document.getElementById('reportYear').value=String(new Date().getFullYear());document.getElementById('reportType').value='pnl';
    const month=new Date().getMonth()+1,before=JSON.stringify(db.labor),report=reportData(),dash=window.arbatDashboardSnapshot(),deal=dealMargin(db.deals[0]);
    reportData();reportData();
    return {report:report.rows.find(x=>x[0]==='ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ')[month],dashboard:dash.totals.operating,card:deal.actualProfit,project:dash.projects[0].result,cost:projectCost(window.arbatDealKey(db.deals[0])),laborUnchanged:before===JSON.stringify(db.labor),financialCoreLoaded:typeof window.ArbatFinanceCore?.preliminaryPeriod==='function'};
   });
   await page.waitForTimeout(50);
   const responsive=await page.evaluate(()=>{
    const root=document.documentElement,mobile=document.querySelector('.ui-mobile-tabs'),navToggle=document.getElementById('ui-nav-toggle');
    const visible=element=>Boolean(element&&element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
    const rect=element=>element?.getBoundingClientRect();
    const labelled=[...document.querySelectorAll('#dealsTable tbody td')].filter(cell=>cell.dataset.columnLabel?.trim()).length;
    const fontSizes=[...document.querySelectorAll('input,select,textarea')].filter(visible).map(element=>parseFloat(getComputedStyle(element).fontSize));
    return {
     overflow:root.scrollWidth-root.clientWidth,
     mobileVisible:visible(mobile),mobileHeight:rect(mobile)?.height||0,
     mobileButtons:[...(mobile?.querySelectorAll('button')||[])].map(button=>({width:rect(button).width,height:rect(button).height})),
     navToggleVisible:visible(navToggle),navToggleSize:rect(navToggle)?.height||0,
     labelled,minFont:fontSizes.length?Math.min(...fontSizes):0,
     dealTableDisplay:getComputedStyle(document.querySelector('#dealsTable table')).display,
     dealRowDisplay:getComputedStyle(document.querySelector('#dealsTable tbody tr')).display,
     bodyPaddingBottom:parseFloat(getComputedStyle(document.querySelector('.content .wrap')).paddingBottom)
    };
   });
   assert.ok(responsive.overflow<=1,'page must not horizontally overflow at '+width+'px: '+responsive.overflow+'px');
   assert.ok(responsive.labelled>0,'responsive table cells must retain column labels at '+width+'px');
   if(width<=650){
    assert.equal(responsive.mobileVisible,true,'iPhone tab bar is visible at '+width+'px');
    assert.ok(responsive.mobileHeight>=58,'iPhone tab bar reserves a usable safe-area height');
    assert.ok(responsive.mobileButtons.every(button=>button.height>=44&&button.width>=44),'every iPhone tab is at least 44x44 CSS px');
    assert.ok(responsive.minFont>=16,'iPhone form controls use 16px text to prevent focus zoom');
    assert.ok(responsive.bodyPaddingBottom>=92,'content is not hidden behind the iPhone tab bar');
    assert.equal(responsive.dealTableDisplay,'block','operational table becomes a readable card list on iPhone');
    assert.ok(['block','grid'].includes(responsive.dealRowDisplay),'each operational row becomes a separate iPhone card');
    assert.ok(await page.locator('#dealsTable tbody tr').evaluateAll(rows=>rows.every(r=>r.scrollWidth<=r.clientWidth+1)),'all mobile record content remains inside its card');
    await page.locator('[data-mobile-route="deals"]').click();
    await page.waitForFunction(()=>document.getElementById('title').textContent.includes('Сделки'));
    assert.equal(await page.locator('[data-mobile-route="deals"]').getAttribute('aria-current'),'page');
    await page.locator('[data-mobile-route="overview"]').click();
   }else{
    assert.equal(responsive.mobileVisible,false,'mobile tab bar remains hidden above phone widths');
    if(width<=1100){
     assert.equal(responsive.navToggleVisible,true,'iPad menu control is visible at '+width+'px');
     assert.ok(responsive.navToggleSize>=44,'iPad menu control is at least 44px high');
     await page.locator('#ui-nav-toggle').click();
     assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'),'false');
     await page.keyboard.press('Escape');
     assert.equal(await page.locator('#sidebar').getAttribute('aria-hidden'),'true');
    }
   }
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results','finance-'+width+'.png'),fullPage:true});
   assert.equal(errors.length,0,'JavaScript errors at '+width+': '+errors.join('; '));
   assert.equal(Number(result.report.replace(/[^\d,.-]/g,'').replace(',','.')),32800);
   assert.equal(result.dashboard,32800);assert.equal(result.card,52800);assert.equal(result.project,52800);assert.equal(result.cost,12000);assert.equal(result.laborUnchanged,true);assert.equal(result.financialCoreLoaded,true);
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


test('offline browser backup includes both stores and passes independent checksum and restore verification',async()=>{
 const {verifyBackup}=require('../scripts/verify-backup.cjs');
 const warehouse={items:[{id:'i1',name:'Монтажный крепёж'}],places:[{id:'p1',name:'Основной склад'}],moves:[{id:'m1',kind:'receipt',itemId:'i1',to:'p1',qty:5,price:20,date:'2026-10-18'}],projectIssues:[]};
 const finance=fixture(),before=JSON.stringify({finance,warehouse});
 const server=http.createServer(async(req,res)=>{
  try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});
  const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({acceptDownloads:true});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(['/app/auth.js','/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* isolated offline test */'});return route.continue()});
  await context.addInitScript(({finance,warehouse})=>{localStorage.setItem('arbat-finance-demo-live',JSON.stringify(finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(warehouse))},{finance,warehouse});
  const page=await context.newPage();await page.goto(origin+'/app/',{waitUntil:'load'});
  const normalized=await page.evaluate(()=>({finance:JSON.parse(JSON.stringify(db)),warehouse:JSON.parse(localStorage.getItem('arbat-warehouse-v1'))}));
  const event=page.waitForEvent('download');
  await page.evaluate(()=>document.getElementById('exportVerifiedBackup').click());
  const download=await event;
  assert.match(download.suggestedFilename(),/^arbat-finance-complete-/);
  const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  const restored=verifyBackup(backup);
  assert.deepEqual(restored.finance,normalized.finance);
  assert.deepEqual(restored.warehouse,normalized.warehouse);
  assert.equal(restored.findings.ok,true);
  backup.stores.warehouse.items[0].name='CHANGED';
  assert.throws(()=>verifyBackup(backup),/checksum mismatch/);
  assert.equal(JSON.stringify({finance,warehouse}),before);
  await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
