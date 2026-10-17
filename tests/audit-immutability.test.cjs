const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261018_immutable_staff_activity.sql'),'utf8');
test('staff activity is append only even for privileged writes',()=>{assert.match(sql,/before update or delete on public\.staff_activity/i);assert.match(sql,/raise exception 'Audit events are immutable/);});
test('ordinary users cannot truncate or rewrite historical audit events',()=>{assert.match(sql,/revoke update, delete, truncate on public\.staff_activity from anon, authenticated/);});
test('audit event correction is a separate record, not an update',()=>{assert.match(sql,/Create a new corrective event instead/);});
