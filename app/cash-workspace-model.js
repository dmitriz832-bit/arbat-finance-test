/* DDS is a read-only query over original documents. Financial arithmetic stays in the core. */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatCashWorkspace=api})(typeof window==='object'?window:globalThis,core=>{
 'use strict';
 const text=value=>String(value??''),normalize=value=>text(value).toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 const partyKey=row=>row.customerId?'cp:'+row.customerId:row.personId?'person:'+row.personId:row.counterparty?'text:'+row.counterparty:'no-party';
 const projectKeys=row=>[...new Set([row.projectKey,...(Array.isArray(row.allocations)?row.allocations:[]).map(x=>x.projectKey)].filter(Boolean))];
 function describe(data,row){
  const wallet=id=>(data.wallets||[]).find(w=>w.id===id)?.name||'Не указан',articleId=row.type==='transfer'?'internal-transfer':row.articleId||'no-article';
  const article=row.type==='transfer'?'Перевод между своими счетами':(data.articles||[]).find(a=>a.id===row.articleId)?.name||'Не классифицировано';
  const party=(data.counterparties||[]).find(p=>p.id===row.customerId)?.name||(data.people||[]).find(p=>p.id===row.personId)?.name||row.counterparty||'Без контрагента';
  const projects=projectKeys(row),projectNames=projects.map(key=>(data.deals||[]).find(d=>core.dealKey(d)===key)?.name||key);
  let amount;try{amount=core.rubles(core.cents(row.amount||0))}catch{amount=text(row.amount)}
  return {row,articleId,article,walletId:row.walletId||'no-wallet',wallet:wallet(row.walletId),destination:row.type==='transfer'?wallet(row.toWalletId):'',partyId:partyKey(row),party,projects,projectNames,amount,date:text(row.date).slice(0,10)};
 }
 function totals(entries){
  const issues=[],valid=[];
  for(const entry of entries){try{core.cents(entry.amount||0);if(!['in','out','transfer'].includes(entry.type))throw Error();valid.push(entry)}catch{issues.push(text(entry._id||entry.id))}}
  const {income,outgoing,transfers,net}=core.cashFlow(valid);return {totals:{income,outgoing,transfers,net},complete:!issues.length,issues};
 }
 function snapshot(data={},state={}){
  const scope=(data.cash||[]).filter(row=>!state.org||row.org===state.org),all=scope.map(row=>describe(data,row));
  const error=state.from&&state.to&&state.from>state.to?'Укажите начало периода не позже окончания.':'';
  const words=normalize(state.search).trim().split(/\s+/).filter(Boolean);
  const entries=error?[]:all.filter(entry=>{
   const row=entry.row;
   if(state.from&&entry.date<state.from||state.to&&entry.date>state.to||state.day&&entry.date!==state.day)return false;
   if(state.type&&state.type!=='all'&&row.type!==state.type||state.articleId&&entry.articleId!==state.articleId||state.walletId&&entry.walletId!==state.walletId&&(row.type!=='transfer'||row.toWalletId!==state.walletId)||state.partyId&&entry.partyId!==state.partyId||state.projectKey&&!entry.projects.includes(state.projectKey))return false;
   const haystack=normalize([entry.date,row.org,entry.wallet,entry.destination,entry.article,entry.party,...entry.projectNames,row.note,row.amount,entry.amount+' ₽',entry.amount.replace('.',',')+' ₽',{in:'Поступление',out:'Расход',transfer:'Перевод'}[row.type]].join(' '));
   return words.every(word=>haystack.includes(word));
  });
  const groups=new Map(),groupBy=state.groupBy||'date';
  for(const entry of entries){
   const [key,label]=groupBy==='article'?[entry.articleId,entry.article]:groupBy==='wallet'?[entry.walletId,entry.wallet]:groupBy==='party'?[entry.partyId,entry.party]:groupBy==='month'?[entry.date.slice(0,7),entry.date.slice(0,7)||'Без даты']:[entry.date,entry.date||'Без даты'];
   if(!groups.has(key))groups.set(key,{key,label,rows:[]});groups.get(key).rows.push(entry.row);
  }
  const rows=entries.map(entry=>entry.row),summary=totals(rows),groupRows=[...groups.values()].map(group=>({...group,count:group.rows.length,...totals(group.rows)}));
  groupRows.sort((a,b)=>groupBy==='date'||groupBy==='month'?a.key.localeCompare(b.key):a.label.localeCompare(b.label,'ru'));
  const options={article:new Map(),wallet:new Map(),party:new Map(),project:new Map()};
  for(const entry of all){options.article.set(entry.articleId,entry.article);options.wallet.set(entry.walletId,entry.wallet);if(entry.row.type==='transfer'&&entry.row.toWalletId)options.wallet.set(entry.row.toWalletId,entry.destination);options.party.set(entry.partyId,entry.party);entry.projects.forEach((key,i)=>options.project.set(key,entry.projectNames[i]));}
  return {rows,entries,groups:groupRows,...summary,complete:!error&&summary.complete,error,scopeCount:scope.length,options:Object.fromEntries(Object.entries(options).map(([key,map])=>[key,[...map].map(([id,label])=>({id,label})).sort((a,b)=>a.label.localeCompare(b.label,'ru'))]))};
 }
 return Object.freeze({snapshot});
});
