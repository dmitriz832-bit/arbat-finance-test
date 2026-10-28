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
    const used=shares.reduce((a,b)=>a+b,0n);let last=ws.length-1;while(ws[last]===0n)last--;shares[last]+=abs-used;
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
    let parsed;
    try{
      parsed=payroll({gross:item.gross??item.amount??item.salary??0,ndfl:item.ndfl??0,other:item.otherDeductions??item.other??0,contributions:item.employerContributions??item.contributions??0});
    }catch(_){return {parts:[],issues:['payroll-invalid-deductions']}}
    const gross=parsed.gross,contributions=parsed.contributions;
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
      if(parts.length||item.projectKey===projectKey||(Array.isArray(item.shares)&&item.shares.some(share=>share?.projectKey===projectKey))){issues.push(...result.issues);if(result.issues.includes('linked-work-overlap'))conflicts.push(item)}
      if(item.deal&&!item.projectKey&&!(item.shares||[]).length)unresolved.push(item);
      if(item.projectKey!==projectKey||item.workActId||item.actId||item.batchId)continue;
      const date=String(item.date||item.dt||'').slice(0,10);
      if(!date||!item.personId)continue;
      const matching=approvedActs.filter(a=>a.status==='approved'&&String(a.date||'').slice(0,10)===date&&((a.memberIds||[]).includes(item.personId)||a.leadId===item.personId));
      if(matching.length)possibleOverlaps.push({accrualId:item._id||item.id||null,actIds:matching.map(a=>a.id)});
    }
    return {total,unresolved,conflicts,possibleOverlaps,issues:[...new Set(issues)]};
  }
  function managementTaxAmount(item){
    const regime={'АИР-КЛИМАТ':'usn','АРБАТ.ГК':'profit'},period=String(item.managementTaxPeriod||''),identity=String(item._id||item.id||'');
    if(item.managementTax!==true||regime[item.org]!==item.managementTaxType||!regime[item.org]||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Проверьте организацию, налог и месяц начисления');
    const end=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
    if(item.date!==end||!identity||!String(item.document||'').trim()||Number(item.vatRate)!==0)throw Error('Проверьте дату, документ и отсутствие НДС в начислении');
    if(item.amount==null||String(item.amount).trim()==='')throw Error('Укажите сумму начисления');
    const value=cents(item.amount);if(value<0n)throw Error('Сумма начисления не может быть отрицательной');
    return value;
  }
  function expenseLedger(data,taxSourceCosts=data.costs||[],saleSource=data){
    const sales=warehouseSaleAudit(saleSource),rows=[],issues=[...sales.issues],deals=data.deals||[],acts=data.workActs||[];
    const push=(source,kind,amount,projectKey=source.projectKey||'',category='direct')=>{
      const deal=deals.find(d=>dealKey(d)===projectKey);
      rows.push({source,kind,amount,projectKey,dir:deal?.dir||source.dir||'',org:source.org||deal?.org||'',date:source.date||source.dt||'',category});
    };
    for(const item of data.expenses||[]){
      if(sales.invalidExpenses.includes(item))continue;
      push(item,'project-expense',documentPnlAmount(item,true));
      if(sales.validExpenses.includes(item))Object.assign(rows[rows.length-1],{stockPurpose:'sale',saleRealizationId:item.saleRealizationId});
    }
    for(const item of acts.filter(a=>a.status==='approved')){
      try{
        if(item.qty==null||String(item.qty).trim()===''||item.rate==null||String(item.rate).trim()==='')throw new TypeError('Unknown work quantity or rate');
        const amount=workAmount(item);if(amount<0n)throw new RangeError('Negative work amount');
        push(item,'work-act',amount);
      }catch(error){issues.push({code:'crew-payroll-invalid-work-act',source:item,message:error.message})}
    }
    for(const item of data.costs||[]){
      if(item.managementTax===true){
        try{const value=managementTaxAmount(item),identity=String(item._id||item.id||'');
          if(taxSourceCosts.filter(x=>String(x._id||x.id||'')===identity).length!==1||taxSourceCosts.filter(x=>x.managementTax===true&&x.org===item.org&&x.managementTaxType===item.managementTaxType&&x.managementTaxPeriod===item.managementTaxPeriod).length!==1)throw Error('Дублирующее начисление налога');
          push(item,'management-tax',value,'','belowExpenses');
        }catch(error){issues.push({code:'invalid-management-tax',source:item,message:error.message});}
        continue;
      }
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
        const crossOrganization=targets.some(target=>{
          const deal=deals.find(d=>dealKey(d)===target.projectKey);
          return target.org!==String(item.org||'')||deal&&String(deal.org||'')!==target.org;
        });
        if(targets.some(a=>!a.projectKey&&!a.dir)||crossOrganization){
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
      try{
        payroll({gross:item.gross??item.amount??item.salary??0,ndfl:item.ndfl??0,other:item.otherDeductions??item.other??0,contributions:item.employerContributions??item.contributions??0});
      }catch(error){
        issues.push({code:'payroll-invalid-deductions',source:item,message:error.message});
        continue;
      }
      const result=payrollParts(item,acts),type=laborType(item,data.people||[]);
      for(const code of result.issues)issues.push({code,source:item});
      const group=String(item.pnlGroup||'').toLowerCase(),level=String(item.pnlLevel||'').toLowerCase();const category=level==='below'?'belowExpenses':group.includes('общепроизвод')?'production':group.includes('коммерч')?'commercial':group.includes('администр')?'administrative':group.includes('прям')?'direct':type==='administrative'?'administrative':type==='commercial'?'commercial':'direct';for(const part of result.parts)push(item,'payroll',part.amount,part.projectKey,category);
    }
    return {rows,issues};
  }
  // Apply the date cutoff before resolving work/payroll links. A later act must
  // never suppress an accrual in an earlier snapshot.
  function expenseLedgerAt(data,cutoff='',inclusive=true){
    if(!cutoff)return expenseLedger(data);
    const scoped={...data},inScope=item=>{
      const date=String(item.date||item.dt||'').slice(0,cutoff.length);
      return inclusive?date<=cutoff:date<cutoff;
    };
    for(const field of ['expenses','costs','labor','workActs'])scoped[field]=(data[field]||[]).filter(inScope);
    return expenseLedger(scoped,data.costs||[],data);
  }
  function expenseLedgerRange(data,from='',to=''){
    const end=expenseLedgerAt(data,to);
    if(!from)return end;
    const prior=expenseLedgerAt(data,from,false),rows=end.rows.filter(row=>String(row.date||'').slice(0,10)>=from);
    // A later act can replace an older payroll gross in the cumulative ledger.
    // Record that calculated reclassification in this range, without editing
    // either source or expensing the same gross in two separate periods.
    const sources=new Map((data.labor||[]).map((source,index)=>[source,index])),changes=new Map();
    const add=(row,sign)=>{
      const key=JSON.stringify([sources.get(row.source),row.projectKey,row.category,row.org,row.dir]);
      if(!changes.has(key))changes.set(key,{row,amount:0n});
      changes.get(key).amount+=sign*row.amount;
    };
    for(const row of prior.rows)if(row.kind==='payroll')add(row,-1n);
    for(const row of end.rows)if(row.kind==='payroll'&&String(row.date||'').slice(0,10)<from)add(row,1n);
    for(const {row,amount} of changes.values())if(amount!==0n)rows.push({...row,amount,date:from,calculated:true,adjustment:'linked-work-reclassification',label:'Расчётная переклассификация начисления в акт'});
    return {rows,issues:end.issues};
  }
  function monthlyExpenseLedger(data,period=''){
    return period?expenseLedgerRange(data,period+'-01',period+'-31'):expenseLedger(data);
  }
  function directionSnapshot(data,name,period='',org=''){
    const ok=x=>(!period||String(x.date||x.dt||'').slice(0,7)===period)&&(!org||x.org===org);
    const keys=new Set((data.deals||[]).filter(d=>d.dir===name).map(dealKey));
    const revenue=managementRealizations(data).filter(x=>keys.has(x.projectKey)&&ok(x)).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const ledger=monthlyExpenseLedger(data,period),assigned=ledger.rows.filter(x=>x.dir===name&&ok(x));
    const accruedCost=assigned.filter(x=>x.category!=='belowIncome').reduce((a,x)=>a+x.amount,0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const deferred=bridge?bridge.projects.filter(x=>x.dir===name).reduce((v,x)=>v+x.deferredChange,0n):0n;
    const cost=accruedCost-deferred;
    const otherIncome=assigned.filter(x=>x.category==='belowIncome').reduce((a,x)=>a+x.amount,0n);
    return {revenue,cost,otherIncome,result:revenue+otherIncome-cost,issues:[...ledger.issues,...(bridge?.issues||[])]};
  }
  function directionReconciliation(data,period='',org=''){
    const ok=x=>(!period||String(x.date||x.dt||'').slice(0,7)===period)&&(!org||x.org===org);
    const deals=data.deals||[],ledger=monthlyExpenseLedger(data,period);
    const names=new Set([...deals.map(x=>x.dir).filter(Boolean),...ledger.rows.map(x=>x.dir).filter(Boolean)]);
    const directions=[...names].sort().map(name=>({name,...directionSnapshot(data,name,period,org)}));
    const total=preliminaryPeriod(data,period,org);
    const directionResult=directions.reduce((v,x)=>v+x.result,0n);
    const unallocatedRevenue=managementRealizations(data).filter(ok).filter(x=>!deals.find(d=>dealKey(d)===x.projectKey)?.dir).reduce((v,x)=>v+documentPnlAmount(x),0n);
    const unallocatedRows=ledger.rows.filter(x=>ok(x)&&!x.dir);
    const unallocatedIncome=unallocatedRows.filter(x=>x.category==='belowIncome').reduce((v,x)=>v+x.amount,0n);
    const unallocatedAccrued=unallocatedRows.filter(x=>x.category!=='belowIncome').reduce((v,x)=>v+x.amount,0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const unallocatedExpense=unallocatedAccrued-(bridge?.projects||[]).filter(x=>!x.dir).reduce((v,x)=>v+x.deferredChange,0n);
    const unallocatedResult=unallocatedRevenue+unallocatedIncome-unallocatedExpense;
    const difference=total.result-directionResult-unallocatedResult;
    return {directions,directionResult,unallocatedRevenue,unallocatedIncome,unallocatedExpense,unallocatedResult,totalResult:total.result,difference,balanced:difference===0n,issues:total.issues};
  }
  function warehouseReceiptGross(source={}){
    if(source.amountGross!==undefined&&source.amountGross!==null&&String(source.amountGross).trim()!=='')return cents(source.amountGross);
    const decimal=value=>{
      const match=String(value??'').trim().replace(',','.').match(/^([+-]?\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
      if(!match)throw Error('Количество или цена партии требуют сверки');
      const fraction=match[2]||'',power=fraction.length-Number(match[3]||0),n=BigInt(match[1]+fraction);
      return power<0?{n:n*10n**BigInt(-power),scale:1n}:{n,scale:10n**BigInt(power)};
    };
    const q=decimal(source.qty),p=decimal(source.price),denominator=q.scale*p.scale,n=q.n*p.n*100n;
    if(q.n<0n||p.n<0n)throw Error('Количество или цена партии требуют сверки');
    return (n+denominator/2n)/denominator;
  }
  function warehouseReceiptValuation(source={},grossCents){
    try{
      const present=x=>x!==null&&x!==undefined&&String(x).trim()!=='';
      const gross=grossCents===undefined?warehouseReceiptGross(source):BigInt(grossCents);
      if(gross<0n||present(source.amountGross)&&cents(source.amountGross)!==gross)throw Error('Стоимость партии требует сверки');
      if(!present(source.vatRate)){
        if(['vatDeductible','amountNet','vatAmount'].some(k=>present(source[k])))throw Error('Не указана ставка НДС партии');
        return {expenseValueCents:String(gross),expenseValuationStatus:'legacy-gross'};
      }
      const yes=source.vatDeductible===true||source.vatDeductible==='true',no=source.vatDeductible===false||source.vatDeductible==='false';
      const tax=documentVat(rubles(gross),source.vatRate,yes);
      if(tax.vatRate!==0&&!yes&&!no)throw Error('Право на вычет НДС партии не подтверждено');
      if(present(source.amountNet)&&cents(source.amountNet)!==tax.amountNet||present(source.vatAmount)&&cents(source.vatAmount)!==tax.vatAmount)throw Error('Суммы НДС партии требуют сверки');
      return {expenseValueCents:String(yes?tax.amountNet:gross),expenseValuationStatus:'verified'};
    }catch(error){return {expenseValueCents:null,expenseValuationStatus:'requires-review',reason:error.message};}
  }
  function warehouseMovementValuation(warehouse={},move={},fifo){
    try{
      const calculation=fifo?.byMove?.[move.id];
      if(!calculation||calculation.invalid||calculation.amount===null||!Array.isArray(calculation.parts)||!calculation.parts.length)throw Error('Партионная стоимость не подтверждена');
      let gross=0n,expense=0n,legacy=false;const parts=[];
      for(const part of calculation.parts){
        const sources=(warehouse.moves||[]).filter(x=>String(x.id)===String(part.source));
        if(sources.length!==1||!['receipt','opening'].includes(sources[0].kind))throw Error('Источник партии отсутствует или неоднозначен');
        const source=sources[0],sourceGross=warehouseReceiptGross(source),policy=warehouseReceiptValuation(source,sourceGross);
        if(source.itemId!==undefined&&move.itemId!==undefined&&String(source.itemId)!==String(move.itemId))throw Error('Номенклатура источника партии не совпадает со списанием');
        if(policy.expenseValueCents===null)throw Error(policy.reason||'Налоговая стоимость партии не подтверждена');
        const partGross=part.valueCents===undefined?warehouseReceiptGross({qty:part.qty,price:part.cost}):BigInt(part.valueCents);
        if(partGross<0n)throw Error('Стоимость части партии требует сверки');
        let partExpense;
        if(part.expenseValueCents===undefined&&policy.expenseValuationStatus==='legacy-gross')partExpense=partGross;
        else{
          if(part.expenseValueCents===null||part.expenseValueCents===undefined||part.expenseValuationStatus==='requires-review')throw Error('Стоимость списания требует сверки');
          partExpense=BigInt(part.expenseValueCents);
          if(part.sourceGrossValueCents===undefined||BigInt(part.sourceGrossValueCents)!==sourceGross||part.sourceExpenseValueCents===null||part.sourceExpenseValueCents===undefined||BigInt(part.sourceExpenseValueCents)!==BigInt(policy.expenseValueCents))throw Error('Изменена стоимость или политика исходной партии');
        }
        if(partExpense<0n)throw Error('Стоимость списания требует сверки');
        legacy=legacy||policy.expenseValuationStatus==='legacy-gross';gross+=partGross;expense+=partExpense;
        parts.push({source:String(part.source),qty:part.qty,grossValueCents:String(partGross),expenseValueCents:String(partExpense),sourceGrossValueCents:String(sourceGross),sourceExpenseValueCents:policy.expenseValueCents,expenseValuationStatus:policy.expenseValuationStatus});
      }
      if(gross!==cents(calculation.amount))throw Error('Сумма частей не совпадает со стоимостью FIFO');
      return {status:'calculated',grossAmount:gross,expenseAmount:expense,expenseValuationStatus:legacy?'legacy-gross':'verified',parts};
    }catch(error){return {status:'requires-review',grossAmount:null,expenseAmount:null,expenseValuationStatus:'requires-review',parts:[],reason:error.message};}
  }
  // JSONB preserves values and array order, but may reorder object properties.
  const warehouseEvidenceJson=value=>JSON.stringify(value,(_key,part)=>part&&typeof part==='object'&&!Array.isArray(part)?Object.fromEntries(Object.keys(part).sort().map(key=>[key,part[key]])):part);
  function warehouseCostAudit(expenses,moves,fifo,warehouse){
    const issues=[];
    const linked=(expenses||[]).filter(x=>x.warehouseMoveId);
    const byMove=new Map();
    for(const e of linked){const key=String(e.warehouseMoveId);byMove.set(key,[...(byMove.get(key)||[]),e])}
    for(const move of (moves||[]).filter(x=>x.kind==='consume'&&(x.projectIssueId||x.dealId))){
      const rows=byMove.get(String(move.id))||[];
      const valued=fifo?.byMove?.[move.id];
      if(rows.length!==1){issues.push({moveId:move.id,reason:rows.length?'duplicate-expense':'missing-expense'});continue}
      if(!valued||valued.invalid||valued.amount==null){issues.push({moveId:move.id,reason:'unverified-fifo'});continue}
      if(rows[0].warehouseGrossAmount!==undefined){
        const valuation=warehouseMovementValuation(warehouse||{moves},move,fifo);
        try{const row=rows[0],missing=x=>x===null||x===undefined||String(x).trim()==='';if(valuation.status!=='calculated'||missing(row.amount)||missing(row.warehouseGrossAmount)||cents(row.warehouseGrossAmount)!==valuation.grossAmount||cents(row.amount)!==valuation.expenseAmount||documentPnlAmount(row,true)!==valuation.expenseAmount||Number(row.vatRate)!==0||cents(row.vatAmount)!==0n||row.vatDeductible!==false||cents(row.amountGross)!==valuation.expenseAmount||cents(row.amountNet)!==valuation.expenseAmount||warehouseEvidenceJson(row.warehouseValuationParts)!==warehouseEvidenceJson(valuation.parts))throw Error('mismatch')}
        catch{issues.push({moveId:move.id,reason:'fifo-cost-mismatch'})}
      }else if(cents(rows[0].amount||0)!==cents(valued.amount)){issues.push({moveId:move.id,reason:'fifo-cost-mismatch'})}
    }
    const eligible=new Set((moves||[]).filter(x=>x.kind==='consume'&&(x.projectIssueId||x.dealId)).map(x=>String(x.id)));
    for(const e of linked){if(!eligible.has(String(e.warehouseMoveId)))issues.push({moveId:String(e.warehouseMoveId),reason:'expense-without-project-consumption'})}
    return issues;
  }
  // Sale metadata is a claim, never evidence on its own. Validate the entire
  // shipment/realization/expense component before allowing either side in P&L.
  function warehouseSaleAudit(data={}){
    const moves=data.warehouse?.moves||[],expenses=data.expenses||[],realizations=data.realizations||[],deals=data.deals||[];
    const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k),id=x=>String(x??''),text=x=>typeof x==='string'&&x.trim()!=='';
    const moveClaim=x=>own(x,'saleRealizationId')||own(x,'stockPurpose')&&!['project',undefined].includes(x.stockPurpose);
    const realizationClaim=x=>['warehouseSale','warehouseDocumentId','warehouseMoveIds'].some(k=>own(x,k));
    const saleMoves=new Set(moves.filter(moveClaim)),saleExpenses=new Set(expenses.filter(moveClaim)),saleRealizations=new Set(realizations.filter(realizationClaim));
    const moveIds=r=>Array.isArray(r.warehouseMoveIds)?r.warehouseMoveIds:[];
    const connected=(m,r)=>id(m.saleRealizationId)&&id(m.saleRealizationId)===id(r._id)||moveIds(r).some(x=>id(x)===id(m.id));
    const linked=(e,m)=>id(e.warehouseMoveId)&&id(e.warehouseMoveId)===id(m.id);
    let changed=true;
    while(changed){
      const size=saleMoves.size+saleExpenses.size+saleRealizations.size;
      for(const m of moves)if([...saleRealizations].some(r=>connected(m,r))||[...saleExpenses].some(e=>linked(e,m)))saleMoves.add(m);
      for(const r of realizations)if([...saleMoves].some(m=>connected(m,r))||[...saleExpenses].some(e=>id(e.saleRealizationId)&&id(e.saleRealizationId)===id(r._id)))saleRealizations.add(r);
      for(const e of expenses)if([...saleMoves].some(m=>linked(e,m))||[...saleRealizations].some(r=>id(e.saleRealizationId)&&id(e.saleRealizationId)===id(r._id)))saleExpenses.add(e);
      changed=size!==saleMoves.size+saleExpenses.size+saleRealizations.size;
    }
    const issues=[],reported=new Set(),badMoves=new Set(),badExpenses=new Set(),badRealizations=new Set();
    const fail=(source,code,set)=>{
      set.add(source);
      reported.add(source);
      const deal=deals.find(d=>id(d._id)===id(source.dealId)),projectKey=source.projectKey||(deal?dealKey(deal):'');
      issues.push({code:'warehouse-sale-'+code,source:source.projectKey?source:{...source,projectKey},projectKey,moveId:source.warehouseMoveId||source.id||'',realizationId:source.saleRealizationId||source._id||''});
    };
    const date=x=>String(x||'').slice(0,10);
    const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(x)&&Number.isFinite(Date.parse(x))&&Number.isFinite(Date.parse(date(x)+'T00:00:00Z'))&&new Date(date(x)+'T00:00:00Z').toISOString().slice(0,10)===date(x);
    for(const r of saleRealizations){
      const list=moveIds(r),matches=deals.filter(d=>dealKey(d)===r.projectKey),deal=matches[0];
      let valid=r.warehouseSale===true&&text(r._id)&&text(r.warehouseDocumentId)&&validDate(r.date)&&list.length>0&&list.every(text)&&new Set(list).size===list.length&&realizations.filter(x=>x._id===r._id).length===1&&matches.length===1&&text(deal?._id)&&deals.filter(d=>d._id===deal._id).length===1&&r.org===deal.org;
      try{
        const revenue=documentPnlAmount(r),contract=documentPnlAmount({...deal,amountGross:deal?.contractTotal??deal?.revenue});
        const earned=realizations.filter(x=>x.projectKey===r.projectKey&&date(x.date)<=date(r.date)).reduce((n,x)=>n+documentPnlAmount(x),0n);
        valid=valid&&revenue>0n&&contract>0n&&earned<=contract;
      }catch(_){valid=false}
      const claimed=moves.filter(m=>id(m.saleRealizationId)===id(r._id));
      if(claimed.length!==list.length||claimed.some(m=>!list.includes(m.id)))valid=false;
      for(const key of list){
        const mm=moves.filter(m=>m.id===key);
        if(mm.length!==1||!connected(mm[0],r)||mm[0].saleRealizationId!==r._id||mm[0].documentId!==r.warehouseDocumentId||mm[0].org!==r.org||mm[0].dealId!==deal?._id||date(mm[0].date)!==date(r.date)||realizations.filter(x=>moveIds(x).includes(key)).length!==1)valid=false;
      }
      if(!valid)fail(r,'invalid-realization-link',badRealizations);
    }
    for(const m of saleMoves){
      const rs=realizations.filter(r=>r._id===m.saleRealizationId),es=expenses.filter(e=>linked(e,m)),deal=deals.find(d=>d._id===m.dealId);
      let valid=m.kind==='consume'&&m.stockPurpose==='sale'&&text(m.id)&&text(m.saleRealizationId)&&text(m.documentId)&&validDate(m.date)&&Number.isFinite(Number(m.qty))&&Number(m.qty)>0&&text(m.itemId)&&text(m.from)&&!m.to&&moves.filter(x=>x.id===m.id).length===1&&rs.length===1&&es.length===1&&!!deal&&deal.org===m.org;
      try{
        const value=warehouseMovementValuation(data.warehouse,m,data.fifo),parts=data.fifo?.byMove?.[m.id]?.parts||[];
        valid=valid&&value.status==='calculated'&&Math.abs(parts.reduce((n,p)=>n+Number(p.qty),0)-Number(m.qty))<1e-8&&parts.every(p=>Number(p.qty)>0&&moves.filter(s=>s.id===p.source&&s.org===m.org&&s.itemId===m.itemId&&date(s.date)<=date(m.date)).length===1);
        valid=valid&&es[0]?.warehouseGrossAmount!==undefined&&warehouseCostAudit(es,[m],data.fifo,data.warehouse).length===0;
      }catch(_){valid=false}
      if(!valid)fail(m,'invalid-shipment-link',badMoves);
    }
    for(const e of saleExpenses){
      const ms=moves.filter(m=>id(m.id)===id(e.warehouseMoveId)),m=ms[0],deal=deals.find(d=>d._id===m?.dealId);
      const valid=e.stockPurpose==='sale'&&text(e.saleRealizationId)&&text(e.warehouseMoveId)&&ms.length===1&&e.saleRealizationId===m.saleRealizationId&&e.org===m.org&&validDate(e.date)&&date(e.date)===date(m.date)&&!!deal&&e.projectKey===dealKey(deal)&&expenses.filter(x=>id(x.warehouseMoveId)===id(e.warehouseMoveId)).length===1;
      if(!valid)fail(e,'invalid-expense-link',badExpenses);
    }
    // A broken node quarantines its complete connected sale, including all
    // lines of a multi-item document. No orphan revenue or partial expense.
    changed=true;
    while(changed){
      const size=badMoves.size+badExpenses.size+badRealizations.size;
      for(const r of saleRealizations)if([...badMoves].some(m=>connected(m,r))||[...badExpenses].some(e=>e.saleRealizationId===r._id))badRealizations.add(r);
      for(const m of saleMoves)if([...badRealizations].some(r=>connected(m,r))||[...badExpenses].some(e=>linked(e,m)))badMoves.add(m);
      for(const e of saleExpenses)if([...badMoves].some(m=>linked(e,m))||[...badRealizations].some(r=>e.saleRealizationId===r._id))badExpenses.add(e);
      changed=size!==badMoves.size+badExpenses.size+badRealizations.size;
    }
    for(const set of [badMoves,badExpenses,badRealizations])for(const source of set)if(!reported.has(source))fail(source,'quarantined-link',set);
    return {issues,validRealizations:[...saleRealizations].filter(x=>!badRealizations.has(x)),invalidRealizations:[...badRealizations],validExpenses:[...saleExpenses].filter(x=>!badExpenses.has(x)),invalidExpenses:[...badExpenses],saleMoves:[...saleMoves]};
  }
  function managementRealizations(data){const audit=warehouseSaleAudit(data);return (data.realizations||[]).filter(x=>!audit.invalidRealizations.includes(x))}
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
  function vatControlRegister(data={},filters={}){
    const issues=[],from=String(filters.from||''),to=String(filters.to||''),org=String(filters.org||''),projectKey=String(filters.projectKey||'');
    const inScope=item=>{
      if(org&&item.org!==org)return false;
      if(projectKey){const key=item.projectKey||item.kind==='contract'&&dealKey(item);if(String(key||'')!==projectKey)return false}
      const date=String(item.date||item.dt||'').slice(0,10);
      return (!date||!from||date>=from)&&(!date||!to||date<=to);
    };
    const scan=(rows,documentKind)=>{for(const source of rows||[]){if(!inScope(source))continue;if(source.vatRate==null||String(source.vatRate).trim()==='')issues.push({code:'vat-rate-missing',documentKind,source})}};
    scan((data.deals||[]).map(item=>({...item,kind:'contract'})),'contract');
    scan(data.realizations,'realization');scan(data.expenses,'project-expense');scan(data.costs,'general-entry');
    return {count:issues.length,issues};
  }
  // Explicit management policy: stable organization key, dated immutable versions.
  // Default amounts retain the existing application convention; no legal policy is inferred.
  function validateUsnVatPolicies(rows=[]){
    if(!Array.isArray(rows))throw Error('Некорректный список настроек порога УСН');
    const ids=new Set(),dates=new Set();
    for(const p of rows){
      if(!p||!String(p._id||'').trim()||ids.has(p._id)||p.orgId!=='air-climat'||p.org!=='АИР-КЛИМАТ')throw Error('Проверьте идентификатор и организацию настройки УСН');
      const d=String(p.effectiveDate||''),stamp=String(p.createdAt||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<'1900-01-01'||d>'9998-12-31'||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d||dates.has(d))throw Error('Укажите корректную и неповторяющуюся дату действия настройки УСН');
      if(!/^\d+(?:[.,]\d{1,2})?$/.test(String(p.threshold??''))||cents(p.threshold)<=0n)throw Error('Порог УСН должен быть положительной суммой с точностью до копейки');
      if(!String(p.reason||'').trim()||!String(p.createdBy||'').trim()||!/^\d{4}-\d{2}-\d{2}T/.test(stamp)||!Number.isFinite(Date.parse(stamp)))throw Error('Укажите основание, автора и время настройки УСН');
      ids.add(p._id);dates.add(d);
    }
    return [...rows].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
  }
  function usnVatThreshold(data={},reference='',incomeEvents=[]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(reference)||!Number.isFinite(Date.parse(reference+'T00:00:00Z'))||new Date(reference+'T00:00:00Z').toISOString().slice(0,10)!==reference)throw Error('Проверьте дату расчёта порога УСН');
    const policies=validateUsnVatPolicies(data.usnVatPolicies),year=Number(reference.slice(0,4)),start=year+'-01-01';
    // Active VAT year: the preceding-income year is a different comparison.
    // FNS /new2026/ (04.07.2026 amendments):20m through2029,15m in2030,10m from2031.
    const defaultLimit=year===2025?60000000:year>=2026&&year<=2029?20000000:year===2030?15000000:year>=2031?10000000:undefined,policyAt=d=>policies.filter(p=>p.effectiveDate<=d).at(-1)||null;
    const limitAt=d=>policyAt(d)?cents(policyAt(d).threshold):defaultLimit===undefined?null:cents(defaultLimit);
    const previousIncome=incomeEvents.filter(e=>String(e.date).startsWith(String(year-1)+'-')).reduce((n,e)=>n+e.amount,0n),daily=new Map();
    for(const e of incomeEvents)if(e.date>=start&&e.date<=reference)daily.set(e.date,(daily.get(e.date)||0n)+e.amount);
    for(const p of policies)if(p.effectiveDate>=start&&p.effectiveDate<=reference&&!daily.has(p.effectiveDate))daily.set(p.effectiveDate,0n);
    let observedIncome=0n,exceededOn=null,effectiveFrom=limitAt(start)!==null&&previousIncome>limitAt(start)?start:null;
    for(const [d,n] of [...daily].sort(([a],[b])=>a.localeCompare(b))){observedIncome+=n;const limit=limitAt(d);if(limit!==null&&!exceededOn&&observedIncome>limit){exceededOn=d;if(!effectiveFrom){const dt=new Date(d+'T00:00:00Z');dt.setUTCDate(1);dt.setUTCMonth(dt.getUTCMonth()+1);effectiveFrom=dt.toISOString().slice(0,10)}}}
    return {orgId:'air-climat',limit:limitAt(reference),policy:policyAt(reference),januaryPolicy:policyAt(start),observedIncome,previousIncome,exceededOn,effectiveFrom,asOf:reference,coverageConfirmed:false};
  }
  // Tax recognition is independent of P&L and bank categories. Missing evidence is
  // a review item, never permission to invent a deduction or infer a VAT rate.
  function quarterTaxSnapshot(data={},reference=''){
    const bounds=ownerPeriodBounds('quarter',reference),year=Number(bounds.from.slice(0,4)),yearBounds={from:year+'-01-01',to:bounds.to};
    const AIR='АИР-КЛИМАТ',ARBAT='АРБАТ.ГК',issues=[],rows=[];
    const yes=x=>x===true||x==='true',no=x=>x===false||x==='false',text=x=>String(x??'').trim();
    const date=x=>String(x||'').slice(0,10),valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
    const between=(d,b)=>valid(d)&&d>=b.from&&d<=b.to,positive=x=>x>0n?x:0n,pct=(x,n)=>(positive(x)*BigInt(n)+50n)/100n;
    const messages={
      'invalid-tax-date':'Проверьте дату операции', 'invalid-tax-amount':'Проверьте сумму операции',
      'tax-organization-unassigned':'Организация налогового источника не указана. Распределите документ перед подтверждением расчёта',
      'tax-exclusion-without-reason':'Исключение из налоговой базы не имеет основания',
      'usn-income-vat-unconfirmed':'Подтвердите сумму НДС в поступлении и документ-основание; без них доход УСН требует сверки',
      'usn-income-unconfirmed':'Уточните налоговую классификацию поступления: продажа, аванс, заём или другое основание',
      'usn-expense-unconfirmed':'Расход УСН не подтверждён: нужны сумма, дата признания и основание; одной оплаты недостаточно',
      'vat-metadata-invalid':'Не указана ставка НДС либо суммы НДС и документа не совпадают',
      'vat-output-rate-review':'Ставка исходящего НДС не соответствует основному режиму ОСНО: проверьте документ и основание ставки',
      'vat-deduction-unconfirmed':'Для вычета НДС нужны подтверждение права, документ и дата выполнения условий вычета',
      'vat-cash-review':'Проверьте авансы, их зачёт и возвраты: полный регистр НДС по оплатам ещё не сформирован',
      'profit-expense-unconfirmed':'Подтвердите сумму и дату налогового расхода, включая прямые расходы и НЗП',
      'warehouse-tax-basis':'Сверьте входящий НДС и стоимость складской партии; складская себестоимость не заменяет налоговый регистр',
      'unsupported-tax-year':'Правила этого года требуют отдельной проверки',
      'documentation-pending':'Документы по сделке не оформлены. Сверьте налоговую классификацию; операция сохранена в управленческом учёте',
      'intercompany-tax-review':'Межорганизационная передача материалов требует проверки основания и налогового отражения обеих сторон; складское движение не заменяет реализацию',
      'usn-vat-policy-invalid':'Настройка порога УСН некорректна. Расчёт порога требует сверки',
      'air-vat-required':'По внесённым доходам возникает обязанность по НДС; подтвердите дату и выбранную ставку',
      'air-vat-document':'У АИР-КЛИМАТ есть документ с НДС: требуется сверка режима и отдельного расчёта НДС'
    };
    function issue(code,scope,collection,source){
      if(!issues.some(x=>x.code===code&&x.scope===scope&&x.source===source))issues.push({code,scope,collection,kind:collection,source,message:messages[code]});
    }
    function readDate(source,collection,scope,field='date'){
      const d=date(source[field]||field==='date'&&source.dt);
      if(!valid(d)){issue('invalid-tax-date',scope,collection,source);return null}return d;
    }
    function amount(value,source,collection,scope){try{if(value==null||text(value)==='')throw Error('Missing amount');return cents(value)}catch{issue('invalid-tax-amount',scope,collection,source);return null}}
    function excluded(source,field,scope,collection){
      if(!no(source[field]))return false;
      if(text(source.taxExclusionReason))return true;
      issue('tax-exclusion-without-reason',scope,collection,source);return false;
    }
    function entry(scope,collection,source,d,value,label){rows.push({scope,collection,source,id:source._id||source.id,date:d,amount:value,label})}
    // An unattributed source cannot be assigned a zero contribution to either
    // organization. Keep its value outside known totals and expose the gap.
    // Explicit foreign organizations remain legitimately outside this model.
    for(const [collection,items,scopes] of [
      ['cash',(data.cash||[]).filter(x=>x.type!=='transfer'),['usn','vat']],
      ['realizations',data.realizations||[],['usn','vat','profit']],
      ['expenses',data.expenses||[],['usn','vat','profit']],
      ['costs',data.costs||[],['usn','vat','profit']],
      ['labor',data.labor||[],['usn','profit']],
      ['workActs',(data.workActs||[]).filter(x=>x.status==='approved'),['profit']],
      ['warehouse',(data.warehouse?.moves||[]).filter(x=>x.kind==='receipt'),['vat','profit']],
      ['vatAdvanceEvents',data.vatAdvanceEvents||[],['usn','vat']]
    ])for(const source of items){
      if(text(source.org))continue;
      const d=date(source.date||source.dt),recognitions=[date(source.usnRecognitionDate),date(source.profitTaxRecognitionDate),...(Array.isArray(source.usnRecognitionEvents)?source.usnRecognitionEvents:[]).map(e=>date(e?.date)),...(Array.isArray(source.profitTaxRecognitionEvents)?source.profitTaxRecognitionEvents:[]).map(e=>date(e?.date))];
      if(!valid(d)||between(d,yearBounds)||recognitions.some(x=>between(x,yearBounds))||collection==='cash'&&source.type==='in'&&d>=(year-1)+'-01-01'&&d<yearBounds.from)for(const scope of scopes)issue('tax-organization-unassigned',scope,collection,source);
    }
    // Event-level tax recognition supports several independently documented portions
    // of one payment, without counting a legacy single recognition twice.
    function recognitionEvents(source,collection,scope,field,legacyDate,legacyAmount,legacyDocument,cap,earliest){
      const events=source[field];
      if(events===undefined||events===null)return null;
      if(!Array.isArray(events)||events.length===0){issue(scope==='usn'?'usn-expense-unconfirmed':'profit-expense-unconfirmed',scope,collection,source);return false}
      let total=0n;const found=new Set(),accepted=[];
      for(const e of events){
        const d=date(e?.date),document=text(e?.document),id=text(e?.id);
        let n;try{n=cents(e?.amount)}catch{n=null}
        if(!valid(d)||d<earliest||!document||!id||found.has(id)||n===null||n<=0n){
          issue(scope==='usn'?'usn-expense-unconfirmed':'profit-expense-unconfirmed',scope,collection,source);return false
        }
        found.add(id);total+=n;accepted.push({date:d,amount:n,document,id});
      }
      if(total>cap||total<0n){issue(scope==='usn'?'usn-expense-unconfirmed':'profit-expense-unconfirmed',scope,collection,source);return false}
      return accepted;
    }

    function vat(source,collection,scope,gross=source.amountGross??source.amount){
      try{
        if(gross==null||text(gross)==='')throw Error('Missing amount');
        const v=documentVat(gross,source.vatRate,yes(source.vatDeductible));
        if(source.vatAmount!=null&&cents(source.vatAmount)!==v.vatAmount||source.amountNet!=null&&cents(source.amountNet)!==v.amountNet)throw Error('VAT mismatch');
        return v;
      }catch{issue('vat-metadata-invalid',scope,collection,source);return null}
    }
    const registerModel=typeof module==='object'&&module.exports?require('./tax-register-model.js'):globalThis.ArbatTaxRegisters;
    const advanceRegister=registerModel?.advances(data,{from:bounds.from,to:bounds.to}),obligationRegister=registerModel?.obligations(data,{to:bounds.to});
    const annualAdvances=registerModel?.advances(data,{from:(year-1)+'-01-01',to:yearBounds.to,org:AIR});
    const airAdvanceVat=new Map(),airRefundGross=new Map();
    let usnIncome=0n,usnExpenses=0n,airOutputVat=0n,airInputVat=0n;
    for(const r of annualAdvances?.rows||[]){if(r.kind==='received')airAdvanceVat.set(r.id,(airAdvanceVat.get(r.id)||0n)+r.vat);if(r.kind==='refund'){airRefundGross.set(r.id,(airRefundGross.get(r.id)||0n)+r.amount);if(between(r.date,yearBounds)){usnIncome-=r.amount-r.vat;entry('usn','cash',r.source,r.date,-(r.amount-r.vat),'Возврат дохода УСН без НДС')}}}

    const incomeEvents=(annualAdvances?.rows||[]).filter(r=>r.kind==='refund').map(r=>({date:r.date,amount:-(r.amount-r.vat)}));
    for(const source of data.cash||[]){
      if(source.org!==AIR||source.type==='transfer')continue;
      const d=readDate(source,'cash','usn');if(!d)continue;
      if(source.type==='in'){
        if(d<`${year-1}-01-01`||d>bounds.to)continue;
        let n=amount(source.amount,source,'cash','usn');if(n===null)continue;
        const knownAdvanceVat=airAdvanceVat.get(String(source._id||source.id))||0n;
        let receivedVat=knownAdvanceVat;
        if(text(source.usnVatAmount)||text(source.usnVatDocument)){
          const explicit=amount(source.usnVatAmount,source,'cash','usn');
          if(explicit===null||explicit<knownAdvanceVat||explicit>n||!text(source.usnVatDocument))issue('usn-income-vat-unconfirmed','usn','cash',source);
          else receivedVat=explicit;
        }
        n-=receivedVat;
        if(n<0n){issue('invalid-tax-amount','usn','cash',source);continue}
        if(excluded(source,'usnTaxable','usn','cash'))continue;
        if(!yes(source.usnTaxable)&&between(d,yearBounds))issue('usn-income-unconfirmed','usn','cash',source);
        incomeEvents.push({date:d,amount:n});
        if(between(d,yearBounds)){usnIncome+=n;entry('usn','cash',source,d,n,'Доход УСН')}
      }else if(source.type==='out'){
        const recognized=date(source.usnRecognitionDate);
        if(d>bounds.to||source.usnRecognitionEvents==null&&recognized&&valid(recognized)&&recognized>bounds.to)continue;
        if(d<yearBounds.from&&!between(recognized,yearBounds)&&!Array.isArray(source.usnRecognitionEvents))continue;
        if(excluded(source,'usnDeductible','usn','cash'))continue;
        const grossPayment=amount(source.amount,source,'cash','usn'),n=grossPayment===null?null:grossPayment-(airRefundGross.get(String(source._id||source.id))||0n);if(n===0n)continue;if(n===null||n<0n){issue('usn-expense-unconfirmed','usn','cash',source);continue}
        const events=recognitionEvents(source,'cash','usn','usnRecognitionEvents',recognized,source.usnRecognizedAmount,source.usnDocument,n,d);
        if(events===false)continue;
        if(events){if(!yes(source.usnDeductible)){issue('usn-expense-unconfirmed','usn','cash',source);continue}
          for(const e of events)if(between(e.date,yearBounds)){usnExpenses+=e.amount;entry('usn','cash',source,e.date,-e.amount,'Признанный расход УСН · '+e.document)}
          continue;
        }
        const accepted=amount(source.usnRecognizedAmount??source.amount,source,'cash','usn');
        if(!yes(source.usnDeductible)||!valid(recognized)||recognized<d||!text(source.usnDocument)||accepted===null||accepted<0n||accepted>n){issue('usn-expense-unconfirmed','usn','cash',source);continue}
        if(between(recognized,yearBounds)){usnExpenses+=accepted;entry('usn','cash',source,recognized,-accepted,'Признанный расход УСН')}
      }
    }
    const usnBase=positive(usnIncome-usnExpenses),regularTax=pct(usnBase,15),minimumTax=pct(usnIncome,1),minimumApplicable=bounds.to===year+'-12-31';
    const usnAccrued=minimumApplicable&&minimumTax>regularTax?minimumTax:regularTax;
    const incomeCosts=(data.costs||[]).filter(item=>{
      if(item.managementTax===true)return false;
      const article=(data.pnlArticles||[]).find(a=>a.id===item.pnlArticleId)||(data.pnlArticles||[]).find(a=>a.name===item.name);
      return String(item.pnlType||article?.type||'expense').toLowerCase()==='income';
    }),expenseCosts=(data.costs||[]).filter(x=>x.managementTax!==true&&!incomeCosts.includes(x));
    let outputVat=0n,inputVat=0n,profitRevenue=0n,profitExpenses=0n;
    for(const [collection,items] of [['realizations',data.realizations||[]],['costs',incomeCosts]])for(const source of items){
      if(source.org!==ARBAT)continue;const d=readDate(source,collection,'profit');if(!d){issue('invalid-tax-date','vat',collection,source);continue}
      if(!between(d,yearBounds))continue;
      const v=vat(source,collection,'profit');
      if(v&&year>=2026&&![0,10,22].includes(v.vatRate)){issue('vat-output-rate-review','profit',collection,source);if(between(d,bounds))issue('vat-output-rate-review','vat',collection,source)}
      if(between(d,bounds)){if(v){outputVat+=v.vatAmount;entry('vat',collection,source,d,v.vatAmount,'Исходящий НДС')}else issue('vat-metadata-invalid','vat',collection,source)}
      if(v&&!excluded(source,'profitTaxable','profit',collection)){profitRevenue+=v.amountNet;entry('profit',collection,source,d,v.amountNet,'Налоговый доход без НДС')}
    }
    function inputDocument(source,collection,gross){
      const d=readDate(source,collection,'vat');if(!d||d>bounds.to)return;
      const deduction=date(source.vatDeductionDate),inDocumentQuarter=between(d,bounds),inDeductionQuarter=between(deduction,bounds);
      if(!inDocumentQuarter&&!inDeductionQuarter)return;
      const v=vat(source,collection,'vat',gross);if(!v)return;
      if(v.vatAmount===0n||no(source.vatDeductible))return;
      if(!yes(source.vatDeductible)||!valid(deduction)||deduction<d||!text(source.vatInvoice)){issue('vat-deduction-unconfirmed','vat',collection,source);return}
      if(inDeductionQuarter){inputVat+=v.vatAmount;entry('vat',collection,source,deduction,-v.vatAmount,'Входящий НДС по подтверждённым данным')}
    }
    function profitExpense(source,collection){
      const d=readDate(source,collection,'profit');if(!d||d>bounds.to)return;
      const recognized=date(source.profitTaxRecognitionDate);
      if(source.profitTaxRecognitionEvents==null&&recognized&&valid(recognized)&&recognized>bounds.to)return;
      if(d<yearBounds.from&&!between(recognized,yearBounds)&&!Array.isArray(source.profitTaxRecognitionEvents))return;
      if(excluded(source,'profitTaxDeductible','profit',collection))return;
      if(!yes(source.profitTaxDeductible)){issue('profit-expense-unconfirmed','profit',collection,source);return}
      if(source.profitTaxRecognitionEvents==null&&(!valid(recognized)||recognized<d||!text(source.profitTaxDocument))){issue('profit-expense-unconfirmed','profit',collection,source);return}
      let max;
      if(collection==='labor'){
        const wages=amount(source.amount,source,collection,'profit'),contributions=amount(source.employerContributions||0,source,collection,'profit');if(wages===null||contributions===null)return;max=wages+contributions;
      }else{const v=vat(source,collection,'profit');if(!v)return;if(v.vatAmount!==0n&&!yes(source.vatDeductible)&&!no(source.vatDeductible)){issue('profit-expense-unconfirmed','profit',collection,source);return}max=yes(source.vatDeductible)?v.amountNet:v.amountGross}
      const n=source.profitTaxRecognizedAmount==null||text(source.profitTaxRecognizedAmount)===''?max:amount(source.profitTaxRecognizedAmount,source,collection,'profit');
      const events=recognitionEvents(source,collection,'profit','profitTaxRecognitionEvents',recognized,source.profitTaxRecognizedAmount,source.profitTaxDocument,max,d);
      if(events===false)return;
      if(events){for(const e of events)if(between(e.date,yearBounds)){profitExpenses+=e.amount;entry('profit',collection,source,e.date,-e.amount,'Признанный налоговый расход · '+e.document)}return}
      if(n===null||max>=0n&&(n<0n||n>max)||max<0n&&(n>0n||n<max)){issue('profit-expense-unconfirmed','profit',collection,source);return}
      if(between(recognized,yearBounds)){profitExpenses+=n;entry('profit',collection,source,recognized,-n,'Признанный налоговый расход')}
    }
    for(const [collection,items] of [['expenses',data.expenses||[]],['costs',expenseCosts],['labor',data.labor||[]]])for(const source of items){
      if(source.org!==ARBAT)continue;
      if(collection!=='labor'&&!source.warehouseMoveId)inputDocument(source,collection,source.amountGross??source.amount);
      profitExpense(source,collection);
    }
    // Receipt prices in the current warehouse schema are supplier gross amounts.
    // Consumption is not a new purchase and must not repeat its VAT deduction.
    for(const source of data.warehouse?.moves||[]){
      if(source.org!==ARBAT||source.kind!=='receipt')continue;
      const d=date(source.date);if(valid(d)&&d>bounds.to)continue;
      let gross;try{gross=rubles(warehouseReceiptGross(source));}catch{issue('invalid-tax-amount','vat','warehouse',source);continue}
      inputDocument(source,'warehouse',gross);
      if(between(d,yearBounds))issue('warehouse-tax-basis','profit','warehouse',source);
    }
    if(advanceRegister){
      for(const r of advanceRegister.rows){if(r.org===ARBAT){if(r.kind==='received')outputVat+=r.vat;else inputVat+=r.vat}else if(r.org===AIR){if(r.kind==='received')airOutputVat+=r.vat;else airInputVat+=r.vat}entry(r.org===AIR?'airVat':'vat',r.collection,r.source,r.date,r.kind==='received'?r.vat:-r.vat,r.label+' · '+r.event.document)}
      for(const problem of advanceRegister.issues)if([AIR,ARBAT].includes(problem.event.org))issues.push({code:'vat-advance-review',scope:problem.event.org===AIR?'usn':'vat',collection:'organization',source:{org:problem.event.org,name:problem.event.document||'Событие НДС'},message:problem.message});
    }
    for(const source of data.cash||[])if(source.org===ARBAT&&source.type!=='transfer'){
      const d=date(source.date);if(!valid(d))issue('invalid-tax-date','vat','cash',source);
      else if(between(d,bounds)&&!advanceRegister?.coveredCash.includes(String(source._id||source.id)))issue('vat-cash-review','vat','cash',source);
    }
    // Work acts can overlap payroll; until reconciled in a tax register they
    // must be visible as a source, not silently omitted or deducted twice.
    for(const source of data.workActs||[])if(source.org===ARBAT&&source.status==='approved'){
      const d=readDate(source,'workActs','profit');if(d&&between(d,yearBounds))issue('profit-expense-unconfirmed','profit','workActs',source);
    }
    for(const [collection,items] of [['realizations',data.realizations||[]],['costs',incomeCosts]])for(const source of items)if(source.org===AIR&&between(date(source.date),yearBounds)&&Number(source.vatRate)>0)issue('air-vat-document','usn',collection,source);
    for(const [collection,items] of [['realizations',data.realizations||[]],['costs',incomeCosts]])for(const source of items)if(source.org===AIR&&between(date(source.date),bounds)&&Number(source.vatRate)>0){const v=vat(source,collection,'usn');if(v){airOutputVat+=v.vatAmount;entry('airVat',collection,source,date(source.date),v.vatAmount,'Исходящий НДС АИР-КЛИМАТ')}}
    const cutoff=valid(date(reference))?date(reference):bounds.to;
    let vatThreshold;try{vatThreshold=usnVatThreshold(data,cutoff,incomeEvents)}catch(error){issue('usn-vat-policy-invalid','usn','organization',{org:AIR,name:error.message});vatThreshold={limit:null,observedIncome:null,previousIncome:null,exceededOn:null,effectiveFrom:null,asOf:cutoff,coverageConfirmed:false,error:error.message}}
    const {effectiveFrom}=vatThreshold;
    const knownAirVatDates=[...(data.realizations||[]).filter(x=>x.org===AIR&&Number(x.vatRate)>0).map(x=>date(x.date)),...(annualAdvances?.rows||[]).filter(x=>x.kind==='received'&&x.vat>0n).map(x=>x.date),effectiveFrom].filter(valid).sort();
    for(const source of data.cash||[])if(source.org===AIR&&source.type==='in'&&between(date(source.date),yearBounds)&&!no(source.usnTaxable)&&knownAirVatDates.some(d=>d<=date(source.date))&&!annualAdvances?.coveredCash.includes(String(source._id||source.id))&&!text(source.usnVatAmount))issue('usn-income-vat-unconfirmed','usn','cash',source);
    if(effectiveFrom)issue('air-vat-required','usn','organization',{org:AIR,name:'Режим НДС с '+effectiveFrom});
    const documentation=typeof module==='object'&&module.exports?require('./management-review-model.js'):globalThis.ArbatManagementReview;
    for(const item of documentation?.reviewSources(data,yearBounds)||[]){const scopes=item.org===AIR?['usn']:item.org===ARBAT?['vat','profit']:['usn','vat','profit'];for(const scope of scopes)issue(item.reason==='documentation'?'documentation-pending':'intercompany-tax-review',scope,item.collection,item.source)}
    if(year<2026||year>2028)for(const scope of ['usn','profit','vat'])issue('unsupported-tax-year',scope,'organization',{});
    const profitBase=positive(profitRevenue-profitExpenses),profitTax=pct(profitBase,25),difference=outputVat-inputVat;
    return {bounds,yearBounds,rows,issues,advanceRegister,obligationRegister,
      air:{outputVat:airOutputVat,inputVat:airInputVat,vatBalance:airOutputVat-airInputVat,income:usnIncome,expenses:usnExpenses,base:usnBase,accrued:usnAccrued,regularTax,minimumTax,minimumApplicable,unclassified:issues.filter(x=>x.scope==='usn'&&x.code==='usn-expense-unconfirmed').length,ready:!issues.some(x=>x.scope==='usn'),vatThreshold},
      arbat:{outputVat,inputVat,payable:positive(difference),recoverable:positive(-difference),unconfirmed:issues.filter(x=>x.scope==='vat').length,profitRevenue,profitExpenses,profitBase,profitTax,profitTaxRate:25,vatReady:!issues.some(x=>x.scope==='vat'),profitReady:!issues.some(x=>x.scope==='profit')},
      limitations:['Расчёт по внесённым данным. Полнота года и начальные налоговые остатки не подтверждены.','Не учтены зачёт налоговых авансов, ЕНС, перенос убытков и специальные налоговые корректировки.','НДС с авансов, восстановление и корректировки требуют отдельного регистра.']};
  }
  function netAmount(gross,org,vatRate){const rate=vatRate==null?(org==='АРБАТ.ГК'?22:0):Number(vatRate);if(!Number.isInteger(rate)||rate<0||rate>100)throw new RangeError('Invalid VAT rate');const d=BigInt(100+rate),v=cents(gross||0),sign=v<0n?-1n:1n,abs=v<0n?-v:v;return sign*((abs*100n+d/2n)/d)}
  function wipCheckPending(data,deal,key,period=''){const until=x=>!period||String(x.date||x.dt||'').slice(0,period.length===10?10:7)<=period;return (data.expenses||[]).some(x=>x.projectKey===key&&until(x)&&x.valuationStatus==='requires-review')||(data.warehouse?.moves||[]).some(x=>x.dealId===deal._id&&until(x)&&x.kind==='consume'&&(x.projectIssueId||x.dealId)&&!data.fifo);}
  function projectWipSnapshot(data,deal,projectKey,period=''){
    const contractGross=deal.contractTotal??deal.revenue;
    const issues=[];
    if(contractGross==null||cents(contractGross)<=0n)return {status:'requires-review',issues:['missing-project-contract'],contractNet:null};
    let contractNet;try{contractNet=documentPnlAmount({...deal,amountGross:contractGross})}catch(error){if(!(error instanceof RangeError))throw error;return {status:'requires-review',issues:['invalid-project-contract-vat'],contractNet:null}}
    if(contractNet<=0n)return {status:'requires-review',issues:['invalid-project-contract'],contractNet};
    const until=(item,p)=>!p||String(item.date||item.dt||'').slice(0,p.length===10?10:7)<=p;
    const before=(item,p)=>String(item.date||item.dt||'').slice(0,p.length===10?10:7)<p;
    const realizations=managementRealizations(data).filter(x=>x.projectKey===projectKey);
    const ledger=expenseLedgerAt(data,period),priorLedger=period?expenseLedgerAt(data,period,false):null;
    const projectRows=ledger.rows.filter(x=>x.projectKey===projectKey&&x.category==='direct');
    const totalOf=(xs)=>xs.reduce((a,x)=>a+x.amount,0n);
    const earned=(p,previous)=>realizations.filter(x=>previous?before(x,p):until(x,p)).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const recognized=(revenue,cost)=>{
      const numerator=revenue<0n?0n:revenue>contractNet?contractNet:revenue;
      const sign=cost<0n?-1n:1n,absolute=cost<0n?-cost:cost;
      return sign*((absolute*numerator+contractNet/2n)/contractNet);
    };
    const revenue=earned(period,false),priorRevenue=period?earned(period,true):0n;
    const accruedCost=totalOf(projectRows),priorCost=priorLedger?totalOf(priorLedger.rows.filter(x=>x.projectKey===projectKey&&x.category==='direct')):0n;
    if(revenue>contractNet)issues.push('realization-exceeds-contract');
    if(revenue>=contractNet&&wipCheckPending(data,deal,projectKey,period))issues.push('project-closeout-unverified');
    if(revenue<0n)issues.push('negative-cumulative-realization');
    const saleCost=totalOf(projectRows.filter(x=>x.stockPurpose==='sale'));
    const priorSaleCost=priorLedger?totalOf(priorLedger.rows.filter(x=>x.projectKey===projectKey&&x.category==='direct'&&x.stockPurpose==='sale')):0n;
    // Goods sold are fully expensed against their own dated realization. The
    // proportional contract method continues to apply only to ordinary WIP.
    const recognizedCost=saleCost+recognized(revenue,accruedCost-saleCost);
    const previouslyRecognizedCost=period?priorSaleCost+recognized(priorRevenue,priorCost-priorSaleCost):0n;
    if(saleCost!==0n&&accruedCost-saleCost!==0n&&revenue<contractNet)issues.push('mixed-sale-service-wip-basis-unassigned');
    const currentCost=recognizedCost-previouslyRecognizedCost;
    const wip=accruedCost-recognizedCost;
    const nonDirectRows=ledger.rows.filter(x=>x.projectKey===projectKey&&x.category!=='direct'&&until(x,period));
    const nonDirectCost=totalOf(nonDirectRows.filter(x=>x.category!=='belowIncome'));
    const otherIncome=totalOf(nonDirectRows.filter(x=>x.category==='belowIncome'));
    const directContribution=revenue-recognizedCost;
    for(const issue of ledger.issues)if(until(issue.source||{},period)&&(issue.source?.projectKey===projectKey||(issue.source?.shares||[]).some(share=>share.projectKey===projectKey)))issues.push(issue.code);
    const expenses=(data.expenses||[]).filter(x=>x.projectKey===projectKey&&until(x,period));
    if(expenses.some(x=>x.valuationStatus==='requires-review'))issues.push('expense-valuation');
    const warehouseMoves=data.warehouse?.moves||[];
    const consumed=warehouseMoves.filter(x=>x.dealId===deal._id&&x.kind==='consume'&&(x.projectIssueId||x.dealId)&&until(x,period));
    if(consumed.length&&!data.fifo)issues.push('warehouse-fifo-unavailable');
    if(data.fifo&&warehouseCostAudit(expenses,consumed,data.fifo,data.warehouse).length)issues.push('warehouse-fifo-mismatch');
    if(data.warehouse&&expenses.some(e=>e.warehouseMoveId&&!warehouseMoves.some(m=>String(m.id)===String(e.warehouseMoveId))))issues.push('warehouse-missing-movement');
    if(expenses.some(e=>e.warehouseMoveId&&warehouseMoves.some(m=>String(m.id)===String(e.warehouseMoveId)&&m.dealId&&m.dealId!==deal._id)))issues.push('warehouse-cross-project-reference');
    if(expenses.some(e=>e.warehouseMoveId&&(data.expenses||[]).some(other=>other!==e&&until(other,period)&&other.warehouseMoveId&&String(other.warehouseMoveId)===String(e.warehouseMoveId))))issues.push('warehouse-duplicate-global-expense');
    const labor=projectPayroll((data.labor||[]).filter(x=>until(x,period)),projectKey,(data.workActs||[]).filter(x=>x.projectKey===projectKey&&until(x,period)));
    if(labor.possibleOverlaps.length)issues.push('possible-work-overlap');
    if(labor.unresolved.some(x=>x.org===deal.org&&x.deal===deal.name))issues.push('legacy-unattributed-payroll');
    return {status:issues.length?'requires-review':'calculated',issues:[...new Set(issues)],contractNet,revenue,accruedCost,recognizedCost,previouslyRecognizedCost,currentCost,wip,fullyRealized:revenue===contractNet,closedCostReconciled:revenue===contractNet&&wip===0n&&recognizedCost===accruedCost,directContribution,nonDirectCost,otherIncome,operatingProfit:directContribution-nonDirectCost+otherIncome};
  }
  function projectSnapshot(data,deal,projectKey){
    const realization=managementRealizations(data).filter(x=>x.projectKey===projectKey);
    const netOf=x=>documentPnlAmount(x);
    const revenue=realization.reduce((a,x)=>a+netOf(x),0n);
    const expenses=(data.expenses||[]).filter(x=>x.projectKey===projectKey);
    const acts=(data.workActs||[]).filter(x=>x.projectKey===projectKey);
    const labor=projectPayroll(data.labor||[],projectKey,acts);
    const ledger=expenseLedger(data),projectRows=ledger.rows.filter(x=>x.projectKey===projectKey);
    const cost=projectRows.filter(x=>x.category!=='belowIncome').reduce((a,x)=>a+x.amount,0n);
    const otherIncome=projectRows.filter(x=>x.category==='belowIncome').reduce((a,x)=>a+x.amount,0n);
    const issues=ledger.issues.filter(x=>(x.source?.projectKey===projectKey||(x.source?.shares||[]).some(p=>p.projectKey===projectKey))).map(x=>x.code);
    if(projectRows.some(x=>x.stockPurpose==='sale')&&projectRows.some(x=>x.category==='direct'&&x.stockPurpose!=='sale')&&projectWipSnapshot(data,deal,projectKey).issues.includes('mixed-sale-service-wip-basis-unassigned'))issues.push('mixed-sale-service-wip-basis-unassigned');
    if(expenses.some(x=>x.valuationStatus==='requires-review'))issues.push('expense-valuation');
    if(labor.conflicts.length)issues.push('linked-work-overlap');
    if(labor.possibleOverlaps.length)issues.push('possible-work-overlap');
    if(labor.unresolved.some(x=>x.org===deal.org&&x.deal===deal.name))issues.push('legacy-unattributed-payroll');
    if(data.warehouse){const moves=data.warehouse.moves||[],consumed=moves.filter(m=>m.dealId===deal._id&&m.kind==='consume'&&(m.projectIssueId||m.dealId));const known=new Set(moves.map(m=>String(m.id)));if(expenses.some(e=>e.warehouseMoveId&&!known.has(String(e.warehouseMoveId))))issues.push('warehouse-missing-movement');if(expenses.some(e=>e.warehouseMoveId&&moves.some(m=>String(m.id)===String(e.warehouseMoveId)&&m.dealId&&m.dealId!==deal._id)))issues.push('warehouse-cross-project-reference');if(expenses.some(e=>e.warehouseMoveId&&(data.expenses||[]).some(other=>other!==e&&other.warehouseMoveId&&String(other.warehouseMoveId)===String(e.warehouseMoveId))))issues.push('warehouse-duplicate-global-expense');if(consumed.length&&!data.fifo)issues.push('warehouse-fifo-unavailable');else if(data.fifo&&warehouseCostAudit(expenses,consumed,data.fifo,data.warehouse).length)issues.push('warehouse-fifo-mismatch')}
    return {revenue,cost,otherIncome,result:revenue+otherIncome-cost,issues:[...new Set(issues)],payroll:labor};
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
    const ledgerRows=expenseLedgerAt(data,period).rows;
    for(const deal of data.deals||[]){
      if(org&&deal.org!==org)continue;
      const projectKey=dealKey(deal);
      const dateRelevant=(data.realizations||[]).some(x=>x.projectKey===projectKey&&String(x.date||'').slice(0,7)<=period)
        ||ledgerRows.some(x=>x.projectKey===projectKey&&String(x.date||'').slice(0,7)<=period);
      if(!dateRelevant)continue;
      const wip=projectWipSnapshot(data,deal,projectKey,period);
      if(wip.status!=='calculated'){
        issues.push({code:'wip-unverified-project',projectKey,details:wip.issues});
        continue;
      }
      const currentAccrued=wip.accruedCost-(projectWipSnapshot(data,deal,projectKey,
        String(Number(period.slice(0,4))-(period.endsWith('-01')?1:0))+'-'+(period.endsWith('-01')?'12':String(Number(period.slice(5))-1).padStart(2,'0'))
      ).accruedCost||0n);
      const adjustment=currentAccrued-wip.currentCost;
      projects.push({projectKey,dir:deal.dir||'',org:deal.org||'',recognizedCost:wip.currentCost,accruedCost:currentAccrued,deferredChange:adjustment,wip:wip.wip});
      deferredChange+=adjustment;recognizedCost+=wip.currentCost;accruedCost+=currentAccrued;
    }
    return {projects,issues,deferredChange,recognizedCost,accruedCost};
  }
  function wipDateRangeBridge(data,from,to,org=''){
    const projects=[],issues=[];let deferredChange=0n,recognizedCost=0n,accruedCost=0n;
    const priorDate=from?new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10):'';
    const ledgerRows=expenseLedgerAt(data,to).rows;
    for(const deal of data.deals||[]){
      if(org&&deal.org!==org)continue;
      const projectKey=dealKey(deal);
      const relevant=[...(data.realizations||[]),...ledgerRows].some(x=>x.projectKey===projectKey&&(!to||String(x.date||x.dt||'').slice(0,10)<=to));
      if(!relevant)continue;
      const end=projectWipSnapshot(data,deal,projectKey,to);
      const start=priorDate?projectWipSnapshot(data,deal,projectKey,priorDate):null;
      if(end.status!=='calculated'||start&&start.status!=='calculated'){
        issues.push({code:'wip-unverified-project',projectKey,details:[...new Set([...(end.issues||[]),...(start?.issues||[])])]});continue;
      }
      const currentAccrued=end.accruedCost-(start?.accruedCost||0n),currentRecognized=end.recognizedCost-(start?.recognizedCost||0n);
      const adjustment=currentAccrued-currentRecognized;
      projects.push({projectKey,dir:deal.dir||'',org:deal.org||'',recognizedCost:currentRecognized,accruedCost:currentAccrued,deferredChange:adjustment,wip:end.wip});
      deferredChange+=adjustment;recognizedCost+=currentRecognized;accruedCost+=currentAccrued;
    }
    return {projects,issues,deferredChange,recognizedCost,accruedCost};
  }
  function preliminaryPeriod(data,period,org=''){
    const ok=x=>(!org||x.org===org)&&(!period||String(x.date||x.dt||'').slice(0,7)===period);
    const ledger=monthlyExpenseLedger(data,period),rows=ledger.rows.filter(ok);
    const total=predicate=>rows.filter(predicate).reduce((a,x)=>a+x.amount,0n);
    const revenue=managementRealizations(data).filter(ok).reduce((a,x)=>a+documentPnlAmount(x),0n);
    const bridge=data.wipAccounting&&period?wipPeriodBridge(data,period,org):null;
    const reportIssues=[...ledger.issues.filter(x=>ok(x.source)||rows.some(row=>row.calculated&&row.source===x.source)),...(bridge?.issues||[])];
    const result=pnl({revenue:[rubles(revenue)],direct:[...rows.filter(x=>x.category==='direct').map(x=>rubles(x.amount)),...(bridge?[rubles(-bridge.deferredChange)]:[])],administrative:rows.filter(x=>x.category==='administrative').map(x=>rubles(x.amount)),commercial:rows.filter(x=>x.category==='commercial').map(x=>rubles(x.amount)),production:rows.filter(x=>x.category==='production').map(x=>rubles(x.amount)),belowIncome:rows.filter(x=>x.category==='belowIncome').map(x=>rubles(x.amount)),belowExpenses:rows.filter(x=>x.category==='belowExpenses').map(x=>rubles(x.amount))});
    return {...result,status:reportIssues.length?'requires-review':'calculated',confirmedResult:reportIssues.length?null:result.result,incomeTax:total(x=>x.kind==='management-tax'),issues:reportIssues,wipBridge:bridge,components:{revenue,
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
    if(mode==='month')return {from:year+'-'+ref.slice(5,7)+'-01',to:new Date(Date.UTC(Number(year),month,0)).toISOString().slice(0,10),label:'Месяц '+ref.slice(0,7)};
    if(mode==='quarter'){const first=String(Math.floor((month-1)/3)*3+1).padStart(2,'0'),last=String(Math.floor((month-1)/3)*3+3).padStart(2,'0');return {from:year+'-'+first+'-01',to:new Date(Date.UTC(Number(year),Number(last),0)).toISOString().slice(0,10),label:'Квартал '+Math.ceil(month/3)+' / '+year}}
    if(mode==='year')return {from:year+'-01-01',to:year+'-12-31',label:'Год '+year};
    if(mode==='range'&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to)return {from,to,label:from+' — '+to};
    throw new RangeError('Invalid dashboard period');
  }
  function ownerPeriodSnapshot(data,bounds,org=''){
    const from=bounds.from||'',to=bounds.to||'';
    const inRange=x=>{const d=String(x.date||x.dt||'').slice(0,10);return (!from||d>=from)&&(!to||d<=to)};
    const ok=x=>(!org||x.org===org)&&inRange(x);
    const ledger=expenseLedgerRange(data,from,to);
    const rows=ledger.rows.filter(ok);
    const revenue=managementRealizations(data).filter(ok).reduce((v,x)=>v+documentPnlAmount(x),0n);
    const categories={direct:0n,production:0n,administrative:0n,commercial:0n,belowIncome:0n,belowExpenses:0n};
    for(const row of rows)if(Object.prototype.hasOwnProperty.call(categories,row.category))categories[row.category]+=row.amount;
    // The dashboard must recognize the same period WIP bridge as the P&L.
    // Sum monthly adjustments for custom ranges; never treat an all-time selection
    // as a single accounting month.
    const periodKeys=new Set([...rows.map(x=>String(x.date||'').slice(0,7)),...(data.realizations||[]).filter(ok).map(x=>String(x.date||'').slice(0,7))].filter(x=>/^[0-9]{4}-[0-9]{2}$/.test(x)));
    let deferredChange=0n;const wipIssues=[],wipBridges=[];
    if(data.wipAccounting){
      for(const period of [...periodKeys].sort()){
        const monthFrom=period+'-01',monthTo=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).toISOString().slice(0,10);
        const bridge=wipDateRangeBridge(data,from&&from>monthFrom?from:monthFrom,to&&to<monthTo?to:monthTo,org);
        deferredChange+=bridge.deferredChange;
        wipIssues.push(...bridge.issues.map(x=>({...x,period})));
        wipBridges.push({period,...bridge});
      }
    }
    const grossProfit=revenue-categories.direct+deferredChange;
    const ebitda=grossProfit-categories.production-categories.administrative-categories.commercial;
    const result=ebitda+categories.belowIncome-categories.belowExpenses;
    const byKind={};
    for(const row of rows)byKind[row.kind]=(byKind[row.kind]||0n)+row.amount;
    const cash=(data.cash||[]).filter(ok);
    const income=cash.filter(x=>x.type==='in').reduce((v,x)=>v+cents(x.amount||0),0n);
    const outgoing=cash.filter(x=>x.type==='out').reduce((v,x)=>v+cents(x.amount||0),0n);
    const reportIssues=[...ledger.issues.filter(x=>x.source&&(ok(x.source)||rows.some(row=>row.calculated&&row.source===x.source))),...wipIssues];
    return {bounds,revenue,grossProfit,ebitda,result,status:reportIssues.length?'requires-review':'calculated',confirmedResult:reportIssues.length?null:result,incomeTax:byKind['management-tax']||0n,deferredChange,wipBridges,categories,byKind,cash:{income,outgoing,net:income-outgoing,rows:cash},revenueDocuments:managementRealizations(data).filter(ok),issues:reportIssues,rows};
  }
  function ownerDebtSnapshot(data,org=''){
    const projects=new Map(),issues=[];
    for(const deal of data.deals||[]){
      if(org&&deal.org!==org)continue;
      const key=dealKey(deal);
      projects.set(key,{key,org:deal.org,revenue:0n,received:0n});
    }
    for(const doc of data.realizations||[]){
      const project=projects.get(String(doc.projectKey||''));
      if(!project){if(!org||doc.org===org)issues.push({code:'realization-unmatched-project',source:doc});continue}
      if(doc.org&&project.org&&doc.org!==project.org){issues.push({code:'realization-organization-mismatch',source:doc});continue}
      project.revenue+=cents(doc.amountGross??doc.amount??0);
    }
    let unallocated=0n;const receiptShares=new Map(),refundRows=[];
    for(const movement of data.cash||[]){
      if(movement.type!=='in'||org&&movement.org!==org)continue;
      let amount;
      try{amount=cents(movement.amount||0)}catch(_){issues.push({code:'invalid-receipt',source:movement});continue}
      // The native receipt editor writes `allocations`; it takes precedence
      // over legacy shares. Clearing it restores the direct project header.
      const allocations=Array.isArray(movement.allocations)?(movement.allocations.length?movement.allocations:null):Array.isArray(movement.projectAllocations)?movement.projectAllocations:null;
      if(amount<0n){issues.push({code:'negative-receipt',source:movement});continue}
      if(allocations){
        let assigned=0n,invalid=false;
        const pending=[];
        for(const a of allocations){
          const project=projects.get(String(a.projectKey||''));
          let portion;
          try{portion=cents(a.amount)}catch(_){invalid=true;continue}
          if(portion<=0n||!project||org&&project.org!==org||movement.org&&project.org&&movement.org!==project.org){invalid=true;continue}
          pending.push({project,portion});
          assigned+=portion;
        }
        if(invalid||assigned>amount){
          issues.push({code:assigned>amount?'overallocated-receipt':'invalid-receipt-allocation',source:movement});
          // Never credit a partially invalid or overallocated receipt to projects.
          unallocated+=amount;
          receiptShares.set(movement,{amount,shares:[{project:null,portion:amount}]});
          continue;
        }
        for(const {project,portion} of pending)project.received+=portion;
        unallocated+=amount-assigned;
        receiptShares.set(movement,{amount,shares:[...pending,{project:null,portion:amount-assigned}]});
      }else if(movement.projectKey&&projects.has(String(movement.projectKey))){
        const project=projects.get(String(movement.projectKey));
        if(movement.org&&project.org&&movement.org!==project.org){unallocated+=amount;receiptShares.set(movement,{amount,shares:[{project:null,portion:amount}]});issues.push({code:'receipt-organization-mismatch',source:movement});continue}
        project.received+=amount;
        receiptShares.set(movement,{amount,shares:[{project,portion:amount}]});
      }else{
        unallocated+=amount;
        receiptShares.set(movement,{amount,shares:[{project:null,portion:amount}]});
        issues.push({code:'unallocated-receipt',source:movement});
      }
    }
    // Only accepted advance-refund evidence identifies a customer return. Trace
    // it to the original receipt, never infer a return from an ordinary expense.
    if((data.vatAdvanceEvents||[]).some(e=>e.kind==='refund')){
      const registerModel=typeof module==='object'&&module.exports?require('./tax-register-model.js'):globalThis.ArbatTaxRegisters;
      if(registerModel){
        const register=registerModel.advances(data,{org}),balances=new Map(register.balances.map(b=>[b.id,b])),refunds=new Map();
        for(const row of register.rows)if(row.kind==='refund'){
          const receipt=balances.get(String(row.event.advanceId||''))?.cash;
          if(!receiptShares.has(receipt))continue;
          if(!refunds.has(receipt)){const original=receiptShares.get(receipt);refunds.set(receipt,{amount:original.amount,shares:original.shares.map(s=>({...s}))})}
          const state=refunds.get(receipt),{amount,shares}=state,refund=row.amount;if(amount<=0n)continue;
          const portions=shares.map(s=>refund*s.portion/amount);let remainder=refund-portions.reduce((s,n)=>s+n,0n);
          // Process accepted events chronologically against remaining receipt
          // shares. Each source gets positive traceable rows without reusing a
          // project's last kopeck after an earlier partial return exhausted it.
          for(let i=shares.length-1;i>=0&&remainder>0n;i--){const capacity=shares[i].portion-portions[i],extra=capacity<remainder?capacity:remainder;portions[i]+=extra;remainder-=extra}
          shares.forEach((s,i)=>{const portion=portions[i];if(portion<=0n)return;if(s.project)s.project.received-=portion;else unallocated-=portion;s.portion-=portion;refundRows.push({source:row.source,projectKey:s.project?.key||'',amount:portion,originalCashId:String(receipt._id||receipt.id||''),eventId:String(row.event._id||row.event.id||'')})});
          state.amount-=refund;
        }
        for(const problem of register.issues)if(problem.event.kind==='refund')issues.push({code:'advance-refund-review',source:problem.event,message:problem.message});
      }else issues.push({code:'advance-refund-review',message:'Регистр возвратов авансов недоступен'});
    }
    const rows=[...projects.values()].map(p=>({...p,receivable:p.revenue>p.received?p.revenue-p.received:0n,advance:p.received>p.revenue?p.received-p.revenue:0n}));
    const total=name=>rows.reduce((v,p)=>v+p[name],0n);
    // One employee can work for both companies. A payment by one company must
    // never discharge another company's liability in the consolidated view.
    const payrollState=payrollByOrganization({accruals:data.labor||[],payments:data.cash||[],settlements:data.crewSettlements||[],workActs:data.workActs||[]},org);
    return {rows,refundRows,receivable:total('receivable'),advances:total('advance'),unallocated,payrollPayable:payrollState.payableTotal,issues:[...issues,...payrollState.issues]};
  }
  function ownerWarehouseSnapshot(warehouse,fifo,org=''){
    const rows=[],issues=[...(fifo?.warnings||[])],places=new Map((warehouse?.places||[]).map(x=>[String(x.id),x]));
    if(!fifo?.bins)return {rows,totalValue:null,reservedQty:0,deficitQty:0,issues:[...issues,{reason:'FIFO valuation unavailable'}]};
    const reservations=new Map();
    for(const issue of warehouse.projectIssues||[]){
      if(issue.closed)continue;
      const place=String(issue.crewId||'');
      for(const line of issue.lines||[]){
        const key=place+'::'+String(line.itemId||'');
        // Full issued quantity is committed until the issue closes; fromCrew is only its origin.
        reservations.set(key,(reservations.get(key)||0)+Math.max(0,Number(line.issued??line.fromCrew??0)));
      }
    }
    let totalValue=0n,reservedQty=0,deficitQty=0,unpriced=false;
    for(const [key,lots] of fifo.bins){
      const divider=key.lastIndexOf('::');if(divider<0)continue;
      const placeId=key.slice(0,divider),itemId=key.slice(divider+2),place=places.get(placeId);
      if(org&&place?.org!==org)continue;
      const item=(warehouse.items||[]).find(x=>String(x.id)===itemId);
      const qty=lots.reduce((v,l)=>v+Math.max(0,Number(l.qty||0)),0);
      const reserved=reservations.get(key)||0;
      const deficit=Math.max(0,reserved-qty);
      const invalid=lots.some(l=>Number(l.qty)>0&&(!Number.isFinite(Number(l.cost))||Number(l.cost)<=0));
      let value=null;
      if(!invalid){value=lots.reduce((v,l)=>v+(l.valueCents!==undefined?BigInt(l.valueCents):cents((Number(l.qty||0)*Number(l.cost||0)).toFixed(2))),0n);totalValue+=value}
      else unpriced=true;
      if(qty||reserved){rows.push({placeId,itemId,name:item?.name||itemId,place:place?.name||placeId,qty,reserved,free:Math.max(0,qty-reserved),deficit,value,unpriced:invalid});reservedQty+=reserved;deficitQty+=deficit}
    }
    // An open issue may reserve stock at a location with no remaining FIFO lots.
    // Count it as a real shortage rather than silently dropping its reservation.
    for(const [key,reserved] of reservations){
      if(reserved<=0||fifo.bins.has(key))continue;
      const split=key.lastIndexOf('::'),placeId=key.slice(0,split),itemId=key.slice(split+2),place=places.get(placeId);
      if(org&&place?.org!==org)continue;
      const item=(warehouse.items||[]).find(x=>String(x.id)===itemId);
      rows.push({placeId,itemId,name:item?.name||itemId,place:place?.name||placeId,qty:0,reserved,free:0,deficit:reserved,value:0n,unpriced:false});
      reservedQty+=reserved;deficitQty+=reserved;
    }
    return {rows,totalValue:unpriced?null:totalValue,knownValue:totalValue,reservedQty,deficitQty,issues:unpriced?[...issues,{reason:'Unpriced positive stock'}]:issues};
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
  function validFinanceDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
  function walletOpeningValues(values,existing=null,entries=[]){
    const name=String(values.name||'').trim(),org=String(values.org||'');
    if(!name)throw Error('Укажите название кошелька');
    if(!['АИР-КЛИМАТ','АРБАТ.ГК','Общий'].includes(org))throw Error('Укажите организацию кошелька');
    if(!validFinanceDate(values.openingBalanceDate))throw Error('Укажите корректную дату начального остатка на конец дня');
    const amount=value=>{if(!String(value??'').trim())throw Error('Укажите остаток явно, в том числе нулевой');return rubles(cents(value))};
    const openingBalance=amount(values.openingBalance),statementRaw=String(values.bankStatementBalance??'').trim(),bankStatementDate=String(values.bankStatementDate||'');
    if(bankStatementDate&&!validFinanceDate(bankStatementDate))throw Error('Проверьте дату выписки');
    if(bankStatementDate&&!statementRaw)throw Error('Для сверки укажите остаток по выписке');
    if(statementRaw&&!bankStatementDate)throw Error('Для сверки укажите дату выписки');
    if(bankStatementDate&&bankStatementDate<values.openingBalanceDate)throw Error('Дата выписки не может быть раньше даты начального остатка');
    if(existing&&org!==existing.org){const related=(entries||[]).filter(item=>item.walletId===existing.id||item.toWalletId===existing.id);if(related.length){const initial=!existing.org&&existing.verified!==true,consistent=related.every(item=>item.walletId===existing.id?item.org===org:item.type==='transfer'&&(item.destinationOrg||item.toOrg)===org);if(!initial||!consistent)throw Error('Нельзя менять организацию кошелька со связанными операциями. Для первичной классификации проверьте организацию всех операций.');}}
    return {name,org,kind:values.kind,openingBalance,openingBalanceDate:values.openingBalanceDate,bankStatementDate,bankStatementBalance:statementRaw===''?'':amount(statementRaw),verified:true};
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
    const groups={'АИР-КЛИМАТ':0n,'АРБАТ.ГК':0n,'Общий':0n},rows=[],issues=[],controlIssues=[],seen=new Set();
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
      let reconciliation;
      try{reconciliation=bankReconciliation(wallet,entries)}catch(error){reconciliation={status:'invalid-statement',difference:null};controlIssues.push({code:'invalid-bank-statement',walletId:id,reason:error.message})}
      if(!wallet.openingBalanceDate)controlIssues.push({code:'opening-balance-date-missing',walletId:id});
      else if(!validFinanceDate(wallet.openingBalanceDate))controlIssues.push({code:'opening-balance-date-invalid',walletId:id});
      if(reconciliation.status==='not-configured')controlIssues.push({code:'bank-reconciliation-not-configured',walletId:id});
      else if(reconciliation.status==='mismatch')controlIssues.push({code:'bank-reconciliation-mismatch',walletId:id,difference:reconciliation.difference});
      else if(reconciliation.status==='invalid-statement-date')controlIssues.push({code:'invalid-bank-statement-date',walletId:id});
      rows.push({walletId:id,name:wallet.name||id,org,kind:wallet.kind||'Счёт или касса',...snapshot,reconciliation});
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
    return {rows,byOrg:groups,total,issues,controlIssues};
  }
  function bankReconciliation(wallet,entries){
    const date=String(wallet.bankStatementDate||'').slice(0,10);
    if(!date||wallet.bankStatementBalance==null||String(wallet.bankStatementBalance).trim()==='')return {status:'not-configured',difference:null};
    const openingDate=String(wallet.openingBalanceDate||'').slice(0,10);
    if(!validFinanceDate(date)||openingDate&&(!validFinanceDate(openingDate)||date<openingDate))return {status:'invalid-statement-date',difference:null};
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
  function crewPayrollAccruals(workActs=[],labor=[]){
    const rows=[],issues=[];
    for(const act of workActs||[]){
      if(act.status!=='approved')continue;
      const actId=String(act.id||act._id||'');
      const linked=(labor||[]).filter(entry=>linkedWork(entry,[act]).length&&(!entry.projectKey||!act.projectKey||entry.projectKey===act.projectKey));
      if(linked.length)issues.push({code:'crew-payroll-linked-labor-overlap',source:act});
      const personIds=[...new Set((act.memberIds||[]).filter(Boolean).map(String))].sort();
      if(!personIds.length){issues.push({code:'crew-payroll-missing-members',source:act});continue}
      let amount;
      try{
        if(act.qty==null||String(act.qty).trim()===''||act.rate==null||String(act.rate).trim()==='')throw new TypeError('Unknown work quantity or rate');
        amount=workAmount(act);
      }catch(e){issues.push({code:'crew-payroll-invalid-work-act',source:act,reason:e.message});continue}
      if(amount<0n){issues.push({code:'crew-payroll-invalid-work-act',source:act,reason:'Negative work amount'});continue}
      const shares=allocate(rubles(amount),personIds.map(()=>1));
      personIds.forEach((personId,index)=>{
        const replacements=linked.filter(entry=>String(entry.personId||'')===personId);
        if(replacements.length){
          let replacementGross=null;
          try{replacementGross=replacements.reduce((total,entry)=>total+cents(entry.gross??entry.amount??0),0n)}catch(_){}
          if(replacementGross!==shares[index]||replacements.some(entry=>linkedWork(entry,workActs).length!==1))issues.push({code:'crew-payroll-linked-amount-mismatch',source:act,personId,expected:shares[index],actual:replacementGross});
          return;
        }
        rows.push({personId,gross:rubles(shares[index]),sourceActId:actId,projectKey:act.projectKey||'',org:act.org||''});
      });
      for(const entry of linked)if(!personIds.includes(String(entry.personId||'')))issues.push({code:'crew-payroll-linked-member-mismatch',source:act,accrual:entry});
    }
    return {rows,issues};
  }
  function payrollReconciliation({accruals=[],payments=[],settlements=[],workActs=[]}={}){
    const totals=new Map(),issues=[],unallocatedPayments=[],settledByCash=new Map();
    for(const link of settlements||[]){
      const cashId=String(link.cashId||''),personId=String(link.personId||'');let amount;
      try{amount=cents(link.amount||0)}catch(_){issues.push({code:'payroll-invalid-settlement',source:link});continue}
      if(!cashId||!personId||amount<=0n){issues.push({code:'payroll-invalid-settlement',source:link});continue}
      settledByCash.set(cashId,[...(settledByCash.get(cashId)||[]),{personId,amount:rubles(amount)}]);
    }
    const crew=crewPayrollAccruals(workActs,accruals);issues.push(...crew.issues);
    const get=id=>{if(!totals.has(id))totals.set(id,{personId:id,gross:0n,ndfl:0n,other:0n,contributions:0n,paid:0n,expense:0n,payable:0n});return totals.get(id)};
    for(const entry of [...accruals,...crew.rows]){
      if(!entry.personId){issues.push({code:'payroll-missing-person',source:entry});continue}
      try{
        const p=payroll({gross:entry.gross??entry.amount??0,ndfl:entry.ndfl??0,other:entry.otherDeductions??entry.other??0,contributions:entry.employerContributions??entry.contributions??0});
        const t=get(String(entry.personId));t.gross+=p.gross;t.ndfl+=p.tax;t.contributions+=p.contributions;t.expense+=p.expense;t.other+=p.deductions;t.payable+=p.payable;
      }catch(e){issues.push({code:'payroll-invalid-deductions',source:entry,reason:e.message})}
    }
    for(const payment of payments.filter(x=>x.type==='out'&&(x.payrollPayment===true||x.personId||Array.isArray(x.payrollAllocations)||settledByCash.has(String(x._id||x.id||'')))&&x.payrollPayment!==false)){
      let amount;
      try{
        if(payment.amount==null||String(payment.amount).trim()==='')throw new TypeError('Unknown salary payment amount');
        amount=cents(payment.amount);
      }catch(_){issues.push({code:'payroll-invalid-payment',source:payment});continue}
      if(amount<0n){issues.push({code:'payroll-invalid-payment',source:payment});continue}
      if(payment.payrollAllocations!=null&&!Array.isArray(payment.payrollAllocations)){
        issues.push({code:'payroll-invalid-allocation',source:payment});
        unallocatedPayments.push({source:payment,amount});
        continue;
      }
      const allocations=Array.isArray(payment.payrollAllocations)?payment.payrollAllocations:(settledByCash.get(String(payment._id||payment.id||''))||null);
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
  function payrollByOrganization({accruals=[],payments=[],settlements=[],workActs=[]}={},org=''){
    const owners=org?[String(org)]:[...new Set([...accruals,...payments,...workActs].map(x=>String(x.org||'')))];
    const states=owners.map(owner=>({org:owner,state:payrollReconciliation({accruals:accruals.filter(x=>String(x.org||'')===owner),payments:payments.filter(x=>String(x.org||'')===owner),workActs:workActs.filter(x=>String(x.org||'')===owner),settlements})}));
    const people=states.flatMap(({org,state})=>state.people.map(p=>({...p,org}))),total=key=>states.reduce((n,{state})=>n+state[key],0n);
    return {people,issues:states.flatMap(({org,state})=>state.issues.map(issue=>({...issue,org}))),unallocatedPayments:states.flatMap(({org,state})=>state.unallocatedPayments.map(payment=>({...payment,org}))),unallocatedTotal:total('unallocatedTotal'),overpaidTotal:total('overpaidTotal'),grossTotal:total('grossTotal'),paidTotal:total('paidTotal'),expense:total('expense'),payableTotal:people.reduce((n,p)=>n+(p.payable>0n?p.payable:0n),0n)};
  }
  function paymentExceptionRegister({cash=[],labor=[],deals=[],people=[],articles=[],expenses=[],crewSettlements=[],workActs=[]}={}){
    const issues=[],add=(code,source,detail='')=>issues.push({code,source,detail});
    const keySet=new Set(deals.map(dealKey));
    const personSet=new Set(people.map(x=>String(x.id)));
    const articleSet=new Set(articles.map(x=>String(x.id)));
    const seen=new Map();
    const payrollState=payrollByOrganization({accruals:labor,payments:cash,settlements:crewSettlements,workActs});
    for(const issue of payrollState.issues){
      if(['payroll-unallocated-payment','payroll-overallocated-payment','payroll-invalid-allocation','payroll-invalid-payment'].includes(issue.code))add(issue.code,issue.source,issue.amount==null?'':rubles(issue.amount));
      if(issue.code==='payroll-overpayment')add(issue.code,{org:issue.org,personId:issue.personId,amount:rubles(issue.amount),note:'Совокупная переплата исполнителю'},[issue.org,people.find(p=>String(p.id)===issue.personId)?.name||issue.personId,rubles(issue.amount)+' ₽'].filter(Boolean).join(' · '));
    }
    for(const item of cash){
      const id=String(item._id||item.id||'');let amount;
      try{amount=cents(item.amount||0)}catch(_){if(!issues.some(x=>x.source===item&&x.code==='payroll-invalid-payment'))add('invalid-payment-amount',item);continue}
      if(item.type==='in'&&!item.projectKey&&!(item.customerId||item.personId))add('incoming-without-project-or-counterparty',item,rubles(amount));
      else if(item.type==='in'&&!item.projectKey)add('incoming-without-project',item,rubles(amount));
      if(item.type==='out'&&!item.personId&&item.type!=='transfer'&&(!item.projectKey||!item.articleId))add('supplier-payment-missing-project-or-article',item,rubles(amount));
      if(item.projectKey&&!keySet.has(String(item.projectKey)))add('invalid-project-reference',item,String(item.projectKey));
      if(item.personId&&people.length&&!personSet.has(String(item.personId)))add('invalid-person-reference',item,String(item.personId));
      if(item.articleId&&articles.length&&item.articleId!=='internal-transfer'&&!articleSet.has(String(item.articleId)))add('invalid-article-reference',item,String(item.articleId));
      if(item.type==='out'&&Array.isArray(item.payrollAllocations)){
        try{
          const allocationTotal=item.payrollAllocations.reduce((total,p)=>total+cents(p.amount||0),0n);
          if(allocationTotal!==amount)add('payment-allocation-difference',item,rubles(amount-allocationTotal));
        }catch(_){if(!issues.some(x=>x.source===item&&x.code==='payroll-invalid-allocation'))add('payroll-invalid-allocation',item)}
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
        if(person.terminationDate&&b>day(person.terminationDate)){issues.push('leave-after-termination');continue}
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
  return Object.freeze({cents,rubles,sum,allocate,difference,pnl,payroll,crewPayrollAccruals,payrollReconciliation,payrollByOrganization,ownerPeriodBounds,ownerPeriodSnapshot,ownerDebtSnapshot,ownerWarehouseSnapshot,cashFlow,walletOpeningValues,walletSnapshot,walletConsolidation,bankReconciliation,paymentExceptionRegister,vatControlRegister,validateUsnVatPolicies,usnVatThreshold,quarterTaxSnapshot,leaveSnapshot,walletBalance,reportRow,projectResult,preliminaryPeriod,projectExpenseTotal,projectPayroll,projectSnapshot,warehouseReceiptValuation,warehouseMovementValuation,warehouseCostAudit,warehouseSaleAudit,netAmount,documentVat,documentPnlAmount,dealKey,workAmount,laborType,payrollParts,managementTaxAmount,expenseLedger,directionSnapshot,directionReconciliation,projectWipSnapshot,wipPeriodBridge});
});
