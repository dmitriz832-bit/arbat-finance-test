'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const {cents}=require('../app/finance-core.js');
const SECTIONS=['deals','realizations','expenses','cash','labor','costs','workActs','crewSettlements','wallets','people'];
const WH_SECTIONS=['items','places','moves','projectIssues'];
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const rows=(data,key)=>Array.isArray(data?.[key])?data[key].filter(isRecord):[];
const validDate=value=>{const text=String(value),day=text.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(text))return false;const date=new Date(day+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===day};
const id=x=>String(x?._id??x?.id??'').trim();
function inspect(finance,warehouse){
 const errors=[],warnings=[],counts={},seen=new Map();
 const failure=(code,source,identifier)=>errors.push({code,source,id:identifier||''});
 const caution=(code,source,identifier)=>warnings.push({code,source,id:identifier||''});
 for(const [store,data,sections] of [['finance',finance,SECTIONS],['warehouse',warehouse,WH_SECTIONS]]){
  if(!data||typeof data!=='object'||Array.isArray(data)){failure('invalid-store',store);continue}
  for(const section of sections){
   const rows=data[section]===undefined?[]:data[section];
   if(!Array.isArray(rows)){failure('invalid-section',store+'.'+section);continue}
   counts[store+'.'+section]=rows.length;
   const ids=new Set();
   for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)){failure('invalid-document',store+'.'+section);continue}
    const key=id(row);
    if(key){if(ids.has(key))failure('duplicate-id',store+'.'+section,key);ids.add(key)}
    else caution('missing-id',store+'.'+section);
    if(row.amount!=null){try{cents(row.amount)}catch{failure('invalid-money',store+'.'+section,key)}}
    if(row.date!=null&&!validDate(row.date))failure('invalid-date',store+'.'+section,key);
   }
  }
 }
 const wallets=new Set(rows(finance,'wallets').map(id).filter(Boolean));
 const crew=new Set(rows(warehouse,'places').map(id).filter(Boolean));
 const people=new Set(rows(finance,'people').map(id).filter(Boolean));
 for(const x of rows(finance,'cash')){
  if(x.walletId&&!wallets.has(String(x.walletId)))caution('missing-wallet','finance.cash',id(x));
  if(x.type==='transfer'&&!x.toWalletId)failure('transfer-missing-destination','finance.cash',id(x));
 }
 for(const x of rows(finance,'labor'))if(x.personId&&!people.has(String(x.personId)))caution('missing-person','finance.labor',id(x));
 for(const x of rows(warehouse,'projectIssues'))if(x.crewId&&!crew.has(String(x.crewId)))caution('missing-crew-place','warehouse.projectIssues',id(x));
 const itemIds=new Set(rows(warehouse,'items').map(x=>String(x.id||'')).filter(Boolean));
 for(const deal of rows(finance,'deals')){
  if(deal.contractTotal!=null){try{if(cents(deal.contractTotal)<0n)failure('negative-contract','finance.deals',id(deal))}catch{failure('invalid-contract','finance.deals',id(deal))}}
 }
 for(const section of ['realizations','expenses']){
  for(const row of rows(finance,section)){
   if(row.projectKey!=null&&!String(row.projectKey).trim())caution('empty-project-link','finance.'+section,id(row));
   if(row.amount!=null){try{if(cents(row.amount)<0n)caution('negative-document-amount','finance.'+section,id(row))}catch{}}
  }
 }
 for(const x of rows(warehouse,'moves')){
  if(x.itemId&&!itemIds.has(String(x.itemId)))caution('unknown-material','warehouse.moves',id(x));
  if(x.qty!=null&&(!Number.isFinite(Number(x.qty))||Number(x.qty)<0))failure('invalid-quantity','warehouse.moves',id(x));
 }
 for(const x of rows(warehouse,'projectIssues')){
  if(x.lines!=null&&!Array.isArray(x.lines)){failure('invalid-section','warehouse.projectIssues.lines',id(x));continue}
  for(const line of x.lines||[]){
  if(!isRecord(line)){failure('invalid-document','warehouse.projectIssues.lines',id(x));continue}
  if(line.itemId&&!itemIds.has(String(line.itemId)))caution('unknown-material','warehouse.projectIssues',id(x));
  for(const prop of ['fromCrew','qty'])if(line[prop]!=null&&(!Number.isFinite(Number(line[prop]))||Number(line[prop])<0))failure('invalid-quantity','warehouse.projectIssues',id(x));
 }
 }
 const valuation=rows(finance,'expenses').filter(x=>x.valuationStatus==='requires-review').length;
 if(valuation)caution('unresolved-warehouse-cost','finance.expenses',String(valuation));
 return {ok:errors.length===0,errors,warnings,counts};
}
function packageBackup(finance,warehouse,metadata={}){
 const stores={finance:structuredClone(finance),warehouse:structuredClone(warehouse)};
 const digest=crypto.createHash('sha256').update(JSON.stringify(stores)).digest('hex');
 return {format:'arbat-finance-backup-v1',createdAt:new Date().toISOString(),source:metadata.source||'manual',revisions:metadata.revisions||null,digest,stores};
}
function verifyBackup(doc){
 if(!doc||doc.format!=='arbat-finance-backup-v1'||!doc.stores)throw Error('Unsupported backup envelope');
 const actual=crypto.createHash('sha256').update(JSON.stringify(doc.stores)).digest('hex');
 if(doc.digest!==actual)throw Error('Backup checksum mismatch');
 const findings=inspect(doc.stores.finance,doc.stores.warehouse);
 return {digest:actual,findings,finance:structuredClone(doc.stores.finance),warehouse:structuredClone(doc.stores.warehouse)};
}
function main(){
 const file=process.argv[2];if(!file){console.error('Usage: node scripts/verify-backup.cjs BACKUP.json');process.exitCode=2;return}
 const data=JSON.parse(fs.readFileSync(file,'utf8'));const r=verifyBackup(data);
 console.log(JSON.stringify({digest:r.digest,findings:r.findings},null,2));
 if(!r.findings.ok)process.exitCode=1;
}
if(require.main===module)main();
module.exports={inspect,packageBackup,verifyBackup};
