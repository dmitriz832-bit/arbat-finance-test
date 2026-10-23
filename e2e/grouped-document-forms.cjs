/* Real form markup + production cascade, independent of auth/network data. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const app=path.resolve(__dirname,'../app'),html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*href="([^"?]+)[^"]*"[^>]*>/g)].map(m=>m[1]??fs.readFileSync(path.resolve(app,m[2]),'utf8')).join('\n');
const scripts=['finance-core.js','vat-forms.js','document-ux.js'].map(file=>fs.readFileSync(path.join(app,file),'utf8'));
const screenshotDir=path.resolve(__dirname,'../test-results');fs.mkdirSync(screenshotDir,{recursive:true});
const expectedGroups={
 dealForm:['Основные данные','Условия договора'],
 editDealForm:['Проект и заказчик','Финансы и состояние'],
 cashForm:['Документ','Участники и аналитика','Сумма и основание'],
 realizationForm:['Основание реализации','Сумма документа'],
 expenseForm:['Документ расхода','Сумма и налоги'],
 costForm:['Классификация','Сумма и налоги'],
 laborForm:['Кому и за что','Расчёт начисления'],
 calendarForm:['Обязательство','Сумма и график']
};
const ids=Object.keys(expectedGroups);
test('grouped document forms fill the sheet in reading order without implicit columns',async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{for(const width of [390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:950}});
   for(const id of ids){
    const markup=html.match(new RegExp('<form\\b[^>]*id="'+id+'"[^>]*>[\\s\\S]*?</form>'))?.[0];assert.ok(markup,id+' fixture exists');
    await page.setContent(`<style>${styles}</style><body class="ab-ready ui-modern ux-app"><div class="ui-sheet"><div class="ui-sheet-body">${markup}</div></div></body>`);
    await page.locator('form').evaluate(form=>{form.classList.add('ui-sheet-content');window.originalControls=[...form.elements];window.controlChanges=0;form.addEventListener('change',()=>window.controlChanges++);});
    for(const script of scripts)await page.addScriptTag({content:script});
    // The sheet enters with scale(.99); transformed rects cannot be compared to layout scrollWidth.
    await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
    const layout=await page.locator('form').evaluate(form=>{
     const r=form.getBoundingClientRect(),groups=[...form.querySelectorAll(':scope > fieldset')];
     return {width:r.width,client:form.clientWidth,scroll:form.scrollWidth,hiddenSelects:[...form.querySelectorAll('.smart-combobox>select')].map(el=>({name:el.name,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scroll:el.scrollWidth,inlineSize:getComputedStyle(el).inlineSize})),scrolling:[...form.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2).map(el=>({tag:el.tagName,id:el.id,className:el.className,name:el.name||el.querySelector('select[name],input[name]')?.name,client:el.clientWidth,scroll:el.scrollWidth,whiteSpace:getComputedStyle(el).whiteSpace})),overflowing:[...form.querySelectorAll('*')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>r.right+2).map(el=>({tag:el.tagName,id:el.id,className:el.className,name:el.name,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right-r.right})),columns:getComputedStyle(form).gridTemplateColumns.split(' ').length,groups:groups.map(g=>{const css=getComputedStyle(g),rect=g.getBoundingClientRect();return {title:g.querySelector('legend').textContent,width:rect.width,top:rect.top,bottom:rect.bottom,display:css.display,template:css.gridTemplateColumns,contentWidth:g.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),gap:parseFloat(css.columnGap),fields:[...g.children].filter(el=>el.matches('label')&&el.querySelector('input,select')&&!el.querySelector('textarea')&&el.getClientRects().length).map(el=>({name:el.querySelector('input[name],select[name]')?.name,width:el.getBoundingClientRect().width,left:el.getBoundingClientRect().left,top:el.getBoundingClientRect().top}))}}),sameControls:window.originalControls.every(c=>c.form===form),orphanFields:form.querySelectorAll(':scope > label input,:scope > label select,:scope > label textarea').length};
    });
    if(id==='editDealForm'||layout.scroll>layout.client+2)await page.screenshot({path:path.join(screenshotDir,`grouped-${id}-${engine.name()}-${width}.png`),fullPage:true});
    if(layout.scroll>layout.client+2)console.log('Grouped form overflow diagnostics',JSON.stringify({engine:engine.name(),viewport:width,id,...layout}));
    assert.equal(layout.columns,1,`${engine.name()} ${width} ${id}: outer form has one track`);
    assert.ok(layout.scroll<=layout.client+2,`${id}: no horizontal overflow (scroll=${layout.scroll}, client=${layout.client}, rect=${layout.width})`);
    assert.equal(layout.sameControls,true,'accounting handlers keep original control nodes');
    for(const select of layout.hiddenSelects)assert.ok(select.width<=1&&select.height<=1,`${engine.name()} ${width} ${id}: hidden native ${select.name} stays 1px, ${JSON.stringify(select)}`);
    assert.equal(layout.orphanFields,0,`${id}: all labelled fields are grouped`);
    assert.deepEqual(layout.groups.map(g=>g.title),expectedGroups[id],id+' has the intended logical group order');
    for(const g of layout.groups){
     const context=`${engine.name()} viewport=${width} form=${id} group=${g.title}`;
     assert.ok(Math.abs(g.width-layout.width)<=2,`${context}: spans the sheet`);
     // Fieldsets may serialize repeat() instead of resolved tracks: measure their actual fields.
     const columns=width<=700?1:2,expectedFieldWidth=(g.contentWidth-g.gap*(columns-1))/columns;
     const field=g.fields[0];assert.ok(field,`${context}: has an editable field`);
     if(Math.abs(field.width-expectedFieldWidth)>2){
      console.log('Grouped field geometry diagnostics',JSON.stringify({context,expectedFieldWidth,...g}));
      await page.screenshot({path:path.join(screenshotDir,`grouped-columns-${id}-${engine.name()}-${width}.png`),fullPage:true});
     }
     assert.ok(Math.abs(field.width-expectedFieldWidth)<=2,`${context}: expected ${columns} columns, field=${field.width}, expected=${expectedFieldWidth}, template=${g.template}`);
    }
    for(let i=1;i<layout.groups.length;i++)assert.ok(layout.groups[i].top>=layout.groups[i-1].bottom&&layout.groups[i].top-layout.groups[i-1].bottom<45,`${id}: ordered groups without empty rows`);
    if(id==='laborForm'){
     const combo=page.locator('.smart-combobox:has(select[name=projectKey])');
     await combo.locator('input').click();
     const list=page.locator('.smart-combobox-list[data-open="1"]');
     assert.equal(await list.evaluate(el=>el.parentElement===document.body),true,'long project options escape the control clipping boundary');
     assert.match(await list.innerText(),/Без проекта — общехозяйственное начисление/);
     await list.locator('.combobox-option').first().click();
     assert.equal(await list.count(),0,'selection closes the portal');
    }
    if(id==='dealForm'){
     assert.equal(layout.groups[0].title,'Основные данные');
     assert.equal(await page.locator('#dealCalc').isVisible(),false,'legacy VAT note does not duplicate explicit summary');
     assert.equal(await page.locator('[name=vatRate]').evaluate(el=>el.closest('fieldset')===document.querySelector('[name=contractTotal]').closest('fieldset')),true);
     await page.locator('[name=contractTotal]').fill('1220');
     await page.locator('[name=vatRate]').evaluate(el=>{el.value='22';el.dispatchEvent(new Event('change',{bubbles:true}));});
     assert.equal(await page.locator('[name=vatAmount]').inputValue(),'220.00');
     assert.ok(await page.evaluate(()=>window.controlChanges>0));
     await page.screenshot({path:path.join(screenshotDir,`grouped-deal-${engine.name()}-${width}.png`),fullPage:true});
    }
   }
   await page.close();
  }}finally{await browser.close()}
 }
});

const interfaceSource=fs.readFileSync(path.join(app,'interface.js'),'utf8');
const warehouseRoutine=interfaceSource.slice(interfaceSource.indexOf(' function warehouseViews(){'),interfaceSource.indexOf(' const names={'));
test('warehouse receipt actions share a compact toolbar and retain click handlers',async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{for(const width of [390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:950}});
   await page.setContent(`<style>${styles}</style><body class="ab-ready ui-modern ux-app"><section id="materials" class="active"><div id="warehouseApp"><div class="card" id="arbatWarehouseIntro"><h2>Поступления</h2><p>Загрузка УПД, накладных и заказов, а также ручное оформление поступления.</p><div class="whbar"><button id="receipt" class="primary">+ Оформить приход</button></div><button id="obligations">Обязательства / оплаты</button></div></div></section></body>`);
   await page.evaluate(routine=>{
    const $=id=>document.getElementById(id),warehouse=$('warehouseApp'),sessionStorage={getItem:()=> 'materials:receipt'};let warehouseMode='';
    window.actionClicks=0;$('receipt').onclick=$('obligations').onclick=()=>window.actionClicks++;
    eval(routine+';warehouseViews();warehouseViews();');
   },warehouseRoutine);
   assert.equal(await page.locator('#arbatWarehouseIntro .ui-toolbar-actions>button').count(),2);
   const first=await page.locator('#receipt').boundingBox(),second=await page.locator('#obligations').boundingBox();
   if(width>=768)assert.ok(Math.abs(first.y-second.y)<2,'desktop and tablet actions stay in one row');
   assert.ok(second.x+second.width<=width+1,'actions remain inside viewport');
   await page.locator('#receipt').click();await page.locator('#obligations').click();
   assert.equal(await page.evaluate(()=>window.actionClicks),2);
   await page.screenshot({path:path.join(screenshotDir,`warehouse-toolbar-${engine.name()}-${width}.png`),fullPage:true});
   await page.close();
  }}finally{await browser.close()}
 }
});
