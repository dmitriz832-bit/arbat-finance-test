const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sync=fs.readFileSync(path.join(__dirname,'../app/sync.js'),'utf8');
const security=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017170000_lock_shared_state_table_grants.sql'),'utf8');
test('sync writes only via server RPC with revision compare-and-swap',()=>{
 assert.match(sync,/api\('rpc\/update_shared_state_batch'/);
 assert.match(sync,/expected_revision:rev\[T\[i\]\]/);
 assert.match(sync,/store:i===0\?'finance':'warehouse'/);
 assert.match(sync,/if\(!response\.ok\)throw Error/);
 assert.doesNotMatch(sync,/method:\s*'PATCH'|method:\s*'DELETE'|method:\s*'PUT'/);
});
test('revoked direct write privileges preserve selected read pathway',()=>{
 assert.match(security,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/);
 assert.doesNotMatch(security,/REVOKE SELECT[^;]*FROM anon, authenticated/);
 assert.match(sync,/table\+'\?select=payload,revision&id=eq\.main'/);
});
