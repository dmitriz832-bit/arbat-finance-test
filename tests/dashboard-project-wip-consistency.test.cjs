const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dashboard=fs.readFileSync(path.join(__dirname,'../app/dashboard.js'),'utf8');

test('project dashboard separates accrued, recognized and WIP costs',()=>{
 assert.match(dashboard,/recognizedCost=wip\.status==='calculated'\?Number\(core\.rubles\(wip\.recognizedCost\)\):null/);
 assert.match(dashboard,/wipCost=wip\.status==='calculated'\?Number\(core\.rubles\(wip\.wip\)\):null/);
 for(const label of ['Начислено / признано','НЗП','признано '])assert.ok(dashboard.includes(label));
 assert.match(dashboard,/rub\(item\.wipCost\)/);
});
