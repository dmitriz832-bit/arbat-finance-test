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
  function dealKey(deal){const n=String(deal.order1c||'').trim();return String(deal.org||'')+'::'+(n?'1C#'+encodeURIComponent(n):String(deal.name||''))}
  function workAmount(item){
    // Quantity is not money: preserve all its decimal places before rounding the line total.
    const raw=String(item.qty??0).trim().replace(',','.');
    if(!/^-?\d+(?:\.\d+)?$/.test(raw))throw new TypeError('Invalid work quantity');
    const decimals=(raw.split('.')[1]||'').length,den=10n**BigInt(decimals);
    const value=cents(item.rate||0)*BigInt(raw.replace('.','')),sign=value<0n?-1n:1n;
    return sign*((value*sign+den/2n)/den);
  }
  function laborType(item,people=[]){return item.expenseType||people.find(p=>p.id===item.personId)?.expenseType||'production'}
  function linkedWork(item,acts){
    return acts.filter(a=>a.status==='approved'&&(!item.org||!a.org||item.org===a.org)&&
      ((item.workActId||item.actId)&&String(item.workActId||item.actId)===String(a.id||a._id||'')||
       item.batchId&&String(item.batchId)===String(a.batchId||'')));
  }
  function payrollParts(item,acts=[]){
    const gross=cents(item.amount??item.salary??0),contributions=cents(item.employerContributions||0);
    const referenced=linkedWork(item,acts),linked=referenced.filter(a=>!item.projectKey||!a.projectKey||a.projectKey===item.projectKey),issues=[];
    if(referenced.length!==linked.length)issues.push('work-link-project-mismatch');
    if(linked.length)issues.push('linked-work-overlap');
    const expenseGross=linked.length?0n:gross;
    if(item.projectKey)return {parts:[{projectKey:item.projectKey,amount:expenseGross+contributions}],issues};
    const shares=Array.isArray(item.shares)?item.shares:[];
    if(!shares.length)return {parts:[{projectKey:'',amount:expenseGross+contributions}],issues};
    const weights=shares.map(x=>cents(x.amount||0)),used=weights.reduce((a,b)=>a+b,0n);
    if(gross<0n||weights.some(x=>x<0n)||used>gross){
      issues.push('invalid-payroll-allocation');return {parts:[{projectKey:'',amount:expenseGross+contributions}],issues};
    }
    const all=[...weights,gross-used];
    // Allocate contributions using integer gross cents; put rounding remainder on the last nonzero share.
    const nonzero=all.map((w,i)=>({w,i})).filter(x=>x.w>0n),insurance=all.map(()=>0n);
    if(nonzero.length){let remainder=contributions;nonzero.forEach(({w,i},n)=>{const value=n===nonzero.length-1?remainder:contributions*w/gross;insurance[i]=value;remainder-=value})}
    else insurance[insurance.length-1]=contributions;
    const parts=all.map((value,i)=>({projectKey:shares[i]?.projectKey||'',amount:(linked.length?0n:value)+insurance[i]}));
    if(gross!==used)issues.push('unallocated-payroll');
    return {parts,issues};
  }
  function projectPayroll(labor,projectKey,approvedActs=[]){
    let total=0n;const unresolved=[],conflicts=[],possibleOverlaps=[],issues=[];
    for(const item of labor||[]){
      const result=payrollParts(item,approvedActs);
      const parts=result.parts.filter(p=>p.projectKey===projectKey);
      total+=parts.reduce((a,p)=>a+p.amount,0n);
      if(parts.length){issues.push(...result.issues);if(result.issues.includes('linked-work-overlap'))conflicts.push(item)}
      if(item.deal&&!item.projectKey&&!(item.shares||[]).length)unresolved.push(item);
      if(item.projectKey!==projectKey||item.workActId||item.actId||item.batchId)continue;
      const date=String(item.date||item.dt||'').slice(0,10);
      if(!date||!item.personId)continue;
      const matching=approvedActs.filter(a=>a.status==='approved'&&String(a.date||'').slice(0,10)===date&&((a.memberIds||[]).includes(item.personId)||a.leadId===item.personId));
      if(matching.length)possibleOverlaps.push({accrualId:item._id||item.id||null,actIds:matching.map(a=>a.id)});
    }
    return {total,unresolved,conflicts,possibleOverlaps,issues:[...new Set(issues)]};
  }
  function expenseLedger(data){
    const rows=[],issues=[],deals=data.deals||[],acts=data.workActs||[];
    const push=(source,kind,amount,projectKey=source.projectKey||'',category='direct')=>{
      const deal=deals.find(d=>dealKey(d)===projectKey);
      rows.push({source,kind,amount,projectKey,dir:deal?.dir||source.dir||'',org:source.org||deal?.org||'',date:source.date||source.dt||'',category});
    };
    for(const item of data.expenses||[])push(item,'project-expense',documentPnlAmount(item,true));
    for(const item of acts.filter(a=>a.status==='approved'))push(item,'work-act',workAmount(item));
    for(const item of data.costs||[]){
      const article=(data.pnlArticles||[]).find(a=>a.id===item.pnlArticleId)||(data.pnlArticles||[]).find(a=>a.name===item.name);
      const type=String(item.pnlType||article?.type||'expense').toLowerCase();
      const group=String(item.pnlGroup||article?.group||'').toLowerCase();
      const level=String(item.pnlLevel||article?.level||article?.ebitdaLevel||'').toLowerCase();
      const category=type==='income'?'belowIncome':
        level==='below'||level==='below-ebitda'||group.includes('ниже ebitda')?'belowExpenses':
        group.includes('коммерч')?'commercial':
        group.includes('общепроизвод')?'production':
        group.includes('администр')?'administrative':
        item.projectKey||item.dir?'direct':'administrative';
      push(item,'general-expense',documentPnlAmount(item,true),item.projectKey||'',category);
    }
    for(const item of data.labor||[]){
      const result=payrollParts(item,acts),type=laborType(item,data.people||[]);
      for(const code of result.issues)issues.push({code,source:item});
      const group=String(item.pnlGroup||'').toLowerCase(),level=String(item.pnlLevel||'').toLowerCase();const category=level==='below'?'belowExpenses':group.includes('общепроизвод')?'production':group.includes('коммерч')?'commercial':group.includes('администр')?'administrative':group.includes('прям')?'direct':type==='administrative'?'administrative':type==='commercial'?'commercial':'direct';for(const part of result.parts)push(item,'payroll',part.amount,part.projectKey,category);
    }
    return {rows,issues};
  }
  function directionSnapshot(data,name,period='',org=''){
    const ok=x=>(!period||String(x.date||x.dt||'').slice(0,7)===period)&&(!org||x.org===org);
    const keys=new Set((data.deals||[]).filter(d=>d.dir===name).map(dealKey));
    const revenue=(data.realizations||[]).filter(x=>keys.has(x.projectKey)&&ok(x)).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const ledger=expenseLedger(data),cost=ledger.rows.filter(x=>x.dir===name&&ok(x)).reduce((a,x)=>a+x.amount,0n);
    return {revenue,cost,result:revenue-cost,issues:ledger.issues};
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
    const eligible=new Set((moves||[]).filter(x=>x.kind==='consume'&&x.projectIssueId).map(x=>String(x.id)));
    for(const e of linked){if(!eligible.has(String(e.warehouseMoveId)))issues.push({moveId:String(e.warehouseMoveId),reason:'expense-without-project-consumption'})}
    return issues;
  }
  // Explicit per-document VAT, calculated entirely in integer kopecks.
  function documentVat(gross,vatRate,vatDeductible=false){
    const rate=vatRate==null||String(vatRate).trim()===''?NaN:Number(vatRate);
    if(![0,5,7,10,20,22].includes(rate))throw new RangeError('Unsupported document VAT rate');
    const amountGross=cents(gross),abs=amountGross<0n?-amountGross:amountGross;
    const divisor=BigInt(100+rate),tax=(abs*BigInt(rate)+divisor/2n)/divisor;
    const vatAmount=amountGross<0n?-tax:tax;
    return {vatRate:rate,amountGross,vatAmount,amountNet:amountGross-vatAmount,vatDeductible:Boolean(vatDeductible)};
  }
  // Keep legacy documents unchanged until their VAT metadata is explicitly assigned.
  // For newly enriched documents, VAT metadata is authoritative for both revenue and cost.
  function documentPnlAmount(item,expense=false){
    const gross=item.amountGross??item.amount??0;
    if(item.vatRate==null||String(item.vatRate).trim()===''){
      if(item.amountNet!=null||item.vatAmount!=null)throw new RangeError('Incomplete document VAT metadata');
      return expense?cents(gross):netAmount(gross,item.org,item.vatRate);
    }
    const tax=documentVat(gross,item.vatRate,item.vatDeductible);
    if(item.vatAmount!=null&&cents(item.vatAmount)!==tax.vatAmount)throw new RangeError('Document VAT amount mismatch');
    if(item.amountNet!=null&&cents(item.amountNet)!==tax.amountNet)throw new RangeError('Document net amount mismatch');
    return expense&&item.vatDeductible!==true&&item.vatDeductible!=='true'?tax.amountGross:tax.amountNet;
  }
  function netAmount(gross,org,vatRate){const rate=vatRate==null?(org==='АРБАТ.ГК'?22:0):Number(vatRate);if(!Number.isInteger(rate)||rate<0||rate>100)throw new RangeError('Invalid VAT rate');const d=BigInt(100+rate),v=cents(gross||0),sign=v<0n?-1n:1n,abs=v<0n?-v:v;return sign*((abs*100n+d/2n)/d)}
  function projectSnapshot(data,deal,projectKey){
    const realization=(data.realizations||[]).filter(x=>x.projectKey===projectKey);
    const netOf=x=>documentPnlAmount(x);
    const revenue=realization.reduce((a,x)=>a+netOf(x),0n);
    const expenses=(data.expenses||[]).filter(x=>x.projectKey===projectKey);
    const acts=(data.workActs||[]).filter(x=>x.projectKey===projectKey);
    const labor=projectPayroll(data.labor||[],projectKey,acts);
    const ledger=expenseLedger(data),cost=ledger.rows.filter(x=>x.projectKey===projectKey).reduce((a,x)=>a+x.amount,0n);
    const issues=ledger.issues.filter(x=>(x.source.projectKey===projectKey||(x.source.shares||[]).some(p=>p.projectKey===projectKey))).map(x=>x.code);
    if(expenses.some(x=>x.valuationStatus==='requires-review'))issues.push('expense-valuation');
    if(labor.conflicts.length)issues.push('linked-work-overlap');
    if(labor.possibleOverlaps.length)issues.push('possible-work-overlap');
    if(labor.unresolved.some(x=>x.org===deal.org&&x.deal===deal.name))issues.push('legacy-unattributed-payroll');
    if(data.warehouse){const moves=data.warehouse.moves||[],consumed=moves.filter(m=>m.dealId===deal._id&&m.kind==='consume'&&m.projectIssueId);const known=new Set(moves.map(m=>String(m.id)));if(expenses.some(e=>e.warehouseMoveId&&!known.has(String(e.warehouseMoveId))))issues.push('warehouse-missing-movement');if(expenses.some(e=>e.warehouseMoveId&&moves.some(m=>String(m.id)===String(e.warehouseMoveId)&&m.dealId&&m.dealId!==deal._id)))issues.push('warehouse-cross-project-reference');if(expenses.some(e=>e.warehouseMoveId&&(data.expenses||[]).some(other=>other!==e&&other.warehouseMoveId&&String(other.warehouseMoveId)===String(e.warehouseMoveId))))issues.push('warehouse-duplicate-global-expense');if(consumed.length&&!data.fifo)issues.push('warehouse-fifo-unavailable');else if(data.fifo&&warehouseCostAudit(expenses,consumed,data.fifo).length)issues.push('warehouse-fifo-mismatch')}
    return {revenue,cost,result:revenue-cost,issues:[...new Set(issues)],payroll:labor};
  }
  function projectExpenseTotal(expenses,acts){
    const external=(expenses||[]).reduce((total,item)=>total+documentPnlAmount(item,true),0n);
    const work=(acts||[]).filter(x=>x.status==='approved').reduce((acc,x)=>acc+workAmount(x),0n);
    return external+work;
  }
  function projectResult(revenue,costs){return cents(revenue)-sum(costs)}
  function reportRow(values){const amounts=values.map(cents);return {months:amounts,total:amounts.reduce((a,b)=>a+b,0n)}}
  function preliminaryPeriod(data,period,org=''){
    const ok=x=>(!org||x.org===org)&&(!period||String(x.date||x.dt||'').slice(0,7)===period);
    const ledger=expenseLedger(data),rows=ledger.rows.filter(ok);
    const total=predicate=>rows.filter(predicate).reduce((a,x)=>a+x.amount,0n);
    const revenue=(data.realizations||[]).filter(ok).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const result=pnl({revenue:[rubles(revenue)],direct:rows.filter(x=>x.category==='direct').map(x=>rubles(x.amount)),administrative:rows.filter(x=>x.category==='administrative').map(x=>rubles(x.amount)),commercial:rows.filter(x=>x.category==='commercial').map(x=>rubles(x.amount)),production:rows.filter(x=>x.category==='production').map(x=>rubles(x.amount)),belowIncome:rows.filter(x=>x.category==='belowIncome').map(x=>rubles(x.amount)),belowExpenses:rows.filter(x=>x.category==='belowExpenses').map(x=>rubles(x.amount))});
    return {...result,issues:ledger.issues.filter(x=>ok(x.source)),components:{revenue,
      projectExpenses:total(x=>x.kind==='project-expense'),
      productionLaborAndWorks:total(x=>x.kind==='work-act'||x.kind==='payroll'&&x.category==='direct'),
      assignedExpenses:total(x=>x.kind==='general-expense'&&x.category==='direct'),
      commonExpenses:total(x=>x.category==='administrative'),
      commercialLabor:total(x=>x.kind==='payroll'&&x.category==='commercial'),
      workActTotal:total(x=>x.kind==='work-act'),productionLabor:total(x=>x.kind==='payroll'&&x.category==='direct'),
      administrativeLabor:total(x=>x.kind==='payroll'&&x.category==='administrative'),
      generalCostTotal:total(x=>x.kind==='general-expense'&&x.category==='administrative')}};
  }
  function cashFlow(entries,period='',org=''){
    const categories=new Map();let income=0n,outgoing=0n,transfers=0n;
    for(const item of entries||[]){
      if(org&&item.org!==org||period&&String(item.date||'').slice(0,7)!==period)continue;
      const amount=cents(item.amount||0);
      if(item.type==='transfer'){transfers+=amount;continue}
      if(!['in','out'].includes(item.type))continue;
      if(item.type==='in')income+=amount;else outgoing+=amount;
      const key=item.articleId||'no-article',row=categories.get(key)||{articleId:key,income:0n,outgoing:0n};
      row[item.type==='in'?'income':'outgoing']+=amount;categories.set(key,row);
    }
    return {income,outgoing,transfers,net:income-outgoing,categories:[...categories.values()]};
  }
  function walletSnapshot(opening,entries,walletId){
    const initial=cents(opening||0);let received=0n,spent=0n;
    for(const item of entries||[]){
      const amount=cents(item.amount||0);
      if(item.type==='in'&&item.walletId===walletId)received+=amount;
      else if(item.type==='out'&&item.walletId===walletId)spent+=amount;
      else if(item.type==='transfer'){
        if(item.walletId===walletId)spent+=amount;
        if(item.toWalletId===walletId)received+=amount;
      }
    }
    return {opening:initial,received,spent,balance:initial+received-spent};
  }
  function walletBalance(opening,entries,walletId){return walletSnapshot(opening,entries,walletId).balance}
  function payroll({gross,ndfl='0',other='0',contributions='0',paid='0'}){
    const g=cents(gross),tax=cents(ndfl),ded=cents(other),ins=cents(contributions),payment=cents(paid);
    if([g,tax,ded,ins,payment].some(x=>x<0n)||tax+ded>g)throw new RangeError('Invalid payroll deductions');
    return {expense:g+ins,payable:g-tax-ded-payment,gross:g,tax,deductions:ded,contributions:ins,paid:payment};
  }
  return Object.freeze({cents,rubles,sum,allocate,difference,pnl,payroll,cashFlow,walletSnapshot,walletBalance,reportRow,projectResult,preliminaryPeriod,projectExpenseTotal,projectPayroll,projectSnapshot,warehouseCostAudit,netAmount,documentVat,documentPnlAmount,dealKey,workAmount,laborType,payrollParts,expenseLedger,directionSnapshot});
});
