/* Offline application integration only. All non-local requests are denied. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function fixture(){
 const date=new Date().toISOString().slice(0,10),org='АИР-КЛИМАТ',projectKey=org+'::1C#AUDIT-20261017-browser',base={date,org};
 const state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','dealPlans','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements'].map(k=>[k,[]]));
 Object.assign(state,{
  deals:[{...base,_id:'AUDIT-20261017-browser',name:'AUDIT browser project',order1c:'AUDIT-20261017-browser',dir:'Кондиционирование',contractTotal:100000,cost:50000}],
  realizations:[{...base,_id:'AUDIT-sale',projectKey,amount:60000,document:'AUDIT-sale'}],
  expenses:[{...base,_id:'AUDIT-expense',projectKey,amount:10000}],
  workActs:[{...base,id:'AUDIT-act',projectKey,qty:1,rate:2000,status:'approved',memberIds:['AUDIT-person'],priceName:'AUDIT work'}],
  costs:[{...base,_id:'AUDIT-direction',dir:'Кондиционирование',amount:3000},{...base,_id:'AUDIT-common',amount:4000}],
  labor:[{...base,_id:'AUDIT-salary',personId:'AUDIT-person',expenseType:'administrative',amount:10000,ndfl:1300,employerContributions:3000}],
  people:[{id:'AUDIT-person',name:'AUDIT employee',expenseType:'administrative',annualLeaveDays:28}],
  wallets:[{id:'AUDIT-wallet',org,name:'AUDIT cash',verified:true,openingBalance:100}],
 });return state;
}
test('offline full application reconciles report, dashboard and project at desktop, tablet and phone widths',async()=>{
 const server=http.createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(rel.endsWith('/')?rel+'index.html':rel));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,1024,390]){
   const context=await browser.newContext({viewport:{width,height:1000}}),errors=[];
   await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(['/app/auth.js','/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* isolated offline test: no auth or remote state writes */'});return route.continue()});
   await context.addInitScript(data=>{localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data));localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[],folders:[],places:[],moves:[],plans:[],projectIssues:[],imports:[]}))},fixture());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app/',{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.arbatDashboardSnapshot==='function');
   const result=await page.evaluate(()=>{
    document.getElementById('reportYear').value=String(new Date().getFullYear());document.getElementById('reportType').value='pnl';
    const month=new Date().getMonth()+1,before=JSON.stringify(db.labor),report=reportData(),dash=window.arbatDashboardSnapshot(),deal=dealMargin(db.deals[0]);
    reportData();reportData();
    return {report:report.rows.find(x=>x[0]==='ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ')[month],dashboard:dash.totals.operating,card:deal.actualProfit,project:dash.projects[0].result,cost:projectCost(window.arbatDealKey(db.deals[0])),laborUnchanged:before===JSON.stringify(db.labor),financial:document.getElementById('dashboardFinancial')?.innerText};
   });
   assert.equal(errors.length,0,'JavaScript errors at '+width+': '+errors.join('; '));
   assert.equal(Number(result.report.replace(/[^\d,.-]/g,'').replace(',','.')),28000);
   assert.equal(result.dashboard,28000);assert.equal(result.card,48000);assert.equal(result.project,48000);assert.equal(result.cost,12000);assert.equal(result.laborUnchanged,true);assert.ok(result.financial?.includes('28'));
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
});
