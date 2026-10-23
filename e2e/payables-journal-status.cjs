const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
test('journal settlement badges remain explicit and current for expenses, costs, receipt lines and imports',async()=>{
 const browser=await chromium.launch();
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:932}});
  await page.route('http://payables.test/**',route=>route.fulfill({contentType:'text/html',body:'<body class="ab-ready ui-modern"><main class="content"></main></body>'}));
  await page.goto('http://payables.test/');
  await page.evaluate(()=>{
   const expense=(id)=>({_id:id,org:'A',amount:100,note:'Одинаковый документ — длинное основание '.repeat(8)});
   window.db={expenses:['paid','partial','unpaid'].map(expense),costs:[expense('cost')],cash:[{_id:'p',org:'A',type:'out',amount:250,supplierAllocations:[{documentKey:'expenses:paid',amount:100},{documentKey:'expenses:partial',amount:50},{documentKey:'costs:cost',amount:100}]}]};
   window.render=()=>{};window.ArbatLiquidity={};
   localStorage.setItem('arbat-warehouse-v1',JSON.stringify({moves:[{id:'r1',importId:'import',org:'A',kind:'receipt',qty:1,price:60},{id:'r2',importId:'import',org:'A',kind:'receipt',qty:1,price:40},{id:'transfer',org:'A',kind:'transfer',qty:1,price:100}]}));
   const table=(id,rows)=>'<div id="'+id+'"><table style="table-layout:fixed;width:100%"><thead><tr><th>Документ</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
   document.querySelector('main').innerHTML=table('expensesTable',db.expenses.map(x=>'<tr data-arbat-kind="expenses" data-arbat-id="'+x._id+'"><td>'+x.note+'</td></tr>').join(''))+table('costTable','<tr data-arbat-kind="costs" data-arbat-id="cost"><td>Общий расход</td></tr>')+table('whMovements',['r1','r2','transfer'].map(id=>'<tr data-wh-move="'+id+'"><td>Накладная</td></tr>').join(''))+table('whImportHistory','<tr data-import-id="import"><td>Импорт</td></tr>');
  });
  for(const name of ['finance-core.js','payables-model.js','payables.js'])await page.addScriptTag({path:path.join(root,'app',name)});
  await page.addStyleTag({path:path.join(root,'app/payables.css')});
  const expect=async(key,status,count=1)=>{await page.waitForFunction(({key,status,count})=>{const nodes=[...document.querySelectorAll('[data-pay-row]')].filter(n=>n.dataset.payRow===key);return nodes.length===count&&nodes.every(n=>n.dataset.payStatus===status&&n.textContent.includes(({paid:'Оплачено',partial:'Частично оплачено',unpaid:'Ожидает оплаты',review:'Требует сверки'})[status]))},{key,status,count})};
  await expect('expenses:paid','paid');await expect('expenses:partial','partial');await expect('expenses:unpaid','unpaid');await expect('costs:cost','paid');await expect('receipt:["A","import"]','unpaid',3);
  assert.equal(await page.locator('[data-wh-move="transfer"] [data-pay-row]').count(),0);
  assert.ok(await page.locator('[data-pay-row]').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)),'full status text wraps within narrow cells');
  // Preserve DOM nodes: the former skip-existing path left these statuses stale.
  await page.evaluate(()=>{window.originalBadge=document.querySelector('[data-pay-row="expenses:partial"]');db.cash[0].supplierAllocations[1].amount=100;db.cash[0].amount=300;window.dispatchEvent(new Event('arbat:cloud-update'))});
  await expect('expenses:partial','paid');assert.equal(await page.evaluate(()=>originalBadge===document.querySelector('[data-pay-row="expenses:partial"]')),true);
  await page.evaluate(()=>{db.cash=[];window.dispatchEvent(new Event('arbat:cloud-update'))});
  await expect('expenses:paid','unpaid');await expect('expenses:partial','unpaid');await expect('costs:cost','unpaid');
  await page.evaluate(()=>{db.cash=[{_id:'receipt-payment',org:'A',type:'out',amount:40,supplierAllocations:[{documentKey:'receipt:["A","import"]',amount:40}]}];window.dispatchEvent(new Event('arbat:cloud-update'))});
  await expect('receipt:["A","import"]','partial',3);
  await page.evaluate(()=>{db.cash[0].amount=100;db.cash[0].supplierAllocations[0].amount=100;window.dispatchEvent(new Event('arbat:cloud-update'))});await expect('receipt:["A","import"]','paid',3);
  await page.evaluate(()=>{db.cash[0].org='B';window.dispatchEvent(new Event('arbat:cloud-update'))});await expect('receipt:["A","import"]','review',3);
  await page.locator('[data-pay-row="expenses:unpaid"]').click();assert.match(await page.locator('#payablesDialog').innerText(),/Ожидает оплаты/);
  await page.close();
 }}finally{await browser.close()}
});
