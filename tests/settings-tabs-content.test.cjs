const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../app/interface.js'),'utf8');
const interfaceCss=fs.readFileSync(path.join(__dirname,'../app/interface.css'),'utf8');
const dashboard=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');

test('settings tabs are bound to semantic controls instead of card positions',()=>{
 const expected=[
  ['Финансовые периоды','periodCloseForm'],['Контрагенты','counterpartyForm'],['Счета и кассы','walletForm'],
  ['Статьи ДДС','articlesTable'],['Статьи ОПиУ','pnlArticleForm'],['Резервные копии','export']
 ];
 for(const [label,id] of expected){assert.ok(ui.includes("'"+label+"'"),label);assert.match(ui,new RegExp("(?:cardFor\\('"+id+"'\\)|\\$\\('"+id+"'\\)\\?\\.closest)"),id)}
 assert.doesNotMatch(ui,/settingsCards\[\d+\]/,'settings must not depend on card order');
 assert.doesNotMatch(ui,/\['data','Данные'/,'generic technical tab label must not be exposed');
});

test('tax cards use visible dashboard containers rather than globally hidden page sections',()=>{
 assert.match(dashboard,/dashboard-tax-company/);
 assert.doesNotMatch(dashboard,/dashboard-tax-grid"><section>/);
});

test('updated UI assets have cache-busting versions and fresh finance core loads before dashboard',()=>{
 for(const asset of ['interface.css?v=13','dashboard.css?v=6','interface.js?v=12','business-system.js?v=14','dashboard.js?v=16','auth.js?v=8'])assert.ok(html.includes(asset),asset);
 const freshCore=html.lastIndexOf('finance-core.js?v=7'),dashboardScript=html.indexOf('dashboard.js?v=16');
 assert.ok(freshCore>=0&&freshCore<dashboardScript);
});

test('bank import exposes DDS article selectors without horizontal table scrolling',()=>{
 assert.doesNotMatch(ui,/#reportTable,#bankImportPreview/);
 assert.match(ui,/tableObserver\.observe\(sheetBody/);
 assert.match(interfaceCss,/#bankImportPreview table\.ui-data-cards>tbody>tr>td/);
 assert.match(interfaceCss,/\.ui-sheet:has\(#bankCsvFile\)\{width:min\(1180px/);
 assert.match(html,/bankImportPreview[\s\S]*classList\.add\('ui-data-cards'\)/);
});

