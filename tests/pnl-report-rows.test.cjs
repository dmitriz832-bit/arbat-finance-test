const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
test('monthly P&L report includes complete EBITDA bridge',()=>{
 for(const name of ['ВАЛОВАЯ ПРИБЫЛЬ','Общепроизводственные расходы','Коммерческие расходы — всего','Административные расходы — всего','EBITDA','Доходы ниже EBITDA','Расходы ниже EBITDA','ИТОГОВЫЙ УПРАВЛЕНЧЕСКИЙ РЕЗУЛЬТАТ'])assert.ok(html.includes("reportRow('"+name+"'"),name);
});
