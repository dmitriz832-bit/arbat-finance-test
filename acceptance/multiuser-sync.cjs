/* Real application and sync.js in independent browser contexts. Auth and CAS server are controlled fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),{fixture}=require('../tests/helpers/business-cycle.cjs'),root=path.resolve(__dirname,'..');
const F='arbat-finance-demo-live',W='arbat-warehouse-v1',B='arbat-cloud-revision-v1';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('two independent application clients share documents, merge independent edits, recover polling and stop conflicting writes',{timeout:180000},async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();const initial=fixture(),cloud={finance:structuredClone(initial.finance),warehouse:structuredClone(initial.warehouse)},revisions={finance:1,warehouse:1},offline=new Set(),blocked=new Set(),contexts=[],pages=[],errors=[];
  try{
   for(const role of ['admin','accountant']){
    const context=await browser.newContext({viewport:{width:390,height:950},reducedMotion:'reduce'}),page=await context.newPage();contexts.push(context);pages.push(page);page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='confirm'&&/Закрыть карточку без сохранения/.test(d.message()))return d.accept();errors.push(d.message());await d.dismiss()});
    await context.route('**/*',async route=>{const u=new URL(route.request().url());
     if(u.origin===origin){if(u.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:`window.abIdentity={user_id:'${role}',email:'${role}@example.test',role:'${role}'};window.abGetToken=async()=> '${role}';const gate=document.createElement('div');gate.id='ab-auth';gate.innerHTML='<div class=\"card\"><h2>ARBAT FINANCE</h2><p id=\"ab-message\"></p><form id=\"ab-form\"></form></div>';document.body.append(gate);const logout=document.createElement('button');logout.id='ab-logout';logout.textContent='Выйти';logout.hidden=true;document.body.append(logout);window.abMessage=text=>{window.lastSyncMessage=text;document.getElementById('ab-message').textContent=text};document.body.classList.add('ab-ready');`});if(u.pathname==='/app/profile.js')return route.fulfill({body:''});return route.continue()}
     if(u.origin!=='https://albkplrjiksydkjkivlm.supabase.co')return route.abort();
     if(!u.pathname.startsWith('/rest/v1/'))return route.abort();
     if(offline.has(role))return route.abort('internetdisconnected');
     if(blocked.has(role))return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Access denied'})});
     if(route.request().method()==='GET'){const store=u.pathname.includes('warehouse_state')?'warehouse':'finance';return route.fulfill({contentType:'application/json',body:JSON.stringify([{payload:cloud[store],revision:revisions[store]}])})}
     if(u.pathname.endsWith('/rpc/update_shared_state_batch')){
      const {p_changes:changes}=route.request().postDataJSON();
      if(changes.some(c=>c.expected_revision!==revisions[c.store]))return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Version conflict'})});
      const result={};for(const c of changes){cloud[c.store]=structuredClone(c.payload);result[c.store]=++revisions[c.store]}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
     }
     return route.abort();
    });
    await context.addInitScript(({initial,F,W,B})=>{if(localStorage.getItem('multiuser-seeded'))return;localStorage.setItem('multiuser-seeded','1');localStorage.setItem(F,JSON.stringify(initial.finance));localStorage.setItem(W,JSON.stringify(initial.warehouse));localStorage.setItem(B,JSON.stringify({finance_state:1,warehouse_state:1}))},{initial,F,W,B});
    await page.clock.setFixedTime(new Date('2026-10-24T10:00:00Z'));await page.goto(origin+'/app/');assert.equal(await page.evaluate(()=>window.arbatCloudBoot()),true);await page.evaluate(()=>window.arbatNavigate('expenses'));
   }
   const [admin,accountant]=pages;
   const create=async(page,id)=>page.evaluate(id=>{db.expenses.push({_id:id,org:'АИР-КЛИМАТ',projectKey:'АИР-КЛИМАТ::1C#CYCLE-air',date:'2026-10-24',category:'Подрядчики',amount:50,note:'Документ '+id,vatRate:0});save()},id);
   const seen=async(page,id)=>{try{await page.waitForFunction(id=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).expenses.some(x=>x._id===id),id);await page.locator('#expensesTable').getByText('Документ '+id,{exact:true}).waitFor()}catch(error){console.log('SYNC DIAGNOSTIC',JSON.stringify({id,cloud:cloud.finance.expenses,revisions,clients:await Promise.all(pages.map(p=>p.evaluate(()=>({expenses:JSON.parse(localStorage.getItem('arbat-finance-demo-live')).expenses,message:window.lastSyncMessage,recovery:[...Object.keys(localStorage)].filter(k=>k.startsWith('arbat-unsynced-recovery-v1:')).map(k=>JSON.parse(localStorage.getItem(k)).reason)}))))}));throw error}};
   await create(accountant,'accountant-document');await seen(admin,'accountant-document');assert.equal(cloud.finance.expenses.find(x=>x._id==='accountant-document').createdBy.email,'accountant@example.test');
   await admin.evaluate(()=>openRecord('expenses','accountant-document'));await admin.locator('#genericEditForm [name=amount]').fill('60');await admin.locator('#genericEditForm [name=vatDeductible]').selectOption('false',{force:true});
   await accountant.evaluate(()=>{db.expenses.find(x=>x._id==='accountant-document').amount=75;save()});await admin.waitForFunction(()=>JSON.parse(localStorage.getItem('arbat-finance-demo-live')).expenses.find(x=>x._id==='accountant-document').amount===75);
   await admin.evaluate(()=>{const f=document.getElementById('genericEditForm'),invalid=[...f.elements].filter(x=>x.willValidate&&!x.validity.valid).map(x=>x.name);if(invalid.length)throw Error('Incomplete editor fixture: '+invalid.join(','));f.requestSubmit()});await admin.locator('#appNoticeModal.open').waitFor();assert.match(await admin.locator('#appNoticeModal').innerText(),/изменён другим сотрудником/);assert.equal(await admin.locator('#genericEditForm [name=amount]').inputValue(),'60');assert.equal(cloud.finance.expenses.find(x=>x._id==='accountant-document').amount,75);await admin.locator('#appNoticeOk').click();await admin.locator('#genericCancel').click();
   offline.add('admin');await pause(5200);assert.equal(await admin.locator('#ab-sync-recovery').count(),0,'read outage keeps app open');await create(accountant,'offline-colleague');offline.delete('admin');await seen(admin,'offline-colleague');assert.equal(await admin.locator('#ab-sync-recovery').count(),0,'polling recovers without reload');
   await seen(accountant,'offline-colleague');
   offline.add('admin');await create(admin,'offline-write');await admin.locator('#ab-sync-recovery').waitFor();offline.delete('admin');await create(accountant,'online-during-outage');
   await Promise.all([admin.waitForEvent('load'),admin.locator('#ab-recovery-retry').click()]);await admin.waitForFunction(()=>typeof window.arbatCloudBoot==='function');assert.equal(await admin.evaluate(()=>window.arbatCloudBoot()),true);await admin.evaluate(()=>window.arbatNavigate('expenses'));
   for(const page of pages){await seen(page,'offline-write');await seen(page,'online-during-outage')}
   assert.equal(await admin.locator('#ab-sync-recovery').count(),0,'acknowledged retry removes the recovery gate');
   await Promise.all([create(admin,'parallel-admin'),create(accountant,'parallel-accountant')]);
   for(const page of pages){await seen(page,'parallel-admin');await seen(page,'parallel-accountant')}
   assert.equal(new Set(cloud.finance.expenses.map(x=>x._id)).size,6,'independent writes are conserved');
   await Promise.all(pages.map((page,i)=>page.evaluate(amount=>{db.expenses.find(x=>x._id==='accountant-document').amount=amount;save()},100+i*100)));
   let loser=-1;for(let i=0;i<100&&loser<0;i++){for(let n=0;n<pages.length;n++)if(await pages[n].locator('#ab-sync-recovery').count())loser=n;if(loser<0)await pause(100)}assert.notEqual(loser,-1,'same document conflict must stop a client');
   const saved=cloud.finance.expenses.find(x=>x._id==='accountant-document').amount;assert.ok([100,200].includes(saved));
   const recovery=await pages[loser].evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('arbat-unsynced-recovery-v1:'));return JSON.parse(localStorage.getItem(key))});assert.equal(recovery.stores.finance.expenses.find(x=>x._id==='accountant-document').amount,loser===0?100:200);assert.notEqual(saved,loser===0?100:200,'server and recoverable local version remain distinct');
   const winner=1-loser;blocked.add(winner===0?'admin':'accountant');await pages[winner].locator('#ab-sync-recovery').waitFor();assert.equal(cloud.finance.expenses.length,6,'access rejection writes no documents');assert.deepEqual(errors,[]);
   await fs.mkdir(path.join(root,'test-results'),{recursive:true});for(let n=0;n<pages.length;n++)await pages[n].screenshot({path:path.join(root,'test-results',`multiuser-${engine.name()}-${n}.png`)});
  }catch(error){await fs.mkdir(path.join(root,'test-results'),{recursive:true});for(let n=0;n<pages.length;n++)await pages[n].screenshot({path:path.join(root,'test-results',`multiuser-failed-${engine.name()}-${n}.png`)}).catch(()=>{});throw error}finally{for(const context of contexts)await context.close();await browser.close()}
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
