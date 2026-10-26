/* Production markup and handlers with isolated finance data; no remote reads/writes. */
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..'),app=path.join(root,'app');
const modalStyles=fs.readFileSync(path.join(app,'modal-system.css'),'utf8');
function fixture(){
 const org='АИР-КЛИМАТ',date='2026-10-22',projectKey=org+'::1C#MODAL-1';
 const db=Object.fromEntries(['cash','costs','crews','deals','labor','people','wallets','articles','calendar','expenses','workActs','materials','workBatches','costArticles','priceCatalog','priceHistory','priceImports','realizations','counterparties','employeeEvents','crewSettlements','pnlArticles','vatAdvanceEvents','taxObligationEvents'].map(key=>[key,[]]));
 Object.assign(db,{dealPlans:{},deals:[{_id:'modal-project',name:'Проект проверки окон',org,order1c:'MODAL-1',contractTotal:120000,cost:30000,vatRate:0}],realizations:[{_id:'modal-sale',date,org,projectKey,amount:20000,vatRate:0,document:'Акт проверки окон'}],calendar:[{id:'modal-plan',name:'Оплата поставщику по договору',org,dueDate:date,type:'out',amount:1000,frequency:'once',active:'yes'}],wallets:[{id:'modal-wallet',name:'Основной расчётный счёт',org,openingBalance:10000,kind:'Расчётный счёт',verified:true}],counterparties:[{id:'modal-supplier',name:'Поставщик оборудования'}],people:[{id:'modal-person',name:'Иван Иванов',expenseType:'production',workStatus:'Работает'}],crews:[{id:'modal-crew',name:'Бригада проверки',leadId:'modal-person',memberIds:['modal-person']}],expenses:[{_id:'modal-expense',date,org,projectKey,category:'Подрядчики',amount:1000,vatRate:0,note:'Акт поставщика'}],cash:[{_id:'modal-payment',date,org,type:'out',walletId:'modal-wallet',amount:1000,customerId:'modal-supplier',note:'Платёж поставщику'}]});
 return {finance:db,warehouse:{items:[{id:'modal-item',name:'Оборудование',unit:'шт'}],places:[{id:'modal-store',name:'Склад',org}],moves:[],projectIssues:[],plans:[],folders:[]}};
}
async function inspect(page,selector,width,name){
 const surface=page.locator(selector).last();await surface.waitFor({state:'visible'});
 const result=await surface.evaluate(el=>{
  const css=getComputedStyle(el),r=el.getBoundingClientRect(),heading=el.querySelector('h2,h3'),primary=[...el.querySelectorAll('button.primary,button[type=submit],[data-tax-pnl-save]')].find(x=>x.getBoundingClientRect().width>5),field=[...el.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].find(x=>x.getBoundingClientRect().width>5),b=primary&&getComputedStyle(primary),f=field&&getComputedStyle(field);
  return {width:r.width,left:r.left,right:r.right,client:el.clientWidth,scroll:el.scrollWidth,page:document.documentElement.scrollWidth,bg:css.backgroundColor,color:css.color,radius:css.borderTopLeftRadius,border:css.borderTopColor,font:css.fontFamily,heading:heading&&{size:getComputedStyle(heading).fontSize,weight:getComputedStyle(heading).fontWeight},primary:b&&{bg:b.backgroundColor,radius:b.borderTopLeftRadius,height:primary.getBoundingClientRect().height},field:f&&{tag:field.tagName,name:field.name,cssHeight:f.height,minHeight:f.minHeight,padding:f.padding,lineHeight:f.lineHeight,boxSizing:f.boxSizing,bg:f.backgroundColor,border:f.borderTopColor,radius:f.borderTopLeftRadius,height:field.getBoundingClientRect().height},overflowingLabels:[...el.querySelectorAll('label')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().width>5&&x.scrollWidth>x.clientWidth+2).map(x=>x.textContent.trim().slice(0,90))};
 });
 const context=`${width}px ${name}`;if(process.env.MODAL_DEBUG)console.log(context,JSON.stringify(result));
 assert.equal(result.bg,'rgb(255, 255, 255)',context+' white surface');assert.equal(result.color,'rgb(51, 51, 51)',context+' text');assert.equal(result.radius,'16px',context+' radius');assert.equal(result.border,'rgb(218, 221, 231)',context+' border');assert.match(result.font,/Source ?Sans ?Pro/i,context+' font');assert.ok(result.left>=-1&&result.right<=width+1,context+' fits viewport '+JSON.stringify(result));assert.ok(result.scroll<=result.client+2,context+' no surface overflow '+JSON.stringify(result));assert.ok(result.page<=width+2,context+' no page overflow');assert.deepEqual(result.overflowingLabels,[],context+' labels wrap');
 if(result.heading){assert.equal(result.heading.size,width<=700?'22px':'24px',context+' heading size');assert.equal(result.heading.weight,'500',context+' heading weight')}
 if(result.primary){assert.equal(result.primary.bg,'rgb(90, 118, 201)',context+' primary');assert.equal(result.primary.radius,'5px',context+' button radius');assert.ok(result.primary.height>=(width<=700?44:37),context+' button target')}
 if(result.field){assert.equal(result.field.bg,'rgb(255, 255, 255)',context+' white field');assert.equal(result.field.border,'rgb(229, 229, 229)',context+' field border');assert.equal(result.field.radius,'5px',context+' field radius');assert.equal(result.field.height,width<=700?44:34,context+' field height')}
 return surface;
}
test('all modal families share Fintablo surfaces, readable labels and unchanged cancellation at phone/tablet/desktop widths',async()=>{
 const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();
 try{for(const width of [375,768,1440]){
  const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/app/auth.js')return route.fulfill({contentType:'text/javascript',body:'document.body.classList.add("ab-ready")'});if(u.pathname==='/app/sync.js')return route.fulfill({body:''});return route.continue()});
  await context.addInitScript(data=>{localStorage.setItem('arbat-finance-demo-live',JSON.stringify(data.finance));localStorage.setItem('arbat-warehouse-v1',JSON.stringify(data.warehouse))},fixture());await page.goto(origin+'/app/');await page.addStyleTag({content:modalStyles});await page.evaluate(()=>document.body.classList.add('ft-app'));
  const baseline=await page.evaluate(()=>localStorage.getItem('arbat-finance-demo-live'));
  const cases=[
   ['deal','#dealModal>.modal',()=>page.evaluate(()=>showDealModal('modal-project')),'#cancelDealEdit'],
   ['generic','#genericModal>.modal',()=>page.evaluate(()=>openRecord('realizations','modal-sale')),'#genericCancel'],
   ['wallet','#walletModal>.modal',()=>page.evaluate(()=>showWallet('modal-wallet')),'#walletEditCancel'],
   ['calendar','#calendarModal>.modal',()=>page.evaluate(()=>editCalendar('modal-plan')),'#calendarModalCancel'],
   ['work','#workEditModal>.modal',()=>page.evaluate(()=>openWorkEdit('crew','modal-crew')),'#workEditCancel'],
   ['allocation','#allocModal>.modal',()=>page.evaluate(()=>allocOpen('modal-payment')),'#allocCancel'],
   ['batch','#batchModal>.modal',()=>page.evaluate(()=>document.getElementById('openBatch').click()),'#batchCancel'],
   ['warehouse','#whDialog>.whmodal',()=>page.evaluate(()=>{window.arbatNavigate('materials:catalog');document.getElementById('whNewMove').click()}),'#whCancel'],
   ['sheet','.ui-sheet',()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('arbat:open-document',{detail:{formId:'cashForm'}}))),'[data-sheet-cancel]'],
   ['period','.ux-preferences-dialog:has(#uxPeriodDialogTitle)',()=>page.evaluate(()=>document.getElementById('uxPeriodTrigger').click()),'.ux-preferences-dialog:has(#uxPeriodDialogTitle) button.primary'],
   ['wallet-order','.ux-preferences-dialog:has(#walletOrderTitle)',()=>page.evaluate(()=>{const b=document.createElement('button');b.dataset.walletOrder='';document.body.append(b);b.click();b.remove()}),'[data-order-cancel]'],
   ['table','.tp-dialog',async()=>{await page.evaluate(()=>window.arbatNavigate('cash'));await page.locator('#cash .tp-settings').first().click()},'.tp-actions button:last-child'],
   ['payables','#payablesDialog',()=>page.evaluate(()=>window.arbatOpenPayables('expenses:modal-expense')),'[data-pay-close]'],
   ['tax-register','#taxRegistersDialog',()=>page.evaluate(()=>{const b=document.createElement('button');b.dataset.openTaxRegister='obligations';document.body.append(b);b.click();b.remove();document.querySelector('#taxRegistersDialog [data-new]').click()}),'#taxRegistersDialog [data-close]'],
   ['tax-pnl','#taxPnlDialog',()=>page.evaluate(()=>{const b=document.createElement('button');b.dataset.taxPnlEdit='2026-10';b.dataset.taxPnlOrg='АИР-КЛИМАТ';document.body.append(b);b.click();b.remove()}),'[data-tax-pnl-close]'],
   ['shared-confirm','.ft-confirm-dialog',()=>page.evaluate(()=>{window.modalConfirmation=window.ArbatPopup.confirm('Проверка общего подтверждения')}),'.ft-popup-cancel'],
   ['profile','#ab-profile-window',()=>page.evaluate(()=>{window.abProfileReady({role:'employee',email:'fixture@example.test'});document.getElementById('ab-profile-open').click()}),'#ab-profile-close']
  ];
  for(const [name,selector,open,close] of cases){
   await open();const surface=await inspect(page,selector,width,name);
   if(['deal','sheet','tax-register','profile'].includes(name)){fs.mkdirSync(path.join(root,'test-results'),{recursive:true});await surface.evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(root,'test-results',`modal-system-${name}-${width}.png`)})}
   await page.locator(close).last().click();await surface.waitFor({state:'hidden'});if(name==='shared-confirm')assert.equal(await page.evaluate(()=>window.modalConfirmation),false,'confirmation Cancel resolves false');
  }
  await page.evaluate(()=>window.ArbatPopup.toast('Документ сохранён. Длинное сообщение переносится в пределах окна.',{duration:0}));
  const toast=page.locator('.ft-toast');await toast.waitFor({state:'visible'});const toastStyle=await toast.evaluate(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {background:c.backgroundColor,color:c.color,radius:c.borderTopLeftRadius,left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth,popover:el.parentElement.matches(':popover-open')}});assert.equal(toastStyle.background,'rgb(255, 255, 255)');assert.equal(toastStyle.color,'rgb(51, 51, 51)');assert.equal(toastStyle.radius,'5px');assert.ok(toastStyle.left>=0&&toastStyle.right<=width);assert.ok(toastStyle.scroll<=toastStyle.client+2);assert.equal(toastStyle.popover,true,'toast occupies the native top layer');await toast.locator('.ft-toast-close').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('arbat-finance-demo-live')),baseline,width+' cancellation keeps finance data');assert.deepEqual(errors,[],width+' no runtime errors');await context.close();
 }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
