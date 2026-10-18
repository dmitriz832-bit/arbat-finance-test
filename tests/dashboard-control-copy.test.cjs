const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
test('dashboard control explains the authoritative accounting method',()=>{
  assert.match(html,/выручка признаётся по реализации, расходы — по начислению, ДДС показывается отдельно/);
  assert.match(html,/Складские списания, утверждённые работы и начисления сотрудникам включаются в себестоимость через единый финансовый модуль/);
  assert.match(html,/считаются предварительными до устранения соответствующего контроля/);
  assert.doesNotMatch(html,/Складские списания и начисления работникам пока не создают автоматически расход проекта/);
  assert.doesNotMatch(html,/Это демо, не бухгалтерская система/);
});
