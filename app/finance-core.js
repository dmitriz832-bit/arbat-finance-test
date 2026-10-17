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
      const amount=documentPnlAmount(item,type!=='income'),allocations=Array.isArray(item.pnlAllocations)?item.pnlAllocations:[],rule=String(item.pnlAllocationRule||article?.allocationRule||'none');
      if(rule==='proportional'&&allocations.length){
        const targets=allocations.map(a=>({projectKey:String(a.projectKey||''),dir:String(a.dir||''),org:String(a.org||item.org||'')}));
        if(targets.some(a=>!a.projectKey&&!a.dir)||targets.some(a=>a.org!==String(item.org||''))){
          issues.push({code:'invalid-pnl-allocation-target',source:item});
          push(item,'general-expense',amount,item.projectKey||'',category);
        }else{
          try{
            const weights=allocations.map(a=>Number(a.weight));
            const parts=allocate(rubles(amount),weights);
            for(let i=0;i<parts.length;i++)push({...item,dir:targets[i].dir,org:targets[i].org},'general-expense',parts[i],targets[i].projectKey,category);
          }catch(_){
            issues.push({code:'invalid-pnl-allocation-weights',source:item});
            push(item,'general-expense',amount,item.projectKey||'',category);
          }
        }
      }else{
        if(rule==='proportional')issues.push({code:'missing-pnl-allocation',source:item});
        push(item,'general-expense',amount,item.projectKey||'',category);
      }
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
    const ledger=expenseLedger(data),assigned=ledger.rows.filter(x=>x.dir===name&&ok(x));
    const accruedCost=assigned.filter(x=>x.category!=='belowIncome').reduce((a,x)=>a+x.amount,0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const deferred=bridge?bridge.projects.filter(x=>x.dir===name).reduce((v,x)=>v+x.deferredChange,0n):0n;
    const cost=accruedCost-deferred;
    const otherIncome=assigned.filter(x=>x.category==='belowIncome').reduce((a,x)=>a+x.amount,0n);
    return {revenue,cost,otherIncome,result:revenue+otherIncome-cost,issues:[...ledger.issues,...(bridge?.issues||[])]};
  }
  function directionReconciliation(data,period='',org=''){
    const ok=x=>(!period||String(x.date||x.dt||'').slice(0,7)===period)&&(!org||x.org===org);
    const deals=data.deals||[],ledger=expenseLedger(data);
    const names=new Set([...deals.map(x=>x.dir).filter(Boolean),...ledger.rows.map(x=>x.dir).filter(Boolean)]);
    const directions=[...names].sort().map(name=>({name,...directionSnapshot(data,name,period,org)}));
    const total=preliminaryPeriod(data,period,org);
    const directionResult=directions.reduce((v,x)=>v+x.result,0n);
    const unallocatedRevenue=(data.realizations||[]).filter(ok).filter(x=>!deals.find(d=>dealKey(d)===x.projectKey)?.dir).reduce((v,x)=>v+documentPnlAmount(x),0n);
    const unallocatedRows=ledger.rows.filter(x=>ok(x)&&!x.dir);
    const unallocatedIncome=unallocatedRows.filter(x=>x.category==='belowIncome').reduce((v,x)=>v+x.amount,0n);
    const unallocatedAccrued=unallocatedRows.filter(x=>x.category!=='belowIncome').reduce((v,x)=>v+x.amount,0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const unallocatedExpense=unallocatedAccrued-(bridge?.projects||[]).filter(x=>!x.dir).reduce((v,x)=>v+x.deferredChange,0n);
    const unallocatedResult=unallocatedRevenue+unallocatedIncome-unallocatedExpense;
    const difference=total.result-directionResult-unallocatedResult;
    return {directions,directionResult,unallocatedRevenue,unallocatedIncome,unallocatedExpense,unallocatedResult,totalResult:total.result,difference,balanced:difference===0n,issues:ledger.issues};
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
  function wipCheckPending(data,deal,key){return (data.expenses||[]).some(x=>x.projectKey===key&&x.valuationStatus==='requires-review')||(data.warehouse?.moves||[]).some(x=>x.dealId===deal._id&&x.kind==='consume'&&x.projectIssueId&&!data.fifo);}
  function projectWipSnapshot(data,deal,projectKey,period=''){
    const contractGross=deal.contractTotal??deal.revenue;
    const issues=[];
    if(contractGross==null||cents(contractGross)<=0n)return {status:'requires-review',issues:['missing-project-contract'],contractNet:null};
    const contractNet=documentPnlAmount({...deal,amountGross:contractGross});
    if(contractNet<=0n)return {status:'requires-review',issues:['invalid-project-contract'],contractNet};
    const until=(item,p)=>!p||String(item.date||item.dt||'').slice(0,7)<=p;
    const before=(item,p)=>String(item.date||item.dt||'').slice(0,7)<p;
    const realizations=(data.realizations||[]).filter(x=>x.projectKey===projectKey);
    const ledger=expenseLedger(data);
    const projectRows=ledger.rows.filter(x=>x.projectKey===projectKey&&x.category==='direct');
    const totalOf=(xs)=>xs.reduce((a,x)=>a+x.amount,0n);
    const earned=(p,previous)=>realizations.filter(x=>previous?before(x,p):until(x,p)).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const accrued=(p,previous)=>totalOf(projectRows.filter(x=>previous?before(x,p):until(x,p)));
    const recognized=(revenue,cost)=>{
      const numerator=revenue<0n?0n:revenue>contractNet?contractNet:revenue;
      const sign=cost<0n?-1n:1n,absolute=cost<0n?-cost:cost;
      return sign*((absolute*numerator+contractNet/2n)/contractNet);
    };
    const revenue=earned(period,false),priorRevenue=period?earned(period,true):0n;
    const accruedCost=accrued(period,false),priorCost=period?accrued(period,true):0n;
    if(revenue>contractNet)issues.push('realization-exceeds-contract');
    if(revenue>=contractNet&&wipCheckPending(data,deal,projectKey))issues.push('project-closeout-unverified');
    if(revenue<0n)issues.push('negative-cumulative-realization');
    const recognizedCost=recognized(revenue,accruedCost);
    const previouslyRecognizedCost=period?recognized(priorRevenue,priorCost):0n;
    const currentCost=recognizedCost-previouslyRecognizedCost;
    const wip=accruedCost-recognizedCost;
    for(const issue of ledger.issues)if(issue.source?.projectKey===projectKey||(issue.source?.shares||[]).some(share=>share.projectKey===projectKey))issues.push(issue.code);
    const expenses=(data.expenses||[]).filter(x=>x.projectKey===projectKey);
    if(expenses.some(x=>x.valuationStatus==='requires-review'))issues.push('expense-valuation');
    const warehouseMoves=data.warehouse?.moves||[];
    const consumed=warehouseMoves.filter(x=>x.dealId===deal._id&&x.kind==='consume'&&x.projectIssueId);
    if(consumed.length&&!data.fifo)issues.push('warehouse-fifo-unavailable');
    if(data.fifo&&warehouseCostAudit(expenses,consumed,data.fifo).length)issues.push('warehouse-fifo-mismatch');
    if(data.warehouse&&expenses.some(e=>e.warehouseMoveId&&!warehouseMoves.some(m=>String(m.id)===String(e.warehouseMoveId))))issues.push('warehouse-missing-movement');
    if(expenses.some(e=>e.warehouseMoveId&&warehouseMoves.some(m=>String(m.id)===String(e.warehouseMoveId)&&m.dealId&&m.dealId!==deal._id)))issues.push('warehouse-cross-project-reference');
    if(expenses.some(e=>e.warehouseMoveId&&(data.expenses||[]).some(other=>other!==e&&other.warehouseMoveId&&String(other.warehouseMoveId)===String(e.warehouseMoveId))))issues.push('warehouse-duplicate-global-expense');
    const labor=projectPayroll(data.labor||[],projectKey,(data.workActs||[]).filter(x=>x.projectKey===projectKey));
    if(labor.possibleOverlaps.length)issues.push('possible-work-overlap');
    if(labor.unresolved.some(x=>x.org===deal.org&&x.deal===deal.name))issues.push('legacy-unattributed-payroll');
    return {status:issues.length?'requires-review':'calculated',issues:[...new Set(issues)],contractNet,revenue,accruedCost,recognizedCost,previouslyRecognizedCost,currentCost,wip,fullyRealized:revenue===contractNet,closedCostReconciled:revenue===contractNet&&wip===0n&&recognizedCost===accruedCost,operatingProfit:revenue-recognizedCost};
  }
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
  function wipPeriodBridge(data,period,org=''){
    const projects=[],issues=[];
    let deferredChange=0n,recognizedCost=0n,accruedCost=0n;
    if(!period)return {projects,issues:[{code:'wip-period-required'}],deferredChange,recognizedCost,accruedCost};
    for(const deal of data.deals||[]){
      if(org&&deal.org!==org)continue;
      const projectKey=dealKey(deal);
      const wip=projectWipSnapshot(data,deal,projectKey,period);
      if(wip.status!=='calculated'){
        issues.push({code:'wip-unverified-project',projectKey,details:wip.issues});
        continue;
      }
      const dateRelevant=(data.realizations||[]).some(x=>x.projectKey===projectKey&&String(x.date||'').slice(0,7)<=period)
        ||expenseLedger(data).rows.some(x=>x.projectKey===projectKey&&String(x.date||'').slice(0,7)<=period);
      if(!dateRelevant)continue;
      const currentAccrued=wip.accruedCost-(projectWipSnapshot(data,deal,projectKey,
        String(Number(period.slice(0,4))-(period.endsWith('-01')?1:0))+'-'+(period.endsWith('-01')?'12':String(Number(period.slice(5))-1).padStart(2,'0'))
      ).accruedCost||0n);
      const adjustment=currentAccrued-wip.currentCost;
      projects.push({projectKey,dir:deal.dir||'',org:deal.org||'',recognizedCost:wip.currentCost,accruedCost:currentAccrued,deferredChange:adjustment,wip:wip.wip});
      deferredChange+=adjustment;recognizedCost+=wip.currentCost;accruedCost+=currentAccrued;
    }
    return {projects,issues,deferredChange,recognizedCost,accruedCost};
  }
  function preliminaryPeriod(data,period,org=''){
    const ok=x=>(!org||x.org===org)&&(!period||String(x.date||x.dt||'').slice(0,7)===period);
    const ledger=expenseLedger(data),rows=ledger.rows.filter(ok);
    const total=predicate=>rows.filter(predicate).reduce((a,x)=>a+x.amount,0n);
    const revenue=(data.realizations||[]).filter(ok).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const result=pnl({revenue:[rubles(revenue)],direct:[...rows.filter(x=>x.category==='direct').map(x=>rubles(x.amount)),...(bridge?[rubles(-bridge.deferredChange)]:[])],administrative:rows.filter(x=>x.category==='administrative').map(x=>rubles(x.amount)),commercial:rows.filter(x=>x.category==='commercial').map(x=>rubles(x.amount)),production:rows.filter(x=>x.category==='production').map(x=>rubles(x.amount)),belowIncome:rows.filter(x=>x.category==='belowIncome').map(x=>rubles(x.amount)),belowExpenses:rows.filter(x=>x.category==='belowExpenses').map(x=>rubles(x.amount))});
    return {...result,issues:[...ledger.issues.filter(x=>ok(x.source)),...(bridge?.issues||[])],wipBridge:bridge,components:{revenue,
      projectExpenses:total(x=>x.kind==='project-expense'),
      productionLaborAndWorks:total(x=>x.kind==='work-act'||x.kind==='payroll'&&x.category==='direct'),
      assignedExpenses:total(x=>x.kind==='general-expense'&&x.category==='direct'),
      commonExpenses:total(x=>x.category==='administrative'),
      commercialLabor:total(x=>x.kind==='payroll'&&x.category==='commercial'),
      workActTotal:total(x=>x.kind==='work-act'),productionLabor:total(x=>x.kind==='payroll'&&x.category==='direct'),
      administrativeLabor:total(x=>x.kind==='payroll'&&x.category==='administrative'),
      generalCostTotal:total(x=>x.kind==='general-expense'&&x.category==='administrative')}};
  }
  function ownerPeriodBounds(mode,reference='',from='',to=''){
    const ref=String(reference||new Date().toISOString().slice(0,10)).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ref))throw new RangeError('Invalid reference date');
    const year=ref.slice(0,4),month=Number(ref.slice(5,7));
    if(month<1||month>12)throw new RangeError('Invalid reference month');
    if(mode==='all')return {from:'',to:'',label:'За всё время'};
    if(mode==='month')return {from:year+'-'+ref.slice(5,7)+'-01',to:year+'-'+ref.slice(5,7)+'-31',label:'Месяц '+ref.slice(0,7)};
    if(mode==='quarter'){const first=String(Math.floor((month-1)/3)*3+1).padStart(2,'0'),last=String(Math.floor((month-1)/3)*3+3).padStart(2,'0');return {from:year+'-'+first+'-01',to:year+'-'+last+'-31',label:'Квартал '+Math.ceil(month/3)+' / '+year}}
    if(mode==='year')return {from:year+'-01-01',to:year+'-12-31',label:'Год '+year};
    if(mode==='range'&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to)return {from,to,label:from+' — '+to};
    throw new RangeError('Invalid dashboard period');
  }
  function ownerPeriodSnapshot(data,bounds,org=''){
    const from=bounds.from||'',to=bounds.to||'';
    const inRange=x=>{const d=String(x.date||x.dt||'').slice(0,10);return (!from||d>=from)&&(!to||d<=to)};
    const ok=x=>(!org||x.org===org)&&inRange(x);
    const ledger=expenseLedger(data);
    const rows=ledger.rows.filter(ok);
    const revenue=(data.realizations||[]).filter(ok).reduce((v,x)=>v+documentPnlAmount(x),0n);
    const categories={direct:0n,production:0n,administrative:0n,commercial:0n,belowIncome:0n,belowExpenses:0n};
    for(const row of rows)if(Object.prototype.hasOwnProperty.call(categories,row.category))categories[row.category]+=row.amount;
    const grossProfit=revenue-categories.direct-categories.production;
    const ebitda=grossProfit-categories.administrative-categories.commercial;
    const result=ebitda+categories.belowIncome-categories.belowExpenses;
    const byKind={};
    for(const row of rows)byKind[row.kind]=(byKind[row.kind]||0n)+row.amount;
    const cash=(data.cash||[]).filter(ok);
    const income=cash.filter(x=>x.type==='in').reduce((v,x)=>v+cents(x.amount||0),0n);
    const outgoing=cash.filter(x=>x.type==='out').reduce((v,x)=>v+cents(x.amount||0),0n);
    return {bounds,revenue,grossProfit,ebitda,result,categories,byKind,cash:{income,outgoing,net:income-outgoing,rows:cash},revenueDocuments:(data.realizations||[]).filter(ok),issues:ledger.issues.filter(x=>x.source&&ok(x.source)),rows};
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
  function walletSnapshot(opening,entries,walletId,openingBalanceDate='',asOfDate=''){
    const initial=cents(opening||0);let received=0n,spent=0n;
    for(const item of entries||[]){
      const date=String(item.date||'').slice(0,10);
      if(openingBalanceDate&&(!date||date<=openingBalanceDate))continue;
      if(asOfDate&&(!date||date>asOfDate))continue;
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
  function walletConsolidation(wallets,entries){
    const groups={'АИР-КЛИМАТ':0n,'АРБАТ.ГК':0n,'Общий':0n},rows=[],issues=[],seen=new Set();
    for(const wallet of wallets||[]){
      if(!wallet.verified)continue;
      const id=String(wallet.id||'');
      if(!id||seen.has(id)){issues.push({code:'duplicate-or-missing-wallet-id',walletId:id});continue}
      seen.add(id);
      const org=String(wallet.org||'');
      if(!Object.prototype.hasOwnProperty.call(groups,org)){
        issues.push({code:'unclassified-wallet-organization',walletId:id,org});continue;
      }
      const snapshot=walletSnapshot(wallet.openingBalance||0,entries,id,wallet.openingBalanceDate||'');
      rows.push({walletId:id,name:wallet.name||id,org,...snapshot});
      groups[org]+=snapshot.balance;
    }
    for(const entry of entries||[]){
      if(entry.type==='transfer'&&(!entry.toWalletId||!entry.walletId||entry.toWalletId===entry.walletId)){
        issues.push({code:'invalid-wallet-transfer',source:entry});
      }else if(entry.type==='transfer'&&(!seen.has(String(entry.walletId))||!seen.has(String(entry.toWalletId)))){
        issues.push({code:'transfer-with-unverified-wallet',source:entry});
      }
    }
    const total=groups['АИР-КЛИМАТ']+groups['АРБАТ.ГК']+groups['Общий'];
    return {rows,byOrg:groups,total,issues};
  }
  function bankReconciliation(wallet,entries){
    const date=String(wallet.bankStatementDate||'').slice(0,10);
    if(!date||wallet.bankStatementBalance==null||String(wallet.bankStatementBalance).trim()==='')return {status:'not-configured',difference:null};
    const openingDate=String(wallet.openingBalanceDate||'').slice(0,10);
    if(openingDate&&date<openingDate)return {status:'invalid-statement-date',difference:null};
    const calculated=walletSnapshot(wallet.openingBalance||0,entries,String(wallet.id),openingDate,date).balance;
    const statement=cents(wallet.bankStatementBalance);
    const difference=calculated-statement;
    return {status:difference===0n?'matched':'mismatch',date,calculated,statement,difference};
  }
  function walletBalance(opening,entries,walletId){return walletSnapshot(opening,entries,walletId).balance}
  function payroll({gross,ndfl='0',other='0',contributions='0',paid='0'}){
    const g=cents(gross),tax=cents(ndfl),ded=cents(other),ins=cents(contributions),payment=cents(paid);
    if([g,tax,ded,ins,payment].some(x=>x<0n)||tax+ded>g)throw new RangeError('Invalid payroll deductions');
    return {expense:g+ins,payable:g-tax-ded-payment,gross:g,tax,deductions:ded,contributions:ins,paid:payment};
  }
  function payrollReconciliation({accruals=[],payments=[]}={}){
    const totals=new Map(),issues=[],unallocatedPayments=[];
    const get=id=>{if(!totals.has(id))totals.set(id,{personId:id,gross:0n,ndfl:0n,other:0n,contributions:0n,paid:0n,expense:0n,payable:0n});return totals.get(id)};
    for(const entry of accruals){
      if(!entry.personId){issues.push({code:'payroll-missing-person',source:entry});continue}
      try{
        const p=payroll({gross:entry.gross??entry.amount??0,ndfl:entry.ndfl??0,other:entry.otherDeductions??entry.other??0,contributions:entry.employerContributions??entry.contributions??0});
        const t=get(String(entry.personId));t.gross+=p.gross;t.ndfl+=p.tax;t.contributions+=p.contributions;t.expense+=p.expense;t.other+=p.deductions;t.payable+=p.payable;
      }catch(e){issues.push({code:'payroll-invalid-deductions',source:entry,reason:e.message})}
    }
    for(const payment of payments.filter(x=>x.type==='out'&&(x.personId||Array.isArray(x.payrollAllocations))&&x.payrollPayment!==false)){
      const amount=cents(payment.amount||0);
      if(amount<0n){issues.push({code:'payroll-invalid-payment',source:payment});continue}
      const allocations=Array.isArray(payment.payrollAllocations)?payment.payrollAllocations:null;
      // Project-based cash allocations have a different meaning and must never settle salary.
      // Explicit payroll allocation takes precedence over legacy single-beneficiary payout.
      let allocated=0n;
      if(allocations){
        const parts=[];let invalid=false;
        for(const part of allocations){
          let value;
          try{value=cents(part.amount||0)}catch(_){invalid=true;break}
          if(value<0n||!part.personId){invalid=true;break}
          allocated+=value;parts.push({personId:String(part.personId),amount:value});
        }
        if(invalid||allocated>amount){
          issues.push({code:invalid?'payroll-invalid-allocation':'payroll-overallocated-payment',source:payment,amount:allocated-amount});
          unallocatedPayments.push({source:payment,amount});
          continue;
        }
        for(const part of parts)get(part.personId).paid+=part.amount;
      }else if(payment.personId){
        allocated=amount;get(String(payment.personId)).paid+=amount;
      }
      const remainder=amount-allocated;
      if(remainder!==0n){unallocatedPayments.push({source:payment,amount:remainder});issues.push({code:'payroll-unallocated-payment',source:payment,amount:remainder})}
    }
    const people=[...totals.values()].map(x=>({...x,payable:x.payable-x.paid}));
    for(const p of people)if(p.payable<0n)issues.push({code:'payroll-overpayment',personId:p.personId,amount:-p.payable});
    const unallocatedTotal=unallocatedPayments.reduce((a,x)=>a+x.amount,0n);
    const overpaidTotal=people.reduce((a,x)=>a+(x.payable<0n?-x.payable:0n),0n);
    const grossTotal=people.reduce((a,x)=>a+x.gross,0n);
    const paidTotal=people.reduce((a,x)=>a+x.paid,0n);
    return {people,issues,unallocatedPayments,unallocatedTotal,overpaidTotal,grossTotal,paidTotal,expense:people.reduce((a,x)=>a+x.expense,0n)};
  }
  function paymentExceptionRegister({cash=[],labor=[],deals=[],people=[],articles=[],expenses=[]}={}){
    const issues=[],add=(code,source,detail='')=>issues.push({code,source,detail});
    const keySet=new Set(deals.map(dealKey));
    const personSet=new Set(people.map(x=>String(x.id)));
    const articleSet=new Set(articles.map(x=>String(x.id)));
    const seen=new Map();
    const payrollState=payrollReconciliation({accruals:labor,payments:cash});
    for(const issue of payrollState.issues){
      if(['payroll-unallocated-payment','payroll-overallocated-payment','payroll-invalid-allocation'].includes(issue.code))add(issue.code,issue.source,issue.amount==null?'':rubles(issue.amount));
    }
    for(const item of cash){
      const id=String(item._id||item.id||''),amount=cents(item.amount||0);
      if(item.type==='in'&&!item.projectKey&&!(item.customerId||item.personId))add('incoming-without-project-or-counterparty',item,rubles(amount));
      else if(item.type==='in'&&!item.projectKey)add('incoming-without-project',item,rubles(amount));
      if(item.type==='out'&&!item.personId&&item.type!=='transfer'&&(!item.projectKey||!item.articleId))add('supplier-payment-missing-project-or-article',item,rubles(amount));
      if(item.projectKey&&!keySet.has(String(item.projectKey)))add('invalid-project-reference',item,String(item.projectKey));
      if(item.personId&&people.length&&!personSet.has(String(item.personId)))add('invalid-person-reference',item,String(item.personId));
      if(item.articleId&&articles.length&&item.articleId!=='internal-transfer'&&!articleSet.has(String(item.articleId)))add('invalid-article-reference',item,String(item.articleId));
      if(item.type==='out'&&Array.isArray(item.payrollAllocations)){
        const allocationTotal=item.payrollAllocations.reduce((total,p)=>total+cents(p.amount||0),0n);
        if(allocationTotal!==amount)add('payment-allocation-difference',item,rubles(amount-allocationTotal));
      }
      // Treat matches as candidates only: never mutate or delete historical movements.
      if(item.type==='in'||item.type==='out'){
        const fingerprint=[item.date,item.type,item.walletId,rubles(amount),item.customerId||item.personId||item.counterparty||''].join('|');
        if(seen.has(fingerprint))add('possible-duplicate-payment',item,'Похожая операция: '+seen.get(fingerprint));
        else seen.set(fingerprint,id||'(без идентификатора)');
      }
    }
    for(const item of expenses){
      if(item.projectRequired&&!item.projectKey)add('required-expense-project-missing',item,rubles(cents(item.amount||0)));
      if(item.projectKey&&!keySet.has(String(item.projectKey)))add('invalid-expense-project-reference',item,String(item.projectKey));
    }
    return {issues,count:issues.length,unallocatedPayroll:payrollState.unallocatedTotal};
  }

  // Vacation ledger amounts are hundredths of a day. Calendar dates are UTC-only.
  function leaveSnapshot(person,history=[],asOf=''){
    const issues=[],events=[],today=asOf||new Date().toISOString().slice(0,10);
    const day=raw=>{
      const str=String(raw||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(str))throw new RangeError('Invalid leave date');
      const ms=Date.parse(str+'T00:00:00Z');
      if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==str)throw new RangeError('Invalid leave date');
      return Math.floor(ms/86400000);
    };
    const fmt=d=>new Date(d*86400000).toISOString().slice(0,10);
    const hire=person.hireDate||person.employmentStartDate;
    if(!hire)return {status:'requires-review',issues:['missing-hire-date'],earned:0n,used:0n,adjustments:0n,balance:0n,events:[]};
    let first,through;
    try{
      first=day(hire);through=day(today);
      if(person.terminationDate){const last=day(person.terminationDate);if(last<first)issues.push('termination-before-hire');through=Math.min(through,last)}
    }catch(_){return {status:'requires-review',issues:['invalid-employment-date'],earned:0n,used:0n,adjustments:0n,balance:0n,events:[]}}
    const annual=Number(person.annualLeaveDays??28);
    if(!Number.isInteger(annual)||annual<0||annual>366)issues.push('invalid-annual-leave-norm');
    let earned=0n,used=0n,adjustments=0n;
    if(!issues.length&&through>=first){
      const start=new Date(first*86400000),month=start.getUTCMonth(),date=start.getUTCDate();
      const anniversary=year=>Math.floor(Date.UTC(year,month,Math.min(date,new Date(Date.UTC(year,month+1,0)).getUTCDate()))/86400000);
      for(let year=start.getUTCFullYear();year<=new Date(through*86400000).getUTCFullYear()+1;year++){
        let a=anniversary(year),b=anniversary(year+1);
        if(year===start.getUTCFullYear()&&a!==first)a=first;
        const covered=Math.max(0,Math.min(through,b-1)-Math.max(first,a)+1);
        if(covered)earned+=(BigInt(annual)*100n*BigInt(covered)+BigInt(b-a)/2n)/BigInt(b-a);
      }
    }
    const intervals=[];
    for(const event of history.filter(e=>String(e.personId)===String(person.id)&&e.status!=='cancelled')){
      try{
        if(event.type==='adjustment'){
          const delta=cents(event.days||0);
          if(day(event.date)>day(today))continue;
          adjustments+=delta;events.push({type:'adjustment',days:delta,date:event.date});continue;
        }
        if(event.type!=='leave')continue;
        const a=day(event.startDate),b=day(event.endDate);
        if(b<a){issues.push('invalid-leave-range');continue}
        if(a<first){issues.push('leave-before-hire');continue}
        if(person.terminationDate&&a>day(person.terminationDate)){issues.push('leave-after-termination');continue}
        const overlap=intervals.some(x=>a<=x.end&&b>=x.start);
        if(overlap&&!event.overlapConfirmed){issues.push('overlapping-leave');continue}
        intervals.push({start:a,end:b});
        const activeEnd=Math.min(b,day(today));
        const amount=BigInt(Math.max(0,activeEnd-a+1))*100n;
        used+=amount;events.push({type:'leave',days:amount,startDate:fmt(a),endDate:fmt(b)});
      }catch(_){issues.push('invalid-leave-event')}
    }
    return {status:issues.length?'requires-review':'calculated',issues,earned,used,adjustments,balance:earned-used+adjustments,events};
  }
  return Object.freeze({cents,rubles,sum,allocate,difference,pnl,payroll,payrollReconciliation,ownerPeriodBounds,ownerPeriodSnapshot,cashFlow,walletSnapshot,walletConsolidation,bankReconciliation,paymentExceptionRegister,leaveSnapshot,walletBalance,reportRow,projectResult,preliminaryPeriod,projectExpenseTotal,projectPayroll,projectSnapshot,warehouseCostAudit,netAmount,documentVat,documentPnlAmount,dealKey,workAmount,laborType,payrollParts,expenseLedger,directionSnapshot,directionReconciliation,projectWipSnapshot,wipPeriodBridge});
});
