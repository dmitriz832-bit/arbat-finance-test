/* Documentation is a review dimension, never a tax exemption or a new organization. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatManagementReview=api})(globalThis,function(core){
 'use strict';const organizations=Object.freeze(['АИР-КЛИМАТ','АРБАТ.ГК']),text=x=>String(x??'').trim();
 const array=x=>Array.isArray(x)?x:[];
 const links=row=>[row.projectKey,row.dealId,...array(row.allocations).map(x=>x?.projectKey),...array(row.shares).map(x=>x?.projectKey),...array(row.pnlAllocations).map(x=>x?.projectKey)].filter(Boolean);
 function reviewSources(data={},period={}){
  const pending=(data.deals||[]).filter(x=>x.taxMode==='review'),byKey=new Map();for(const d of pending){byKey.set(core.dealKey(d),d);byKey.set(d._id,d)}
  const rows=[],inPeriod=row=>{const dates=[row.date||row.dt,row.usnRecognitionDate,row.profitTaxRecognitionDate,row.vatDeductionDate,...array(row.usnRecognitionEvents).map(x=>x?.date),...array(row.profitTaxRecognitionEvents).map(x=>x?.date)].map(x=>text(x).slice(0,10));return !period.from&&!period.to||dates.some(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&(!period.from||date>=period.from)&&(!period.to||date<=period.to))};
  for(const collection of ['cash','realizations','expenses','costs','labor','workActs'])for(const source of data[collection]||[]){if(!inPeriod(source)||collection==='cash'&&source.type==='transfer')continue;const project=links(source).map(key=>byKey.get(key)).find(Boolean);if(project)rows.push({collection,source,org:source.org||project.org,reason:'documentation'})}
  for(const source of data.warehouse?.moves||[]){if(source.kind!=='intercompany'||!inPeriod(source))continue;const places=data.warehouse?.places||[],from=source.sourceOrg||places.find(x=>x.id===source.from)?.org,to=source.destinationOrg||source.org||places.find(x=>x.id===source.to)?.org,owners=[...new Set([from,to].filter(x=>organizations.includes(x)))];for(const org of owners)rows.push({collection:'warehouse',source,org,reason:'intercompany'});if(!organizations.includes(from)||!organizations.includes(to))rows.push({collection:'warehouse',source,org:'',reason:'intercompany'})}
  return rows;
 }
 function validateCash(row,data){if(!row.projectKey||row.type==='transfer')return null;const projects=(data.deals||[]).filter(x=>core.dealKey(x)===row.projectKey);return projects.length===1&&projects[0].org===row.org?null:'Проект и платёж должны относиться к одной фактической организации';}
 function validateWallet(row){return text(row.name).startsWith('0000')&&!organizations.includes(row.org)?'Укажите фактическую организацию — владельца наличных денег':null;}
 function validateTransfers(moves,basis){const cross=moves.filter(m=>m.kind==='intercompany');if(cross.some(m=>!organizations.includes(m.sourceOrg)||!organizations.includes(m.destinationOrg)||m.sourceOrg===m.destinationOrg))return 'Укажите фактические организации — владельцев передаваемых материалов';if(cross.length&&!text(basis))return 'Укажите документ-основание передачи материалов между организациями';return null;}
 return Object.freeze({reviewSources,validateCash,validateWallet,validateTransfers,organizations});
});
