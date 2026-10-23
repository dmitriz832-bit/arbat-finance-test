/* Real application CSS and actual sync.js; isolated claimed identity and local recovery snapshot. No remote API access. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
const owner='security-recovery-owner',key='arbat-unsynced-recovery-v1:'+owner;
function fixture(){
 const finance=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles','leaveEvents'].map(k=>[k,[]]));
 finance.dealPlans={};finance.expenses=[{_id:'unsaved-expense',org:'АИР-КЛИМАТ',date:'2026-10-23',amount:37,note:'Несохранённая версия для сверки'}];
 const warehouse={items:[],places:[],moves:[],projectIssues:[],folders:[],plans:[],imports:[]};
 const snapshot={format:'arbat-unsynced-recovery-v1',owner,identity:{user_id:owner,email:'recovery@example.test',full_name:'Тест восстановления'},createdAt:'2026-10-23T10:00:00.000Z',reason:'Конфликт документа',revisions:{finance_state:12,warehouse_state:4},stores:{finance,warehouse},rawStorage:{'arbat-finance-demo-live':JSON.stringify(finance),'arbat-warehouse-v1':JSON.stringify(warehouse)}};
 return {finance,warehouse,snapshot,key,owner};
}
test('recovery controls are visible with actual application CSS and survive reload without fetching cloud state',{timeout:120000},async()=>{
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true});
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:932},reducedMotion:'reduce',acceptDownloads:true}),page=await context.newPage(),errors=[],remote=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.stack||error.message));
   try{
    await context.route('**/*',route=>{
     const url=new URL(route.request().url());if(url.origin!==origin){remote.push(url.origin+url.pathname);return route.abort()}
     if(url.pathname==='/app/profile.js')return route.fulfill({contentType:'text/javascript',body:'/* profile UI irrelevant to isolated sync recovery */'});
     if(url.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:`
      window.abIdentity={user_id:${JSON.stringify(owner)},email:'recovery@example.test',role:'admin',full_name:'Тест восстановления'};
      const gate=document.createElement('div');gate.id='ab-auth';gate.innerHTML='<div class="card"><h2>ARBAT FINANCE</h2><p id="ab-message"></p><form id="ab-form"></form></div>';document.body.append(gate);
      const logout=document.createElement('button');logout.id='ab-logout';logout.textContent='Выйти';logout.hidden=true;document.body.append(logout);
      window.__recoveryFetchCount=0;window.fetch=async()=>{window.__recoveryFetchCount++;throw Error('Unexpected fetch during recovery boot')};
      window.abGetToken=async()=>{throw Error('Recovery boot must not request a token')};window.abMessage=text=>document.getElementById('ab-message').textContent=text;
      window.__recoveryBoot=window.arbatCloudBoot();
     `});
     return route.continue();
    });
    await context.addInitScript(data=>{if(localStorage.getItem('security-recovery-e2e-seeded'))return;localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data.finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(data.warehouse));localStorage.setItem('arbat-cloud-revision-v1',JSON.stringify(data.snapshot.revisions));localStorage.setItem(data.key,JSON.stringify(data.snapshot));localStorage.setItem('security-recovery-e2e-seeded','1')},fixture());
    await page.goto(origin+'/app/',{waitUntil:'load'});assert.equal(await page.evaluate(()=>window.__recoveryBoot),false);
    const panel=page.locator('#ab-sync-recovery'),download=panel.getByRole('button',{name:'Скачать несохранённую копию',exact:true}),discard=panel.getByRole('button',{name:'Отказаться от локальных изменений',exact:true});
    await panel.waitFor({state:'visible'});assert.equal(await download.isVisible(),true);assert.equal(await discard.isVisible(),true);assert.equal(await panel.getByRole('button',{name:'Выйти',exact:true}).isVisible(),true);
    assert.ok(await download.evaluate(button=>{const r=button.getBoundingClientRect();return r.width>0&&r.height>0}),engine.name()+' '+width+': visible clickable recovery control');
    assert.match(await page.locator('#ab-message').innerText(),/несохранённые изменения/);assert.equal(await page.evaluate(()=>window.__recoveryFetchCount),0);
    const before=await page.evaluate(key=>localStorage.getItem(key),key),downloadPromise=page.waitForEvent('download');await download.click();const file=await downloadPromise;assert.deepEqual(JSON.parse(await fs.readFile(await file.path(),'utf8')),fixture().snapshot);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before,'download cannot discard the recovery snapshot');
    await page.reload({waitUntil:'load'});assert.equal(await page.evaluate(()=>window.__recoveryBoot),false);await page.locator('#ab-recovery-download').waitFor({state:'visible'});assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);assert.equal(await page.evaluate(()=>window.__recoveryFetchCount),0);assert.deepEqual(remote,[],'no external requests');assert.deepEqual(errors,[],'no application page errors');
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});await page.screenshot({path:path.join(root,'test-results',`security-recovery-${engine.name()}-${width}.png`),fullPage:true});
   }finally{await context.close()}
  }}finally{await browser.close()}
 }}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
