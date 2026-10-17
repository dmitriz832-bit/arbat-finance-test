const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017170000_lock_shared_state_table_grants.sql'),'utf8');
test('critical tables never grant direct client data writes or truncate',()=>{
 assert.match(sql,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
 for(const name of ['finance_state','warehouse_state','staff_access','staff_activity'])assert.ok(sql.includes('public.'+name));
 assert.match(sql,/FROM anon, authenticated/);
 assert.match(sql,/REVOKE SELECT ON TABLE[\s\S]*FROM anon/);
});
