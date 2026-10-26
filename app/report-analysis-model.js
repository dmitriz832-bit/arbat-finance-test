/* Read-only report projections. All financial amounts and WIP come from finance-core. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatReportAnalysis=api})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const sum=rows=>rows.reduce((n,row)=>n+row.amount,0n),iso=date=>date.toISOString().slice(0,10),day=86400000;
 const categories={revenue:'Выручка без НДС',direct:'Прямые затраты',wip:'Изменение НЗП',production:'Общепроизводственные расходы',commercial:'Коммерческие расходы',administrative:'Административные расходы',belowIncome:'Доходы ниже EBITDA',belowExpenses:'Расходы ниже EBITDA'};
 const kinds={revenue:['realizations','Реализации'],'project-expense':['expenses','Расходы проектов'],'general-expense':['costs','Общие доходы и расходы'],payroll:['labor','Начисления сотрудникам'],'work-act':['workActs','Выполненные работы'],'management-tax':['taxPnl','Налог на доход (прибыль)'],wip:[null,'Расчётное изменение НЗП']};
 function readDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw new RangeError('Укажите корректные даты');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(+date)||iso(date)!==value)throw new RangeError('Укажите корректные даты');return date}
 function periods(from,to,granularity='month'){
  let cursor=readDate(from);readDate(to);if(from>to)throw new RangeError('Дата начала позже даты окончания');if(!['day','week','month','quarter','year'].includes(granularity))throw new RangeError('Неизвестная детализация');
  const result=[];while(iso(cursor)<=to){const start=iso(cursor),end=new Date(cursor),year=cursor.getUTCFullYear(),month=cursor.getUTCMonth();
   if(granularity==='week')end.setUTCDate(end.getUTCDate()+6-(end.getUTCDay()+6)%7);
   if(granularity==='month')end.setUTCMonth(month+1,0);
   if(granularity==='quarter')end.setUTCMonth(Math.floor(month/3)*3+3,0);
   if(granularity==='year')end.setUTCMonth(11,31);
   const last=iso(end)>to?to:iso(end),label=granularity==='year'?String(year):granularity==='quarter'?Math.ceil((month+1)/3)+' квартал '+year:granularity==='month'?new Intl.DateTimeFormat('ru-RU',{month:'short',year:'numeric',timeZone:'UTC'}).format(cursor):granularity==='week'?start+' — '+last:start;
   result.push({id:start+':'+last,from:start,to:last,label});if(result.length>740)throw new RangeError('Выберите более крупную детализацию для длинного периода');cursor=new Date(Date.parse(last+'T00:00:00Z')+day);
  }return result;
 }
 function percentage(amount,denominator){if(denominator==null||denominator<=0n)return null;const negative=amount<0n,abs=negative?-amount:amount,tenths=(abs*1000n+denominator/2n)/denominator;return (negative?'-':'')+tenths/10n+','+tenths%10n+'%'}
 function cashParts(data,source,groupBy,core){
  const full=core.cents(source.amount||0),deals=data.deals||[];
  if(groupBy==='direction'){
   // The native allocation editor owns `allocations`; older receipt sources use
   // `projectAllocations`. Never combine them or add the direct key twice.
   const allocations=Array.isArray(source.allocations)?source.allocations:Array.isArray(source.projectAllocations)?source.projectAllocations:[],valid=[],seen=new Set();let assigned=0n,invalid=false;
   const projectFor=key=>deals.find(d=>core.dealKey(d)===key&&(!source.org||d.org===source.org));
   for(const allocation of allocations){
    const key=String(allocation?.projectKey||''),project=projectFor(key);let amount;
    try{amount=core.cents(allocation?.amount)}catch{invalid=true;continue}
    if(amount<=0n||!project||seen.has(key)){invalid=true;continue}
    seen.add(key);assigned+=amount;valid.push({amount,key:project.dir||'unassigned',allocationStatus:'allocated'});
   }
   if(allocations.length){
    // Match native validation and the core's atomic invalid-allocation policy:
    // a broken set remains wholly unassigned, including any otherwise valid leg.
    if(invalid||assigned>full)return [{amount:full,key:'unassigned',label:'Без направления',allocationStatus:'invalid',issue:{code:assigned>full?'overallocated-cash-direction-allocation':'invalid-cash-direction-allocation',source}}];
    if(assigned<full)valid.push({amount:full-assigned,key:'unassigned',allocationStatus:'residual'});
    return valid.map(x=>({...x,label:x.key==='unassigned'?'Без направления':x.key}));
   }
   const project=source.projectKey?projectFor(source.projectKey):null,key=source.projectKey?(project?.dir||'unassigned'):(source.dir||'unassigned');return [{amount:full,key,label:key==='unassigned'?'Без направления':key,...(source.projectKey&&!project?{issue:{code:'invalid-cash-direction-project',source}}:{})}];
  }
  if(groupBy==='wallet'){const key=String(source.walletId||'unassigned');return [{amount:full,key,label:(data.wallets||[]).find(x=>String(x.id)===key)?.name||'Без счёта'}]}
  if(groupBy==='party'){const customer=source.customerId||source.counterpartyId,person=source.personId,key=String(customer?'cp:'+customer:person?'person:'+person:source.counterparty||source.payee||'unassigned'),label=customer?(data.counterparties||[]).find(x=>String(x.id||x._id)===String(customer))?.name:person?(data.people||[]).find(x=>String(x.id||x._id)===String(person))?.name:null;return [{amount:full,key,label:label||source.counterparty||source.payee||'Без контрагента'}]}
  const key=String(source.articleId||'unassigned');return [{amount:full,key,label:(data.articles||[]).find(x=>String(x.id)===key)?.name||'Без статьи'}];
 }
 function cashRows(data,bounds,options,core){
  const issues=[],rows=(data.cash||[]).filter(x=>{const date=String(x.date||'').slice(0,10);return (!options.org||x.org===options.org)&&date>=bounds.from&&date<=bounds.to&&['in','out','transfer'].includes(x.type)}).flatMap(source=>cashParts(data,source,options.groupBy,core).map(part=>{if(part.issue)issues.push(part.issue);return {source,id:source._id||source.id,collection:'cash',date:String(source.date).slice(0,10),label:part.label,groupKey:part.key,category:source.type,kind:source.type,amount:part.amount*(source.type==='out'?-1n:1n),documentAmount:core.cents(source.amount||0),allocatedAmount:part.amount,allocationStatus:part.allocationStatus||null,calculated:false}}));return {rows,issues};
 }
 function pnlRows(data,bounds,options,core){
  const financial=core.ownerPeriodSnapshot({...data,wipAccounting:true},bounds,options.org||''),rows=[];
  for(const source of financial.revenueDocuments){const deal=(data.deals||[]).find(d=>core.dealKey(d)===source.projectKey);rows.push({source,id:source._id||source.id,collection:'realizations',date:source.date,label:'Реализация',kind:'revenue',category:'revenue',dir:deal?.dir||source.dir||'',amount:core.documentPnlAmount(source)})}
  for(const entry of financial.rows){const calculated=entry.calculated===true;rows.push({...entry,id:entry.source?._id||entry.source?.id,collection:calculated?null:kinds[entry.kind]?.[0],label:entry.label||kinds[entry.kind]?.[1]||entry.kind,calculated,amount:entry.amount*(entry.category==='belowIncome'?1n:-1n)})}
  for(const bridge of financial.wipBridges||[])for(const project of bridge.projects||[]){if(!project.deferredChange)continue;rows.push({source:null,id:null,collection:null,date:bridge.period,kind:'wip',category:'wip',dir:project.dir,projectKey:project.projectKey,org:project.org,label:'Расчётная корректировка НЗП',calculated:true,amount:project.deferredChange,explanation:'Пропорциональное признание затрат проекта из финансового ядра. Отдельного документа корректировки нет.'})}
  for(const row of rows){row.groupKey=options.groupBy==='source'?row.kind:options.groupBy==='direction'?(row.dir||'unassigned'):row.category;row.groupLabel=options.groupBy==='source'?(kinds[row.kind]?.[1]||row.kind):options.groupBy==='direction'?(row.dir||'Без направления'):categories[row.category]||row.category}
  return {rows,issues:financial.issues};
 }
 function snapshot(data,options,core){
  const kind=options.kind==='cash'?'cash':'pnl',groupBy=options.groupBy||(kind==='cash'?'article':'category'),scope={...options,kind,groupBy},columns=periods(scope.from,scope.to,scope.granularity),groupOptions=new Map(),issues=[];
  let buckets=columns.map(bounds=>{const result=kind==='cash'?cashRows(data,bounds,scope,core):pnlRows(data,bounds,scope,core);issues.push(...result.issues);for(const row of result.rows)groupOptions.set(row.groupKey,row.groupLabel||row.label);return result.rows});
  if(kind==='cash'){const catalogue=groupBy==='article'?(data.articles||[]):groupBy==='wallet'?(data.wallets||[]).filter(x=>!scope.org||x.org===scope.org):groupBy==='party'?[...(data.counterparties||[]).map(x=>({...x,id:'cp:'+(x.id||x._id)})),...(data.people||[]).map(x=>({...x,id:'person:'+(x.id||x._id)}))]:(data.deals||[]).filter(x=>!scope.org||x.org===scope.org).map(x=>({id:x.dir,name:x.dir}));for(const item of catalogue)if(item.id||item._id)groupOptions.set(String(item.id||item._id),item.name||String(item.id))}
  if(kind==='pnl'&&groupBy==='category')for(const [id,label] of Object.entries(categories))groupOptions.set(id,label);
  const query=String(scope.search||'').trim().toLocaleLowerCase('ru-RU'),allowed=key=>(!scope.groupFilter||key===scope.groupFilter)&&(!query||String(groupOptions.get(key)||'').toLocaleLowerCase('ru-RU').includes(query));
  buckets=buckets.map(rows=>rows.filter(row=>allowed(row.groupKey)&&(!scope.hideTransfers||row.category!=='transfer')));
  const families=buckets.map(rows=>({in:sum(rows.filter(x=>x.category==='in')),out:-sum(rows.filter(x=>x.category==='out')),revenue:sum(rows.filter(x=>x.category==='revenue'))}));
  function cell(sources,index,family=null,multiplier=1n){const projected=multiplier===1n?sources:sources.map(x=>({...x,amount:x.amount*multiplier})),amount=sum(projected),denominator=family?(index==null?families.reduce((n,x)=>n+x[family],0n):families[index][family]):null;return {amount,sources:projected,denominator,percent:percentage(amount,denominator)}}
  function row(id,label,predicate,{family=kind==='pnl'?'revenue':null,multiplier=1n,groupKey=null,summary=false,subline=false}={}){const selected=buckets.map(rows=>rows.filter(predicate));return {id,label,groupKey,summary,subline,cells:selected.map((sources,index)=>cell(sources,index,family,multiplier)),total:cell(selected.flat(),null,family,multiplier)}}
  let rows=[];const entries=[...groupOptions].filter(([key])=>allowed(key));
  if(kind==='cash'){
   for(const [type,title] of [['in','Поступления'],['out','Выбытия']]){rows.push(row(type,title,x=>x.category===type,{family:type,multiplier:type==='out'?-1n:1n,summary:true}));for(const [key,label] of entries)rows.push(row(type+':'+key,label,x=>x.category===type&&x.groupKey===key,{family:type,multiplier:type==='out'?-1n:1n,groupKey:key,subline:true}))}
   rows.push(row('net','Чистый денежный поток',x=>x.category!=='transfer',{summary:true}));if(!scope.hideTransfers)rows.push(row('transfer','Технические переводы',x=>x.category==='transfer',{summary:true}));
  }else if(groupBy==='category'){
   for(const key of ['revenue','direct','wip'])rows.push(row(key,categories[key],x=>x.category===key,{groupKey:key}));
   rows.push(row('gross','Валовая прибыль',x=>['revenue','direct','wip'].includes(x.category),{summary:true}));
   for(const key of ['production','commercial','administrative'])rows.push(row(key,categories[key],x=>x.category===key,{groupKey:key}));
   rows.push(row('ebitda','EBITDA',x=>!['belowIncome','belowExpenses'].includes(x.category),{summary:true}));
   for(const key of ['belowIncome','belowExpenses'])rows.push(row(key,categories[key],x=>x.category===key,{groupKey:key}));
   rows.push(row('tax','В том числе налог на доход (прибыль)',x=>x.kind==='management-tax',{subline:true}));rows.push(row('result','Управленческий результат',()=>true,{summary:true}));
  }else{for(const [key,label] of entries)rows.push(row('group:'+key,label,x=>x.groupKey===key,{groupKey:key}));rows.push(row('result','Управленческий результат',()=>true,{summary:true}))}
  if(scope.hideZero)rows=rows.filter(row=>row.summary||row.cells.some(cell=>cell.amount!==0n));
  const rank=new Map((scope.rowOrder||[]).map((id,index)=>[id,index]));if(rank.size){for(let start=0;start<rows.length;){if(!rows[start].groupKey){start++;continue}let end=start+1;while(end<rows.length&&rows[end].groupKey)end++;const ordered=rows.slice(start,end).map((row,index)=>({row,index})).sort((a,b)=>(rank.get(a.row.id)??1e6+a.index)-(rank.get(b.row.id)??1e6+b.index)).map(x=>x.row);rows.splice(start,end-start,...ordered);start=end}}
  const all=buckets.flat(),totals=kind==='cash'?{income:sum(all.filter(x=>x.category==='in')),outgoing:-sum(all.filter(x=>x.category==='out')),net:sum(all.filter(x=>x.category!=='transfer')),transfers:sum(all.filter(x=>x.category==='transfer'))}:{revenue:sum(all.filter(x=>x.category==='revenue')),result:sum(all)};
  return {kind,groupBy,columns,rows,totals,groupOptions:[...groupOptions].map(([value,label])=>({value,label})),sourceCount:all.length,issues,scope};
 }
 function csv(view,core){const text=value=>'"'+String(value??'').replace(/^[\s]*[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"',lines=[[text('Статья'),...view.columns.map(c=>text(c.label)),text('Итого')].join(';')];for(const row of view.rows)lines.push([text(row.label),...row.cells.map(cell=>core.rubles(cell.amount)),core.rubles(row.total.amount)].join(';'));return '\ufeff'+lines.join('\r\n')}
 function money(amount){const negative=amount<0n,abs=negative?-amount:amount;return (negative?'−':'')+String(abs/100n).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+String(abs%100n).padStart(2,'0')+' ₽'}
 return Object.freeze({periods,snapshot,percentage,csv,money});
});
