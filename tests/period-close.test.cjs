const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261018_finance_period_lock.sql'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
test('closed-period integrity runs server side for finance state',()=>{assert.match(sql,/before update of payload on public\.finance_state/i);assert.match(sql,/except all/i);assert.match(sql,/status='closed'/i);assert.match(sql,/raise exception 'Financial period/i)});
test('period reopen is admin only with reason and audit',()=>{assert.match(sql,/role='admin'/);assert.match(sql,/length\(trim\(p_reason\)\)<10/);assert.match(sql,/finance_period_reopened/);assert.match(sql,/auth\.uid\(\)/)});
test('period register keeps closed and open status',()=>{assert.match(sql,/check\(status in \('open','closed'\)\)/);assert.match(sql,/enable row level security/);assert.match(ui,/id="periodCloseForm"/);assert.match(ui,/set_finance_period_status/)});
