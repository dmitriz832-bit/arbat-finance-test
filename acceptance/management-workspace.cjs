/* Source-backed read-only workspaces; no production records or remote APIs. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');
test('management workspaces reconcile companies, drill into original documents and refresh without posting',async()=>{
 for(const engine of process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit]){const browser=await engine.launch();try{for(const width of [375,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><body><select id="orgFilter"><option value="">Все</option><option>АИР-КЛИМАТ</option></select><main id="host"></main></body></html>');
  await page.addStyleTag({content:await fs.readFile(path.join(root,'app/management-workspace.css'),'utf8')});
  await page.evaluate(()=>{window.db={people:[{id:'person',name:'Общий исполнитель'}],labor:[{personId:'person',org:'АИР-КЛИМАТ',amount:100}],cash:[{personId:'person',org:'АРБАТ.ГК',type:'out',amount:100,date:'2026-10-26'}],expenses:[{_id:'e',org:'АИР-КЛИМАТ',amount:250,date:'2026-10-26',paymentDueDate:'2026-10-27',note:'Накладная № 1'}],calendar:[{id:'alias',org:'АИР-КЛИМАТ',supplierDocumentKey:'expenses:e',dueDate:'2026-10-27',amount:250}]};window.original=JSON.stringify(window.db);window.arbatOpenPayables=key=>window.opened=key;window.arbatNavigate=route=>window.route=route;window.render=()=>{};});
  for(const file of ['finance-core.js','payables-model.js','liquidity-model.js','management-workspace-model.js','management-workspace.js'])await page.addScriptTag({content:await fs.readFile(path.join(root,'app',file),'utf8')});
  await page.evaluate(()=>{window.workspace=ArbatManagementWorkspace.mount('#host',{today:'2026-10-26'});});
  assert.match(await page.locator('.management-cards').innerText(),/100,00/);
  await page.getByRole('tab',{name:'Исполнители'}).click();assert.match(await page.getByRole('tabpanel').innerText(),/Общий исполнитель/);assert.equal(await page.getByRole('tabpanel').locator('tbody tr').count(),2);
  await page.getByRole('tab',{name:'Поставщики'}).click();await page.getByRole('button',{name:'Накладная № 1',exact:true}).click();assert.equal(await page.evaluate(()=>window.opened),'expenses:e');
  await page.getByRole('button',{name:'Открыть ДДС',exact:true}).click();assert.equal(await page.evaluate(()=>window.route),'cash');
  await page.locator('[name=managementOrg]').selectOption('АИР-КЛИМАТ');await page.getByRole('tab',{name:'Исполнители'}).click();assert.equal(await page.getByRole('tabpanel').locator('tbody tr').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.db)===window.original),true);
  await page.evaluate(()=>{window.workspace.destroy();window.workspace=ArbatManagementWorkspace.mount('#host',{view:'planning',today:'2026-10-26'});});
  assert.match(await page.locator('.management-content').innerText(),/Явно связанных правил календаря: 1/);assert.equal(await page.locator('tbody tr').count(),1);
  await page.evaluate(()=>{window.db.expenses[0].amount=300;window.dispatchEvent(new Event('arbat:cloud-update'));});assert.match(await page.locator('tbody').innerText(),/300,00/);
  await page.evaluate(()=>{window.workspace.destroy();window.workspace=ArbatManagementWorkspace.mount('#host',{view:'reports',today:'2026-10-26'});});
  assert.match(await page.locator('.management-cards').innerText(),/100,00/);await page.locator('[name=managementPeriod]').fill('2026-09');assert.match(await page.locator('.management-cards').innerText(),/0,00/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close()}}
});
