const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const finance=require('../app/finance-core.js');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017160000_align_my_payroll_last_cent.sql'),'utf8');
test('server payroll migration preserves access restrictions',()=>{
 assert.match(migration,/SECURITY DEFINER/);
 assert.match(migration,/SET search_path TO ''/);
 assert.match(migration,/s\.user_id=auth\.uid\(\) and s\.enabled/);
 assert.match(migration,/Access denied/);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.my_payroll\(\)/);
});
test('server payroll uses final employee as remainder recipient',()=>{
 assert.match(migration,/position_in_crew=member_count then total_cents-\(total_cents\/member_count\)\*\(member_count-1\)/);
 assert.doesNotMatch(migration,/position_in_crew<=mod\(total_cents,member_count\)/);
 for(const [value,people] of [['100',3],['-1',3],['0.01',3],['10.02',4]]){
   const total=finance.cents(value),n=BigInt(people),share=total/n;
   const rpc=Array.from({length:people},(_,i)=>i===people-1?total-share*(n-1n):share);
   assert.deepEqual(rpc,finance.allocate(value,Array(people).fill(1)));
   assert.equal(rpc.reduce((a,b)=>a+b,0n),total);
 }
});
