/* Real vendored SDK; only network transport is intercepted. No production events. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
test('diagnostics send only allowlisted data, survive failure, respect opt-out and bound traffic',async()=>{
  const server=http.createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    if(name==='/test.html')return res.end('<!doctype html><input id="secret" value="private@example.com"><script src="/app/telemetry.js"></script><script>window.dispatchEvent(new ErrorEvent("error",{error:new TypeError("SECRET-CUSTOMER-INVOICE"),message:"SECRET-CUSTOMER-INVOICE"}));</script>');
    try{const file=path.join(root,name);res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.html')?'text/html':'application/json');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  try{for(const engine of process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit]){
    const browser=await engine.launch(engine===chromium&&process.env.ARBAT_CHROMIUM_PATH?{executablePath:process.env.ARBAT_CHROMIUM_PATH,args:['--no-sandbox']}:{});
    try{
      const stalled=await browser.newContext(),boot=await stalled.newPage();
      let adapterRequested=false;
      await stalled.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.pathname==='/app/telemetry.js'){adapterRequested=true;return new Promise(()=>{})}
        if(u.origin===origin)return route.continue();
        return route.abort();
      });
      await boot.goto(origin+'/app/index.html',{waitUntil:'domcontentloaded',timeout:15000});
      assert(adapterRequested,'actual application requests the diagnostics adapter');
      assert(await boot.evaluate(()=>document.body!==null),'stalled diagnostics must not block application parsing');
      await stalled.close();
      const context=await browser.newContext({userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"}),page=await context.newPage(),events=[],unexpected=[];
      await context.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});Object.defineProperty(navigator,'userAgentData',{get:()=>undefined});});
      await context.route('**/*',async route=>{
        const req=route.request(),u=new URL(req.url());
        if(u.pathname==='/app/telemetry-config.json')return route.fulfill({json:{enabled:true,token:'phc_test',apiHost:'https://eu.i.posthog.com',origin,pathPrefix:'/'}});
        if(u.origin===origin)return route.continue();
        if(u.hostname==='eu.i.posthog.com'&&req.method()==='POST'){
          const body=req.postData();let event;
          try{event=JSON.parse(body)}catch{const data=new URLSearchParams(body).get('data');event=JSON.parse(Buffer.from(data,'base64').toString())}
          events.push(...(event.batch||(Array.isArray(event)?event:[event])));
          return route.fulfill({json:{status:1}});
        }
        unexpected.push(req.url());return route.abort();
      });
      await page.goto(origin+'/test.html?email=SECRET-EMAIL#access_token=SECRET-TOKEN');
      await assert.doesNotReject(()=>page.waitForFunction(()=>window.posthog?.__loaded));
      await page.waitForTimeout(250);
      await page.evaluate(()=>{
        window.ArbatTelemetry.capture('arbat_sync_result',{status:'failed',message:'SECRET-MESSAGE',amount:123456});
        document.dispatchEvent(new CustomEvent('arbat:navigate',{detail:{section:'cash',route:'SECRET-DEAL'}}));
        window.posthog.register({email:'SECRET-PERSON',amount:999});
        window.posthog.capture('arbat_navigation',{section:'deals',$set:{email:'SECRET-SET'}});
        window.posthog.capture('$pageview');
        window.posthog.capture('arbitrary event');
      });
      await page.waitForTimeout(300);
      assert(events.some(e=>e.event==='arbat_app_loaded'));
      assert(events.some(e=>e.event==='arbat_runtime_error'&&e.properties.code==='TypeError'),'early errors must survive the SDK load queue');
      assert(events.some(e=>e.event==='arbat_sync_result'&&e.properties.status==='failed'));
      assert(events.some(e=>e.event==='arbat_navigation'&&e.properties.section==='cash'));
      for(const event of events){
        assert(['arbat_app_loaded','arbat_runtime_error','arbat_sync_result','arbat_navigation'].includes(event.event));
        assert(!JSON.stringify(event).includes('SECRET'));
        assert(!JSON.stringify(event).includes('private@example.com'));
        assert.deepEqual(Object.keys(event.properties).filter(k=>!['distinct_id','token','$process_person_profile','$geoip_disable','section','status','code'].includes(k)),[]);
      }
      assert.equal(new Set(events.map(e=>e.properties.distinct_id)).size,1);
      assert.deepEqual(unexpected,[]);
      assert.deepEqual(await context.cookies(),[]);
      assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ph_'))),[]);
      await page.evaluate(()=>{for(let i=0;i<150;i++)window.ArbatTelemetry.capture('arbat_navigation',{section:'cash'})});
      await page.waitForTimeout(400);assert(events.length<=101,'100 adapter events plus one direct SDK probe');
      await context.close();
      for(const mode of ['disabled','dnt','network-failure']){
        const c=await browser.newContext(),p=await c.newPage(),external=[];
        if(mode==='dnt')await c.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{value:'1'}));
        await c.route('**/*',route=>{
          const u=new URL(route.request().url());
          if(u.origin!==origin){external.push(u.href);return route.abort()}
          if(u.pathname==='/app/telemetry-config.json'){
            if(mode==='network-failure')return route.abort();
            return route.fulfill({json:{enabled:mode!=='disabled',token:'phc_test',apiHost:'https://eu.i.posthog.com',origin,pathPrefix:'/'}});
          }
          return route.continue();
        });
        await p.goto(origin+'/test.html');await p.waitForTimeout(100);
        await p.locator('#secret').fill('application remains usable');
        assert.equal(await p.locator('#secret').inputValue(),'application remains usable');assert.deepEqual(external,[]);
        await c.close();
      }
    }finally{await browser.close()}
  }}finally{await new Promise(r=>server.close(r))}
});
