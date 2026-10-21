/* Real UI with isolated finance/warehouse fixtures; no remote data is read or written. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
test('approved navigation, periods, source documents and every section fit all six device widths',async()=>{
 const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const width of [375,390,430,768,1024,1440]){
  const context=await browser.newContext({viewport:{width,height:932},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname==='/app/auth.js')return r.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return r.fulfill({body:''});return r.continue()});
  await context.addInitScript(()=>{const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),org='АИР-КЛИМАТ',projectKey=org+'::1C#UX-1',state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles'].map(k=>[k,[]]));Object.assign(state,{dealPlans:{},deals:[{_id:'UX-project',name:'Проект проверки интерфейса',org,order1c:'UX-1',contractTotal:100000,cost:30000,vatRate:0}],realizations:[{_id:'UX-sale',date,org,projectKey,amount:60000,vatRate:0,document:'Акт UX-1'}],calendar:[{id:'UX-plan',name:'Оплата по договору UX-1',org,dueDate:date,type:'in',amount:25000,frequency:'once',active:'yes'}],wallets:[{id:'UX-wallet',name:'Основной счёт',org,openingBalance:100,verified:true}]});localStorage.setItem('arbat-finance-demo-live',JSON.stringify(state));localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[],moves:[],places:[],projectIssues:[],plans:[],folders:[]}));});
  await page.goto(origin+'/app/');
  assert.equal(await page.locator('#ownerPeriodMode').evaluate(el=>!!el.closest('.ux-period')&&el.closest('.ux-period').getBoundingClientRect().height>0),true,'period selector is visible in the approved panel');
  const ref=await page.locator('#ownerPeriodReference').inputValue();
  await page.locator('[data-ux-period-step="-1"]').click();
  assert.notEqual(await page.locator('#ownerPeriodReference').inputValue(),ref);
  await page.locator('[data-ux-period-current]').click();
  assert.equal(await page.locator('#ownerPeriodReference').inputValue(),ref);
  const tax=page.locator('#uxTaxReference');await tax.fill('2025-04-01');await tax.dispatchEvent('change');
  assert.equal(await page.locator('#ownerPeriodReference').inputValue(),ref,'tax quarter does not change P&L');
  assert.match(await page.locator('#dashboardTaxPeriod').innerText(),/2.*2025/);
  await page.locator('[data-ux-metric="revenue"]').click();await page.locator('#uxDetail:not([hidden])').waitFor();
  assert.match(await page.locator('#uxDetail').innerText(),/60\s?000/);
  await page.locator('#uxDetail [data-ux-source="realizations"]').click();await page.locator('#genericModal.open').waitFor();
  assert.equal(await page.locator('#genericEditForm [name=document]').inputValue(),'Акт UX-1');
  await page.locator('#genericEditForm [name=document]').fill('Несохранённая правка');
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');
  assert.equal(await page.locator('#genericModal.open').isVisible(),true,'cancel discard keeps edited document');
  await page.locator('#genericEditForm [name=document]').fill('Акт UX-1');
  await page.keyboard.press('Escape');await page.locator('#genericModal.open').waitFor({state:'hidden'});
  assert.equal(await page.locator('#uxDetail').isVisible(),true);await page.locator('#uxDetailBack').click();
  await page.locator('#dashboardProjects [data-ux-project]').click();await page.locator('#dealModal.open').waitFor();
  assert.equal(await page.locator('#editDealForm [name=name]').inputValue(),'Проект проверки интерфейса');
  await page.locator('#createRealizationFromDeal').click();await page.locator('.ui-sheet-overlay:not([hidden])').waitFor();
  assert.equal(await page.locator('#realizationForm [name=projectKey]').inputValue(),'АИР-КЛИМАТ::1C#UX-1');
  await page.locator('[data-sheet-cancel]').click();
  await page.locator('[data-ux-plan="income"]').click();assert.match(await page.locator('#uxDetail').innerText(),/Оплата по договору UX-1/);
  await page.locator('#uxDetail [data-ux-source="calendar"]').click();await page.locator('#calendarModal.open').waitFor();await page.keyboard.press('Escape');await page.locator('#uxDetailBack').click();
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',`rollout-home-${engine.name()}-${width}.png`),fullPage:true});
  for(const route of ['deals','realizations','expenses','cash','calendar','materials:catalog','labor','costs','work','reports','settings']){
   await page.evaluate(route=>window.arbatNavigate(route),route);
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=width+2,`${engine.name()} ${width} ${route}: page overflow ${overflow.scroll}`);
  }
  await page.evaluate(()=>window.arbatNavigate('reports'));
  const month=await page.evaluate(()=>new Date().getMonth()+1);
  await page.locator('#reportTable tbody tr').first().locator('[data-ux-report-cell="'+month+'"]').click();
  assert.equal(await page.locator('#uxDetail').isVisible(),true);assert.match(await page.locator('#uxDetail .ux-detail-summary').innerText(),/60\s?000/);
  await page.locator('#uxDetail [data-ux-source="realizations"]').click();
  await page.locator('#genericEditForm [name=amount]').fill('70000');
  await page.locator('#genericEditForm button[type=submit]').click();await page.locator('#genericModal.open').waitFor({state:'hidden'});
  assert.match(await page.locator('#uxDetail .ux-detail-summary').innerText(),/70\s?000/,'summary updates after editing report source');
  await page.locator('#uxDetailBack').click();
  assert.equal(await page.locator('#reports').evaluate(el=>el.classList.contains('active')),true,'return to original report');
  assert.deepEqual(errors,[],engine.name()+' '+width+': no runtime errors');await context.close();
 }}finally{await browser.close()}}}finally{await new Promise(r=>server.close(r))}
});
