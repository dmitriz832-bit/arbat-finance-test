'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');

test('FinTablo visual layer loads and mobile menu overlays content',async()=>{
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   const rel=decodeURIComponent(url.pathname);
   const file=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));
   if(!file.startsWith(root+path.sep))throw Error('outside repository');
   const contents=await fs.readFile(file);
   res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');
   res.end(contents);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,834,430,390]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort();
    if(u.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready");'});
    if(['/app/sync.js','/app/profile.js'].includes(u.pathname))return route.fulfill({contentType:'text/javascript',body:'/* offline UI test */'});
    return route.continue();
   });
   const page=await context.newPage();
   const browserErrors=[];
   page.on('pageerror',error=>browserErrors.push(error.message));
   await page.goto(origin+'/app/',{waitUntil:'load'});
   const theme=await page.evaluate(()=>{
    const sidebar=document.querySelector('.sidebar');
    return {background:getComputedStyle(sidebar).backgroundColor,linked:[...document.styleSheets].some(s=>s.href&&s.href.includes('fintablo-ui.css'))};
   });
   assert.equal(theme.linked,true,'Missing external design layer at width '+width);
   assert.equal(theme.background,'rgb(255, 255, 255)', 'sidebar should be opaque at '+width);
   const exists=await page.locator('#overview').count();
   assert.equal(exists,1);
   if(width<=700){
    await page.locator('#toggleSide').click();
    await page.waitForTimeout(120);
    const state=await page.evaluate(()=>{
      const layout=document.querySelector('#layout');
      const nav=document.querySelector('.sidebar').getBoundingClientRect();
      const content=document.querySelector('.content').getBoundingClientRect();
      return {open:layout.classList.contains('mobile-open'),navWidth:nav.width,contentWidth:content.width,navPosition:getComputedStyle(document.querySelector('.sidebar')).position};
    });
    assert.equal(state.open,true,'menu did not open at '+width);
    assert.equal(state.navPosition,'fixed');
    assert.ok(state.navWidth>=190,'mobile navigation too narrow at '+width);
    assert.ok(state.contentWidth>=width-60,'mobile main pane shrank at '+width);
   }
   assert.deepEqual(browserErrors,[], 'Uncaught page errors at '+width);
   await context.close();
  }
 }finally{await browser?.close();await new Promise(ok=>server.close(ok));}
});
