const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../app/finance-core');
const html=fs.readFileSync(require.resolve('../app/index.html'),'utf8');
function native(name){const start=html.indexOf('function '+name+'('),end=html.indexOf(name==='calc'?'\nwindow.arbatAudit=':'\nfunction ',start+1);return html.slice(start,end)}
const org='АРБАТ.ГК';
function fixture(receipts,consumes){return {items:[{id:'m',name:'Материал'}],places:[{id:'s',org}],moves:[...receipts.map((x,i)=>({id:'r'+i,org,kind:'receipt',itemId:'m',to:'s',date:'2026-01-01',...x})),...consumes.map((qty,i)=>({id:'c'+i,org,kind:'consume',itemId:'m',from:'s',dealId:'p',date:'2026-01-02',qty}))]}}
function run(w){const data={deals:[{_id:'p',org,name:'Проект',contractTotal:1220,vatRate:22}],expenses:[]},store=new Map([['arbat-warehouse-v1',JSON.stringify(w)]]),c=vm.createContext({db:data,window:{ArbatFinanceCore:core,arbatDealKey:core.dealKey},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});vm.runInContext(native('calc')+';window.arbatFifo=calc;const read=()=>JSON.parse(localStorage.getItem("arbat-warehouse-v1"));'+native('reconcileProjectExpenses'),c);c.reconcileProjectExpenses();return {data,fifo:c.calc(w),c}}

test('warehouse receipt policy computes full source expense base once without organization inference',()=>{
 a.equal(typeof core.warehouseReceiptValuation,'function');
 for(const [vatRate,vatDeductible,net]of [[22,true,'10000'],[22,false,'12200'],[5,true,'11619'],[0,undefined,'12200']]){
  const r=core.warehouseReceiptValuation({vatRate,vatDeductible},12200n);a.equal(r.expenseValueCents,net);a.equal(r.expenseValuationStatus,'verified');
 }
 a.equal(core.warehouseReceiptValuation({},12200n).expenseValuationStatus,'legacy-gross');
 for(const source of [{vatRate:22},{vatRate:22,vatDeductible:true,amountNet:'99'},{vatDeductible:true}])a.equal(core.warehouseReceiptValuation(source,12200n).expenseValueCents,null);
});

test('native deductible consumption posts internal net cost and retains distinct gross FIFO evidence',()=>{
 const w=fixture([{qty:10,price:122,vatRate:22,vatDeductible:true}],[4]),r=run(w),e=r.data.expenses[0];
 a.equal(core.cents(e.amount),40000n);a.equal(core.cents(e.amountNet),40000n);a.equal(core.cents(e.warehouseGrossAmount),48800n);
 a.equal(e.vatRate,0);a.equal(core.cents(e.vatAmount),0n);a.equal(e.vatDeductible,false);
 a.equal(core.documentPnlAmount(e,true),40000n);a.equal(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,0);
 r.c.reconcileProjectExpenses();a.equal(r.data.expenses.length,1);
 e.amount='401';a.ok(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,'tampered internal cost requires review');
});

test('mixed rates and mixed recoverability sum source acquisition bases without averaging VAT rates',()=>{
 const w=fixture([{qty:1,price:122,vatRate:22,vatDeductible:true},{qty:1,price:105,vatRate:5,vatDeductible:false},{qty:1,price:110,vatRate:10,vatDeductible:true}],[3]),r=run(w),e=r.data.expenses[0];
 a.equal(core.cents(e.amount),30500n);a.equal(core.cents(e.warehouseGrossAmount),33700n);a.equal(e.warehouseValuationParts.length,3);
 a.equal(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,0);
});

test('fractional issues conserve full receipt net cents through depletion instead of rerounding each issue VAT',()=>{
 const w=fixture([{qty:3,price:'10.01',vatRate:22,vatDeductible:true}],[0.5,0.5,2]),r=run(w);
 a.deepEqual(r.data.expenses.map(e=>core.cents(e.amount)),[410n,410n,1641n]);
 a.equal(r.data.expenses.reduce((n,e)=>n+core.cents(e.amount),0n),2461n);
 a.equal(r.data.expenses.reduce((n,e)=>n+core.cents(e.warehouseGrossAmount),0n),3003n);
 a.equal(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,0);
});

test('explicit incomplete VAT produces unknown consumed cost while legacy receipts retain labelled gross fallback',()=>{
 const unknown=run(fixture([{qty:2,price:122,vatRate:22}],[1])).data.expenses[0];a.equal(unknown.amount,null);a.equal(unknown.valuationStatus,'requires-review');
 const legacy=run(fixture([{qty:2,price:122}],[1])).data.expenses[0];a.equal(core.cents(legacy.amount),12200n);a.equal(legacy.warehouseValuationStatus,'legacy-gross');
});

test('warehouse consumption creates no second supplier input VAT deduction',()=>{
 const w=fixture([{qty:10,price:122,vatRate:22,vatDeductible:true,vatInvoice:'УПД',vatDeductionDate:'2026-01-01'}],[4]),r=run(w);
 const q=core.quarterTaxSnapshot({...r.data,warehouse:w},'2026-03-31');a.equal(q.arbat.inputVat,22000n);a.equal(q.rows.filter(x=>x.scope==='vat'&&x.amount<0n).length,1);
});

test('manual high precision unit price is rounded once at line level during independent read validation',()=>{
 const w=fixture([{qty:3,price:'10.005',vatRate:22,vatDeductible:true}],[3]),r=run(w),e=r.data.expenses[0];
 a.equal(core.cents(e.warehouseGrossAmount),3002n);a.equal(core.cents(e.amount),2461n);a.equal(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,0);
});

test('read validation rejects a changed receipt policy, duplicated source and changed allocated net evidence',()=>{
 for(const variant of ['policy','duplicate','allocation']){
  const w=fixture([{qty:10,price:122,vatRate:22,vatDeductible:true}],[4]),r=run(w);
  if(variant==='policy')w.moves[0].vatDeductible=false;
  if(variant==='duplicate')w.moves.push({...w.moves[0]});
  if(variant==='allocation')r.fifo.byMove.c0.parts[0].expenseValueCents='39999';
  a.ok(core.warehouseCostAudit(r.data.expenses,w.moves,r.fifo,w).length,variant);
 }
});

test('original receipt input VAT uses authoritative gross line total rather than rounded unit extension',()=>{
 const w=fixture([{qty:3,price:'33.33',amountGross:'100',amountNet:'81.97',vatAmount:'18.03',vatRate:22,vatDeductible:true,vatInvoice:'УПД',vatDeductionDate:'2026-01-01'}],[1]);
 const r=core.quarterTaxSnapshot({warehouse:w},'2026-03-31');a.equal(r.arbat.inputVat,1803n);a.equal(r.arbat.vatReady,true);
});
