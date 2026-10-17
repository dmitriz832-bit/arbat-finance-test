/* ARBAT FINANCE: pure deterministic monetary primitives. No production state writes. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ArbatFinanceCore=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  function cents(value){
    if(typeof value==='bigint')throw new TypeError('Specify rubles, not bigint cents');
    const raw=String(value??'0').trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
    if(!/^-?\d+(?:\.\d+)?$/.test(raw))throw new TypeError('Invalid amount: '+raw);
    const neg=raw.startsWith('-'),s=neg?raw.slice(1):raw,[whole,fraction='']=s.split('.');
    let n=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
    if(fraction.length>2&&fraction[2]>='5')n++;
    return neg?-n:n;
  }
  function rubles(c){if(typeof c!=='bigint')throw new TypeError('Expected bigint cents');let neg=c<0n;const a=neg?-c:c;return (neg?'-':'')+(a/100n)+'.'+String(a%100n).padStart(2,'0')}
  function sum(values){return values.reduce((n,v)=>n+cents(v),0n)}
  function allocate(total,weights){
    const amount=cents(total),ws=weights.map(w=>{const x=Number(w);if(!Number.isSafeInteger(x)||x<0)throw new RangeError('Weights must be nonnegative safe integers');return BigInt(x)});
    const weight=ws.reduce((a,b)=>a+b,0n);if(!ws.length||weight===0n)throw new RangeError('Positive weights required');
    const sign=amount<0n?-1n:1n,abs=amount<0n?-amount:amount;
    const shares=ws.map(w=>abs*w/weight);
    const used=shares.reduce((a,b)=>a+b,0n);shares[shares.length-1]+=abs-used;
    return shares.map(x=>x*sign);
  }
  function difference(income,expenses){return sum(income)-sum(expenses)}
  function pnl(input){
    const revenue=sum(input.revenue||[]);
    const direct=sum(input.direct||[]),production=sum(input.production||[]);
    const commercial=sum(input.commercial||[]),administrative=sum(input.administrative||[]);
    const belowIncome=sum(input.belowIncome||[]),belowExpenses=sum(input.belowExpenses||[]);
    const gross=revenue-direct,ebitda=gross-production-commercial-administrative;
    return {revenue,direct,gross,production,commercial,administrative,ebitda,belowIncome,belowExpenses,result:ebitda+belowIncome-belowExpenses};
  }
  function projectPayroll(labor,projectKey,approvedActs=[]){
    let total=0n,unresolved=[],conflicts=[];
    const actIds=new Set(approvedActs.filter(a=>a.status==='approved').map(a=>String(a.id||a._id||'')).filter(Boolean));
    const batchIds=new Set(approvedActs.filter(a=>a.status==='approved').map(a=>String(a.batchId||'')).filter(Boolean));
    for(const item of labor||[]){
      const amount=cents(item.amount??item.salary??0)+cents(item.employerContributions||0);
      const linkedAct=String(item.workActId||item.actId||''),linkedBatch=String(item.batchId||'');
      if((linkedAct&&actIds.has(linkedAct))||(linkedBatch&&batchIds.has(linkedBatch))){conflicts.push(item);continue}
      if(item.projectKey===projectKey){total+=amount;continue}
      if(Array.isArray(item.shares)&&item.shares.length){
        const matched=item.shares.filter(share=>share.projectKey===projectKey);
        if(matched.length)total+=sum(matched.map(share=>share.amount||0));
        continue;
      }
      if(item.deal&&!item.projectKey)unresolved.push(item);
    }
    const possibleOverlaps=[];
    for(const item of labor||[]){
      if(item.projectKey!==projectKey||item.workActId||item.actId||item.batchId)continue;
      const date=String(item.date||item.dt||'').slice(0,10);
      if(!date||!item.personId)continue;
      const matching=approvedActs.filter(a=>a.status==='approved'&&String(a.date||'').slice(0,10)===date&&((a.memberIds||[]).includes(item.personId)||a.leadId===item.personId));
      if(matching.length)possibleOverlaps.push({accrualId:item._id||item.id||null,actIds:matching.map(a=>a.id)});
    }
    return {total,unresolved,conflicts,possibleOverlaps};
  }
  function warehouseCostAudit(expenses,moves,fifo){
    const issues=[];
    const linked=(expenses||[]).filter(x=>x.warehouseMoveId);
    const byMove=new Map();
    for(const e of linked){const key=String(e.warehouseMoveId);byMove.set(key,[...(byMove.get(key)||[]),e])}
    for(const move of (moves||[]).filter(x=>x.kind==='consume'&&x.projectIssueId)){
      const rows=byMove.get(String(move.id))||[];
      const valued=fifo?.byMove?.[move.id];
      if(rows.length!==1){issues.push({moveId:move.id,reason:rows.length?'duplicate-expense':'missing-expense'});continue}
      if(!valued||valued.invalid||valued.amount==null){issues.push({moveId:move.id,reason:'unverified-fifo'});continue}
      if(cents(rows[0].amount||0)!==cents(valued.amount)){issues.push({moveId:move.id,reason:'fifo-cost-mismatch'})}
    }
    return issues;
  }
  function projectSnapshot(data,deal,projectKey){
    const realization=(data.realizations||[]).filter(x=>x.projectKey===projectKey);
    const netOf=x=>{const rate=x.vatRate==null?(x.org==='АРБАТ.ГК'?22:0):Number(x.vatRate);if(!Number.isInteger(rate)||rate<0)throw new RangeError('Invalid VAT rate');const divisor=BigInt(100+rate);return (cents(x.amount||0)*100n+divisor/2n)/divisor};
    const revenue=realization.reduce((a,x)=>a+netOf(x),0n);
    const expenses=(data.expenses||[]).filter(x=>x.projectKey===projectKey);
    const acts=(data.workActs||[]).filter(x=>x.projectKey===projectKey);
    const labor=projectPayroll(data.labor||[],projectKey,acts);
    const cost=projectExpenseTotal(expenses,acts)+labor.total;
    const issues=[];
    if(expenses.some(x=>x.valuationStatus==='requires-review'))issues.push('expense-valuation');
    if(labor.conflicts.length)issues.push('linked-work-overlap');
    if(labor.possibleOverlaps.length)issues.push('possible-work-overlap');
    if(labor.unresolved.some(x=>x.org===deal.org&&x.deal===deal.name))issues.push('legacy-unattributed-payroll');
    if(data.warehouse){const moves=data.warehouse.moves||[],consumed=moves.filter(m=>m.dealId===deal._id&&m.kind==='consume'&&m.projectIssueId);const known=new Set(moves.map(m=>String(m.id)));if(expenses.some(e=>e.warehouseMoveId&&!known.has(String(e.warehouseMoveId))))issues.push('warehouse-missing-movement');if(consumed.length&&!data.fifo)issues.push('warehouse-fifo-unavailable');else if(data.fifo&&warehouseCostAudit(expenses,consumed,data.fifo).length)issues.push('warehouse-fifo-mismatch')}
    return {revenue,cost,result:revenue-cost,issues,payroll:labor};
  }
  function projectExpenseTotal(expenses,acts){
    const external=sum((expenses||[]).map(x=>x.amount||0));
    const work=(acts||[]).filter(x=>x.status==='approved').reduce((acc,x)=>acc+(cents(x.rate||0)*cents(x.qty||0)+50n)/100n,0n);
    return external+work;
  }
  function projectResult(revenue,costs){return cents(revenue)-sum(costs)}
  function reportRow(values){const amounts=values.map(cents);return {months:amounts,total:amounts.reduce((a,b)=>a+b,0n)}}
  function preliminaryPeriod(data,period,org=''){
    const ok=x=>(!org||x.org===org)&&String(x.date||x.dt||'').slice(0,7)===period;
    const amounts=(data.realizations||[]).filter(ok).map(x=>{
      const gross=cents(x.amount||0);
      const divisor=x.vatRate==null?(x.org==='АРБАТ.ГК'?122n:100n):(100n+BigInt(Number(x.vatRate)));
      return rubles((gross*100n+divisor/2n)/divisor);
    });
    const direct=(data.expenses||[]).filter(ok).map(x=>x.amount||0);
    const production=(data.workActs||[]).filter(x=>ok(x)&&x.status==='approved').map(x=>rubles((cents(x.rate||0)*cents(x.qty||0)+50n)/100n));
    const assigned=(data.costs||[]).filter(x=>ok(x)&&x.dir).map(x=>x.amount||0);
    const common=(data.costs||[]).filter(x=>ok(x)&&!x.dir).map(x=>x.amount||0);
    const workActTotal=sum(production),generalCostTotal=sum(common),commercial=[];
    const labor=(data.labor||[]).filter(ok);
    for(const item of labor){
      const type=item.expenseType||'production',amount=item.amount??item.salary??0;
      (type==='administrative'?common:type==='commercial'?commercial:production).push(amount);
    }
    const result=pnl({revenue:amounts,direct:[...direct,...production,...assigned],administrative:common,commercial});return {...result,components:{revenue:sum(amounts),projectExpenses:sum(direct),productionLaborAndWorks:sum(production),assignedExpenses:sum(assigned),commonExpenses:sum(common),commercialLabor:sum(commercial),workActTotal,productionLabor:sum(production)-workActTotal,administrativeLabor:sum(common)-generalCostTotal,generalCostTotal}};
  }
  function walletBalance(opening,entries,walletId){
    let balance=cents(opening||0);
    for(const item of entries||[]){
      const amount=cents(item.amount||0);
      if(item.type==='in'&&item.walletId===walletId)balance+=amount;
      else if(item.type==='out'&&item.walletId===walletId)balance-=amount;
      else if(item.type==='transfer'){
        if(item.walletId===walletId)balance-=amount;
        if(item.toWalletId===walletId)balance+=amount;
      }
    }
    return balance;
  }
  function payroll({gross,ndfl='0',other='0',contributions='0',paid='0'}){
    const g=cents(gross),tax=cents(ndfl),ded=cents(other),ins=cents(contributions),payment=cents(paid);
    if([g,tax,ded,ins,payment].some(x=>x<0n)||tax+ded>g)throw new RangeError('Invalid payroll deductions');
    return {expense:g+ins,payable:g-tax-ded-payment,gross:g,tax,deductions:ded,contributions:ins,paid:payment};
  }
  return Object.freeze({cents,rubles,sum,allocate,difference,pnl,payroll,walletBalance,reportRow,projectResult,preliminaryPeriod,projectExpenseTotal,projectPayroll,projectSnapshot,warehouseCostAudit});
});
