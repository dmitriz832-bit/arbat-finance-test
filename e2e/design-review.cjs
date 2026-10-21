const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright');
test('design review: period, source drilldown, editing and linked realization on six widths',async()=>{
 const root=path.resolve(__dirname,'..'),html=await fs.readFile(path.join(root,'design/review.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 try{for(const engine of [chromium,webkit]){const browser=await engine.launch();try{
  for(const width of [375,390,430,768,1024,1440]){
   const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];
   await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
   page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page fits '+width);
   await page.screenshot({path:path.join(root,'test-results',`review-home-${engine.name()}-${width}.png`),fullPage:true});
   await page.locator('#incomingTotal').click();assert.match(await page.locator('#detailTotal').innerText(),/300/);
   assert.equal(await page.locator('#detailRows [data-document]').count(),2,'seven-day plan excludes later and overdue dates');
   await page.locator('#back').click();await page.getByRole('button',{name:'Предыдущий период',exact:true}).click();
   assert.equal(await page.locator('#month').inputValue(),'2026-09');
   await page.locator('#metrics [data-detail="revenue"]').click();
   assert.match(await page.locator('#detailPeriod').innerText(),/01.09.2026/);
   assert.equal(await page.locator('#detailRows [data-document]').count(),1);
   await page.locator('#detailRows [data-document="r3"]').click();
   await page.locator('#editor input[name="amount"]').fill('120000');
   await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
   assert.match(await page.locator('#detailTotal').innerText(),/120/);
   await page.screenshot({path:path.join(root,'test-results',`review-detail-${engine.name()}-${width}.png`),fullPage:true});
   await page.locator('#back').click();assert.equal(await page.locator('#month').inputValue(),'2026-09');
   await page.locator('#homeProjects [data-project="p1"]').click();
   if(width<=600)assert.ok((await page.locator('#editor').boundingBox()).width>=width-1,'mobile dialog uses full width');
   await page.screenshot({path:path.join(root,'test-results',`review-project-${engine.name()}-${width}.png`)});
   await page.getByRole('button',{name:'Создать реализацию',exact:true}).click();
   assert.match(await page.locator('#editorBody').innerText(),/Вентиляция офиса/);
   await page.locator('#editor input[name="name"]').fill('Акт тестовой реализации');
   await page.locator('#editor input[name="amount"]').fill('1000');
   await page.getByRole('button',{name:'Создать реализацию',exact:true}).click();
   await page.locator('#homeProjects [data-project="p1"]').click();
   assert.equal(await page.getByRole('button',{name:'Акт тестовой реализации',exact:true}).count(),1);
   await page.locator('#editor input[name="name"]').fill('Несохранённое название');
   page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Отмена',exact:true}).click();
   assert.equal(await page.locator('#editor').evaluate(el=>el.open),true,'cancelled discard preserves input');
   assert.equal(await page.locator('#editor input[name="name"]').inputValue(),'Несохранённое название');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close()}}}finally{await new Promise(resolve=>server.close(resolve))}
});
