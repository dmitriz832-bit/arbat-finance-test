const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261017180000_harden_remaining_table_grants.sql'),'utf8');
test('remaining protected tables cannot be truncated by client roles',()=>{
 assert.match(sql,/REVOKE TRUNCATE, REFERENCES, TRIGGER/);
 for(const table of ['allowed_emails','salary_accruals','user_preferences'])assert.ok(sql.includes('public.'+table));
 assert.match(sql,/FROM anon, authenticated/);
});
test('employee preferences and admin salary writes retain row-level privileges',()=>{
 assert.doesNotMatch(sql,/REVOKE INSERT, UPDATE, DELETE ON TABLE public.salary_accruals FROM authenticated/);
 assert.doesNotMatch(sql,/REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_preferences FROM authenticated/);
 assert.match(sql,/REVOKE INSERT, UPDATE, DELETE ON TABLE public.allowed_emails FROM authenticated/);
});
