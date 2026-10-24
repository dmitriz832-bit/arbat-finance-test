const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../app/finance-periods.js');
test('year register explicitly distinguishes never-closed, closed, and reopened months',()=>{
 const rows=model.yearRows([{period:'2026-09',status:'closed',closed_at:'2026-10-01T00:00:00Z',closed_name:'Руководитель'},{period:'2026-08',status:'open',closed_at:'2026-09-01T00:00:00Z',reopened_at:'2026-10-02T00:00:00Z',reopened_name:'Бухгалтер',reopen_reason:'Исправление акта'}],2026);
 assert.equal(rows.length,12);assert.equal(rows[0].status,'open');assert.equal(rows[0].changedAt,null);assert.equal(rows[0].neverClosed,true);
 assert.equal(rows[8].status,'closed');assert.equal(rows[8].actor,'Руководитель');assert.equal(rows[8].changedAt,'2026-10-01T00:00:00Z');assert.equal(rows[8].reason,'');
 assert.equal(rows[7].actor,'Бухгалтер');assert.equal(rows[7].reason,'Исправление акта');assert.equal(rows[7].changedAt,'2026-10-02T00:00:00Z');
});
test('a later reclosure uses closing actor and date while retaining the last reopening reason',()=>{
 const r=model.yearRows([{period:'2026-09',status:'closed',closed_at:'2026-10-04T00:00:00Z',closed_name:'Директор',reopened_at:'2026-10-02T00:00:00Z',reopened_name:'Администратор',reopen_reason:'Пересчёт акта'}],2026)[8];
 assert.equal(r.actor,'Директор');assert.equal(r.changedAt,'2026-10-04T00:00:00Z');assert.equal(r.reason,'Пересчёт акта');
});
test('invalid responses never turn into an all-open register',()=>{
 for(const data of [null,{},[{period:'2026-09',status:'unknown'}],[{period:'2026-13',status:'closed'}],[{period:'2026-09',status:'closed'},{period:'2026-09',status:'open'}]])assert.throws(()=>model.yearRows(data,2026));
 assert.throws(()=>model.yearRows([],NaN));assert.throws(()=>model.yearRows([],0));
});
