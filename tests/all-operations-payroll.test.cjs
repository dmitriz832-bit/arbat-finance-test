/* Independent literal-control payroll audit. All data is local; no remote finance calls. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../app/finance-core'),management=require('../app/management-workspace-model');
const A='АИР-КЛИМАТ',B='АРБАТ.ГК',period='2026-10',date='2026-10-04';
function fixture(){
 const deals=[{_id:'d1',org:A,name:'Payroll project 1',order1c:'PAY-1',dir:'Кондиционирование',contractTotal:1000},{_id:'d2',org:A,name:'Payroll project 2',order1c:'PAY-2',dir:'Сервис и ТО',contractTotal:1000}];
 const k1=A+'::1C#PAY-1',k2=A+'::1C#PAY-2';
 return {deals,people:[{id:'admin',expenseType:'administrative'},...['a','b','c'].map(id=>({id,expenseType:'production'}))],
  workActs:[{id:'act',org:A,date,status:'approved',projectKey:k1,qty:'0.3333',rate:'300.06',memberIds:['c','a','b']}],
  labor:[{_id:'admin',org:A,date,personId:'admin',amount:'1000.01',ndfl:'130.00',otherDeductions:'20.01',employerContributions:'300.03',expenseType:'administrative'},
   {_id:'linked',org:A,date,personId:'a',workActId:'act',projectKey:k1,amount:'33.33',ndfl:'4.33',otherDeductions:'1.00',employerContributions:'10.00',expenseType:'production'},
   {_id:'shared',org:A,date,personId:'b',amount:'200.03',ndfl:'26.00',otherDeductions:'4.03',employerContributions:'60.01',expenseType:'production',shares:[{projectKey:k1,amount:'100.00'},{projectKey:k2,amount:'100.03'}]}],
  cash:[{_id:'prior',org:A,date:'2026-09-30',type:'out',personId:'admin',amount:'500.00',payrollPayment:true},
   {_id:'bulk',org:A,date,type:'out',personId:'b',amount:'161.35',payrollPayment:true,payrollAllocations:[{personId:'a',amount:'28.00'},{personId:'b',amount:'100.00'},{personId:'c',amount:'33.35'}]},
   {_id:'partial',org:A,date,type:'out',personId:'b',amount:'50.00',payrollPayment:true},
   {_id:'other',org:A,date,type:'out',personId:'admin',amount:'200.01',payrollPayment:false}],
  realizations:[{org:A,date,projectKey:k1,amount:'1000.00',vatRate:0},{org:A,date,projectKey:k2,amount:'1000.00',vatRate:0}],crewSettlements:[]};
}
function payroll(data,org=''){return core.payrollByOrganization({accruals:data.labor,payments:data.cash,workActs:data.workActs,settlements:data.crewSettlements},org)}
function eligibility(data,org=A,personId='admin',state=payroll(data,org)){
 const source=fs.readFileSync(path.join(__dirname,'../app/business-system.js'),'utf8'),start=source.indexOf('function payrollPaymentEligibility('),end=source.indexOf('window.arbatPayrollPaymentEligibility=',start),context={};
 vm.runInNewContext(source.slice(start,end),context);return context.payrollPaymentEligibility(org,personId,state,data);
}
// Catches rate/qty truncation, unstable crew ordering, double accrual and allocation rounding.
test('literal decimal payroll control reaches company, project, P&L, owner dashboard and cash once',()=>{
 const d=fixture(),before=JSON.stringify(d),p=payroll(d,A),by=Object.fromEntries(p.people.map(p=>[p.personId,p]));
 assert.equal(core.workAmount(d.workActs[0]),10001n);assert.equal(p.grossTotal,130005n);assert.equal(p.expense,167009n);assert.equal(p.paidTotal,71135n);assert.equal(p.payableTotal,40333n);
 assert.deepEqual(['a','b','c'].map(id=>by[id].gross),[3333n,23336n,3335n]);assert.deepEqual(['admin','a','b','c'].map(id=>by[id].payable),[35000n,0n,5333n,0n]);
 assert.equal(by.admin.ndfl,13000n);assert.equal(by.admin.other,2001n);assert.equal(by.admin.contributions,30003n);assert.equal(by.a.expense,4333n);
 assert.equal(p.unallocatedTotal,0n);assert.equal(p.overpaidTotal,0n);assert.equal(p.issues.filter(i=>i.code!=='crew-payroll-linked-labor-overlap').length,0);
 const ledger=core.expenseLedger(d);assert.equal(ledger.rows.reduce((s,r)=>s+r.amount,0n),167009n);
 const project1=core.projectSnapshot(d,d.deals[0],A+'::1C#PAY-1'),project2=core.projectSnapshot(d,d.deals[1],A+'::1C#PAY-2');
 assert.equal(project1.cost,24001n);assert.equal(project2.cost,13004n);assert.equal(project1.result,75999n);assert.equal(project2.result,86996n);
 const pnl=core.preliminaryPeriod(d,period,A),owner=core.ownerPeriodSnapshot(d,{from:'2026-10-01',to:'2026-10-31'},A),workspace=management.snapshot(d,{}, {today:'2026-10-27',period,org:A});
 assert.equal(pnl.direct,37005n);assert.equal(pnl.administrative,130004n);assert.equal(pnl.result,32991n);assert.equal(owner.result,32991n);assert.equal(workspace.result.result,32991n);
 assert.equal(workspace.payroll.payable,40333n);assert.equal(core.ownerDebtSnapshot(d,A).payrollPayable,40333n);
 assert.equal(core.cashFlow(d.cash,period,A).outgoing,41136n);assert.equal(owner.cash.outgoing,41136n);assert.equal(workspace.cash.outgoing,41136n);
 assert.equal(JSON.stringify(d),before,'reports never mutate source records');
});
test('repeated partial payroll cash settles net and leaves P&L and projects unchanged',()=>{
 const d=fixture(),before=core.preliminaryPeriod(d,period,A).result;
 d.cash.push({_id:'rest-admin',org:A,date,type:'out',personId:'admin',amount:'350.00',payrollPayment:true},{_id:'rest-b',org:A,date,type:'out',personId:'b',amount:'53.33',payrollPayment:true});
 const p=payroll(d,A);assert.equal(p.payableTotal,0n);assert.equal(p.overpaidTotal,0n);assert.equal(p.paidTotal,111468n);assert.equal(p.expense,167009n);assert.equal(core.preliminaryPeriod(d,period,A).result,before);
 d.cash.push({_id:'repeat',org:A,date,type:'out',personId:'admin',amount:'0.01',payrollPayment:true});assert.equal(payroll(d,A).overpaidTotal,1n);
});
test('prior-period payout stays in cumulative payroll but never becomes current-month cash',()=>{
 const d=fixture(),p=payroll(d,A);assert.equal(p.people.find(p=>p.personId==='admin').paid,50000n);
 assert.equal(core.cashFlow(d.cash,period,A).outgoing,41136n);assert.equal(core.cashFlow(d.cash,'2026-09',A).outgoing,50000n);
});
test('company balances never net each other and foreign unresolved payroll never blocks this company',()=>{
 const d=fixture();d.labor.push({org:B,date,personId:'admin',amount:'100.00'});d.cash.push({_id:'foreign-overpay',org:B,date,type:'out',personId:'admin',amount:'150.00',payrollPayment:true});
 const all=payroll(d);assert.equal(all.payableTotal,40333n);assert.equal(all.overpaidTotal,5000n);assert.equal(payroll(d,A).overpaidTotal,0n);assert.equal(eligibility(d,A,'admin',all).allowed,true);
 d.cash.push({_id:'foreign-invalid',org:B,date,type:'out',payrollPayment:true,amount:'invalid',payrollAllocations:[]});assert.equal(eligibility(d,A,'admin',payroll(d)).allowed,true);
});
for(const [label,payment] of [['unallocated',{amount:'100.00'}],['malformed',{amount:'invalid'}]])test(`salary-marked ${label} prior cash without a recipient is visible and blocks another payout`,()=>{
 const d={labor:[{org:A,personId:'admin',amount:'100.00'}],cash:[{_id:'unknown',org:A,type:'out',payrollPayment:true,...payment}],workActs:[],crewSettlements:[]},p=payroll(d,A);
 assert.ok(p.issues.some(i=>i.code=== (label==='malformed'?'payroll-invalid-payment':'payroll-unallocated-payment')),'explicit salary cash cannot disappear without a recipient');
 assert.equal(eligibility(d).allowed,false);assert.equal(eligibility(d).source._id,'unknown');if(label==='unallocated')assert.equal(p.unallocatedTotal,10000n);
});
test('invalid explicit bulk allocation is quarantined in full and cannot credit any employee',()=>{
 for(const allocations of [[{personId:'admin',amount:'101.00'}],[{personId:'admin',amount:'-1.00'}],[{personId:'admin',amount:'invalid'}],[null]]){
  const d={labor:[{org:A,personId:'admin',amount:100}],cash:[{_id:'invalid',org:A,type:'out',amount:100,payrollPayment:true,payrollAllocations:allocations}],workActs:[]},p=payroll(d,A);
  assert.equal(p.paidTotal,0n);assert.equal(p.unallocatedTotal,10000n);assert.equal(p.payableTotal,10000n);assert.equal(eligibility(d).allowed,false);
 }
});
test('legacy settlement loses precedence to explicit allocations and cannot settle non-payroll cash',()=>{
 const d={labor:[{org:A,personId:'a',amount:100},{org:A,personId:'b',amount:100}],workActs:[],cash:[{_id:'cash',org:A,type:'out',personId:'a',amount:100,payrollPayment:true,payrollAllocations:[{personId:'b',amount:100}]}],crewSettlements:[{cashId:'cash',personId:'a',amount:100}]};
 let p=payroll(d,A);assert.deepEqual(p.people.map(p=>[p.personId,p.paid]),[['a',0n],['b',10000n]]);d.cash[0].payrollPayment=false;p=payroll(d,A);assert.equal(p.paidTotal,0n);assert.equal(p.payableTotal,20000n);
});
test('negative imported payroll correction is blocked from payout and cannot silently change company expense',()=>{
 const key=A+'::1C#NEG',deal={org:A,order1c:'NEG',contractTotal:1000},d={deals:[deal],labor:[{org:A,date,personId:'admin',projectKey:key,amount:100},{_id:'negative-correction',org:A,date,personId:'admin',projectKey:key,amount:-10}],cash:[],workActs:[]};
 const p=payroll(d,A);assert.ok(p.issues.some(i=>i.code==='payroll-invalid-deductions'));assert.equal(eligibility(d).allowed,false);
 const ledger=core.expenseLedger(d);assert.ok(ledger.issues.some(i=>i.source._id==='negative-correction'),'unsupported negative accrual must not be a clean P&L correction');
 assert.equal(ledger.rows.reduce((n,r)=>n+r.amount,0n),10000n);
 const pnl=core.preliminaryPeriod(d,period,A),owner=core.ownerPeriodSnapshot(d,{from:'2026-10-01',to:'2026-10-31'},A),workspace=management.snapshot(d,{}, {today:'2026-10-27',period,org:A});
 assert.ok(core.projectSnapshot(d,deal,key).issues.includes('payroll-invalid-deductions'));
 for(const snapshot of [pnl,owner,workspace.result])assert.ok(snapshot.issues.some(i=>i.code==='payroll-invalid-deductions'&&i.source._id==='negative-correction'),'reported numeric partial result remains explicitly unconfirmed');
});
test('production settlement company control never nets another organizations salary',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8'),start=html.indexOf('function drawSettlement()'),end=html.indexOf('function renderSettlements',start),tables=[],els={settleCrew:{value:''},orgFilter:{value:''},settleReport:{innerHTML:''},settlePayments:{innerHTML:'',querySelectorAll:()=>[]}},acts=[{id:'act',org:A,date,status:'approved',memberIds:['p'],rate:100,qty:1}],db={people:[{id:'p',name:'Same person',expenseType:'production'}],workActs:acts,cash:[{_id:'payout',org:B,type:'out',personId:'p',amount:100,payrollPayment:true}],crewSettlements:[]};
 const ctx={db,window:{ArbatFinanceCore:core},document:{getElementById:id=>els[id]},settlementData:()=>acts,f:String,statusCell:String,table:(headers,rows)=>{tables.push({headers,rows});return ''}};vm.runInNewContext(html.slice(start,end),ctx);ctx.drawSettlement();
 assert.ok(tables[0].headers.some(h=>h.includes('Организация')),'all-organization report must expose separate company rows');assert.equal(tables[0].rows.length,2,'one debt and one overpayment remain visible');
});
test('work quantity is exact before rounding each money line and crew last cent is stable',()=>{
 for(const [qty,rate,want] of [['0.005','1.00',1n],['1.2345','123.45',15240n],['0.3333','300.06',10001n],['-0.005','1',-1n]])assert.equal(core.workAmount({qty,rate}),want);
 const p=payroll(fixture(),A);assert.equal(p.people.find(p=>p.personId==='c').gross,3335n);assert.deepEqual(core.allocate('100.01',[1,1,1]),[3333n,3333n,3335n]);
});
test('leave adjustment and terminated-employment limits preserve the independent day balance',()=>{
 const person={id:'p',hireDate:'2026-01-01',terminationDate:'2026-12-31',annualLeaveDays:28},events=[{personId:'p',type:'leave',startDate:'2026-02-01',endDate:'2026-02-03'},{personId:'p',type:'adjustment',date:'2026-03-01',days:'-0.50'},{personId:'p',type:'adjustment',date:'2027-01-01',days:'50.00'}],r=core.leaveSnapshot(person,events,'2026-12-31');assert.equal(r.earned,2800n);assert.equal(r.used,300n);assert.equal(r.adjustments,-50n);assert.equal(r.balance,2450n);
});

test('malformed imported payroll allocation container cannot fall back to a full single-person payout',()=>{
 for(const allocations of [{personId:'admin',amount:100},'admin=100']){
 const d={labor:[{org:A,personId:'admin',amount:100}],cash:[{_id:'invalid-container',org:A,type:'out',personId:'admin',amount:100,payrollPayment:true,payrollAllocations:allocations}],workActs:[]},p=payroll(d,A);
 assert.equal(p.paidTotal,0n);assert.equal(p.unallocatedTotal,10000n);assert.ok(p.issues.some(i=>i.code==='payroll-invalid-allocation'));assert.equal(eligibility(d).allowed,false);
 }
});

test('employee profile displays company debt separately from foreign overpayment and both deduction kinds',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app/profile.js'),'utf8'),start=source.indexOf('async function salary(){'),end=source.indexOf('async function loadAdminData()',start),content={textContent:'',innerHTML:''},payload={earned:1100.01,withheld:150.01,ndfl:130,otherDeductions:20.01,paid:650,balance:300,payable:350,overpaid:50,status:'requires-review',issues:[{code:'payroll-invalid-payment'}],organizations:[{org:A,earned:1000.01,withheld:150.01,paid:500,payable:350,overpaid:0},{org:B,earned:100,withheld:0,paid:150,payable:0,overpaid:50}],rows:[{date,kind:'accrual',org:A,description:'Заработная плата',amount:1000.01,ndfl:130,otherDeductions:20.01}]};
 const ctx={content,request:async()=>payload,currency:x=>String(x??0),esc:x=>String(x??'')};vm.runInNewContext(source.slice(start,end),ctx);await ctx.salary();
 assert.match(content.innerHTML,/<div>К выплате<br><b>350<\/b>/);assert.match(content.innerHTML,/<div>Переплата<br><b>50<\/b>/);assert.match(content.innerHTML,/Другие удержания/);assert.match(content.innerHTML,/20.01/);assert.match(content.innerHTML,/АИР-КЛИМАТ/);assert.match(content.innerHTML,/АРБАТ.ГК/);assert.match(content.innerHTML,/требуют сверки/);
});

test('imported gross and contribution aliases have the same authority in expense and payroll balances',()=>{
 const d={labor:[{org:A,date,personId:'p',gross:100,amount:900,contributions:30}],cash:[],workActs:[]},p=payroll(d,A),ledger=core.expenseLedger(d);assert.equal(p.payableTotal,10000n);assert.equal(p.expense,13000n);assert.equal(ledger.rows.reduce((n,r)=>n+r.amount,0n),13000n);assert.equal(core.preliminaryPeriod(d,period,A).direct,13000n);
});

test('missing or blank imported salary amount is unknown rather than a confirmed zero payout',()=>{
 for(const amount of [undefined,null,'','   ']){const d={labor:[{org:A,personId:'admin',amount:100}],cash:[{_id:'unknown-amount',org:A,type:'out',personId:'admin',amount,payrollPayment:true}],workActs:[]},p=payroll(d,A);assert.ok(p.issues.some(i=>i.code==='payroll-invalid-payment'));assert.equal(p.paidTotal,0n);assert.equal(eligibility(d).allowed,false);}
 const d={labor:[{org:A,personId:'admin',amount:100}],cash:[{org:A,type:'out',personId:'admin',amount:0,payrollPayment:true}],workActs:[]};assert.equal(payroll(d,A).issues.length,0,'explicit zero remains a known zero');
});

test('invalid imported approved work never becomes a clean negative or unknown-zero company expense',()=>{
 for(const fields of [{qty:-1,rate:100},{qty:'Infinity',rate:100},{rate:100},{qty:1}]){const key=A+'::1C#BAD-WORK',deal={org:A,order1c:'BAD-WORK',contractTotal:1000},act={id:'invalid-work',org:A,date,status:'approved',memberIds:['admin'],projectKey:key,...fields},d={deals:[deal],labor:[{org:A,date,personId:'admin',amount:100}],cash:[],workActs:[act]},p=payroll(d,A),ledger=core.expenseLedger(d);
 assert.ok(p.issues.some(i=>i.code==='crew-payroll-invalid-work-act'));assert.equal(p.grossTotal,10000n);assert.equal(eligibility(d).allowed,false);assert.equal(ledger.rows.filter(r=>r.kind==='work-act').length,0);assert.ok(ledger.issues.some(i=>i.code==='crew-payroll-invalid-work-act'&&i.source===act));
 for(const snapshot of [core.preliminaryPeriod(d,period,A),core.ownerPeriodSnapshot(d,{from:'2026-10-01',to:'2026-10-31'},A)])assert.ok(snapshot.issues.some(i=>i.code==='crew-payroll-invalid-work-act'));assert.ok(core.projectSnapshot(d,deal,key).issues.includes('crew-payroll-invalid-work-act'));
 }
});

test('project payroll readers quarantine invalid source with the same known costs and review flags as the ledger',()=>{
 const projects=require('../app/project-workspace-model'),key=A+'::1C#QUARANTINE',deal={_id:'quarantine-project',org:A,order1c:'QUARANTINE',name:'Quarantine control',contractTotal:1000,vatRate:0};
 for(const bad of [{amount:'invalid'},{amount:-10},{amount:100,ndfl:101},{amount:100,employerContributions:'invalid'}]){
  const invalid={_id:'invalid-labor',org:A,date,personId:'a',projectKey:key,...bad},valid={_id:'known-labor',org:A,date,personId:'a',projectKey:key,amount:100,employerContributions:30},d={deals:[deal],people:[{id:'a',expenseType:'production'}],labor:[valid,invalid],cash:[],workActs:[]};
  const split=core.payrollParts(invalid);assert.equal(split.parts.length,0);assert.ok(split.issues.includes('payroll-invalid-deductions'));
  const payroll=core.projectPayroll(d.labor,key);assert.equal(payroll.total,13000n);assert.ok(payroll.issues.includes('payroll-invalid-deductions'));
  const snapshot=core.projectSnapshot(d,deal,key);assert.equal(snapshot.cost,13000n);assert.ok(snapshot.issues.includes('payroll-invalid-deductions'));
  const workspace=projects.snapshot(d,deal);assert.equal(workspace.cost,13000n);assert.equal(workspace.profit,null);assert.ok(workspace.issues.includes('payroll-invalid-deductions'));assert.equal(core.expenseLedger(d).rows.reduce((n,r)=>n+r.amount,0n),13000n);
 }
});
