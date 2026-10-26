const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/finance-core.js');
test('month and quarter end are valid calendar dates including leap years',()=>{
 for(const [mode,ref,end] of [['month','2026-02-10','2026-02-28'],['month','2024-02-10','2024-02-29'],['quarter','2026-05-10','2026-06-30'],['quarter','2026-08-10','2026-09-30']]) assert.equal(core.ownerPeriodBounds(mode,ref).to,end);
});
