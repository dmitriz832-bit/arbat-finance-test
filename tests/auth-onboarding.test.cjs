const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/staff-onboarding/index.ts'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../app/auth.js'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261018_auth_request_limits.sql'),'utf8');
test('onboarding never discloses whether the email is in staff allowlist',()=>{
 assert.match(edge,/if\(!allowed\?\.enabled\)return reply\(200,neutral\)/);
 assert.match(edge,/if\(action==="status"\)return reply\(200,\{mode:"login"\}\)/);
 assert.doesNotMatch(edge,/mode:firstLogin\?/);
});
test('server applies atomic limits to IP and email for first login and recovery',()=>{
 assert.match(edge,/consume_auth_request_limit/);
 assert.match(edge,/rateScope\+"-ip"/);
 assert.match(edge,/rateScope\+"-email"/);
 assert.match(edge,/return reply\(429/);
 assert.match(migration,/on conflict\(scope,identity_hash,window_start\) do update/);
});
test('rate limits cannot be bypassed through public RPC',()=>{
 assert.match(migration,/revoke all on function public\.consume_auth_request_limit.*from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.consume_auth_request_limit.*to service_role/);
 assert.match(migration,/enable row level security/);
});
test('client routes recovery to server handler',()=>{
 assert.match(client,/await onboarding\('recover'\)/);
 assert.doesNotMatch(client,/\/auth\/v1\/recover\?/);
});
