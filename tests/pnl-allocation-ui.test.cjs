const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
test('overhead allocation form has 3 directional weights and exact 100 percent guard',()=>{
 assert.match(html,/name="allocationPercentages"/);
 assert.match(html,/weights\.reduce\(\(a,b\)=>a\+b,0\)!==10000/);
 assert.match(html,/x\.pnlAllocations=weights\.map/);
 assert.match(html,/delete x\.allocationPercentages/);
});
