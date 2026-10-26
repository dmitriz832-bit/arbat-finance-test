const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../app/finance-core.js'),payables=require('../app/payables-model.js');
const model=fs.existsSync(require.resolve('../app/finance-core.js').replace('finance-core.js','tax-pnl-model.js'))?require('../app/tax-pnl-model.js'):{};
const input=(period,amount,org='АРБАТ.ГК')=>({period,amount,org,tax:org==='АРБАТ.ГК'?'profit':'usn',document:'Расчёт бухгалтера'});
const month=(data,period,amount,org)=>({...data,costs:model.upsert(data,input(period,amount,org),()=>period+'-'+org).costs});
test('monthly tax accrual changes profit once below EBITDA without changing cash supplier debt or confirmed tax obligations',()=>{
 assert.equal(typeof model.upsert,'function');let d={realizations:[{org:'АРБАТ.ГК',date:'2026-04-10',amount:1220,vatRate:22}],cash:[],costs:[]};
 d=month(d,'2026-04','100.00');const first=d.costs[0]._id;d=month(d,'2026-04','150.00');assert.equal(d.costs.length,1);assert.equal(d.costs[0]._id,first);
 const pnl=core.preliminaryPeriod(d,'2026-04','АРБАТ.ГК');assert.equal(pnl.ebitda,100000n);assert.equal(pnl.result,85000n);assert.equal(core.ownerPeriodSnapshot(d,core.ownerPeriodBounds('month','2026-04-15'),'АРБАТ.ГК').result,85000n);assert.deepEqual(payables.snapshot(d).documents,[]);assert.deepEqual(d.cash,[]);assert.equal(d.taxObligationEvents,undefined);
 assert.equal(core.quarterTaxSnapshot(d,'2026-04-15').arbat.profitExpenses,0n);
});
test('quarter correction replaces monthly values in exact cents and preserves unrelated sources',()=>{
 assert.equal(typeof model.correction,'function');let d={costs:[]};for(const [p,a] of [['2026-04','100'],['2026-05','200'],['2026-06','300'],['2026-07','70']])d=month(d,p,a);d=month(d,'2026-04','40','АИР-КЛИМАТ');const original=JSON.stringify(d);
 const r=model.correction(d,{reference:'2026-05-15',org:'АРБАТ.ГК',tax:'profit',total:'500.00',document:'Уточнённый расчёт'});assert.deepEqual(r.preview.map(x=>x.after),[8333n,16667n,25000n]);assert.equal(r.preview.reduce((n,x)=>n+x.after,0n),50000n);assert.equal(JSON.stringify(d),original);assert.equal(r.costs.find(x=>x.org==='АИР-КЛИМАТ').amount,'40.00');assert.equal(r.costs.find(x=>x.managementTaxPeriod==='2026-07').amount,'70.00');assert.equal(new Set(r.costs.map(x=>x._id)).size,5);
});
test('invalid or ambiguous rows are rejected and zero base never invents a distribution',()=>{
 assert.equal(typeof model.upsert,'function');const d=month({costs:[]},'2026-04','0');assert.equal(d.costs[0].amount,'0.00');assert.throws(()=>model.upsert(d,{...input('2026-13','1')},()=>''),/месяц/i);assert.throws(()=>model.upsert(d,input('2026-04','-1'),()=>''),/сумм/i);assert.throws(()=>model.upsert(d,{...input('2026-04','1'),tax:'vat'},()=>''),/налог|организац/i);assert.throws(()=>model.correction(d,{reference:'2026-04-10',org:'АРБАТ.ГК',tax:'profit',total:'1',document:'Корректировка'}),/начислен|баз/i);
 const duplicate={costs:[d.costs[0],{...d.costs[0],_id:'duplicate'}]};assert.throws(()=>model.upsert(duplicate,input('2026-04','1'),()=>''),/дубл|несколько/i);
});
test('large correction and ties keep exact cents without floating point loss',()=>{
 assert.equal(typeof model.correction,'function');let d={costs:[]};for(const p of ['2026-04','2026-05','2026-06'])d=month(d,p,'100000000000000.01');const r=model.correction(d,{reference:'2026-05-15',org:'АРБАТ.ГК',tax:'profit',total:'900000000000000.02',document:'Корректировка'});assert.equal(r.preview.reduce((n,x)=>n+x.after,0n),90000000000000002n);assert.ok(r.preview.every(x=>x.after===30000000000000001n||x.after===30000000000000000n));
});
test('management tax keeps its P&L meaning and invalid or duplicate documents cannot silently affect profit',()=>{
 let d=month({costs:[]},'2026-04','100');d.costs[0].pnlType='income';d.costs[0].pnlLevel='above';d.costs[0].pnlGroup='Административные';const p=core.preliminaryPeriod(d,'2026-04');assert.equal(p.ebitda,0n);assert.equal(p.result,-10000n);assert.equal(p.incomeTax,10000n);assert.equal(core.ownerPeriodSnapshot(d,core.ownerPeriodBounds('quarter','2026-04-15')).incomeTax,10000n);
 const broken={costs:[{...d.costs[0],date:'2026-05-31'}]},duplicate={costs:[d.costs[0],{...d.costs[0],_id:'dup'}]};for(const data of [broken,duplicate]){const x=core.preliminaryPeriod(data,'');assert.equal(x.result,0n);assert.ok(x.issues.some(i=>i.code==='invalid-management-tax'));}
});
test('tax accrual classification never becomes taxable revenue or deduction after generic metadata edits',()=>{
 const d=month({costs:[]},'2026-04','100');d.costs[0].pnlType='income';assert.equal(core.quarterTaxSnapshot(d,'2026-05-15').arbat.profitRevenue,0n);d.costs[0].pnlType='expense';Object.assign(d.costs[0],{profitTaxDeductible:true,profitTaxRecognitionDate:'2026-04-30',profitTaxDocument:'Сторонняя правка'});assert.equal(core.quarterTaxSnapshot(d,'2026-05-15').arbat.profitExpenses,0n);
});
test('tax drilldown contains only monthly accruals and opens their dedicated documents',()=>{const experience=require('../app/experience-model.js');const d=month({costs:[],realizations:[{org:'АРБАТ.ГК',date:'2026-04-15',amount:1220,vatRate:22}]},'2026-04','100');const s=core.ownerPeriodSnapshot(d,core.ownerPeriodBounds('month','2026-04-15'));const rows=experience.financialRows(s,'taxPnl',core);assert.equal(rows.length,1);assert.equal(rows[0].amount,10000n);assert.equal(rows[0].collection,'taxPnl');assert.equal(rows[0].id,d.costs[0]._id);});
test('later dated duplicate cannot make earlier monthly tax report look valid',()=>{const d=month({costs:[]},'2026-04','100');for(const other of [{...d.costs[0],_id:'later',date:'2026-05-31'},{_id:d.costs[0]._id,date:'2026-05-31',org:'АРБАТ.ГК',name:'Другой документ',amount:1,vatRate:0}]){const data={costs:[d.costs[0],other]};for(const p of [core.preliminaryPeriod(data,'2026-04'),core.ownerPeriodSnapshot(data,core.ownerPeriodBounds('month','2026-04-15'))]){assert.equal(p.result,0n);assert.ok(p.issues.some(i=>i.code==='invalid-management-tax'));}}});
test('independent first creations of the same monthly tax use one identity for CAS conflict detection',()=>{const a=model.upsert({costs:[]},input('2026-04','100')),b=model.upsert({costs:[]},input('2026-04','200')),air=model.upsert({costs:[]},input('2026-04','100','АИР-КЛИМАТ'));assert.equal(a.row._id,b.row._id);assert.notEqual(a.row._id,air.row._id);});
