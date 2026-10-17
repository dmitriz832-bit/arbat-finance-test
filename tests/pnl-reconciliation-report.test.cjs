const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
test('management report displays exact allocation reconciliation',()=>{
 for(const name of ['СВЕРКА — результат распределённых направлений','СВЕРКА — выручка без направления','СВЕРКА — прочие доходы без направления','СВЕРКА — расходы без направления','СВЕРКА — нераспределённый результат','СВЕРКА — расхождение с консолидированным ОПиУ'])
  assert.ok(html.includes("reportRow('"+name+"'"),name);
 assert.ok(html.includes('ArbatFinanceCore.directionReconciliation(reportInput,'));
});
