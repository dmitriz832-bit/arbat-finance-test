const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
test('owner dashboard exposes incomplete leave source data',()=>{
  assert.match(js,/staffMissingHire=activePeople\.filter\(item=>!item\.hireDate\)\.length/);
  assert.match(js,/staffMissingLeaveNorm=activePeople\.filter/);
  assert.match(js,/Отпуска нельзя подтвердить/);
  assert.match(js,/сотрудников без даты приёма/);
  assert.match(html,/dashboard\.js\?v=13/);
});
