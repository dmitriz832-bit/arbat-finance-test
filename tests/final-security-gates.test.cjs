const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const migrationDir=path.join(__dirname,'../supabase/migrations'),files=fs.readdirSync(migrationDir),sources=files.filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync(path.join(migrationDir,x),'utf8')).join('\n');
test('shared state mutations retain revision guard and server session check',()=>{
 assert.match(sources,/if not public\.has_active_finance_session\(\)/);
 assert.match(sources,/revision=p_expected_revision/);
});
test('all seven financial or staff RPCs are covered by live session security migration',()=>{
 const src=fs.readFileSync(path.join(migrationDir,'20261018_privileged_session_guards.sql'),'utf8');
 for(const name of ['claim_staff_access','my_payroll','set_finance_period_status','admin_set_staff','admin_staff_list','admin_people_list'])assert.match(src,new RegExp('function public\\.'+name+'\\(','i'),name);
 assert.match(fs.readFileSync(path.join(migrationDir,'20261018_live_session_rls.sql'),'utf8'),/create or replace function public\.update_shared_state/);
});
test('closed period and append-only activity protections remain in version control',()=>{
 assert.match(sources,/create trigger finance_closed_period_guard/);
 assert.match(sources,/create trigger staff_activity_immutable/);
 assert.match(sources,/create trigger finance_state_update_audit/);
 assert.match(sources,/create trigger warehouse_state_update_audit/);
});
