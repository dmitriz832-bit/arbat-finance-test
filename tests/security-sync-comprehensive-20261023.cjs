'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/sync.js'),'utf8');
const F='arbat-finance-demo-live',W='arbat-warehouse-v1',B='arbat-cloud-revision-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const wait=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function harness(finance={deals:[]},warehouse={items:[]},options={}){
 class Storage{constructor(data){this.data=data||new Map()}getItem(k){return this.data.has(k)?this.data.get(k):null}setItem(k,v){if(options.failRecoveryWrites&&String(k).startsWith('arbat-unsynced-recovery-v1:'))throw Error('Storage quota exceeded');this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
 const localStorage=new Storage(options.data),sessionStorage=new Storage(),events=[],messages=[],intervals=[],nodes=[],downloads=[];
 const element=()=>{const n={children:[],style:{},classList:{remove(){}},append(...children){this.children.push(...children)},remove(){this.removed=true},click(){this.onclick?.()}};nodes.push(n);return n};
 const card=element(),auth=element();auth.id='ab-auth';auth.querySelector=()=>card;
 let cloud=options.cloud?clone(options.cloud):[{payload:clone(finance),revision:1},{payload:clone(warehouse),revision:1}],postHook=null,getHook=null;
 const writes=[];
 if(!options.data){localStorage.setItem(F,JSON.stringify(finance));localStorage.setItem(W,JSON.stringify(warehouse));localStorage.setItem(B,JSON.stringify({finance_state:1,warehouse_state:1}))}
 const window={abIdentity:options.identity,abGetToken:async()=> 'mock-token',abMessage:x=>messages.push(x),dispatchEvent:e=>events.push(e),addEventListener(){}};
 const context={Storage,localStorage,sessionStorage,window,document:{body:{classList:{remove(){}},append(){}},createElement:element,getElementById:id=>nodes.find(n=>n.id===id&&!n.removed)||null,addEventListener(){}},Blob,URL:{createObjectURL:blob=>{downloads.push(blob);return 'blob:mock'},revokeObjectURL(){}},setTimeout(){},confirm:()=>true,location:{reload(){}},CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}},setInterval:fn=>intervals.push(fn),queueMicrotask,console,fetch:async(url,options)=>{
  const respond=x=>({ok:true,json:async()=>clone(x)});
  if(options.method==='GET'){const i=url.includes('warehouse_state')?1:0;const snapshot=clone(cloud[i]);if(getHook)await getHook(i);return respond([snapshot])}
  const body=JSON.parse(options.body);writes.push(body);if(postHook){const result=await postHook(body);if(result)return result}
  if(url.endsWith('/rpc/update_shared_state_batch')){
   const draft=clone(cloud),result={};
   for(const change of body.p_changes){const i=change.store==='finance'?0:1;if(change.expected_revision!==draft[i].revision)return {ok:false,json:async()=>({message:'revision conflict'})};draft[i]={payload:clone(change.payload),revision:draft[i].revision+1};result[change.store]=draft[i].revision}
   cloud=draft;return respond(result);
  }
  const i=body.p_store==='finance'?0:1;
  if(body.p_expected_revision!==cloud[i].revision)return {ok:false,json:async()=>({message:'revision conflict'})};
  cloud[i]={payload:clone(body.p_payload),revision:cloud[i].revision+1};return respond(cloud[i].revision);
 }};
 vm.runInNewContext(source,context);
 return {window,localStorage,events,messages,intervals,writes,nodes,downloads,setCloud:(i,payload)=>cloud[i]={payload:clone(payload),revision:cloud[i].revision+1},getCloud:i=>clone(cloud[i]),post:fn=>postHook=fn,get:fn=>getHook=fn,save:(key,payload)=>localStorage.setItem(key,JSON.stringify(payload)),read:key=>JSON.parse(localStorage.getItem(key))};
}
test('conflict recovery leaves merged documents in both cloud, local cache and update event',async()=>{
 const h=harness();await h.window.arbatCloudBoot();h.setCloud(0,{deals:[{_id:'remote'}]});h.save(F,{deals:[{_id:'local'}]});await wait();await wait();
 assert.deepEqual(h.getCloud(0).payload.deals.map(x=>x._id).sort(),['local','remote']);
 assert.deepEqual(h.read(F),h.getCloud(0).payload);
 assert.deepEqual(clone(h.events.at(-1).detail.finance),h.getCloud(0).payload);
});
test('conflict recovery preserves newer same-store and other-store edits made during failed request',async()=>{
 const h=harness(),gate=deferred();await h.window.arbatCloudBoot();let first=true;
 h.post(async()=>{if(first){first=false;await gate.promise}return null});
 h.setCloud(0,{deals:[{_id:'remote'}]});h.save(F,{deals:[{_id:'local'}]});await wait();
 h.save(F,{deals:[{_id:'local'},{_id:'newer'}]});h.save(W,{items:[{id:'material'}]});gate.resolve();await wait();await wait();await wait();
 assert.deepEqual(h.getCloud(0).payload.deals.map(x=>x._id).sort(),['local','newer','remote']);assert.deepEqual(h.read(W),h.getCloud(1).payload);
});
test('a refresh started before a local save cannot overwrite its newer revision',async()=>{
 const h=harness(),gate=deferred();await h.window.arbatCloudBoot();h.setCloud(0,{deals:[{_id:'remote'}]});
 h.get(async()=>gate.promise);const refresh=h.intervals[0]();await wait();
 h.save(F,{deals:[{_id:'mine'}]});await wait();h.get(null);gate.resolve();await refresh;await wait();await wait();
 assert.deepEqual(h.read(F),h.getCloud(0).payload);
});
const start=source.indexOf('  function mergeShared('),end=source.indexOf('  async function flush()',start),merge=new Function(source.slice(start,end)+';return mergeShared')();
test('concurrent edits and edit/delete conflicts on the same financial document stop instead of losing a version',()=>{
 const row={_id:'d',amount:10},base={expenses:[row]};
 assert.throws(()=>merge(base,{expenses:[{...row,amount:20}]},{expenses:[{...row,amount:30}]}),/Конфликт/);
 assert.throws(()=>merge(base,{expenses:[]},{expenses:[{...row,amount:30}]}),/Конфликт/);
 assert.throws(()=>merge(base,{expenses:[{...row,amount:20}]},{expenses:[]}),/Конфликт/);
});
test('same document edit conflict preserves unsaved local state and does not retry a destructive overwrite',async()=>{
 const base={expenses:[{_id:'d',amount:10}]},h=harness(base);await h.window.arbatCloudBoot();h.setCloud(0,{expenses:[{_id:'d',amount:20}]});h.save(F,{expenses:[{_id:'d',amount:30}]});await wait();await wait();
 assert.equal(h.getCloud(0).payload.expenses[0].amount,20);assert.equal(h.read(F).expenses[0].amount,30);assert.ok(h.messages.some(x=>x.includes('приостановлена')));assert.equal(h.writes.length,1);
});
function authHarness(authOptions={}){
 const nodes=new Map(),storage=new Map(),requests=[],gate=deferred();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',validity:{valid:true},classList:{add(){},remove(){}},append(){},appendChild(){},focus(){},addEventListener(){},elements:{password:{value:'',focus(){}}}});return nodes.get(id)};
 const stored={access_token:'expired',refresh_token:'refresh',expires_at:1};storage.set('arbat-session-v1',JSON.stringify(stored));
 let cloudBoots=0;const window={dispatchEvent(){},arbatCloudBoot:async()=>{cloudBoots++;return true}};
 const context={window,document:{createElement:()=>node(Symbol()),getElementById:node,querySelector:node,body:node('body')},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{removeItem(){}},location:{hash:authOptions.hash||'',pathname:'/app/'},history:{replaceState(){}},URLSearchParams,CustomEvent:class{},requestAnimationFrame(){},confirm:()=>true,console,fetch:async(url,options)=>{
  requests.push({url,options});if(url.includes('grant_type=refresh_token')){await gate.promise;return {ok:true,json:async()=>({access_token:'renewed',refresh_token:'next-refresh',expires_at:Date.now()/1000+3600})}}
  if(authOptions.identity&&url.includes('claim_staff_access'))return {ok:true,json:async()=>authOptions.identity};
  if(authOptions.identity&&url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'employee'})};
  return {ok:false,json:async()=>({message:'mock boot stopped'})};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/auth.js'),'utf8'),context);
 return {window,requests,gate,nodes,storage,cloudBoots:()=>cloudBoots};
}
test('concurrent callers share a single expired-session refresh',async()=>{
 const h=authHarness(),a=h.window.abGetToken(),b=h.window.abGetToken();await wait();
 const refreshes=h.requests.filter(x=>x.url.includes('grant_type=refresh_token')).length;h.gate.resolve();await Promise.all([a,b]);assert.equal(refreshes,1);
});

