const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),app=path.resolve(__dirname,'../app');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*href="([^"?]+)[^"]*"[^>]*>/g)].map(m=>m[1]??fs.readFileSync(path.resolve(app,m[2]),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(app,'table-preferences.css'),'utf8');
const script=fs.readFileSync(path.join(app,'table-preferences.js'),'utf8');
const table='<table class="arbat-resizable ux-register-table"><thead><tr><th>Дата</th><th>Контрагент</th><th>Сумма</th></tr></thead><tbody><tr><td>23.10.2026</td><td>ООО Заказчик</td><td>123 456 789,00 ₽</td></tr></tbody></table>';
test('table settings preserve DOM contracts, show full amounts, persist per identity and survive rerenders',async()=>{
 const browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:1440,height:950}});
 await page.route('http://tables.test/**',route=>route.fulfill({contentType:'text/html',body:`<style>${styles}</style><body class="ab-ready ui-modern ux-app"><main><section id="cash" class="active"><div id="cashTable" class="scroll">${table}</div></section><section id="warehouse" class="active"><div id="whMovements" class="whtable">${table}</div></section></main><script>window.abIdentity={user_id:'one'}</script><script>${script}</script></body>`}));
 await page.goto('http://tables.test/');await page.locator('.tp-settings').first().waitFor();assert.equal(await page.locator('.tp-settings').count(),2);
 const amount=page.locator('#cashTable td').nth(2);assert.equal(await amount.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'amount is fully visible');
 await page.locator('.tp-settings').first().click();await page.getByRole('button',{name:'Выше: Сумма',exact:true}).click();
 const cells=await page.locator('#cashTable tbody tr').evaluate(row=>[...row.cells].map(c=>({text:c.textContent,order:c.style.order})));
 assert.match(cells[2].text,/123/);assert.equal(cells[2].order,'1');assert.equal(cells[1].order,'2');
 await page.getByLabel('Контрагент',{exact:true}).uncheck();await page.getByRole('button',{name:'Готово',exact:true}).click();
 assert.equal(await page.locator('#cashTable td').nth(1).isVisible(),false);
 await page.reload();await page.locator('#cashTable .tp-hidden').first().waitFor({state:'attached'});assert.equal(await page.locator('#cashTable td').nth(1).isVisible(),false);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('arbat:identity',{detail:{user_id:'two'}})));await page.waitForFunction(()=>!document.querySelector('#cashTable td:nth-child(2)').classList.contains('tp-hidden'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('arbat:identity',{detail:{user_id:'one'}})));await page.waitForFunction(()=>document.querySelector('#cashTable td:nth-child(2)').classList.contains('tp-hidden'));
 await page.locator('#cashTable').evaluate((host,markup)=>host.innerHTML=markup,table);await page.waitForFunction(()=>document.querySelector('#cashTable td:nth-child(2)').classList.contains('tp-hidden'));assert.equal(await page.locator('.tp-settings').count(),2,'rerender does not duplicate settings controls');
 await page.locator('#cashTable tbody tr').evaluate(row=>row.hidden=true);assert.equal(await page.locator('#cashTable tbody tr').isVisible(),false,'search hidden rows stay hidden');
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page containment '+width)}
 await page.locator('.tp-settings').first().click();await page.getByRole('button',{name:'Сбросить',exact:true}).click();await page.getByRole('button',{name:'Готово',exact:true}).click();assert.equal(await page.locator('#cashTable .tp-hidden').count(),0);
 }finally{await browser.close()}
});
