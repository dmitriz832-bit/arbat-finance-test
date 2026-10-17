const test=require('node:test'),assert=require('node:assert/strict'),f=require('../app/finance-core.js');
test('60% realization recognizes proportional project cost; remainder stays WIP',()=>{
 const deal={org:'A',order1c:'WIP1',contractTotal:'122000',vatRate:22};
 const key=f.dealKey(deal);
 const data={deals:[deal],realizations:[{org:'A',projectKey:key,date:'2026-10-12',amount:'73200',vatRate:22}],expenses:[
 {projectKey:key,org:'A',date:'2026-10-10',amount:'24400',vatRate:22,vatDeductible:true},
 {projectKey:key,org:'A',date:'2026-10-10',amount:'5000',warehouseMoveId:'stock-1'}
 ],workActs:[{id:'act1',org:'A',projectKey:key,date:'2026-10-10',status:'approved',qty:1,rate:'8000'}],labor:[{org:'A',projectKey:key,date:'2026-10-11',amount:'10000',employerContributions:'3000'}]};
 const v=f.projectWipSnapshot(data,deal,key,'2026-10');
 for(const [field,want] of Object.entries({contractNet:'100000.00',revenue:'60000.00',accruedCost:'46000.00',recognizedCost:'27600.00',wip:'18400.00',operatingProfit:'32400.00'}))assert.equal(f.rubles(v[field]),want,field);
 assert.equal(v.status,'calculated');
});
test('cost incurred before first realization is WIP, not period P&L',()=>{
 const deal={org:'A',order1c:'WIP2',contractTotal:100,vatRate:0},projectKey=f.dealKey(deal);
 const data={deals:[deal],costs:[{org:'A',projectKey,date:'2026-09-20',amount:60}],realizations:[{org:'A',projectKey,date:'2026-10-01',amount:50,vatRate:0}]};
 const september=f.projectWipSnapshot(data,deal,projectKey,'2026-09');assert.equal(f.rubles(september.wip),'60.00');assert.equal(f.rubles(september.currentCost),'0.00');
 const october=f.projectWipSnapshot(data,deal,projectKey,'2026-10');assert.equal(f.rubles(october.currentCost),'30.00');assert.equal(f.rubles(october.wip),'30.00');assert.equal(f.rubles(october.previouslyRecognizedCost),'0.00');
});
test('unknown contract and uncertain FIFO are flagged, not shown as certain profit',()=>{
 const deal={org:'A',order1c:'WIP3'},key=f.dealKey(deal);
 const r=f.projectWipSnapshot({},deal,key,'2026-10');assert.equal(r.status,'requires-review');assert.equal(r.contractNet,null);
 const d={...deal,contractTotal:100,vatRate:0,_id:'deal-3'};
 const w=f.projectWipSnapshot({warehouse:{moves:[{dealId:'deal-3',kind:'consume',projectIssueId:'issue'}]}},d,key,'2026-10');assert.ok(w.issues.includes('warehouse-fifo-unavailable'));
});