test('invite/recovery link requires matching new passwords before entering the employee profile',async()=>{
 for(const type of ['invite','recovery']){
  const h=authHarness({hash:'#access_token=invite-token&refresh_token=refresh&type='+type,identity:{role:'employee',email:'worker@example.test'}});
  assert.equal(h.requests.length,0);assert.equal(h.nodes.get('ab-submit').textContent,'Сохранить пароль');
  h.nodes.get('ab-password').value='new-password';h.nodes.get('ab-password-confirm').value='different';
  await h.nodes.get('ab-form').onsubmit({preventDefault(){}});assert.equal(h.requests.length,0);
  h.nodes.get('ab-password-confirm').value='new-password';await h.nodes.get('ab-form').onsubmit({preventDefault(){}});
  assert.equal(h.requests[0].options.method,'PUT');assert.equal(JSON.parse(h.requests[0].options.body).password,'new-password');
  assert.equal(h.requests.filter(x=>x.url.includes('claim_staff_access')).length,1);assert.equal(h.cloudBoots(),0);
 }
});
test('employee login does not fetch shared finance/warehouse state and removes their active caches',async()=>{
 const h=authHarness({identity:{role:'employee',email:'worker@example.test'}});for(const key of [F,W,B])h.storage.set(key,'cached-sensitive-data');h.gate.resolve();await wait();await wait();
 assert.equal(h.cloudBoots(),0);assert.equal(h.storage.has(F),false);assert.equal(h.storage.has(W),false);assert.equal(h.storage.has(B),false);
});
const {inspect,packageBackup,verifyBackup}=require('../scripts/verify-backup.cjs');
test('backup inspection returns findings for null stores and malformed collections instead of throwing',()=>{
 for(const [finance,warehouse] of [[null,null],[{cash:{}},{moves:'invalid'}],[{cash:[null],wallets:{}},{projectIssues:[null],items:null}]]){
  const result=inspect(finance,warehouse);assert.equal(result.ok,false);assert.ok(result.errors.length>0);
 }
});
test('backup inspection rejects malformed nested issue lines without crashing',()=>{
 const result=inspect({}, {projectIssues:[{id:'issue',lines:[null,{qty:'invalid'}]},{id:'bad-lines',lines:{qty:2}}]});
 assert.equal(result.ok,false);assert.ok(result.errors.some(x=>x.code==='invalid-document'));assert.ok(result.errors.some(x=>x.code==='invalid-section'));
});
test('backup inspection rejects impossible dates and keeps valid leap days',()=>{
 for(const date of ['2026-02-29','2026-13-01','2026-01-32'])assert.ok(inspect({cash:[{_id:'x',date}]},{}).errors.some(x=>x.code==='invalid-date'));
 assert.equal(inspect({cash:[{_id:'x',date:'2024-02-29'}]},{}).ok,true);
});
test('checksum verification still returns invalid schema findings rather than accepting malformed restore data',()=>{
 const result=verifyBackup(packageBackup({cash:{}},{moves:[]}));assert.equal(result.findings.ok,false);
});
test('re-enabling preserved staff access goes through the auth-unban endpoint',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/profile.js'),'utf8'),start=source.indexOf('  async function setStaffEnabled('),end=source.indexOf('  async function sendPasswordLink',start);
 assert.ok(start>=0,'profile must restore Auth account together with staff access');
 const calls=[],setEnabled=new Function('request',source.slice(start,end)+';return setStaffEnabled')(async(...args)=>{calls.push(args);return {ok:true}});
 const user={email:'worker@example.test',role:'employee',employee_id:'person1',full_name:'Worker',enabled:false};await setEnabled(user);
 assert.equal(calls[0][0],'admin-invite-staff');assert.equal(calls[0][1].employee_id,'person1');assert.equal(calls[0][2],'functions/v1/');
 calls.length=0;await setEnabled({...user,enabled:true});assert.equal(calls[0][0],'rpc/admin_set_staff');assert.equal(calls[0][1].p_enabled,false);
});
function edgeHarness(sessionResult,actor={role:'admin',enabled:true}){
 const calls=[],mutations=[],clients=[];let handler;
 const admin={auth:{getUser:async token=>{calls.push(['getUser',token]);return {data:{user:{id:'admin-id',email:'admin@example.test'}},error:null}},admin:{listUsers:async()=>({data:{users:[{id:'worker-id',email:'worker@example.test',user_metadata:{}}]},error:null}),updateUserById:async(...args)=>{mutations.push(['auth-update',...args]);return {error:null}},inviteUserByEmail:async()=>{throw Error('Test must not send mail')}}},from:table=>{
  calls.push(['from',table]);let operation='read';const builder={};
  for(const method of ['select','eq'])builder[method]=()=>builder;
  for(const method of ['upsert','update','insert'])builder[method]=value=>{operation=method;mutations.push([table,method,value]);return builder};
  const result=()=>({data:table==='staff_access'&&operation==='read'?actor:{email:'worker@example.test'},error:null});
  builder.maybeSingle=async()=>result();builder.single=async()=>result();builder.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return builder;
 }};
 const caller={rpc:async name=>{calls.push(['rpc',name]);return sessionResult}};
 const createClient=(url,key,options)=>{clients.push({url,key,options});return options?.global?.headers?.Authorization?caller:admin};
 const {stripTypeScriptTypes}=require('node:module');const ts=fs.readFileSync(path.join(__dirname,'../supabase/functions/admin-invite-staff/index.ts'),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(ts),{createClient,Response,console:{error(){}},Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://test.supabase.co':'test-service-key'},serve:fn=>handler=fn}});
 return {calls,mutations,clients,handle:(action='invite')=>handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer still-valid-jwt','Content-Type':'application/json'},body:JSON.stringify({action,email:'worker@example.test',role:'employee',employee_id:'worker-id',full_name:'Worker'})}))};
}
test('revoked JWT and session-check errors cannot reach privileged invite/remove operations',async()=>{
 for(const sessionResult of [{data:false,error:null},{data:null,error:{message:'RPC unavailable'}},{data:null,error:null}])for(const action of ['invite','remove']){
  const h=edgeHarness(sessionResult),response=await h.handle(action);assert.equal(response.status,401);assert.equal(h.mutations.length,0);assert.equal(h.calls.some(x=>x[0]==='from'),false);
  const caller=h.clients.find(x=>x.options?.global);assert.equal(caller.options.global.headers.Authorization,'Bearer still-valid-jwt');assert.ok(h.calls.some(x=>x[0]==='rpc'&&x[1]==='has_active_finance_session'));
 }
});
test('live session still requires enabled administrator role, and authorized restoration succeeds',async()=>{
 for(const actor of [{role:'employee',enabled:true},{role:'admin',enabled:false}]){
  const h=edgeHarness({data:true,error:null},actor);assert.equal((await h.handle()).status,403);assert.equal(h.mutations.length,0);
 }
 const h=edgeHarness({data:true,error:null});assert.equal((await h.handle()).status,200);assert.ok(h.mutations.some(x=>x[0]==='auth-update'&&x[2].ban_duration==='none'));
});

test('conflict recovery snapshot survives reload, is identity-bound and requires explicit discard',async()=>{
 const identity={user_id:'owner-id',email:'owner@example.test'},base={expenses:[{_id:'d',amount:10}]};
 const h=harness(base,{items:[]},{identity});await h.window.arbatCloudBoot();h.setCloud(0,{expenses:[{_id:'d',amount:20}]});h.save(F,{expenses:[{_id:'d',amount:30}]});h.save(W,{items:[{id:'unsynced-material'}]});await wait();await wait();
 const key=[...h.localStorage.data.keys()].find(x=>x.startsWith('arbat-unsynced-recovery-v1:'));assert.ok(key,'halt must persist a recovery snapshot');
 const original=h.localStorage.getItem(key),snapshot=JSON.parse(original);assert.equal(snapshot.stores.finance.expenses[0].amount,30);assert.equal(snapshot.stores.warehouse.items[0].id,'unsynced-material');assert.equal(snapshot.identity.email,identity.email);assert.ok(snapshot.revisions.finance_state);
 const reloaded=harness(undefined,undefined,{data:h.localStorage.data,cloud:[h.getCloud(0),h.getCloud(1)],identity});assert.equal(await reloaded.window.arbatCloudBoot(),false);assert.equal(reloaded.read(F).expenses[0].amount,30);assert.equal(reloaded.localStorage.getItem(key),original);
 const download=reloaded.nodes.find(x=>x.id==='ab-recovery-download');assert.ok(download);download.onclick();assert.equal(reloaded.downloads.length,1);assert.equal(await reloaded.downloads[0].text(),JSON.stringify(snapshot,null,2));assert.equal(reloaded.localStorage.getItem(key),original);
 reloaded.window.abIdentity={user_id:'different-id',email:'other@example.test'};download.onclick();assert.equal(reloaded.downloads.length,1,'stale recovery controls cannot download another account snapshot');
 const other=harness(undefined,undefined,{data:h.localStorage.data,cloud:[h.getCloud(0),h.getCloud(1)],identity:reloaded.window.abIdentity});await other.window.arbatCloudBoot();assert.equal(other.nodes.some(x=>x.id==='ab-recovery-download'),false);assert.equal(other.localStorage.getItem(key),original);
 reloaded.window.abIdentity=identity;await reloaded.nodes.find(x=>x.id==='ab-recovery-discard').onclick();assert.equal(reloaded.localStorage.getItem(key),null);assert.equal(reloaded.read(F).expenses[0].amount,20);
});

test('recovery remains downloadable with an explicit warning when browser storage is full',async()=>{
 const options={identity:{user_id:'quota-user',email:'quota@example.test'},failRecoveryWrites:true},h=harness({expenses:[{_id:'d',amount:10}]},{items:[]},options);
 await h.window.arbatCloudBoot();h.setCloud(0,{expenses:[{_id:'d',amount:20}]});h.save(F,{expenses:[{_id:'d',amount:30}]});await wait();await wait();
 assert.ok(h.messages.some(x=>x.includes('не закрывайте')));h.nodes.find(x=>x.id==='ab-recovery-download').onclick();assert.equal(JSON.parse(await h.downloads[0].text()).stores.finance.expenses[0].amount,30);
});

test('synchronous linked finance and warehouse saves use one atomic batch request',async()=>{
 const h=harness();await h.window.arbatCloudBoot();h.save(F,{deals:[{_id:'linked-finance'}]});h.save(W,{items:[{id:'linked-warehouse'}]});await wait();await wait();
 assert.equal(h.writes.length,1);assert.deepEqual(h.writes[0].p_changes.map(x=>x.store),['finance','warehouse']);assert.equal(h.getCloud(0).revision,2);assert.equal(h.getCloud(1).revision,2);
});
test('second-store conflict cannot commit the first store and queued pair remains recoverable',async()=>{
 const h=harness({expenses:[{_id:'f',amount:10}]},{moves:[{id:'w',qty:1}]},{identity:{user_id:'atomic-owner',email:'atomic@example.test'}});await h.window.arbatCloudBoot();
 h.setCloud(1,{moves:[{id:'w',qty:2}]});h.save(F,{expenses:[{_id:'f',amount:30}]});h.save(W,{moves:[{id:'w',qty:3}]});await wait();await wait();
 assert.equal(h.getCloud(0).payload.expenses[0].amount,10,'first store must remain unchanged if second store conflicts');assert.equal(h.getCloud(0).revision,1);assert.equal(h.getCloud(1).payload.moves[0].qty,2);assert.equal(h.read(F).expenses[0].amount,30);assert.equal(h.read(W).moves[0].qty,3);assert.ok(h.messages.some(x=>x.includes('приостановлена')));
});
test('batch transport failure preserves both latest local stores for recovery without separate fallback writes',async()=>{
 const h=harness();await h.window.arbatCloudBoot();h.post(async()=>{throw Error('Network unavailable')});h.save(F,{deals:[{_id:'pending'}]});h.save(W,{items:[{id:'pending'}]});await wait();await wait();
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].p_changes.length,2);assert.equal(h.getCloud(0).revision,1);assert.equal(h.getCloud(1).revision,1);assert.equal(h.read(F).deals[0]._id,'pending');assert.equal(h.read(W).items[0].id,'pending');
});
test('atomic batch SQL retains invoker privileges and deterministic guarded writes',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261023155814_atomic_shared_state_batch.sql'),'utf8');
 assert.match(sql,/security invoker set search_path=''/i);assert.match(sql,/next_revision:=public\.update_shared_state\(/);assert.match(sql,/count\(distinct value->>'store'\)/);assert.match(sql,/order by case value->>'store' when 'finance' then 0 else 1 end/);assert.match(sql,/revoke all.*from public,anon/i);assert.match(sql,/grant execute.*to authenticated/i);assert.doesNotMatch(sql,/exception when|security definer/i);
});

test('newer queued pair while a successful batch is in flight is sent together after its acknowledgement',async()=>{
 const h=harness(),gate=deferred();await h.window.arbatCloudBoot();let first=true;h.post(async()=>{if(first){first=false;await gate.promise}return null});
 h.save(F,{deals:[{_id:'first'}]});h.save(W,{items:[{id:'first'}]});await wait();h.save(F,{deals:[{_id:'latest'}]});h.save(W,{items:[{id:'latest'}]});gate.resolve();await wait();await wait();
 assert.equal(h.writes.length,2);assert.ok(h.writes.every(x=>x.p_changes.length===2));assert.equal(h.getCloud(0).payload.deals[0]._id,'latest');assert.equal(h.getCloud(1).payload.items[0].id,'latest');assert.equal(h.getCloud(0).revision,3);assert.equal(h.getCloud(1).revision,3);
});

test('transient poll network failure retries without locking the app or replacing local data',async()=>{
 const h=harness({deals:[{_id:'existing'}]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();
 h.get(async()=>{throw new TypeError('Failed to fetch')});await h.intervals[0]();
 assert.equal([...h.localStorage.data.keys()].some(k=>k.startsWith('arbat-unsynced-recovery-v1:')),false,'a read outage must not require discarding a recovery snapshot');
 h.get(null);h.setCloud(0,{deals:[{_id:'existing'},{_id:'colleague'}]});await h.intervals[0]();
 assert.deepEqual(h.read(F).deals.map(x=>x._id),['existing','colleague'],'next poll must receive colleague documents without reload');
});

test('temporary server failure is retried but access rejection still halts and preserves recovery',async()=>{
 for(const status of [503,403]){
  const h=harness({deals:[]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.get(async()=>{throw Object.assign(new Error('server error'),{status})});await h.intervals[0]();
  const recovery=[...h.localStorage.data.keys()].some(k=>k.startsWith('arbat-unsynced-recovery-v1:'));assert.equal(recovery,status===403);
  h.get(null);h.setCloud(0,{deals:[{_id:'next'}]});await h.intervals[0]();assert.equal(h.read(F).deals.length,status===503?1:0);
 }
});

test('failed write can be explicitly retried against fresh cloud state without losing independent colleague edits',async()=>{
 const h=harness({deals:[]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.post(async()=>{throw new TypeError('Failed to fetch')});h.save(F,{deals:[{_id:'mine'}]});await wait();await wait();
 const retry=h.nodes.find(n=>n.id==='ab-recovery-retry');assert.ok(retry,'recovery must offer a safe retry');h.setCloud(0,{deals:[{_id:'colleague'}]});h.post(null);await retry.onclick();
 assert.deepEqual(h.getCloud(0).payload.deals.map(x=>x._id).sort(),['colleague','mine']);assert.deepEqual(h.read(F),h.getCloud(0).payload);assert.equal([...h.localStorage.data.keys()].some(k=>k.startsWith('arbat-unsynced-recovery-v1:')),false,'recovery removed only after acknowledgement');
});
test('retry of an actual same-document conflict preserves both versions and the recovery snapshot',async()=>{
 const h=harness({expenses:[{_id:'x',amount:10}]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.setCloud(0,{expenses:[{_id:'x',amount:20}]});h.save(F,{expenses:[{_id:'x',amount:30}]});await wait();await wait();
 const retry=h.nodes.find(n=>n.id==='ab-recovery-retry');assert.ok(retry);await retry.onclick();assert.equal(h.getCloud(0).payload.expenses[0].amount,20);assert.equal(h.read(F).expenses[0].amount,30);assert.equal([...h.localStorage.data.keys()].some(k=>k.startsWith('arbat-unsynced-recovery-v1:')),true);
 const calls=h.writes.length;h.window.abIdentity={user_id:'other',role:'admin'};await retry.onclick();assert.equal(h.writes.length,calls,'another user cannot replay the snapshot');
});

test('retry is idempotent when the original save committed but its response was lost',async()=>{
 const h=harness({deals:[]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.post(async body=>{for(const c of body.p_changes)h.setCloud(c.store==='finance'?0:1,c.payload);throw new TypeError('Response lost')});h.save(F,{deals:[{_id:'once'}]});await wait();await wait();h.post(null);await h.nodes.find(n=>n.id==='ab-recovery-retry').onclick();assert.equal(h.getCloud(0).payload.deals.length,1);assert.equal(h.getCloud(0).payload.deals[0]._id,'once');
});
test('changing recovery owner during the fresh-state fetch prevents retry writes',async()=>{
 const h=harness({deals:[]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.post(async()=>{throw new TypeError('Offline')});h.save(F,{deals:[{_id:'private'}]});await wait();await wait();const gate=deferred();h.post(null);h.get(async()=>gate.promise);const count=h.writes.length,attempt=h.nodes.find(n=>n.id==='ab-recovery-retry').onclick();await wait();h.window.abIdentity={user_id:'other',role:'admin'};gate.resolve();await attempt;assert.equal(h.writes.length,count);assert.equal([...h.localStorage.data.keys()].some(k=>k.startsWith('arbat-unsynced-recovery-v1:')),true);
});

test('visible cloud model mutations cannot alter the three-way merge baseline',async()=>{
 const h=harness({deals:[]});await h.window.arbatCloudBoot();h.setCloud(0,{deals:[{_id:'first'}]});await h.intervals[0]();
 const visible=h.events.at(-1).detail.finance;visible.deals.push({_id:'mine'});h.setCloud(0,{deals:[{_id:'first'},{_id:'colleague'}]});h.save(F,visible);await wait();await wait();
 assert.deepEqual(h.getCloud(0).payload.deals.map(x=>x._id).sort(),['colleague','first','mine']);
});
test('editing the emitted UI model retains the original baseline and detects another edit of that document',async()=>{
 const h=harness({expenses:[]},{items:[]},{identity:{user_id:'admin',email:'admin@example.test',role:'admin'}});await h.window.arbatCloudBoot();h.setCloud(0,{expenses:[{_id:'x',amount:10}]});await h.intervals[0]();
 const visible=h.events.at(-1).detail.finance;visible.expenses[0].amount=30;h.setCloud(0,{expenses:[{_id:'x',amount:20}]});h.save(F,visible);await wait();await wait();assert.equal(h.getCloud(0).payload.expenses[0].amount,20);assert.equal(h.read(F).expenses[0].amount,30);assert.ok(h.messages.some(x=>x.includes('Конфликт')));
});
