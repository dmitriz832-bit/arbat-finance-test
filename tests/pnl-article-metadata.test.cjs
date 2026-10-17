const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../app/index.html'),'utf8');
test('P&L article form exposes mandatory accounting metadata',()=>{
 for(const name of ['type','level','dir','projectKey','allocationRule','validFrom','validTo'])
   assert.match(html,new RegExp('<(?:input|select)[^>]*name="'+name+'"'));
});
test('P&L article validity and immutable expense classification are enforced',()=>{
 assert.ok(html.includes("x.validFrom>x.validTo"));
 assert.ok(html.includes("a.validFrom&&x.date<a.validFrom"));
 for(const field of ['pnlType','pnlLevel','pnlAllocationRule'])assert.ok(html.includes('x.'+field+'='));
});
