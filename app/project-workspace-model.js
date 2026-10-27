/* Project presentation aggregates. Accounting remains in finance-core; amounts are cents. */
((root,factory)=>{const api=factory(typeof module==='object'&&module.exports?require('./finance-core.js'):root.ArbatFinanceCore,typeof module==='object'&&module.exports?require('./payables-model.js'):root.ArbatPayables);if(typeof module==='object'&&module.exports)module.exports=api;else root.ArbatProjectWorkspace=api})(typeof window==='object'?window:globalThis,(core,payables)=>{
 'use strict';
 const categories=Object.freeze([
  {id:'equipment',field:'planEquipment',label:'Оборудование'},
  {id:'materials',field:'planMaterials',label:'Материалы'},
  {id:'labor',field:'planLabor',label:'Работы монтажников'},
  {id:'contractors',field:'planContractors',label:'Подрядчики'},
  {id:'transport',field:'planTransport',label:'Транспорт'},
  {id:'machinery',field:'planMachinery',label:'Спецтехника'},
  {id:'other',field:'planOther',label:'Прочие прямые расходы'}
 ]);
 const stageStatuses=Object.freeze({planned:'Планируется',active:'В работе',completed:'Выполнен',cancelled:'Отменён'});
 function stageAmount(value){if(value==null||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw Error('Укажите неотрицательную сумму этапа, не более двух знаков после точки');return core.cents(value)}
 function stageDate(value){const date=String(value??'');if(!date)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,4)==='0000')throw Error('Укажите корректную дату этапа');const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('Укажите корректную дату этапа');return date}
 function normalizeStages(raw){
  if(!Array.isArray(raw)||raw.length>500)throw Error('Этапы должны быть массивом, не более 500 строк');
  const ids=new Set();return raw.map((row,index)=>{if(!row||typeof row!=='object')throw Error('Проверьте этап '+(index+1));const id=String(row.id||'stage-'+(index+1)),name=String(row.name??'').trim(),status=row.status||'planned',startDate=stageDate(row.startDate),endDate=stageDate(row.endDate);if(ids.has(id))throw Error('Идентификатор этапа повторяется');ids.add(id);if(!name)throw Error('Укажите название этапа '+(index+1));if(!Object.hasOwn(stageStatuses,status))throw Error('Проверьте состояние этапа');if(startDate&&endDate&&endDate<startDate)throw Error('Дата окончания этапа раньше даты начала');return {id,name,amount:core.rubles(stageAmount(row.amount)),startDate,endDate,status}});
 }
 function stages(deal){const rows=normalizeStages(deal.projectStages??[]),sum=status=>rows.filter(x=>status?x.status===status:x.status!=='cancelled').reduce((n,x)=>n+core.cents(x.amount),0n),total=sum(),contract=deal.contractTotal??deal.revenue;return {rows,total,completed:sum('completed'),cancelled:sum('cancelled'),difference:contract==null||contract===''?null:core.cents(contract)-total,undated:rows.filter(x=>x.status!=='cancelled'&&(!x.startDate||!x.endDate)).length}}
 function splitStages({amount,startDate,months,name='Этап'}){
  const total=stageAmount(amount),anchor=stageDate(startDate),count=Number(months);if(!anchor)throw Error('Укажите дату первого этапа');if(!Number.isInteger(count)||count<1||count>120)throw Error('Укажите число месяцев от 1 до 120');
  const [year,month,day]=anchor.split('-').map(Number),base=total/BigInt(count),rest=total%BigInt(count),batch=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  return normalizeStages(Array.from({length:count},(_,i)=>{const date=new Date(anchor+'T00:00:00Z');date.setUTCDate(1);date.setUTCFullYear(year,month-1+i,1);const last=new Date(date);last.setUTCMonth(last.getUTCMonth()+1,0);date.setUTCDate(Math.min(day,last.getUTCDate()));const at=date.toISOString().slice(0,10);return {id:'stage-'+batch+'-'+i,name:String(name||'Этап')+' · '+(i+1)+'/'+count,amount:core.rubles(base+(BigInt(i)<rest?1n:0n)),startDate:at,endDate:at,status:'planned'}}));
 }
 function budget(deal){
  const rows=categories.map(c=>{const raw=deal[c.field],plan=raw==null||raw===''?null:core.cents(raw);if(plan!==null&&plan<0n)throw Error('Сумма плана должна быть неотрицательной');return {...c,plan,actual:0n}});
  const detailed=rows.some(x=>x.plan!==null),legacy=deal.cost;
  return {detailed,total:detailed?rows.reduce((n,x)=>n+(x.plan||0n),0n):legacy==null||legacy===''?null:core.cents(legacy),rows};
 }
 // Resolve presentation from stable identity; never decode an order key into a project name.
 function projectTitle(data,source={}){
  const key=String(source.projectKey||''),id=source.dealId,rows=(data.deals||[]).filter(d=>(key?core.dealKey(d)===key:id&&String(d._id)===String(id))&&(!id||String(d._id)===String(id)));
  const matches=rows.filter(d=>!source.org||d.org===source.org);
  if(matches.length===1&&String(matches[0].name||'').trim())return matches[0].name;
  return !key&&!id?'Без проекта · Требует сверки':'Проект не найден · Требует сверки';
 }
 const norm=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const workLabel=row=>[row.name||row.priceName||'',row.section||'',row.unit||''].join(' · ');
 const quantity=value=>{if(value==null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null};
 const qtyLeft=(planned,completed)=>Number(Math.max(0,planned-completed).toFixed(9));
 function sameWork(a,b){if(a.priceLabel&&b.priceLabel)return norm(a.priceLabel)===norm(b.priceLabel);return Boolean(norm(a.name||a.priceName)&&norm(a.name||a.priceName)===norm(b.name||b.priceName)&&norm(a.unit)===norm(b.unit));}
 function planWorkFor(act,items){if(act.planItemId){const linked=items.find(i=>String(i.id)===String(act.planItemId));if(linked)return linked;}const found=items.filter(i=>sameWork(i,{...act,priceLabel:workLabel(act)}));return found.length===1?found[0]:null;}
 function workRate(data,item,org){
  const catalog=(data.priceCatalog||[]).filter(p=>!p.org||p.org===org),matches=item.priceLabel?catalog.filter(p=>norm(workLabel(p))===norm(item.priceLabel)):catalog.filter(p=>sameWork(p,item));
  if(matches.length===1&&matches[0].rate!=null&&matches[0].rate!==''&&quantity(matches[0].rate)!==null)return {rate:matches[0].rate,label:'Текущий прайс'};
  if(matches.length>1)return {rate:null,label:'Неоднозначная позиция прайса'};
  if(item.rate!=null&&item.rate!==''&&quantity(item.rate)!==null)return {rate:item.rate,label:'Ставка строки плана'};
  return {rate:null,label:'Ставка не задана'};
 }
 function initialEstimate(plan,items=plan?.items||[]){return Array.isArray(plan?.initialEstimateItems)?plan.initialEstimateItems.map(x=>({...x})):items.map(x=>({...x}));}
 // Use source VAT policy only. Invoice-level net totals are NOT unit prices.
 function acquisitionValue(qty,rate,source,grossCents){
   if(!Number.isFinite(Number(rate))||Number(rate)<=0)throw Error('Цена приобретения не задана');
   const gross=grossCents??core.workAmount({qty:Number(qty.toFixed(9)),rate});
   if(!source||source.vatRate==null||source.vatRate===''){
    if(source&&['vatDeductible','amountNet','vatAmount'].some(k=>source[k]!=null&&source[k]!==''))throw Error('Не указана ставка НДС источника');
    return {amount:gross,legacy:true};
   }
   const rateValue=String(source.vatRate),deductible=source.vatDeductible;
   if(rateValue!=='0'&&![true,false,'true','false',1,0,'1','0'].includes(deductible))throw Error('Не указано право на вычет НДС');
   const yes=deductible===true||deductible==='true'||deductible===1||deductible==='1';
   // Validate whole source metadata before using its policy on a planned portion.
   if(['amountGross','amountNet','vatAmount'].some(k=>source[k]!=null&&source[k]!=='')){
    const sourceQty=quantity(source.qty),sourceGross=source.amountGross!=null?core.cents(source.amountGross):sourceQty===null?null:core.workAmount({qty:sourceQty,rate:source.price});
    if(sourceGross===null)throw Error('Сумма источника не определена');
    try{core.documentPnlAmount({...source,amountGross:core.rubles(sourceGross),vatDeductible:yes},true)}catch{throw Error('Суммы НДС источника требуют сверки')}
   }
   const tax=core.documentVat(core.rubles(gross),source.vatRate,yes);return {amount:yes?tax.amountNet:tax.amountGross,legacy:false};
 }
 // FIFO conserves receipt cents across partial issues. A remaining lot's exact
 // value can differ from its quantity times the original unit acquisition price.
 function lotValue(qty,lot,field='valueCents'){
  if(lot[field]===undefined)return undefined;
  if(lot[field]===null||!/^\d+$/.test(String(lot[field])))throw Error('Стоимость партии требует сверки');
  const value=BigInt(lot[field]);return qty>=lot.qty?value:scaledValue(value,qty,lot.qty);
 }
 function scaledValue(value,qty,fullQty){
  const decimal=value=>{const [coefficient,exponent='0']=String(value).toLowerCase().split('e'),[whole,fraction='']=coefficient.split('.'),scale=fraction.length-Number(exponent),n=BigInt(whole+fraction);return scale<0?{n:n*10n**BigInt(-scale),scale:1n}:{n,scale:10n**BigInt(scale)}};
  const q=decimal(qty),total=decimal(fullQty),denominator=q.scale*total.n;
  return (value*q.n*total.scale+denominator/2n)/denominator;
 }
 function lotAcquisitionValue(qty,rate,source,lot){
  const value=acquisitionValue(qty,rate,source,lot?lotValue(qty,lot):undefined);
  if(lot?.expenseValuationStatus==='requires-review')throw Error('НДС партии требует сверки');
  if(lot&&lot.expenseValueCents!==undefined)value.amount=lotValue(qty,lot,'expenseValueCents');
  if(!lot&&source){
   const originalQty=quantity(source.qty),policy=core.warehouseReceiptValuation(source);
   if(!(originalQty>0)||policy.expenseValueCents===null)throw Error(policy.reason||'Стоимость исходной партии требует сверки');
   value.amount=scaledValue(BigInt(policy.expenseValueCents),qty,originalQty);value.legacy=policy.expenseValuationStatus==='legacy-gross';
  }
  return value;
 }
 // Full-scope analytical plan. No actual acts, cash, consumption quantities or ledger
 // amounts enter this calculation. Automatic values are never written to source data.
 function plannedBudget(data,deal,warehouse={},fifo){
  const result=budget(deal),composition=data.dealPlans?.[deal._id],lines=[],covered=new Set();
  const add=(row)=>{lines.push(row);covered.add(row.category)};
  for(const item of composition?.items||[]){
   const plannedQty=quantity(item.planned??item.qty),price=workRate(data,item,deal.org);
   let amount=null;try{amount=plannedQty===0?0n:plannedQty===null||price.rate===null?null:core.workAmount({qty:plannedQty,rate:price.rate})}catch{}
   add({id:item.id,kind:'work',category:'labor',name:item.name||item.priceLabel||'Работа без названия',unit:item.unit||'',plannedQty,rate:price.rate,amount,priceSource:price.label,sourceLabel:composition.docNo||'Состав работ сделки',estimated:false});
  }
  const materials=new Map(),plans=(warehouse.plans||[]).filter(p=>String(p.dealId)===String(deal._id)&&(!p.org||p.org===deal.org));
  const addMaterial=(line,label)=>{const id=line.itemId||'unresolved:'+norm(line.name)+'::'+norm(line.unit),qty=quantity(line.qty),entry=materials.get(id);if(entry){entry.plannedQty=entry.plannedQty===null||qty===null?null:Number((entry.plannedQty+qty).toFixed(9))}else materials.set(id,{line,plannedQty:qty,label})};
  for(const plan of plans)for(const line of plan.lines||[])addMaterial(line,plan.docNo||plan.filename||'Потребность проекта');
  if(!plans.length)for(const line of composition?.materials||[]){const matches=(warehouse.items||[]).filter(i=>(!i.org||i.org===deal.org)&&(line.itemId?String(i.id)===String(line.itemId):norm(i.name)===norm(line.name)&&norm(i.unit)===norm(line.unit)));addMaterial({...line,itemId:matches.length===1?matches[0].id:null},composition.docNo||'Материалы сделки')}
  const moveOrder=new Map((warehouse.moves||[]).map((m,i)=>[String(m.id),i]));
  for(const [id,entry] of materials){
   const matches=(warehouse.items||[]).filter(i=>String(i.id)===String(id)&&(!i.org||i.org===deal.org)),item=matches.length===1?matches[0]:null,category=/оборудован/i.test(item?.category||entry.line.category||'')?'equipment':'materials',lots=[];
   if(fifo?.bins)for(const [bin,values] of fifo.bins){const at=bin.lastIndexOf('::'),place=(warehouse.places||[]).find(p=>String(p.id)===bin.slice(0,at));if(bin.slice(at+2)!==String(id)||place?.org!==deal.org)continue;for(const lot of values)if(lot.qty>0)lots.push(lot)}
   lots.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||(moveOrder.get(String(a.source))??Number.MAX_SAFE_INTEGER)-(moveOrder.get(String(b.source))??Number.MAX_SAFE_INTEGER));
   let amount=entry.plannedQty===0?0n:null,knownAmount=0n,estimated=false,legacy=false,priceSource='Цена приобретения не определена';
   if(item&&entry.plannedQty>0){
    let left=entry.plannedQty,total=0n;const priceIssues=[],sources=new Map();
    // Group all planned portions of the same original receipt, including the
    // shortage estimate, before rounding. Consumption carries exact remaining
    // cents into EAC; it does not change the full-scope acquisition price curve.
    const take=(qty,rate,source,lot)=>{try{
     if(lot?.source&&(warehouse.moves||[]).filter(m=>String(m.id)===String(lot.source)).length!==1)throw Error('Источник партии не найден или неоднозначен');
     if(source?.org&&source.org!==deal.org)throw Error('Партия другой организации');
     if(source&&quantity(source.price)===0)throw Error('Цена приобретения исходной партии не задана');
     const value=lotAcquisitionValue(qty,rate,source,lot);
     if(source){
      const originalQty=quantity(source.qty);if(!(originalQty>0))throw Error('Количество исходной партии не определено');
      const policy=core.warehouseReceiptValuation(source);if(policy.expenseValueCents===null)throw Error(policy.reason);
      const originalValue=BigInt(policy.expenseValueCents),key=String(source.id),group=sources.get(key);
      if(group)group.qty=Number((group.qty+qty).toFixed(9));else sources.set(key,{qty,originalQty,originalValue});
      legacy ||= policy.expenseValuationStatus==='legacy-gross';
     }else{total+=value.amount;legacy ||= value.legacy}
    }catch(error){priceIssues.push(error.message)}};
    for(const lot of lots){if(left<=1e-8)break;const qty=Math.min(left,lot.qty),source=(warehouse.moves||[]).find(m=>String(m.id)===String(lot.source));take(qty,lot.cost,source,lot);estimated ||= Boolean(lot.estimated);left=Number((left-qty).toFixed(9))}
    if(left>1e-8){const receipts=(warehouse.moves||[]).filter(m=>String(m.itemId)===String(id)&&m.org===deal.org&&['receipt','opening'].includes(m.kind)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(moveOrder.get(String(b.id))??0)-(moveOrder.get(String(a.id))??0)),source=receipts[0];if(source)take(left,source.price,source);else priceIssues.push('Нет цены приобретения');estimated=true}
    for(const group of sources.values())total+=scaledValue(group.originalValue,group.qty,group.originalQty);knownAmount=total;
    if(!priceIssues.length){amount=total;priceSource=estimated?'FIFO + последняя цена приобретения · оценка':'Складские партии FIFO';if(legacy)priceSource+=' · цена источника, НДС не классифицирован'}else priceSource=[...new Set(priceIssues)].join(' · ');

   }
   add({id,kind:'material',category,name:item?.name||entry.line.name||'Номенклатура не найдена',unit:item?.unit||entry.line.unit||'',plannedQty:entry.plannedQty,rate:entry.plannedQty>0&&amount!==null?Number(core.rubles(amount))/entry.plannedQty:null,amount,knownAmount,priceSource,sourceLabel:entry.label,estimated});
  }
  for(const row of result.rows){row.automatic=covered.has(row.id);const own=lines.filter(x=>x.category===row.id);row.unknownCount=own.filter(x=>x.amount===null).length;if(row.automatic)row.plan=row.unknownCount?null:own.reduce((n,x)=>n+x.amount,0n)}
  result.automatic=lines.length>0;result.lines=lines;result.unknownCount=lines.filter(x=>x.amount===null).length;
  result.knownTotal=result.rows.reduce((n,r)=>n+(r.automatic?lines.filter(x=>x.category===r.id).reduce((sum,x)=>sum+(x.amount??x.knownAmount??0n),0n):r.plan??0n),0n);
  if(result.automatic){result.detailed=true;result.total=result.unknownCount?null:result.knownTotal}
  else result.knownTotal=result.total;
  return result;
 }
 function workActualAmount(source){
  if(quantity(source.qty)===null||quantity(source.rate)===null)return null;
  try{const amount=core.workAmount(source);return amount<0n?null:amount}catch{return null}
 }
 function forecast(data,deal,warehouse={},fifo,actualCost=0n,baseline=budget(deal),actualIssues=[]){
  const key=core.dealKey(deal),plan=data.dealPlans?.[deal._id],items=plan?.items||[],original=initialEstimate(plan),acts=(data.workActs||[]).filter(a=>a.projectKey===key&&a.org===deal.org&&a.status==='approved'),rows=[],covered=new Set(),issues=[],invalidActualSources=acts.filter(act=>workActualAmount(act)===null);
  if(invalidActualSources.length||actualIssues.length)issues.push('forecast-actual-review');
  for(const item of items){
   const planned=quantity(item.planned??item.qty),linked=acts.filter(a=>planWorkFor(a,items)===item),completed=linked.some(a=>workActualAmount(a)===null)?null:linked.reduce((n,a)=>n+quantity(a.qty),0),remainingQty=planned===null||completed===null?null:qtyLeft(planned,completed),price=workRate(data,item,deal.org),remainingCost=remainingQty===0?0n:remainingQty===null||price.rate===null?null:core.workAmount({qty:remainingQty,rate:price.rate}),unbudgeted=!planWorkFor({...item,planItemId:item.id},original)&&!original.some(i=>sameWork(i,item));
   rows.push({id:item.id,kind:'work',category:'labor',name:item.name||item.priceLabel||'Работа без названия',unit:item.unit||'',plannedQty:planned,completedQty:completed,remainingQty,rate:price.rate,remainingCost,actualCost:completed===null?null:linked.reduce((n,a)=>n+workActualAmount(a),0n),actualSources:linked,unbudgeted,source:item,sourceCollection:'dealPlans',priceSource:price.label,sourceLabel:plan?.docNo||'План работ'});
  }
  if(items.length)covered.add('labor');
  // Work entered directly in production remains visible even when the estimate is empty.
  for(const act of acts){if(planWorkFor(act,items))continue;const inOriginal=planWorkFor(act,original),actual=workActualAmount(act);rows.push({id:act.id||act._id,kind:'work',category:'labor',name:act.name||act.priceName||'Работа без названия',unit:act.unit||'',plannedQty:0,completedQty:quantity(act.qty),remainingQty:0,rate:act.rate??null,remainingCost:actual===null?null:0n,actualCost:actual,unbudgeted:!inOriginal,source:act,sourceCollection:'workActs',sourceLabel:act.document||act.batchId||'Выполненная работа',priceSource:'Ставка выполненной работы'});}
  const materials=new Map(),moveOrder=new Map((warehouse.moves||[]).map((m,index)=>[String(m.id),index])),warehousePlans=(warehouse.plans||[]).filter(p=>p.dealId===deal._id&&(!p.org||p.org===deal.org));
  const addMaterial=(line,source,sourceLabel)=>{const id=line.itemId||'unresolved:'+norm(line.name)+'::'+norm(line.unit),existing=materials.get(id),q=quantity(line.qty);if(existing){existing.plannedQty=existing.plannedQty===null||q===null?null:existing.plannedQty+q;return}materials.set(id,{line,source,sourceLabel,plannedQty:q})};
  for(const p of warehousePlans)for(const line of p.lines||[])addMaterial(line,p,p.docNo||p.filename||'Потребность проекта');
  if(!warehousePlans.length)for(const line of plan?.materials||[]){const found=(warehouse.items||[]).filter(i=>(!i.org||i.org===deal.org)&&(line.itemId?String(i.id)===String(line.itemId):norm(i.name)===norm(line.name)&&norm(i.unit)===norm(line.unit)));addMaterial({...line,itemId:found.length===1?found[0].id:null},plan,plan.docNo||'Материалы заказ-наряда')}
  for(const [id,entry] of materials){
   const matches=(warehouse.items||[]).filter(i=>String(i.id)===String(id)&&(!i.org||i.org===deal.org)),item=matches.length===1?matches[0]:null,category=/оборудован/i.test(item?.category||entry.line.category||'')?'equipment':'materials',consumed=(warehouse.moves||[]).filter(m=>m.dealId===deal._id&&m.itemId===id&&m.kind==='consume'&&(!m.org||m.org===deal.org)).reduce((n,m)=>n+(quantity(m.qty)||0),0),remainingQty=entry.plannedQty===null?null:qtyLeft(entry.plannedQty,consumed);
   let remainingCost=remainingQty===0?0n:null,priceSource='Цена приобретения не определена',estimated=false;
   if(remainingQty>0&&item){
    const lots=[];if(fifo?.bins)for(const [bin,values] of fifo.bins){const divider=bin.lastIndexOf('::'),place=(warehouse.places||[]).find(p=>String(p.id)===bin.slice(0,divider));if(bin.slice(divider+2)!==String(id)||place?.org!==deal.org)continue;for(const lot of values)if(lot.qty>0)lots.push(lot)}
    lots.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||(moveOrder.get(String(a.source))??Number.MAX_SAFE_INTEGER)-(moveOrder.get(String(b.source))??Number.MAX_SAFE_INTEGER));
    let left=remainingQty,sum=0n,unknown=false;
    const take=(qty,rate,source,lot)=>{try{if(lot?.source&&(warehouse.moves||[]).filter(m=>String(m.id)===String(lot.source)).length!==1)throw Error('Источник партии не найден или неоднозначен');if(source?.org&&source.org!==deal.org)throw Error('Партия другой организации');if(source&&quantity(source.price)===0)throw Error('Цена приобретения исходной партии не задана');sum+=lotAcquisitionValue(qty,rate,source,lot).amount}catch{unknown=true}};
    for(const lot of lots){if(left<=1e-8)break;const q=Math.min(left,lot.qty);left-=q;const source=(warehouse.moves||[]).find(m=>String(m.id)===String(lot.source));take(q,lot.cost,source,lot);estimated ||= Boolean(lot.estimated)}
    if(left>1e-8){const receipts=(warehouse.moves||[]).filter(m=>m.itemId===id&&m.org===deal.org&&['receipt','opening'].includes(m.kind)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||(moveOrder.get(String(b.id))??0)-(moveOrder.get(String(a.id))??0));const latest=receipts[0];if(latest){take(left,latest.price,latest);estimated=true;priceSource='FIFO + последняя цена приобретения для нехватки'}else unknown=true}
    else priceSource='Текущие партии FIFO';
    if(!unknown){remainingCost=sum;if(estimated)priceSource+=' · оценка'}
   }
   covered.add(category);rows.push({id,kind:'material',category,name:item?.name||entry.line.name||'Номенклатура не найдена',unit:item?.unit||entry.line.unit||'',plannedQty:entry.plannedQty,completedQty:consumed,remainingQty,rate:remainingQty>0&&remainingCost!==null?Number(core.rubles(remainingCost))/remainingQty:null,remainingCost,actualCost:null,source:entry.source,sourceCollection:'warehousePlans',sourceLabel:entry.sourceLabel,priceSource,estimated,unbudgeted:false});
  }
  for(const item of baseline.rows){if(covered.has(item.id)||item.plan===null)continue;const remainingCost=item.plan>item.actual?item.plan-item.actual:0n;rows.push({id:'budget:'+item.id,kind:'budget',category:item.id,name:item.label,plannedQty:null,completedQty:null,remainingQty:null,rate:null,remainingCost,actualCost:item.actual,source:deal,sourceCollection:'deals',sourceLabel:'Явная смета сделки',priceSource:'Остаток явного бюджета',unbudgeted:false})}
  if(!items.length&&!materials.size&&!baseline.detailed&&baseline.total!==null)rows.push({id:'legacy-budget',kind:'budget',category:'other',name:'Общий бюджет',remainingCost:baseline.total>actualCost?baseline.total-actualCost:0n,source:deal,sourceCollection:'deals',sourceLabel:'Явный общий бюджет',priceSource:'Остаток явного бюджета',unbudgeted:false});
  const hasPlan=items.length>0||materials.size>0||baseline.total!==null;
  const unknown=rows.filter(r=>r.remainingCost===null),knownRemaining=rows.reduce((n,r)=>n+(r.remainingCost??0n),0n),remaining=unknown.length||!hasPlan?null:knownRemaining;
  if(unknown.length)issues.push('forecast-price-missing');if(!hasPlan)issues.push('forecast-plan-missing');
  const cost=remaining===null||actualIssues.length||invalidActualSources.length?null:actualCost+remaining;let income=null;try{const contract=deal.contractTotal??deal.revenue;if(contract==null||String(contract).trim()==='')throw Error('Сумма договора не задана');income=core.documentPnlAmount({...deal,amountGross:contract})}catch{issues.push('forecast-contract-review')}
  return {rows,unbudgeted:rows.filter(r=>r.unbudgeted),actualCost:actualIssues.length||invalidActualSources.length?null:actualCost,knownActualCost:actualCost,invalidActualSources,remaining,knownRemaining,unknownCount:unknown.length,cost,income,profit:income===null||cost===null?null:income-cost,issues,originalEstimateSource:Array.isArray(plan?.initialEstimateItems)?'Сохранённая исходная смета':'Текущий план · историческая исходная смета не сохранена'};
 }

 function snapshot(data,deal,warehouse={},fifo){
  const key=core.dealKey(deal),input={...data,warehouse,fifo},project=core.projectSnapshot(input,deal,key),wip=core.projectWipSnapshot(input,deal,key),issues=[...project.issues,...wip.issues],plan=plannedBudget(data,deal,warehouse,fifo),baseline=budget(deal);
  const cashRows=[];
  for(const source of data.cash||[]){
   if(source.type!=='in'&&source.type!=='out')continue;
   const parts=Array.isArray(source.allocations)?source.allocations:Array.isArray(source.projectAllocations)?source.projectAllocations:[];
   if(parts.length?!parts.some(p=>p.projectKey===key):source.projectKey!==key)continue;
   let n;
   try{const total=core.cents(source.amount),amounts=parts.map(p=>core.cents(p.amount));if(total<=0n||amounts.some(v=>v<=0n)||amounts.reduce((sum,v)=>sum+v,0n)>total){issues.push('cash-allocation-invalid');continue}n=parts.length?parts.reduce((sum,p,i)=>sum+(p.projectKey===key?amounts[i]:0n),0n):total}catch{issues.push('cash-allocation-invalid');continue}
   if(!n)continue;
   if(source.org!==deal.org){issues.push('cash-organization-mismatch');continue}
   cashRows.push({source,amount:n});
  }
  let settlement=null,refunded=0n;
  try{
   const cash=(data.cash||[]).map(source=>Array.isArray(source.allocations)?{...source,projectAllocations:source.allocations.length?source.allocations:undefined}:source);
   const settlements=core.ownerDebtSnapshot({deals:[...(data.deals||[]).filter(d=>core.dealKey(d)!==key),deal],realizations:data.realizations||[],cash,vatAdvanceEvents:data.vatAdvanceEvents||[]},deal.org);
   settlement=settlements.rows.find(row=>row.key===key)||null;
   const traced=new Map();
   for(const row of settlements.refundRows||[]){if(row.projectKey!==key||row.amount<=0n)continue;const id=String(row.source._id||row.source.id||'');const group=traced.get(id);if(group)group.amount+=row.amount;else traced.set(id,{source:row.source,amount:row.amount})}
   refunded=[...traced.values()].reduce((sum,row)=>sum+row.amount,0n);
   for(const row of traced.values()){
    const original=(data.cash||[]).find(source=>source===row.source||String(source._id||source.id||'')===String(row.source._id||row.source.id||''))||row.source;
    const parts=Array.isArray(original.allocations)?original.allocations:Array.isArray(original.projectAllocations)?original.projectAllocations:[],keys=parts.length?parts.map(part=>part.projectKey).filter(Boolean):[original.projectKey].filter(Boolean);
    if(keys.length&&!keys.includes(key)){issues.push('cash-refund-project-mismatch');continue}
    if(cashRows.some(entry=>entry.source===original))continue;
    if(keys.length)continue; // Invalid explicit allocations remain quarantined.
    cashRows.push({source:original,amount:row.amount,refund:true});
   }
  }catch{issues.push('cash-settlement-review')}
  const total=type=>cashRows.filter(x=>x.source.type===type).reduce((n,x)=>n+x.amount,0n),income=total('in'),outcome=total('out');
  const settlementReview=!settlement||settlement.received!==income-refunded||issues.some(code=>['cash-allocation-invalid','cash-organization-mismatch','cash-refund-project-mismatch','cash-settlement-review'].includes(code));
  if(settlementReview)issues.push('cash-settlement-review');
  if(settlement)settlement={...settlement,review:settlementReview,receivable:settlementReview?null:settlement.receivable,advance:settlementReview?null:settlement.advance};
  const netReceived=settlementReview?null:settlement.received;
  const ledger=core.expenseLedger(input).rows.filter(x=>x.projectKey===key&&x.category!=='belowIncome');
  const unclassified={id:'unclassified',label:'Не распределено по смете',plan:null,actual:0n};
  for(const row of ledger){let bucket;
   if(row.category==='direct'&&(row.kind==='payroll'||row.kind==='work-act'))bucket=plan.rows.find(x=>x.id==='labor');
   else bucket=plan.rows.find(x=>x.label===row.source?.category);
   (bucket||unclassified).actual+=row.amount;
  }
  if(unclassified.actual)plan.rows.push(unclassified);
  for(const row of plan.rows)row.remaining=row.plan===null?null:row.plan-row.actual;
  plan.actual=project.cost;plan.remaining=plan.total===null?null:plan.total-project.cost;
  const supplierDocuments=payables.snapshot(data,warehouse).documents.filter(d=>d.org===deal.org&&d.sources.some(s=>s.projectKey===key||s.dealId===deal._id));
  const valid=supplierDocuments.filter(d=>d.status!=='review');
  if(supplierDocuments.some(d=>d.status==='review'))issues.push('supplier-document-review');
  const supplierReviewCount=supplierDocuments.filter(d=>d.status==='review').length,supplierKnownRemaining=valid.reduce((n,d)=>n+(d.remaining||0n),0n),supplierRemaining=supplierReviewCount?null:supplierKnownRemaining,contractGross=core.cents(deal.contractTotal??deal.revenue??0),contractNet=wip.contractNet;
  return {key,deal,contractGross,contractNet,revenue:project.revenue,cost:project.cost,recognizedCost:wip.recognizedCost==null?null:wip.recognizedCost+(wip.nonDirectCost||0n),wip:wip.wip??null,profit:project.issues.length||wip.status!=='calculated'?null:wip.operatingProfit,settlement,remainingPayment:netReceived===null?null:contractGross-netReceived,remainingRevenue:contractNet===null?null:contractNet-project.revenue,cash:{income,outcome,balance:income-outcome,netReceived,refunded,rows:cashRows},budget:plan,forecast:forecast(data,deal,warehouse,fifo,project.cost,{...baseline,rows:baseline.rows.map(row=>({...row,actual:plan.rows.find(x=>x.id===row.id)?.actual??0n}))},project.issues),realizations:(data.realizations||[]).filter(x=>x.projectKey===key),ledger,supplierDocuments,supplierRemaining,supplierKnownRemaining,supplierReviewCount,issues:[...new Set(issues)]};
 }
 return Object.freeze({categories,budget,plannedBudget,snapshot,forecast,workActualAmount,projectTitle,initialEstimate,stageStatuses,normalizeStages,stages,splitStages});
});
