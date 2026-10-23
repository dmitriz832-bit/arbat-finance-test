/* Actual application and navigation, with local finance/warehouse fixtures only. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
test('real application routes retain content bounds when sidebar opens and closes',async()=>{
 const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{for(const width of [390,768,1024,1280,1440,1870,2560]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname==='/app/auth.js')return r.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return r.fulfill({body:''});return r.continue()});
  await context.addInitScript(()=>{
   const org='АИР-КЛИМАТ',date='2026-10-22',state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles'].map(k=>[k,[]]));
   Object.assign(state,{dealPlans:{},deals:[{_id:'layout-project',name:'Проект проверки границ интерфейса',org,order1c:'LAYOUT-1',contractTotal:100000,cost:30000,vatRate:0}],wallets:[{id:'layout-wallet',name:'Основной счёт',org,verified:true,openingBalance:10000}]});
   localStorage.setItem('arbat-finance-demo-live',JSON.stringify(state));localStorage.setItem('arbat-sidebar-collapsed','0');localStorage.setItem('arbat-sidebar-auto','0');
   localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[{id:'layout-item',name:'Материал для проверки длинного наименования в журнале движений',unit:'шт'}],places:[{id:'layout-store',name:'Основной склад',org}],moves:[{id:'layout-move',n:1,date,org,kind:'receipt',importId:'layout-import',itemId:'layout-item',to:'layout-store',qty:2,price:30,note:'Приходная накладная'}],imports:[{id:'layout-import',mode:'receipt',count:1,filename:'Приходная накладная.pdf',date,org}],projectIssues:[],plans:[],folders:[]}));
  });
  await page.goto(origin+'/app/');
  await fs.mkdir(path.join(root,'test-results'),{recursive:true});
  // Disable only animation for deterministic geometry; retain all production sizing rules.
  await page.addStyleTag({content:'#layout{transition:none!important}'});
  const routes=await page.locator('#tabs [data-route]').evaluateAll(els=>[...new Set(els.map(el=>el.dataset.route))]);
  assert.ok(routes.includes('materials:receipt')&&routes.includes('reports:pnl')&&routes.includes('settings'));
  const check=async(label,collapsed=false)=>{
   const result=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};
    const layout=document.getElementById('layout'),content=layout.querySelector(':scope>.content'),main=content.querySelector(':scope>main'),bounds=rect(content);
    const bad=[...main.querySelectorAll('.card,.scroll,.whtable,.ab-scroll')].filter(el=>el.getClientRects().length&&!el.closest('.modal,.whmodal,.ui-sheet,.arbat-modal')).map(el=>({id:el.id,cls:el.className,...rect(el)})).filter(r=>r.left<bounds.left-1||r.right>bounds.right+1);
    return {layout:rect(layout),content:bounds,main:rect(main),sidebar:rect(document.getElementById('sidebar')),bad,scrollX};
   });
   assert.ok(result.layout.right<=width+1&&result.content.right<=result.layout.right+1&&result.main.right<=result.content.right+1,`${label}: content remains inside viewport ${JSON.stringify(result)}`);
   assert.equal(result.scrollX,0,`${label}: navigation does not move page horizontally`);
   assert.deepEqual(result.bad,[],`${label}: visible cards and table viewports stay inside content`);
   const expected=width>1100?(collapsed?68:260):0;
   assert.ok(Math.abs(result.content.left-result.layout.left-expected)<=1,`${label}: sidebar reserves ${expected}px, actual ${result.content.left-result.layout.left}`);
  };
  for(const route of routes){
   await page.evaluate(route=>window.arbatNavigate(route),route);
   await check(`${engine.name()} ${width} ${route} expanded`);
   if([390,1440].includes(width)&&['overview','materials:receipt'].includes(route))await page.screenshot({path:path.join(root,'test-results',`audit-${engine.name()}-${width}-${route.replace(':','-')}.png`),fullPage:true});
   if(width>1100){await page.locator('#toggleSide').click();await check(`${engine.name()} ${width} ${route} collapsed`,true);await page.locator('#toggleSide').click();}
   else {await page.locator(width<=650?'[data-mobile-route="menu"]':'#ui-nav-toggle').click();await check(`${engine.name()} ${width} ${route} drawer open`);await page.locator('#toggleSide').click();await check(`${engine.name()} ${width} ${route} drawer closed`);}
  }
  assert.deepEqual(errors,[],`${engine.name()} ${width}: no application errors`);await context.close();
 }}finally{await browser.close()}}}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
