const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
for(const engine of (process.env.ARBAT_BROWSER==='chromium'?[chromium]:[chromium,webkit]))test('registered asset balance shows missing monthly postings, historical cutoff and orphan source drilldown — '+engine.name(),async()=>{
 const names=['finance-core','financial-payment-links','payables-model','tax-register-model','loan-workspace-model','asset-workspace-model','balance-workspace-model','balance-workspace'];
 const html='<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/balance-workspace.css"><main id="host"></main>'+names.map(n=>'<script src="/app/'+n+'.js"></script>').join('');
 const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(await fs.readFile(path.join(root,req.url)))}catch{res.writeHead(404);res.end('missing')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:375,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   window.db={fixedAssets:[{_id:'asset',org:'АИР-КЛИМАТ',name:'Проверяемый станок',cost:'100.01',liquidationValue:'10',inServiceDate:'2026-01-01',usefulLifeMonths:3,boughtEarlier:true}],costs:[]};window.calls=[];
   window.workspace=ArbatBalanceWorkspace.mount(document.querySelector('#host'),{getData:()=>db,getWarehouse:()=>({}),getOrg:()=> 'АИР-КЛИМАТ',today:'2026-03-31',openSource:(collection,id)=>calls.push({collection,id})});window.initial=JSON.stringify(db);
  });
  await page.getByRole('button',{name:'Имущество: остаточная стоимость',exact:true}).click();
  const detail=page.getByRole('region',{name:'Расшифровка статьи'});assert.match(await detail.innerText(),/100,01 ₽/);assert.match(await detail.innerText(),/Не проведена амортизация.*2026-02, 2026-03/);assert.match(await detail.innerText(),/Полная сумма требует сверки/);assert.equal(await page.evaluate(()=>JSON.stringify(db)===initial),true);
  await page.getByRole('button',{name:'Проверяемый станок',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls),[{collection:'fixedAssets',id:'asset'}]);
  await page.evaluate(()=>{ArbatAssetWorkspaceModel.post(db,'asset','2026-02',{org:'АИР-КЛИМАТ',confirmed:true});workspace.refresh()});assert.match(await detail.innerText(),/70,01 ₽/);assert.match(await detail.innerText(),/Не проведена амортизация за месяцы: 2026-03/);
  await page.evaluate(()=>{ArbatAssetWorkspaceModel.post(db,'asset','2026-03',{org:'АИР-КЛИМАТ',confirmed:true});workspace.refresh()});assert.match(await detail.innerText(),/40,01 ₽/);assert.doesNotMatch(await detail.innerText(),/Полная сумма требует сверки/);
  await page.evaluate(()=>{Object.assign(db.costs[1],{amount:'99',amountNet:'99',amountGross:'99'});workspace.refresh()});assert.match(await detail.innerText(),/Полная сумма требует сверки/);
  await page.getByLabel('Состояние на дату',{exact:true}).fill('2026-02-28');await page.getByLabel('Состояние на дату',{exact:true}).dispatchEvent('change');assert.match(await detail.innerText(),/70,01 ₽/);assert.doesNotMatch(await detail.innerText(),/Полная сумма требует сверки/);
  await page.evaluate(()=>{db.costs.push({_id:'orphan-interest',org:'АИР-КЛИМАТ',date:'2026-02-20',amount:'1',sourceLoanId:'absent',pnlLevel:'below',pnlType:'expense'});workspace.refresh()});
  await page.getByRole('button',{name:'Кредиты: основной долг',exact:true}).click();assert.match(await detail.innerText(),/Начисление ссылается на отсутствующий/);await detail.getByRole('button',{name:'Открыть источник →',exact:true}).click();assert.deepEqual((await page.evaluate(()=>calls)).at(-1),{collection:'costs',id:'orphan-interest'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
});
