const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261018_shared_state_revision_audit.sql'),'utf8');
test('finance and warehouse mutations append state audit events in same transaction',()=>{assert.match(sql,/after update of payload on public\.finance_state/);assert.match(sql,/after update of payload on public\.warehouse_state/);assert.match(sql,/insert into public\.staff_activity/);});
test('audit exposes affected sections and revisions rather than original confidential data',()=>{assert.match(sql,/revision_before/);assert.match(sql,/revision_after/);assert.match(sql,/sections/);assert.doesNotMatch(sql,/to_jsonb\(new\.payload\)/i);});
test('no audit event is written for unchanged payload',()=>assert.match(sql,/new\.payload is not distinct from old\.payload/));
