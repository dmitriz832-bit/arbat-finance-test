const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../app/interface.js'),'utf8');
const dashboard=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');

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

