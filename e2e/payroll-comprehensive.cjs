/* Real application, isolated local state. Authentication/sync are stubbed; every remote request is denied. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'..');

function fixture(){
 const org='АИР-КЛИМАТ',date=new Date().toISOString().slice(0,10),projectKey=org+'::1C#PAYROLL-E2E';
 const state=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles','leaveEvents'].map(key=>[key,[]]));
 return {...state,dealPlans:{},
  deals:[{_id:'payroll-project',org,date,order1c:'PAYROLL-E2E',name:'PAYROLL проект',dir:'Кондиционирование',contractTotal:10000,cost:2000,vatRate:0}],
  people:[{_id:'person-original-row',id:'person-original',name:'PAYROLL Исторический монтажник',position:'Монтажник',expenseType:'production',status:'Трудовой договор',workStatus:'Работает',hireDate:'2020-01-01',annualLeaveDays:28},{_id:'person-current-row',id:'person-current',name:'PAYROLL Новый монтажник',position:'Монтажник',expenseType:'production',status:'Трудовой договор',workStatus:'Работает',hireDate:'2020-01-01',annualLeaveDays:28}],
  crews:[{id:'payroll-crew',name:'PAYROLL Бригада',active:true,memberIds:['person-original'],leadId:'person-original'}],
  priceCatalog:[{id:'payroll-price',priceCode:'payroll-price',name:'PAYROLL выполненная работа',section:'Монтаж',unit:'шт',rate:100,effectiveFrom:'2020-01-01'}],
  workActs:[{id:'payroll-work',org,date,projectKey,crewId:'payroll-crew',crewName:'PAYROLL Бригада',memberIds:['person-original'],leadId:'person-original',priceId:'payroll-price',priceName:'PAYROLL выполненная работа',section:'Монтаж',unit:'шт',rate:100,qty:2,note:'Исходное примечание',status:'approved'}],
  labor:[{_id:'payroll-accrual',org,date,personId:'person-original',name:'PAYROLL Исторический монтажник',amount:1000,ndfl:130,employerContributions:300,expenseType:'production',accrualType:'salary'}],
  cash:[{_id:'payroll-cash',org,date,type:'out',personId:'person-original',counterparty:'PAYROLL Исторический монтажник',amount:870,walletId:'payroll-wallet',payrollPayment:true}],
  wallets:[{id:'payroll-wallet',org,name:'PAYROLL счёт',verified:true,openingBalance:2000}],
  crewSettlements:[{id:'payroll-settlement',cashId:'payroll-cash',personId:'person-original',amount:870}],
  leaveEvents:[{id:'payroll-leave',personId:'person-original',type:'leave',startDate:'2025-01-01',endDate:'2025-01-02'}]
 };
}

test('real payroll workflow preserves historical work snapshots and blocks employee bulk deletion', {timeout:180000},async()=>{
 const server=http.createServer(async(req,res)=>{
  try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file))}catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{for(const engine of [chromium,webkit]){
  const browser=await engine.launch({headless:true});
  try{for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:932},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   const label=engine.name()+' '+width;
   try{
    page.on('pageerror',error=>errors.push(error.stack||error.message));
    await context.route('**/*',route=>{
     const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
     if(url.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready"); /* isolated authenticated shell */'});
     if(['/app/sync.js','/app/profile.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:'/* offline fixture: no remote state writes */'});
     return route.continue();
    });
    await context.addInitScript(data=>{
     localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data));
     localStorage.setItem('arbat-warehouse-v1',JSON.stringify({items:[],folders:[],places:[],moves:[],plans:[],projectIssues:[],imports:[]}));
    },fixture());
    await page.goto(origin+'/app/',{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.arbatNavigate==='function'&&typeof window.arbatPriceForDate==='function');

    // Simulate the directories changing after an approved work snapshot was recorded.
    // The actual row click, edit form and save handler below remain untouched.
    await page.evaluate(()=>{
     db.priceCatalog.find(price=>price.id==='payroll-price').rate=250;
     const crew=db.crews.find(crew=>crew.id==='payroll-crew');
     crew.memberIds=['person-current'];crew.leadId='person-current';
     window.render();window.arbatNavigate('work');
    });
    await page.locator('#work [role=tab][data-pane=work]').click();
    await page.locator('#work details > summary').click();
    const work=page.locator('#workActsList tbody tr[data-arbat-work-id="payroll-work"]');
    await work.waitFor({state:'visible'});
    await work.getByText('PAYROLL выполненная работа',{exact:true}).click();
    const editor=page.locator('#workEditModal.open');
    await editor.waitFor({state:'visible'});
    assert.equal(await editor.locator('[name=note]').inputValue(),'Исходное примечание',label+': actual work row opens its stored document');
    await editor.locator('[name=note]').fill('PAYROLL изменено только примечание');
    await editor.locator('button[type=submit]').click();
    await editor.waitFor({state:'hidden'});
    await page.waitForFunction(()=>db.workActs.find(work=>work.id==='payroll-work')?.note==='PAYROLL изменено только примечание');
    const saved=await page.evaluate(()=>{
     const live=db.workActs.find(work=>work.id==='payroll-work'),persisted=JSON.parse(localStorage.getItem('arbat-finance-demo-live')).workActs.find(work=>work.id==='payroll-work');
     const fields=work=>({id:work.id,note:work.note,rate:work.rate,qty:work.qty,memberIds:work.memberIds,leadId:work.leadId,priceId:work.priceId});
     return {live:fields(live),persisted:fields(persisted),currentRate:db.priceCatalog.find(price=>price.id==='payroll-price').rate,currentMembers:db.crews.find(crew=>crew.id==='payroll-crew').memberIds};
    });
    const expected={id:'payroll-work',note:'PAYROLL изменено только примечание',rate:100,qty:2,memberIds:['person-original'],leadId:'person-original',priceId:'payroll-price'};
    assert.deepEqual(saved.live,expected,label+': note-only save keeps the historical crew/rate');
    assert.deepEqual(saved.persisted,expected,label+': saved local finance document keeps the snapshot');
    assert.equal(saved.currentRate,250);assert.deepEqual(saved.currentMembers,['person-current']);

    await page.evaluate(()=>window.arbatNavigate('labor'));
    await page.locator('#labor [role=tab][data-employee-pane=directory]').click();
    const employee=page.locator('#personTable tbody tr[data-arbat-id="person-original-row"]');
    await employee.waitFor({state:'visible'});
    await employee.locator('input.arbat-bulk-select').check();
    await page.evaluate(()=>{
     window.payrollBeforeProtectedDelete={live:JSON.stringify(db),persisted:localStorage.getItem('arbat-finance-demo-live')};
    });
    await page.locator('#personTable .arbat-bulk-toolbar').getByRole('button',{name:'Удалить выбранные записи',exact:true}).click();
    const confirmation=page.locator('.arbat-delete-alert [role=alertdialog]');
    await confirmation.waitFor({state:'visible'});
    await confirmation.getByRole('button',{name:'Удалить',exact:true}).click();
    const warning=page.locator('#appNoticeModal.open');
    await warning.waitFor({state:'visible'});
    assert.match(await warning.locator('#appNoticeText').innerText(),/Не работает/,label+': protected deletion explains how to retain history');
    const retention=await page.evaluate(()=>({live:JSON.stringify(db)===window.payrollBeforeProtectedDelete.live,persisted:localStorage.getItem('arbat-finance-demo-live')===window.payrollBeforeProtectedDelete.persisted}));
    assert.deepEqual(retention,{live:true,persisted:true},label+': employee, salary, cash, leave and production history remain unchanged');
    await warning.getByRole('button',{name:'Понятно',exact:true}).click();
    assert.equal(await employee.count(),1,label+': protected employee remains in the actual directory');
    assert.deepEqual(errors,[],label+': no application page errors');
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(root,'test-results',`payroll-history-${engine.name()}-${width}.png`),fullPage:true});
   }finally{await context.close()}
  }}finally{await browser.close()}
 }}finally{await new Promise(resolve=>server.close(resolve))}
});
