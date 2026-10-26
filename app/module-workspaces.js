/* Mount full-page workspaces while retaining native document handlers and routes. */
(()=>{
 'use strict';
 const pages=new Map();
 function mount(id,api,options){const host=document.getElementById(id);if(host&&api?.mount)pages.set(host.closest('section').id,api.mount(host,{autoRefresh:false,...options}));}
 mount('taxWorkspaceHost',window.ArbatTaxWorkspace);
 mount('warehouseWorkspaceHost',window.ArbatWarehouseWorkspace);
 mount('payrollWorkspaceHost',window.ArbatManagementWorkspace,{view:'payroll'});
 mount('planningWorkspaceHost',window.ArbatManagementWorkspace,{view:'planning'});
 mount('obligationsWorkspaceHost',window.ArbatManagementWorkspace,{view:'obligations'});
 mount('reportsWorkspaceHost',window.ArbatManagementWorkspace,{view:'reports'});
 function refresh(){for(const [id,page] of pages)if(document.getElementById(id)?.classList.contains('active'))page?.refresh?.();}
 const previous=window.render;
 if(typeof previous==='function')window.render=function(...args){const result=previous.apply(this,args);refresh();return result;};
 document.addEventListener('arbat:navigate',refresh);
 document.getElementById('orgFilter')?.addEventListener('change',event=>{for(const page of pages.values())page?.setOrganization?.(event.target.value);});
 document.addEventListener('change',event=>{if(!event.target.matches('[data-tax-org],[data-warehouse-org],[name=managementOrg]'))return;const select=document.getElementById('orgFilter');if(select&&select.value!==event.target.value){select.value=event.target.value;select.dispatchEvent(new Event('change',{bubbles:true}));}});
 window.addEventListener('arbat:cloud-update',refresh);
 window.addEventListener('storage',refresh);
 window.addEventListener('arbat:tax-pnl-changed',refresh);
 refresh();
})();
