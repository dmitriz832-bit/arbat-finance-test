'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const {cents}=require('../app/finance-core.js');
const SECTIONS=['deals','realizations','expenses','cash','labor','costs','workActs','crewSettlements'];
const WH_SECTIONS=['items','places','moves','projectIssues'];
const id=x=>String(x?._id??x?.id??'').trim();
function inspect(finance,warehouse){
 const errors=[],warnings=[],counts={},seen=new Map();
 const failure=(code,source,identifier)=>errors.push({code,source,id:identifier||''});
 const caution=(code,source,identifier)=>warnings.push({code,source,id:identifier||''});
 for(const [store,data,sections] of [['finance',finance,SECTIONS],['warehouse',warehouse,WH_SECTIONS]]){
  if(!data||typeof data!=='object'||Array.isArray(data)){failure('invalid-store',store);continue}
  for(const section of sections){
   const rows=data[section]??[];
   if(!Array.isArray(rows)){failure('invalid-section',store+'.'+section);continue}
   counts[store+'.'+section]=rows.length;
   const ids=new Set();
   for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)){failure('invalid-document',store+'.'+section);continue}
    const key=id(row);
    if(key){if(ids.has(key))failure('duplicate-id',store+'.'+section,key);ids.add(key)}
    else caution('missing-id',store+'.'+section);
    if(row.amount!=null){try{cents(row.amount)}catch{failure('invalid-money',store+'.'+section,key)}}
    if(row.date!=null&&!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(row.date)))failure('invalid-date',store+'.'+section,key);
   }
  }
 }
 const wallets=new Set((finance.wallets||[]).map(id).filter(Boolean));
 const crew=new Set((warehouse.places||[]).map(id).filter(Boolean));
 const people=new Set((finance.people||[]).map(id).filter(Boolean));
 for(const x of finance.cash||[]){
  if(x.walletId&&!wallets.has(String(x.walletId)))caution('missing-wallet','finance.cash',id(x));
  if(x.type==='transfer'&&!x.toWalletId)failure('transfer-missing-destination','finance.cash',id(x));
 }
 for(const x of finance.labor||[])if(x.personId&&!people.has(String(x.personId)))caution('missing-person','finance.labor',id(x));
 for(const x of warehouse.projectIssues||[])if(x.crewId&&!crew.has(String(x.crewId)))caution('missing-crew-place','warehouse.projectIssues',id(x));
 const valuation=(finance.expenses||[]).filter(x=>x.valuationStatus==='requires-review').length;
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
