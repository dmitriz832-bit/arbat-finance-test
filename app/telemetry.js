/* Technical diagnostics only. Never pass documents, identities, URLs or raw errors. */
((root,factory)=>{
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(root.document&&!root.ArbatTelemetry)api.start(root);
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const schemas={
    arbat_app_loaded:{},
    arbat_navigation:{section:['overview','cash','deals','expenses','costs','materials','warehouseSummary','work','labor','payrollSummary','reports','settings','calendar','taxes','obligations','planning','managementReports','realizations']},
    arbat_runtime_error:{code:['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError','EvalError','PromiseRejection','ResourceError']},
    arbat_sync_result:{status:['success','retry','failed']}
  };
  function sanitize(event,properties={}){
    if(!Object.hasOwn(schemas,event))return null;
    const clean={};
    for(const [key,values] of Object.entries(schemas[event]))if(values.includes(properties?.[key]))clean[key]=properties[key];
    return {event,properties:clean};
  }
  function envelope(input,token,anonymousId){
    const clean=sanitize(input?.event,input?.properties);if(!clean)return null;
    // Rebuild the entire envelope AFTER SDK enrichment; deny future SDK fields by default.
    return {event:clean.event,properties:{...clean.properties,distinct_id:anonymousId,token,$process_person_profile:false,$geoip_disable:true},timestamp:new Date()};
  }
  function canStart(config,location,navigator){
    return !!(config?.enabled===true&&/^phc_[A-Za-z0-9_]+$/.test(config.token||'')&&
      ['https://eu.i.posthog.com','https://us.i.posthog.com'].includes(config.apiHost)&&
      config.origin===location.origin&&typeof config.pathPrefix==='string'&&config.pathPrefix.startsWith('/')&&config.pathPrefix.endsWith('/')&&location.pathname.startsWith(config.pathPrefix)&&
      navigator.doNotTrack!=='1'&&navigator.globalPrivacyControl!==true);
  }
  function start(root){
    const base=new URL('.',root.document.currentScript.src);
    let client=null,disabled=false,count=0,queue=[];
    const errors=new Set();
    function capture(event,properties){
      try{
        if(disabled||count>=100)return;
        const clean=sanitize(event,properties);if(!clean)return;
        if(event==='arbat_runtime_error'){
          const key=clean.properties.code||'Error';if(errors.has(key))return;errors.add(key);
        }
        if(client){count++;client.capture(clean.event,clean.properties)}
        else if(queue.length<20)queue.push(clean);
      }catch{/* Diagnostics must never interrupt accounting or authentication. */}
    }
    root.ArbatTelemetry=Object.freeze({capture});
    root.addEventListener('error',event=>capture('arbat_runtime_error',{code:event.error?.name||'ResourceError'}),true);
    root.addEventListener('unhandledrejection',()=>capture('arbat_runtime_error',{code:'PromiseRejection'}));
    root.document.addEventListener('arbat:navigate',event=>capture('arbat_navigation',{section:event.detail?.section}));
    const stop=()=>{disabled=true;queue=[];client=null};
    if(root.navigator.doNotTrack==='1'||root.navigator.globalPrivacyControl===true){stop();return}
    root.fetch(new URL('telemetry-config.json',base),{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'})
      .then(response=>{if(!response.ok)throw Error('Configuration unavailable');return response.json()})
      .then(config=>{
        if(!canStart(config,root.location,root.navigator)){stop();return}
        const id=root.crypto.randomUUID();
        const script=root.document.createElement('script');
        script.src=new URL('vendor/posthog.js',base).href;script.async=true;script.onerror=stop;
        script.onload=()=>{
          try{
            root.posthog.init(config.token,{
              api_host:config.apiHost,defaults:'2026-08-30',persistence:'memory',person_profiles:'never',
              autocapture:false,capture_pageview:false,capture_pageleave:false,capture_exceptions:false,
              capture_performance:false,enable_recording_console_log:false,disable_session_recording:true,
              disable_surveys:true,disable_conversations:true,disable_product_tours:true,
              disable_external_dependency_loading:true,advanced_disable_flags:true,
              enable_heatmaps:false,save_referrer:false,save_campaign_params:false,respect_dnt:true,ip:false,
              request_batching:false,disable_compression:true,
              before_send:data=>envelope(data,config.token,id),
              loaded:instance=>{
                client=instance;capture('arbat_app_loaded');const waiting=queue;queue=[];
                // Already sanitized and deduplicated when queued; do not drop early errors again.
                for(const row of waiting){if(count>=100)break;count++;try{client.capture(row.event,row.properties)}catch{}}
              }
            });
          }catch{stop()}
        };
        root.document.head.append(script);
      }).catch(stop);
  }
  return {sanitize,envelope,canStart,start};
});
