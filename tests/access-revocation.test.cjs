const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/admin-invite-staff/index.ts'),'utf8');
test('revoke disables both access registers without deleting Auth user',()=>{
 assert.match(source,/from\("allowed_emails"\)\.update\(\{enabled:false/);
 assert.match(source,/from\("staff_access"\)\.update\(\{enabled:false\}\)/);
 assert.doesNotMatch(source,/auth\.admin\.deleteUser\(/);
 assert.doesNotMatch(source,/from\("allowed_emails"\)\.delete\(/);
 assert.doesNotMatch(source,/from\("staff_access"\)\.delete\(/);
});
test('revoke bans future authentication and retains auditable change',()=>{
 assert.match(source,/ban_duration:"876000h"/);
 assert.match(source,/event:"access_revoked"/);
 assert.match(source,/auth_user_preserved:true/);
});
test('regrant of previously revoked employee unbans account',()=>{
 assert.match(source,/ban_duration:"none"/);
});
