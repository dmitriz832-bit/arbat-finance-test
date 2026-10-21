const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'app/index.html'),'utf8'),core=require('../app/finance-core');
function declaration(name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=html.indexOf('function ',start+9);return html.slice(start,end<0?undefined:end)}
function fixture(){
 const deal={_id:'AUDIT-20261017-project',org:'АИР-КЛИМАТ',order1c:'AUDIT-20261017-1',name:'Audit project',dir:'Service',contractTotal:'100000',cost:'50000'};
 const key=core.dealKey(deal),base={org:deal.org,date:'2026-10-17'};
 return {deals:[deal],people:[],realizations:[{...base,projectKey:key,amount:'60000'}],expenses:[{...base,projectKey:key,amount:'10000'}],workActs:[{...base,id:'AUDIT-20261017-act',projectKey:key,qty:1,rate:'2000',status:'approved',memberIds:['one','two','three']}],costs:[{...base,dir:'Service',amount:'3000'},{...base,amount:'4000'}],labor:[{...base,expenseType:'administrative',amount:'10000',employerContributions:'3000'}],cash:[],wallets:[],calendar:[],articles:[]};
}
function runtime(db){
 const inputs={orgFilter:{value:'',addEventListener(){}},reportYear:{value:'2026'},reportType:{value:'pnl'}};
 const ctx={db,dirs:['Service'],document:{getElementById:id=>inputs[id]||null},localStorage:{getItem:()=>null},Date:class extends Date{constructor(...args){super(...(args.length?args:['2026-10-17T12:00:00Z']))}static now(){return new Date('2026-10-17T12:00:00Z').getTime()}},console};
 ctx.window={ArbatFinanceCore:core,arbatDealKey:core.dealKey,ArbatExperience:require('../app/experience-model')};vm.createContext(ctx);
 vm.runInContext(`const f=x=>Number(x||0).toFixed(2);`+['monthNumbers','percentText','reportPercentRow','reportRow','reportData','dealMargin','projectCost','settlementShares'].map(declaration).join('\n'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'app/dashboard.js'),'utf8'),ctx);
 return ctx;
}
test('actual report, dashboard, project card and table adapters execute against a shared fixture',()=>{
 const db=fixture(),before=JSON.stringify(db),ctx=runtime(db),result=vm.runInContext('reportData()',ctx);
 const row=result.rows.find(x=>x[0]==='ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ');assert.equal(row[10],'32800.00');assert.equal(row[13],'32800.00');assert.equal(row[9],'0.00');
 const p=vm.runInContext('dealMargin(db.deals[0])',ctx);assert.equal(p.actualProfit,52800);assert.equal(p.wipProfit,52800);assert.equal(p.recognizedCost,7200);assert.equal(p.wipBalance,4800);assert.equal(vm.runInContext('projectCost(window.arbatDealKey(db.deals[0]))',ctx),12000);
 // Freeze the runtime clock to the fixture month.
 const snapshot=ctx.window.arbatDashboardSnapshot();assert.equal(snapshot.projects[0].cost,12000);assert.equal(snapshot.directions[0].result,45000);
 assert.equal(snapshot.totals.operating,32800);assert.equal(snapshot.financial.result,core.ownerPeriodSnapshot({...db,wipAccounting:true},core.ownerPeriodBounds('month','2026-10-17')).result);
 vm.runInContext('reportData(); reportData()',ctx);assert.equal(JSON.stringify(db),before);
});
test('runtime adapters preserve linked-act contributions and project general expenses',()=>{
 const db=fixture(),key=core.dealKey(db.deals[0]);db.labor.push({org:db.deals[0].org,date:'2026-10-17',projectKey:key,workActId:'AUDIT-20261017-act',amount:'2000',employerContributions:'600'});db.costs.push({org:db.deals[0].org,date:'2026-10-17',projectKey:key,amount:'100'});
 const ctx=runtime(db);assert.equal(vm.runInContext('projectCost(window.arbatDealKey(db.deals[0]))',ctx),12700);
 const report=vm.runInContext('reportData()',ctx);assert.equal(report.rows.find(x=>x[0]==='ПРЕДВАРИТЕЛЬНЫЙ РЕЗУЛЬТАТ')[10],'27300.00');
 const snap=ctx.window.arbatDashboardSnapshot();assert.equal(snap.projects[0].cost,12700);assert.equal(snap.directions[0].cost,15700);
});
test('runtime crew shares conserve full act value with remainder on the last employee',()=>{
 const ctx=runtime(fixture()),parts=vm.runInContext("settlementShares({memberIds:['c','a','b'],rate:'100',qty:'1'})",ctx);
 assert.equal(JSON.stringify(parts),JSON.stringify([{personId:'a',amount:33.33},{personId:'b',amount:33.33},{personId:'c',amount:33.34}]));
});
module.exports={runtime};
test('actual cash report includes unclassified receipts and preserves decimal totals',()=>{
 const d=fixture();d.cash=[{org:'АИР-КЛИМАТ',date:'2026-10-17',type:'in',amount:'0.10'},{org:'АИР-КЛИМАТ',date:'2026-10-17',type:'in',amount:'0.20'},{org:'АИР-КЛИМАТ',date:'2026-10-17',type:'out',amount:'1.00'},{org:'АИР-КЛИМАТ',date:'2026-10-17',type:'transfer',amount:'100.00'}];
 const ctx=runtime(d);ctx.document.getElementById('reportType').value='cash';const result=vm.runInContext('reportData()',ctx);
 assert.equal(result.rows.find(x=>x[0]==='ПОСТУПЛЕНИЯ')[10],'0.30');assert.equal(result.rows.find(x=>x[0]==='ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК')[10],'-0.70');assert.equal(result.rows.find(x=>x[0]===' ↳ Не классифицировано')[10],'0.30');assert.equal(result.rows.find(x=>x[0]==='Технические переводы (не включены)')[10],'100.00');
});
