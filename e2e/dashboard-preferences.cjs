/* Actual application and navigation, with local finance/warehouse fixtures only. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
test('dashboard period dialog and personal wallet order work in the actual application',async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const width of [390,768,1440,1870]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname==='/app/auth.js')return r.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return r.fulfill({body:''});return r.continue()});
  await context.addInitScript(()=>{
   const org='АИР-КЛИМАТ',date='2026-10-22',state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles'].map(k=>[k,[]]));
   Object.assign(state,{dealPlans:{},deals:[{_id:'layout-project',name:'Проект проверки границ интерфейса',org,order1c:'LAYOUT-1',contractTotal:100000,cost:30000,vatRate:0}],wallets:[{id:'layout-wallet',name:'Основной счёт',org,verified:true,openingBalance:10000},{id:'layout-wallet-2',name:'Касса',org,verified:true,openingBalance:5000}]});
   localStorage.setItem('arbat-finance-demo-live',JSON.stringify(state));localStorage.setItem('arbat-sidebar-collapsed','0');localStorage.setItem('arbat-sidebar-auto','0');
   localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[{id:'layout-item',name:'Материал для проверки длинного наименования в журнале движений',unit:'шт'}],places:[{id:'layout-store',name:'Основной склад',org}],moves:[{id:'layout-move',n:1,date,org,kind:'receipt',importId:'layout-import',itemId:'layout-item',to:'layout-store',qty:2,price:30,note:'Приходная накладная'}],imports:[{id:'layout-import',mode:'receipt',count:1,filename:'Приходная накладная.pdf',date,org}],projectIssues:[],plans:[],folders:[]}));
  });
  await page.goto(origin+'/app/');
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  // Disable only animation for deterministic geometry; retain all production sizing rules.
  await page.addStyleTag({content:'#layout{transition:none!important}'});
  await page.locator('#uxPeriodTrigger').click();
  assert.equal(await page.locator('.ux-preferences-dialog:has(#ownerPeriodMode)').evaluate(e=>e.open),true);
  await page.locator('#ownerPeriodMode').locator('..').getByRole('combobox').fill('Год');
  await page.locator('.ux-preferences-dialog [role=option]').filter({hasText:/^Год$/}).click();
  await page.locator('.ux-preferences-dialog:has(#ownerPeriodMode)').getByRole('button',{name:'Готово',exact:true}).click();
  assert.match(await page.locator('#uxPeriodTrigger').innerText(),/Год/);
  assert.equal(await page.locator('#ownerPeriodMode').isVisible(),false);
  assert.ok((await page.locator('.ux-period-bar').boundingBox()).height<160,'period control is compact');
  await page.locator('[data-wallet-order]').click();
  await page.locator('.wallet-order-list>div').first().getByRole('button',{name:/Ниже/}).click();
  await page.locator('[data-order-save]').click();
  assert.equal(await page.locator('#dashboardWallets [data-ux-id]').first().getAttribute('data-ux-id'),'layout-wallet-2');
  await page.reload();
  assert.equal(await page.locator('#dashboardWallets [data-ux-id]').first().getAttribute('data-ux-id'),'layout-wallet-2');
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const geometry=await page.evaluate(()=>{const panels=[...document.querySelectorAll('.dashboard-layout>.dashboard-panel')].filter(e=>e.getClientRects().length).map(e=>({name:e.className,r:e.getBoundingClientRect().toJSON()}));const overlap=[];for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){const a=panels[i].r,b=panels[j].r;if(a.left<b.right-2&&a.right>b.left+2&&a.top<b.bottom-2&&a.bottom>b.top+2)overlap.push([panels[i].name,panels[j].name])}return {overlap,underlines:[...document.querySelectorAll('#overview button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).textDecorationLine.includes('underline')).length}});
  assert.deepEqual(geometry.overlap,[],engine.name()+' '+width+': dashboard panels do not overlap');assert.equal(geometry.underlines,0);
  await page.screenshot({path:path.join(root,'test-results',`polish-${engine.name()}-${width}-overview.png`),fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close()}}}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
