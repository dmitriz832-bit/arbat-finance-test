const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../app/telemetry.js');
const api=fs.existsSync(file)?require(file):{};

// Catches accidentally forwarding arbitrary event names, form fields or SDK enrichment.
test('telemetry only accepts known events and enumerated properties',()=>{
  assert.equal(typeof api.sanitize,'function');
  assert.equal(api.sanitize('customer paid',{amount:100,email:'private@example.com'}),null);
  assert.deepEqual(api.sanitize('arbat_sync_result',{status:'success',amount:100,email:'private@example.com',payload:{cash:[]}}),{event:'arbat_sync_result',properties:{status:'success'}});
  assert.deepEqual(api.sanitize('arbat_sync_result',{status:'customer-private-name'}),{event:'arbat_sync_result',properties:{}});
  assert.deepEqual(api.sanitize('arbat_runtime_error',{code:'TypeError',message:'Invoice 123 / customer',stack:'secret',url:'https://example.com/?token=secret'}),{event:'arbat_runtime_error',properties:{code:'TypeError'}});
  assert.deepEqual(api.sanitize('arbat_navigation',{section:'cash',route:'cash:client-secret',user_id:'staff-secret'}),{event:'arbat_navigation',properties:{section:'cash'}});
});

test('last-mile envelope drops person updates, URLs and identifiers added by the SDK',()=>{
  assert.equal(typeof api.envelope,'function');
  const event=api.envelope({event:'arbat_app_loaded',properties:{distinct_id:'real-employee-id',$current_url:'https://example.com/#access_token=SECRET',$referrer:'secret',$set:{email:'secret'},amount:900},$set:{name:'secret'},$set_once:{phone:'secret'},uuid:'secret'},'phc_test','anonymous-page');
  assert.deepEqual(Object.keys(event).sort(),['event','properties','timestamp']);
  assert.deepEqual(event.properties,{distinct_id:'anonymous-page',token:'phc_test',$process_person_profile:false,$geoip_disable:true});
  assert.equal(api.envelope({event:'$pageview',properties:{}},'phc_test','anonymous-page'),null);
  assert.equal(api.envelope({event:'$exception',properties:{$exception_list:[{value:'secret'}]}},'phc_test','anonymous-page'),null);
});

// Catches mistakenly enabling telemetry in test forks, local runs, opt-outs or invalid config.
test('telemetry is enabled only on the configured production origin and path',()=>{
  assert.equal(typeof api.canStart,'function');
  const c={enabled:true,token:'phc_test',apiHost:'https://eu.i.posthog.com',origin:'https://example.com',pathPrefix:'/finance/'};
  const location={origin:'https://example.com',pathname:'/finance/index.html'};
  assert.equal(api.canStart(c,location,{}),true);
  for(const changes of [{enabled:false},{token:''},{apiHost:'http://unsafe.example.com'},{apiHost:'https://other.example.com'},{origin:'https://other.example.com'}])assert.equal(api.canStart({...c,...changes},location,{}),false);
  assert.equal(api.canStart(c,{...location,pathname:'/other/'},{}),false);
  assert.equal(api.canStart(c,location,{doNotTrack:'1'}),false);
  assert.equal(api.canStart(c,location,{globalPrivacyControl:true}),false);
});

test('errors queued before SDK load are sent once without raw messages',async()=>{
  const captured=[],listeners={};
  const root={location:{origin:'https://example.com',pathname:'/finance/'},navigator:{},crypto:{randomUUID:()=> 'anonymous-page'},
    addEventListener:(name,fn)=>{listeners[name]=fn},
    document:{currentScript:{src:'https://example.com/finance/telemetry.js'},addEventListener:()=>{},createElement:()=>({}),head:{append:script=>script.onload()}},
    fetch:async()=>({ok:true,json:async()=>({enabled:true,token:'phc_test',apiHost:'https://eu.i.posthog.com',origin:'https://example.com',pathPrefix:'/finance/'})}),
    posthog:{init:(token,config)=>config.loaded({capture:(event,properties)=>captured.push(config.before_send({event,properties}))})}
  };
  api.start(root);
  listeners.error({error:{name:'TypeError',message:'SECRET'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(captured.filter(x=>x.event==='arbat_runtime_error').length,1);
  assert(!JSON.stringify(captured).includes('SECRET'));
  listeners.error({error:{name:'TypeError',message:'SECOND'}});
  assert.equal(captured.filter(x=>x.event==='arbat_runtime_error').length,1);
});
