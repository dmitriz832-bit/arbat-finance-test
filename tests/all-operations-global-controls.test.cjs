const test=require('node:test'),assert=require('node:assert/strict'),core=require('../app/finance-core'),scanner=require('../scripts/verify-backup.cjs');
test('source scanner recognizes native person business IDs independently of row IDs',()=>{
 const findings=scanner.inspect({people:[{_id:'row-person',id:'person-business'}],labor:[{_id:'salary',personId:'person-business',amount:100},{_id:'orphan',personId:'missing',amount:1}]},{});
 assert.deepEqual(findings.warnings.filter(x=>x.code==='missing-person').map(x=>x.id),['orphan']);
});
test('current statutory active-year USN VAT defaults retain20m through2029 and dated tenant settings remain explicit',()=>{
 // Primary FNS /new2026/: active VAT year, not the year of preceding income.
 const cases=[['2025-06-30',6000000000n],['2026-06-30',2000000000n],['2027-06-30',2000000000n],['2028-06-30',2000000000n],['2029-06-30',2000000000n],['2030-06-30',1500000000n],['2031-06-30',1000000000n]];
 for(const [date,want] of cases)assert.equal(core.usnVatThreshold({},date).limit,want,date);
 const data={usnVatPolicies:[{_id:'custom',orgId:'air-climat',org:'АИР-КЛИМАТ',effectiveDate:'2027-02-01',threshold:'17000000.01',reason:'Явная настройка',createdBy:'accountant',createdAt:'2026-10-27T00:00:00Z'}]};
 assert.equal(core.usnVatThreshold(data,'2027-01-31').limit,2000000000n);assert.equal(core.usnVatThreshold(data,'2027-02-01').limit,1700000001n);
});
test('offline source scanner discloses missing, duplicate and foreign generated expense cards without losing known expense',()=>{
 const data={fixedAssets:[{_id:'dup',org:'АИР-КЛИМАТ'},{_id:'dup',org:'АИР-КЛИМАТ'},{_id:'foreign',org:'АРБАТ.ГК'}],loanContracts:[],costs:[{_id:'missing',org:'АИР-КЛИМАТ',sourceLoanId:'gone',amount:'1.01'},{_id:'ambiguous',org:'АИР-КЛИМАТ',sourceAssetId:'dup',amount:'2.02'},{_id:'other-org',org:'АИР-КЛИМАТ',sourceAssetId:'foreign',amount:'3.03'}]};
 const result=scanner.inspect(data,{items:[],places:[],moves:[],projectIssues:[]});
 assert.ok(result.warnings.some(x=>x.code==='generated-expense-source-review'&&x.id==='missing'));
 assert.ok(result.warnings.some(x=>x.code==='generated-expense-source-review'&&x.id==='ambiguous'));
 assert.ok(result.warnings.some(x=>x.code==='generated-expense-source-review'&&x.id==='other-org'));
 assert.equal(core.expenseLedger(data).rows.reduce((n,r)=>n+r.amount,0n),606n);
});
test('registered balance inventory honors exact remaining FIFO cents instead of re-rounding unit multiplication',()=>{
 const b=require('../app/balance-workspace-model'),org='АИР-КЛИМАТ',warehouse={items:[{id:'i',name:'Материал'}],places:[{id:'s',org}],moves:[{id:'r',itemId:'i',org,kind:'receipt',date:'2026-10-01',to:'s',qty:3,price:'10.01'}]};
 const fifo=()=>({bins:new Map([['s::i',[{source:'r',qty:2.5,cost:10.01,valueCents:'2502',date:'2026-10-01'}]]]),byMove:{},warnings:[]});
 assert.equal(b.snapshot({},warehouse,{today:'2026-10-27',org,fifo}).inventory.total,2502n);
 const invalid=()=>({bins:new Map([['s::i',[{source:'r',qty:2.5,cost:10.01,valueCents:'bad',date:'2026-10-01'}]]]),byMove:{},warnings:[]});
 assert.equal(b.snapshot({},warehouse,{today:'2026-10-27',org,fifo:invalid}).inventory.total,null);
});
test('future registered advance refund cannot invalidate an earlier customer balance',()=>{
 const b=require('../app/balance-workspace-model'),org='АИР-КЛИМАТ',deal={_id:'p',org,order1c:'p',name:'Контроль',contractTotal:'30.00',vatRate:0},key=core.dealKey(deal);
 const data={deals:[deal],cash:[{_id:'in',org,type:'in',date:'2026-10-01',amount:'30.00',projectKey:key,customerId:'buyer'}],vatAdvanceEvents:[{_id:'advance',kind:'received',org,date:'2026-10-01',amount:'30.00',cashId:'in',vatRate:0,document:'Аванс'}]};
 assert.equal(b.snapshot(data,{}, {org,today:'2026-10-31'}).clientAdvances.total,3000n);
 data.cash.push({_id:'refund',org,type:'out',date:'2026-11-01',amount:'20.00',customerId:'buyer'});data.vatAdvanceEvents.push({_id:'return',kind:'refund',org,date:'2026-11-01',amount:'20.00',cashId:'refund',advanceId:'advance',document:'Возврат'});
 const before=JSON.stringify(data);assert.equal(b.snapshot(data,{}, {org,today:'2026-10-31'}).clientAdvances.total,3000n);assert.equal(b.snapshot(data,{}, {org,today:'2026-11-01'}).clientAdvances.total,1000n);assert.equal(JSON.stringify(data),before);
});
test('balance and warehouse retain authoritative printed gross100 even with rounded unit price33.33',()=>{
 const b=require('../app/balance-workspace-model'),org='АИР-КЛИМАТ',warehouse={items:[{id:'i'}],places:[{id:'s',org}],moves:[{id:'r',itemId:'i',org,kind:'receipt',date:'2026-10-01',to:'s',qty:3,price:'33.33',amountGross:'100.00'}]};
 const fifo=()=>({bins:new Map([['s::i',[{source:'r',qty:3,cost:33.33,valueCents:'10000',date:'2026-10-01'}]]]),byMove:{},warnings:[]});
 assert.equal(b.snapshot({},warehouse,{today:'2026-10-27',org,fifo}).inventory.total,10000n);assert.equal(core.ownerWarehouseSnapshot(warehouse,fifo(),org).totalValue,10000n);
});
