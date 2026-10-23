/* Regression for the production CSS cascade, isolated from remote/auth state. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const app=path.resolve(__dirname,'../app'),html=fs.readFileSync(path.join(app,'index.html'),'utf8');
const styles=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*href="([^"?]+)[^"]*"[^>]*>/g)].map(m=>m[1]??fs.readFileSync(path.resolve(app,m[2]),'utf8')).join('\n');
const cells=Array.from({length:8},(_,i)=>`<td data-column-label="Поле ${i}">Длинное название документа и значение ${i}</td>`).join('');
const table=`<table class="arbat-resizable ux-register-table" style="--arbat-table-width:2800px"><colgroup>${'<col style="width:350px">'.repeat(8)}</colgroup><thead><tr>${'<th>Заголовок</th>'.repeat(8)}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
test('dashboard grid and warehouse viewports respect device width and sidebar state',async()=>{
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch();
  try{for(const width of [390,768,1024,1280,1440,1870,2560]){
   const page=await browser.newPage({viewport:{width,height:950}});
   await page.setContent(`<style>${styles}</style><body class="ab-ready ui-modern ux-app"><div class="layout"><aside class="sidebar"></aside><div class="content"><main class="wrap"><section id="overview" class="active"><div class="dashboard-layout">${['finance','flow','spend','wallet','tax','project','sales','warehouse'].map(x=>`<article class="dashboard-panel dashboard-${x}-panel">${x}</article>`).join('')}</div></section><section id="warehouseApp" class="active"><div class="card"><div id="whImportHistory" class="scroll">${table}</div></div><div class="card"><div id="whMovements" class="whtable">${table}</div></div></section></main></div></div></body>`);
   for(const collapsed of [false,true]){
    await page.locator('.layout').evaluate((el,value)=>el.classList.toggle('collapsed',value),collapsed);
    const columns=await page.locator('.dashboard-layout').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns,width<=1100?1:2,`${engine.name()} ${width}: intended dashboard columns`);
    for(const id of ['whImportHistory','whMovements']){
     const bounds=await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.card').getBoundingClientRect();el.scrollLeft=10000;return {right:r.right,parent:p.right,width:el.clientWidth,scroll:el.scrollWidth,left:el.scrollLeft,overflow:getComputedStyle(el).overflowX}});
     assert.ok(bounds.right<=width+1&&bounds.right<=bounds.parent+1,`${engine.name()} ${width} collapsed=${collapsed}: ${id} remains inside card`);
     if(width>1100){assert.equal(bounds.overflow,'auto');assert.ok(bounds.scroll>bounds.width&&bounds.left>0,'rightmost desktop columns are reachable');}
     else assert.ok(bounds.scroll<=bounds.width+2,`${id}: desktop widths reset on tablet/mobile`);
    }
   }
   await page.close();
  }}finally{await browser.close()}
 }
});
