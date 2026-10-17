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
    const labor=(data.labor||[]).filter(ok),commercial=[];
    for(const item of labor){
      const type=item.expenseType||'production',amount=item.amount??item.salary??0;
      (type==='administrative'?common:type==='commercial'?commercial:production).push(amount);
    }
    return pnl({revenue:amounts,direct:[...direct,...production,...assigned],administrative:common,commercial});
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
  return Object.freeze({cents,rubles,sum,allocate,difference,pnl,payroll,walletBalance,reportRow,projectResult,preliminaryPeriod});
});
