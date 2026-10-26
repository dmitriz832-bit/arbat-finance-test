/* Real table preferences and production styles; no remote accounting requests. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),app=path.resolve(__dirname,'../app');
const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const optional=name=>fs.existsSync(path.join(app,name))?fs.readFileSync(path.join(app,name),'utf8'):'';
const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*href="([^"?]+)[^"]*"[^>]*>/g)].map(m=>m[1]??fs.readFileSync(path.resolve(app,m[2]),'utf8')).join('\n')+'\n'+optional('report-table-system.css');
const scripts=optional('table-preferences.js')+'\n'+optional('report-table-system.js');
const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь','Итого'];
function matrix(label='Статья',selection=false){
 const head=(selection?'<th><input type="checkbox" aria-label="Все строки"></th>':'')+`<th>${label}</th>`+months.map(m=>`<th>${m}</th>`).join('');
 const cells=(selection?'<td><input type="checkbox" aria-label="Выбрать строку"></td>':'')+'<td>↳ Монтаж и обслуживание систем вентиляции на производственном объекте</td>'+months.map((_,i)=>`<td><button type="button" class="ux-text-link" data-source="${i}">${i===1?'-':''}123 456 789,00 ₽</button></td>`).join('');
 return `<table><thead><tr>${head}</tr></thead><tbody>${Array.from({length:28},(_,i)=>`<tr data-id="row-${i}">${cells}</tr>`).join('')}</tbody><tfoot><tr>${selection?'<td></td>':''}<th>ИТОГО</th>${months.map(()=>'<td>0,00 ₽</td>').join('')}</tr></tfoot></table>`;
}
async function fixture(browser){
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://matrix.test/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>${styles}</style><style>main{max-width:100%;padding:12px;box-sizing:border-box}#reportTable,#comparison,#nativeMatrix{max-height:390px}#comparison{margin-top:30px}td button{font:inherit;white-space:nowrap;padding:0;border:0;background:none}body{margin:0}</style><body class="ab-ready ui-modern ux-app"><main><section id="reports" class="active"><div id="reportTable" class="scroll">${matrix()}</div><div id="comparison" class="scroll">${matrix('Наименование',true)}</div><div id="defaultMatrix" class="scroll">${matrix("Показатель")}</div><div id="nativeMatrix" class="scroll" data-table-settings="off">${matrix("Показатель")}</div><div id="catalog" class="scroll"><table><thead><tr><th>Статья</th><th>Группа</th><th>Описание</th></tr></thead><tbody><tr><td>Статья справочника</td><td>Расходы</td><td>Описание</td></tr></tbody></table></div></section></main><script>window.abIdentity={user_id:'matrix-user'};window.sourceClicks=0;document.addEventListener('click',e=>{if(e.target.closest('[data-source]'))window.sourceClicks++});</script><script>${scripts}</script></body>`}));
 await page.goto('http://matrix.test/');await page.locator('#reportTable .tp-resizer').first().waitFor();
 return {page,errors};
}
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function rect(locator){return locator.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})}
const engines=process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit];
for(const engine of engines){
 test(`${engine.name()}: exact huge negative amounts fit default tracks and wrap within saved narrower widths`,async()=>{
  const browser=await engine.launch();try{const {page,errors}=await fixture(browser);
   const [whole,fraction]=require('../app/finance-core.js').rubles(-1234567890123456789012n).split('.'),amount=whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+fraction+' ₽';
   assert.equal(amount,'-12 345 678 901 234 567 890,12 ₽','fixture retains every BigInt digit and kopeck');
   const viewport=page.locator('#reportTable'),header=viewport.locator('thead th').nth(1),cell=viewport.locator('tbody tr').first().locator('td').nth(1),link=cell.locator('button');
   const initial=(await rect(header)).width;
   await viewport.locator('tbody [data-source="0"]').evaluateAll((links,value)=>links.forEach(button=>button.textContent=value),amount);
   await viewport.locator('tfoot td').first().evaluate((cell,value)=>cell.textContent=value,amount);await frame(page);await frame(page);
   assert.ok((await rect(header)).width>initial+60,'default numeric track grows for the exact value');
   const fits=async(label)=>{
    assert.equal(await cell.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,label+': cell does not spill into the next period');
    assert.equal(await link.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,label+': the source button contains its complete value');
    assert.equal(await link.textContent(),amount,label+': displayed digits remain exact');
    const range=await link.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect(),cell=el.closest('td').getBoundingClientRect();return {left:r.left,right:r.right,cellLeft:cell.left,cellRight:cell.right}});
    assert.ok(range.left>=range.cellLeft-1&&range.right<=range.cellRight+1,label+': visible text stays inside its period');
   };
   await fits('automatic width');
   assert.ok(await link.evaluate(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)+1),'automatic width keeps the large exact amount on one line');
   const handle=header.locator('.tp-resizer'),box=await handle.boundingBox(),grown=(await rect(header)).width;
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-grown+155,box.y+box.height/2);await page.mouse.up();await frame(page);await frame(page);
   assert.ok(Math.abs((await rect(header)).width-155)<2,'explicit saved numeric width is preserved');
   await fits('saved narrow width');
   assert.ok(await link.evaluate(el=>el.getBoundingClientRect().height>parseFloat(getComputedStyle(el).lineHeight)+1),'a narrow saved width wraps the complete amount');
   for(const width of [375,768,1440]){await page.setViewportSize({width,height:950});await frame(page);await viewport.evaluate(el=>el.scrollLeft=0);await frame(page);await fits(String(width));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: huge amount does not widen the page`)}
   await page.reload();await frame(page);await frame(page);assert.ok(Math.abs((await rect(page.locator('#reportTable thead th').nth(1))).width-155)<2,'saved numeric width survives reload');assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 });
 test(`${engine.name()}: report article and header/footer intersections stay readable during two-axis scrolling`,async()=>{
  const browser=await engine.launch();try{const {page,errors}=await fixture(browser);
   for(const selector of ['#reportTable','#comparison','#nativeMatrix']){
    const viewport=page.locator(selector),index=selector==='#comparison'?1:0,article=viewport.locator('tbody tr').first().locator('td').nth(index),numeric=viewport.locator('tbody tr').first().locator('td').nth(index+1);
    const before=await rect(article),numberBefore=await rect(numeric);
    await viewport.evaluate(el=>el.scrollLeft=650);await frame(page);
    const after=await rect(article),numberAfter=await rect(numeric),bounds=await rect(viewport);
    assert.ok(Math.abs(after.x-bounds.x)<2,`${selector}: semantic article stays at scrollport edge, got ${JSON.stringify({before,after,bounds})}`);
    assert.ok(numberBefore.x-numberAfter.x>600,`${selector}: numeric periods still scroll`);
    assert.equal(await article.evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),false,'article has an opaque background');
    await viewport.evaluate(el=>el.scrollTop=180);await frame(page);
    const header=viewport.locator('thead th').nth(index),headerBounds=await rect(header);
    assert.ok(Math.abs(headerBounds.x-bounds.x)<2&&Math.abs(headerBounds.y-bounds.y)<2,`${selector}: top-left header remains pinned ${JSON.stringify({headerBounds,bounds})}`);
    await viewport.evaluate(el=>el.scrollTop=el.scrollHeight);await frame(page);
    const footer=await rect(viewport.locator('tfoot th'));
    assert.ok(Math.abs(footer.x-bounds.x)<2,`${selector}: footer article is pinned`);
    assert.equal(await viewport.locator('tbody tr').first().evaluate(row=>row.cells.length),months.length+1+index,'cell indices remain unchanged');
   }
   await page.locator('#comparison').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0});
   await page.locator('#comparison tbody tr').first().getByRole('checkbox').check();
   assert.equal(await page.locator('#comparison tbody tr').first().getByRole('checkbox').isChecked(),true,'selection is still interactive');
   await page.locator('#reportTable').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0});await page.locator('#reportTable tbody [data-source="0"]').first().click();
   assert.equal(await page.evaluate(()=>window.sourceClicks),1,'existing drilldown handlers remain interactive');
   for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:950});await frame(page);
    for(const selector of ['#reportTable','#comparison','#nativeMatrix']){
     const host=page.locator(selector),index=selector==='#comparison'?1:0;
     await host.evaluate(el=>{el.scrollLeft=600;el.scrollTop=180});await frame(page);
     assert.equal(await host.evaluate(el=>el.scrollLeft),600,`${width} ${selector}: horizontal matrix scrolling remains available`);
     assert.ok(Math.abs((await rect(host.locator('thead th').nth(index))).x-(await rect(host)).x)<2,`${width} ${selector}: article header stays pinned`);
     assert.ok(Math.abs((await rect(host.locator('thead th').nth(index+1))).x-(await rect(host.locator('tbody tr').first().locator('td').nth(index+1))).x)<2,`${width} ${selector}: period header scrolls with its amounts`);
     assert.equal(await host.locator('tbody tr').first().locator('td').nth(index+1).evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${width} ${selector}: full monetary value fits the column`);
    }
   }
   assert.equal(await page.locator('#defaultMatrix').evaluate(el=>el.clientHeight<el.scrollHeight&&el.clientHeight<innerHeight),true,'long reports provide a bounded two-axis workspace for sticky headers');
   assert.equal(await page.locator('#catalog table').evaluate(table=>table.classList.contains('rt-table')),false,'article directories are not financial matrices');assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 });
 test(`${engine.name()}: reordered, hidden and resized article columns retain settings through rerenders and mobile matrices`,async()=>{
  const browser=await engine.launch();try{const {page,errors}=await fixture(browser),viewport=page.locator('#comparison');
   const settings=viewport.locator('xpath=preceding-sibling::*[1]').getByRole('button',{name:/Настройка таблицы/});
   await settings.click();await page.getByRole('button',{name:'Ниже: Наименование',exact:true}).click();await page.getByLabel('Март',{exact:true}).uncheck();await page.getByRole('button',{name:'Готово',exact:true}).click();await frame(page);
   const article=viewport.locator('thead th').nth(1),handle=article.locator('.tp-resizer'),box=await handle.boundingBox(),initial=await rect(article);
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2);await page.mouse.up();await frame(page);
   const sized=await rect(article);assert.ok(sized.width>initial.width+70,'article can be resized independently');
   assert.equal(await article.evaluate(el=>el.style.order),'2','requested order is retained');
   await viewport.evaluate(el=>el.scrollLeft=700);await frame(page);
   assert.ok(Math.abs((await rect(viewport.locator('tbody tr').first().locator('td').nth(1))).x-(await rect(viewport)).x)<2,'reordered article stays sticky');
   const scroll=await viewport.evaluate(el=>el.scrollLeft);await page.locator('#comparison tbody td').nth(2).evaluate(el=>{el.title='Источник: новые данные';el.append(document.createElement('span'))});await frame(page);
   assert.equal(await viewport.evaluate(el=>el.scrollLeft),scroll,'a tooltip/child update does not reset horizontal scroll');
   await viewport.evaluate(host=>host.replaceChildren());await frame(page);
   await viewport.evaluate((host,markup)=>host.innerHTML=markup,matrix('Наименование',true));await frame(page);await frame(page);
   assert.equal(await viewport.evaluate(el=>el.scrollLeft),scroll,'source rerender keeps the viewed period');
   assert.equal(await viewport.locator('thead th').nth(1).evaluate(el=>el.style.order),'2','rerender keeps user order');
   assert.equal(await viewport.locator('thead th').nth(4).isVisible(),false,'rerender keeps hidden period');
   assert.ok(Math.abs((await rect(viewport.locator('thead th').nth(1))).width-sized.width)<2,'rerender keeps individual article width');
   await settings.click();await page.getByLabel('Наименование',{exact:true}).uncheck();await page.getByRole('button',{name:'Готово',exact:true}).click();await frame(page);
   assert.equal(await viewport.locator('tbody tr').first().locator('td').nth(1).isVisible(),false,'explicitly hidden article stays hidden');
   await viewport.evaluate(el=>el.scrollLeft=700);await frame(page);
   assert.ok(Math.abs((await rect(viewport.locator('thead th').first())).x+await viewport.evaluate(el=>el.scrollLeft)-(await rect(viewport)).x)<2,'selection scrolls with the matrix instead of becoming the frozen article');
   await settings.click();await page.getByLabel('Наименование',{exact:true}).check();await page.getByRole('button',{name:'Готово',exact:true}).click();
   for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:950});await frame(page);
    await viewport.evaluate(el=>{el.scrollLeft=700;el.scrollTop=0});await frame(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: matrix stays inside the page`);
    assert.equal(await viewport.locator('thead').isVisible(),true,`${width}: header is visible`);
    assert.equal(await viewport.locator('tbody tr').first().locator('td').nth(2).isVisible(),true,`${width}: report keeps multiple periods`);
    const label=await rect(viewport.locator('tbody tr').first().locator('td').nth(1)),bounds=await rect(viewport);
    assert.ok(Math.abs(label.x-bounds.x)<2,`${width}: article remains pinned`);
    if(width===375)assert.ok(label.width<=190,`375: article leaves room for a readable amount, got ${label.width}`);
   }
   await page.reload();await frame(page);await frame(page);
   assert.equal(await page.locator('#comparison thead th').nth(1).evaluate(el=>el.style.order),'2','reload keeps settings');assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 });
}
