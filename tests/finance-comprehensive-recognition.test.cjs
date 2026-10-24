const test=require('node:test');
const assert=require('node:assert/strict');
const f=require('../app/finance-core.js');

test('zero-weight P&L target never receives the rounding remainder',()=>{
  const data={costs:[{org:'A',date:'2026-10-01',amount:'0.01',pnlAllocationRule:'proportional',pnlAllocations:[{dir:'One',weight:1},{dir:'Two',weight:1},{dir:'Excluded',weight:0}]}]};
  const ledger=f.expenseLedger(data);
  assert.deepEqual(ledger.rows.map(x=>x.amount),[0n,1n,0n]);
  assert.equal(f.directionSnapshot(data,'Excluded','2026-10').cost,0n);
  assert.deepEqual(f.allocate('-0.01',[1,1,0]),[0n,-1n,0n]);
});

test('proportional expense cannot be credited to another organizations existing project',()=>{
  const a={org:'A',name:'Own',dir:'Own direction'},b={org:'B',name:'Foreign',dir:'Foreign direction'};
  const data={deals:[a,b],costs:[{org:'A',date:'2026-10-01',amount:'100.00',pnlGroup:'Общепроизводственные',pnlAllocationRule:'proportional',pnlAllocations:[{projectKey:f.dealKey(a),weight:1},{projectKey:f.dealKey(b),weight:1}]}]};
  const ledger=f.expenseLedger(data);
  assert.ok(ledger.issues.some(x=>x.code==='invalid-pnl-allocation-target'));
  assert.equal(f.projectSnapshot(data,b,f.dealKey(b)).cost,0n);
  assert.equal(f.projectSnapshot(data,a,f.dealKey(a)).cost,0n);
  assert.equal(f.preliminaryPeriod(data,'2026-10','A').production,10000n);
  assert.equal(f.preliminaryPeriod(data,'2026-10','B').production,0n);
  assert.equal(f.directionReconciliation(data,'2026-10','A').unallocatedExpense,10000n);
});

test('quarter snapshot classifies taxable other income as revenue and output VAT',()=>{
  const data={
    realizations:[{org:'АРБАТ.ГК',date:'2026-10-01',amountGross:'122000',vatRate:22}],
    costs:[{org:'АРБАТ.ГК',date:'2026-10-02',amountGross:'12200',vatRate:22,pnlType:'income',vatDeductible:true}]
  };
  const q=f.quarterTaxSnapshot(data,'2026-10-23').arbat;
  // 100,000 sales + 10,000 other income; VAT 22,000 + 2,200.
  assert.equal(q.profitRevenue,11000000n);
  assert.equal(q.profitExpenses,0n);
  assert.equal(q.profitTax,2750000n);
  assert.equal(q.outputVat,2420000n);
  assert.equal(q.inputVat,0n);
  assert.equal(q.payable,2420000n);
});

test('quarter snapshot resolves income article metadata and its negative correction',()=>{
  const data={pnlArticles:[{id:'interest',name:'Other income',type:'income'}],costs:[
    {org:'АРБАТ.ГК',date:'2026-10-02',amountGross:'12200',vatRate:22,pnlArticleId:'interest'},
    {org:'АРБАТ.ГК',date:'2026-10-03',amountGross:'-2440',vatRate:22,pnlArticleId:'interest'},
    {org:'АРБАТ.ГК',date:'2026-10-04',amountGross:'6100',vatRate:22,pnlType:'income',profitTaxable:false,taxExclusionReason:'Подтверждённое основание исключения из базы налога на прибыль'}
  ]};
  const q=f.quarterTaxSnapshot(data,'2026-10-23').arbat;
  assert.equal(q.profitRevenue,800000n);
  assert.equal(q.profitExpenses,0n);
  assert.equal(q.profitTax,200000n);
  assert.equal(q.outputVat,286000n);
  assert.equal(q.inputVat,0n);
});

test('future unverified project expense cannot change an earlier month WIP result',()=>{
  const deal={org:'A',name:'Historical',contractTotal:'100.00',vatRate:0,dir:'Service'},key=f.dealKey(deal);
  const data={deals:[deal],wipAccounting:true,expenses:[
    {org:'A',projectKey:key,date:'2026-09-01',amount:'60.00'},
    {org:'A',projectKey:key,date:'2026-11-01',amount:'20.00',valuationStatus:'requires-review'}
  ],realizations:[{org:'A',projectKey:key,date:'2026-10-01',amount:'50.00',vatRate:0}]};
  const october=f.projectWipSnapshot(data,deal,key,'2026-10');
  assert.equal(october.status,'calculated');
  assert.equal(october.recognizedCost,3000n);
  assert.equal(october.wip,3000n);
  assert.equal(f.preliminaryPeriod(data,'2026-10','A').result,2000n);
  assert.equal(f.ownerPeriodSnapshot(data,{from:'2026-10-01',to:'2026-10-31'},'A').result,2000n);
  assert.equal(f.projectWipSnapshot(data,deal,key,'2026-11').status,'requires-review');
});

test('three-month independent control reconciles VAT, payroll, WIP and expense correction',()=>{
  const deal={org:'АРБАТ.ГК',name:'Control',dir:'Service',contractTotal:'122000',vatRate:22},key=f.dealKey(deal);
  const source={org:deal.org,projectKey:key};
  const data={deals:[deal],wipAccounting:true,expenses:[
    {...source,date:'2026-09-01',amountGross:'48800',vatRate:22,vatDeductible:true},
    {...source,date:'2026-10-01',amountGross:'12200',vatRate:22,vatDeductible:false},
    {...source,date:'2026-11-01',amountGross:'-1220',vatRate:22,vatDeductible:false}
  ],labor:[{...source,date:'2026-09-30',amount:'10000',employerContributions:'3000',personId:'p'}],realizations:[
    {...source,date:'2026-10-15',amountGross:'61000',vatRate:22},
    {...source,date:'2026-11-15',amountGross:'61000',vatRate:22}
  ],costs:[
    {org:deal.org,date:'2026-10-01',amountGross:'6100',vatRate:22,vatDeductible:true,pnlGroup:'Административные'},
    {org:deal.org,date:'2026-10-01',amountGross:'1220',vatRate:22,pnlType:'income'}
  ],cash:[{org:deal.org,date:'2026-10-01',amount:'999999',type:'in'}]};
  const before=JSON.stringify(data);
  // Sep: 40,000 net materials + 10,000 gross wages + 3,000 contributions, all WIP.
  // Oct: (53,000 + 12,200) * 50% = 32,600 cost; result 50,000 - 32,600 - 5,000 + 1,000.
  // Nov: cumulative direct cost 63,980; recognize remaining 31,380, leaving zero WIP.
  const cases=[['2026-09',0n,5300000n],['2026-10',1340000n,3260000n],['2026-11',1862000n,0n]];
  for(const [period,result,wip] of cases){
    assert.equal(f.preliminaryPeriod(data,period,deal.org).result,result);
    assert.equal(f.ownerPeriodSnapshot(data,{from:period+'-01',to:period+'-31'},deal.org).result,result);
    assert.equal(f.projectWipSnapshot(data,deal,key,period).wip,wip);
    assert.equal(f.directionReconciliation(data,period,deal.org).difference,0n);
  }
  assert.equal(f.ownerPeriodSnapshot(data,{from:'',to:''},deal.org).result,3202000n);
  assert.equal(f.projectWipSnapshot(data,deal,key,'2026-11').closedCostReconciled,true);
  assert.equal(JSON.stringify(data),before);
});
