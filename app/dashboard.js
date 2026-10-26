(()=>{
  const COLORS=['var(--ft-chart-blue,#3a369b)','var(--ft-chart-purple,#804ad7)','var(--ft-chart-teal,#75c2c7)','var(--ft-chart-sky,#7d76cf)','var(--ft-chart-lilac,#9399c0)','var(--ft-chart-slate,#b2bad8)','var(--ft-chart-sand,#afa6c6)'];
  const money=value=>Number(value||0);
  const validWalletDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const sum=(rows,selector=item=>money(item.amount))=>Number(window.ArbatFinanceCore.rubles(window.ArbatFinanceCore.sum(rows.map(selector))));
  const rub=value=>money(value).toLocaleString('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2});
  const exactRub=value=>{const raw=window.ArbatFinanceCore.rubles(value),[whole,fraction]=raw.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ') + ',' + fraction + ' ₽'};
  const compact=value=>new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(money(value))+' ₽';
  const percent=value=>Number.isFinite(value)?value.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'—';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const projectKey=deal=>window.arbatDealKey?.(deal)||(deal.org+'::'+deal.name);
  const matchesOrg=(item,org)=>!org||item.org===org;
  const monthKey=date=>String(date||'').slice(0,7);
  const iso=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const days=(from,to)=>Math.round((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000);
  const isCalendarIncome=item=>item.type==='in'||item.kind==='income';

  // Cash is a separate accounting view from earned revenue and recognized costs.
  function periodCashSummary(data,bounds,org=''){
    const core=window.ArbatFinanceCore;
    const normalizeEnd=value=>{if(!value)return '';const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Math.min(Number(value.slice(8,10)),new Date(Date.UTC(year,month,0)).getUTCDate());return value.slice(0,8)+String(day).padStart(2,'0')};
    const from=bounds.from||'',to=normalizeEnd(bounds.to),inside=(item,start=from,end=to)=>{const date=String(item.date||'').slice(0,10);return validWalletDate(date)&&(!start||date>=start)&&(!end||date<=end)};
    const scoped=(data.cash||[]).filter(x=>matchesOrg(x,org)),selected=scoped.filter(x=>inside(x)),flow=core.cashFlow(selected,'',org),issues=[];
    const wallets=(data.wallets||[]).filter(x=>matchesOrg(x,org)),eligible=core.walletConsolidation(data.wallets||[],[]).rows.filter(x=>matchesOrg(x,org)),ids=new Set(eligible.map(x=>x.walletId));
    let opening=0n,closing=0n,transferNet=0n;const openingDate=from?new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString().slice(0,10):'';
    if(!wallets.length)issues.push('Нет счетов для расчёта остатка');
    if(wallets.length!==eligible.length)issues.push('Не все счета подтверждены или классифицированы');
    const noOpening=!from;
    for(const wallet of wallets){
      if(!validWalletDate(wallet.openingBalanceDate)||openingDate&&wallet.openingBalanceDate>openingDate){issues.push('Начальный остаток счёта не подтверждён на начало периода: '+(wallet.name||wallet.id));continue}
      opening+=core.walletSnapshot(wallet.openingBalance,data.cash||[],wallet.id,wallet.openingBalanceDate,openingDate).balance;
      closing+=core.walletSnapshot(wallet.openingBalance,data.cash||[],wallet.id,wallet.openingBalanceDate,to).balance;
    }
    for(const row of selected)if(['in','out'].includes(row.type)&&!ids.has(String(row.walletId||'')))issues.push('Операция ДДС не связана с подтверждённым счётом: '+(row._id||row.id||row.date));
    // Include incoming cross-company transfers even if the source document belongs to another org.
    for(const row of (data.cash||[]).filter(x=>x.type==='transfer'&&inside(x))){const amount=core.cents(row.amount||0);if(ids.has(String(row.toWalletId)))transferNet+=amount;if(ids.has(String(row.walletId)))transferNet-=amount}
    for(const row of scoped)if(!validWalletDate(row.date))issues.push('Операция без корректной даты: '+(row._id||row.id||''));
    let previous=null;
    if(from&&to){const first=new Date(from+'T00:00:00Z'),last=new Date(to+'T00:00:00Z'),span=Math.round((last-first)/86400000)+1,previousTo=bounds.previousBounds?.to||new Date(+first-86400000).toISOString().slice(0,10),previousFrom=bounds.previousBounds?.from||new Date(+first-span*86400000).toISOString().slice(0,10);previous={...core.cashFlow(scoped.filter(x=>inside(x,previousFrom,previousTo))),from:previousFrom,to:previousTo}}
    const articleNames=new Map((data.articles||[]).map(x=>[String(x.id||x._id),x.name]));
    return {...flow,bounds:{from,to,label:bounds.label||''},previous,opening:issues.length||noOpening?null:opening,closing:issues.length?null:closing,transferNet,bridgeDifference:issues.length||noOpening?null:closing-opening-flow.net-transferNet,issues,articles:flow.categories.map(x=>({...x,name:articleNames.get(String(x.articleId))||(x.articleId==='no-article'?'Без статьи':String(x.articleId))}))};
  }
  window.ArbatDashboardSummary=Object.freeze({snapshot:periodCashSummary});
  const comparisonNote=(current,previous)=>previous===null||previous===undefined?'Нет предыдущего периода':(current-previous>0n?'+':'')+exactRub(current-previous)+' к предыдущему периоду'+(previous!==0n?' · '+percent(Number(current-previous)/Math.abs(Number(previous))*100):' · Нет базы для процента');
  function periodSummary(data){
    const target=document.getElementById('dashboardPeriodSummary');if(!target)return;const x=data.cashSummary;
    const opened=new Set([...target.querySelectorAll('details[open]')].map(x=>x.className));
    const card=(label,value,note)=>'<div class="summary-period-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(note)+'</span></div>';
    target.dataset.dashboardPriority='cash';target.dataset.value=String(x.net);
    target.innerHTML='<div class="dashboard-kpi-top"><span>Чистый денежный поток</span><small>За период</small></div><button type="button" class="ux-value '+(x.net<0n?'dashboard-negative':'')+'" data-ux-metric="cash" aria-label="Чистый денежный поток: '+esc(exactRub(x.net))+'. Открыть операции">'+exactRub(x.net)+'</button><small class="dashboard-comparison">'+esc(comparisonNote(x.net,x.previous?.net))+'</small><dl class="dashboard-cash-totals"><div><dt>Поступления</dt><dd>'+exactRub(x.income)+'</dd></div><div><dt>Платежи</dt><dd>'+exactRub(x.outgoing)+'</dd></div></dl><small class="dashboard-cash-scope">'+esc(x.bounds.from&&x.bounds.to?x.bounds.from+' — '+x.bounds.to:'За всё время')+'</small><div class="dashboard-cash-controls"><details class="summary-cash-reconciliation summary-cash-bridge"><summary>'+(x.issues.length?'Не определён остаток · сверка '+x.issues.length:'Остатки и сверка')+'</summary><div class="summary-cash-bridge-values">'+card('Остаток на начало',x.opening===null?'Не определён':exactRub(x.opening),x.bounds.from||'Без начальной даты')+card('Переводы между организациями',exactRub(x.transferNet),'Отдельно от поступлений и платежей')+card('Остаток на конец',x.closing===null?'Не определён':exactRub(x.closing),x.bounds.to||'По внесённым операциям')+'</div>'+(x.issues.length?'<details class="summary-cash-issues"><summary>Остатки требуют проверки · '+x.issues.length+'</summary><ul>'+x.issues.map(reason=>'<li>'+esc(reason)+'</li>').join('')+'</ul></details>':x.bridgeDifference!==null&&x.bridgeDifference!==0n?'<p class="pay-notice">ДДС и остатки не сходятся на '+exactRub(x.bridgeDifference)+'. Проверьте организацию и счета операций.</p>':x.bridgeDifference===null?'<p class="ux-help">Для контроля начального остатка выберите период с датой начала.</p>':'<p class="ux-help">Начало + поступления − платежи + переводы = конец.</p>')+'</details><details class="summary-cash-articles"><summary>Статьи ДДС · '+x.articles.length+'</summary><div class="summary-cash-scroll"><table><thead><tr><th>Статья</th><th>Поступления</th><th>Платежи</th></tr></thead><tbody>'+x.articles.map(row=>'<tr><td>'+esc(row.name)+'</td><td>'+exactRub(row.income)+'</td><td>'+exactRub(row.outgoing)+'</td></tr>').join('')+'</tbody><tfoot><tr><th>Итого</th><th>'+exactRub(x.income)+'</th><th>'+exactRub(x.outgoing)+'</th></tr></tfoot></table></div></details></div>';
    for(const detail of target.querySelectorAll('details'))if(opened.has(detail.className))detail.open=true;
  }

  function lastMonths(count=6,reference=iso(new Date())){
    const anchor=new Date(reference+'T12:00:00'),result=[];
    for(let offset=count-1;offset>=0;offset--){const date=new Date(anchor.getFullYear(),anchor.getMonth()-offset,1);result.push({key:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'),label:date.toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+' '+String(date.getFullYear()).slice(-2)})}
    return result;
  }
  function comparisonBounds(bounds,mode){
    if(!bounds.from||!bounds.to)return null;
    if(['month','quarter','year'].includes(mode))return window.ArbatFinanceCore.ownerPeriodBounds(mode,window.ArbatExperience.shiftPeriod(bounds.from,mode,-1));
    const first=Date.parse(bounds.from+'T00:00:00Z'),span=Date.parse(bounds.to+'T00:00:00Z')-first+86400000;
    return {from:new Date(first-span).toISOString().slice(0,10),to:new Date(first-86400000).toISOString().slice(0,10)};
  }
  // Calendar comparison is a read-only view of active independent plans, not an approved P&L budget.
  function calendarPlanFact(data,bounds,org){
    const result={income:null,outgoing:null,rows:[],issues:[]},core=window.ArbatFinanceCore;if(!bounds.from||!bounds.to)return result;
    const start=new Date(bounds.from+'T00:00:00Z'),end=new Date(bounds.to+'T00:00:00Z');
    for(const rule of data.calendar||[]){
      if(rule.active==='no'||!matchesOrg(rule,org)||rule.supplierDocumentKey)continue;
      let amount;try{if(rule.amount===null||rule.amount===undefined||rule.amount==='')throw Error();amount=core.cents(rule.amount);if(amount<0n)throw Error()}catch{result.issues.push(rule);continue}
      if(!validWalletDate(rule.dueDate)){result.issues.push(rule);continue}
      const dates=[];
      if(rule.frequency==='monthly'){
        const first=new Date(rule.dueDate+'T00:00:00Z'),offset=Math.max(0,(start.getUTCFullYear()-first.getUTCFullYear())*12+start.getUTCMonth()-first.getUTCMonth()),last=(end.getUTCFullYear()-first.getUTCFullYear())*12+end.getUTCMonth()-first.getUTCMonth();
        for(let i=offset;i<=last;i++){const d=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+i,1));d.setUTCDate(Math.min(first.getUTCDate(),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));dates.push(d.toISOString().slice(0,10))}
      }else dates.push(rule.dueDate);
      const type=isCalendarIncome(rule)?'income':'outgoing';
      for(const date of dates)if(date>=bounds.from&&date<=bounds.to){result[type]=(result[type]??0n)+amount;result.rows.push({rule,date,amount,type})}
    }
    return result;
  }

  function walletRows(org,consolidated){
    const core=window.ArbatFinanceCore;
    if(!core)throw new Error('Финансовый расчетный модуль не загружен');
    const source=consolidated||core.walletConsolidation(db.wallets||[],db.cash||[]);
    return source.rows.filter(wallet=>!org||wallet.org===org).map(wallet=>({...wallet,balance:Number(core.rubles(wallet.balance))}));
  }
  function calendarOccurrences(org){return window.ArbatExperience.plans(db,org).future;}
  function taxSnapshot(){
    let warehouse={};try{warehouse=JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{}
    return window.ArbatFinanceCore.quarterTaxSnapshot({...db,warehouse},document.getElementById('uxTaxReference')?.value||iso(new Date()));
  }
  window.arbatTaxSnapshot=taxSnapshot;
  function snapshot(){
    const chartBounds=window.ArbatFinanceCore.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',document.getElementById('ownerPeriodReference')?.value||iso(new Date()),document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||'');
    const org=document.getElementById('orgFilter')?.value||'',months=lastMonths(6,chartBounds.to||iso(new Date())),cash=(db.cash||[]).filter(item=>matchesOrg(item,org)),deals=(db.deals||[]).filter(item=>matchesOrg(item,org)),realizations=(db.realizations||[]).filter(item=>matchesOrg(item,org)),expenses=(db.expenses||[]).filter(item=>matchesOrg(item,org)),costs=(db.costs||[]).filter(item=>matchesOrg(item,org)),labor=(db.labor||[]).filter(item=>matchesOrg(item,org)),acts=(db.workActs||[]).filter(item=>item.status==='approved'&&matchesOrg(item,org));
    const flow=months.map(month=>{const core=window.ArbatFinanceCore,result=core.cashFlow(cash.filter(x=>!chartBounds.to||String(x.date||'')<=chartBounds.to),month.key,org);return {label:month.label,income:Number(core.rubles(result.income)),outcome:Number(core.rubles(result.outgoing))}});
    const names=[...new Set([...(typeof dirs!=='undefined'?dirs:[]),...deals.map(item=>item.dir).filter(Boolean)])];
    const warehouseState=(()=>{try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}})();const fifo=typeof window.arbatFifo==='function'?window.arbatFifo(warehouseState):null;const period=monthKey(iso(new Date())),wipData={...db,warehouse:warehouseState,fifo,wipAccounting:true};const directions=names.map(name=>{const core=window.ArbatFinanceCore,bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',document.getElementById('ownerPeriodReference')?.value||iso(new Date()),document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),selected=core.ownerPeriodSnapshot(wipData,bounds,org),assigned=selected.rows.filter(x=>x.dir===name),revenueDocs=selected.revenueDocuments.filter(x=>deals.some(d=>d.dir===name&&projectKey(d)===x.projectKey)),revenue=revenueDocs.reduce((v,x)=>v+core.documentPnlAmount(x),0n),cost=assigned.reduce((v,x)=>v+(x.category==='belowIncome'?-x.amount:x.amount),0n),adjustment=selected.wipBridges.flatMap(b=>b.projects).filter(p=>p.dir===name).reduce((v,p)=>v+p.deferredChange,0n),result=revenue-cost+adjustment,num=x=>Number(core.rubles(x));return {name,revenue:num(revenue),cost:num(cost-adjustment),result:num(result),margin:revenue?Number(result)/Number(revenue)*100:NaN}});
    const projects=deals.map(deal=>{const key=projectKey(deal),core=window.ArbatFinanceCore,snapshot=core.projectSnapshot(wipData,deal,key),wip=core.projectWipSnapshot(wipData,deal,key),vat=core.vatControlRegister(wipData,{projectKey:key}),gross=sum(realizations.filter(item=>item.projectKey===key)),contract=money(deal.contractTotal??deal.revenue),remaining=Math.max(0,contract-gross),revenue=Number(core.rubles(snapshot.revenue)),cost=Number(core.rubles(snapshot.cost)),recognizedCost=wip.status==='calculated'?Number(core.rubles(wip.recognizedCost+(wip.nonDirectCost||0n))):null,wipCost=wip.status==='calculated'?Number(core.rubles(wip.wip)):null,reviewRequired=snapshot.issues.length>0||wip.status!=='calculated'||vat.count>0;return {key,name:deal.name||'Без названия',org:deal.org,contract,realized:gross,revenue,cost,recognizedCost,wipCost,result:reviewRequired?null:Number(core.rubles(wip.operatingProfit)),reviewRequired,issues:[...snapshot.issues,...wip.issues,...vat.issues],remaining,progress:contract?Math.min(100,gross/contract*100):0}}).sort((a,b)=>b.remaining-a.remaining);
    const people=db.people||[],activePeople=people.filter(item=>item.workStatus!=='Не работает'),staffMissingHire=activePeople.filter(item=>!item.hireDate).length,staffMissingLeaveNorm=activePeople.filter(item=>item.annualLeaveDays===''||item.annualLeaveDays==null).length;
    const core=window.ArbatFinanceCore,walletMoney=core.walletConsolidation(db.wallets||[],db.cash||[]),wallets=walletRows(org,walletMoney),forecast=window.ArbatLiquidity.snapshot(db,warehouseState,org,iso(new Date())),calendar=forecast.rows.filter(item=>item.days!==null&&item.days>=0&&item.days<=90),payments30=forecast.rows.filter(item=>item.days!==null&&item.days<30),contract=sum(deals,deal=>money(deal.contractTotal??deal.revenue)),realized=sum(realizations),remaining=Math.max(0,contract-realized),uncategorized=cash.filter(item=>item.type!=='transfer'&&!item.articleId).length,unverified=(db.wallets||[]).filter(item=>!item.verified&&(!org||item.org===org)).length,brokenTransfers=cash.filter(item=>item.type==='transfer'&&!item.toWalletId).length,uncertain=expenses.filter(item=>item.valuationStatus==='requires-review').length,unreconciled=wallets.filter(item=>item.reconciliation?.status!=='matched').length,mismatched=wallets.filter(item=>item.reconciliation?.status==='mismatch'||item.reconciliation?.status==='invalid-statement'||item.reconciliation?.status==='invalid-statement-date').length;
    const reference=document.getElementById('ownerPeriodReference')?.value||iso(new Date()),bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',reference,document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),liquidity=Number(core.rubles(org?walletMoney.byOrg[org]||0n:walletMoney.total)),financial=core.ownerPeriodSnapshot(wipData,bounds,org),vatControl=core.vatControlRegister({deals,realizations,expenses,costs},{org,from:bounds.from,to:bounds.to}),taxes=core.quarterTaxSnapshot(wipData,document.getElementById('uxTaxReference')?.value||iso(new Date())),operating=Number(core.rubles(financial.result)),cashSummary=periodCashSummary(db,{...bounds,previousBounds:comparisonBounds(bounds,document.getElementById('ownerPeriodMode')?.value||'month')},org),net=Number(core.rubles(cashSummary.net)),previousNet=cashSummary.previous?Number(core.rubles(cashSummary.previous.net)):0,obligations=Number(core.rubles(forecast.obligations30)),scopedWallets=(db.wallets||[]).filter(item=>matchesOrg(item,org)),walletSetupComplete=wallets.length>0&&wallets.length===scopedWallets.length&&scopedWallets.every(item=>validWalletDate(item.openingBalanceDate)&&validWalletDate(item.bankStatementDate)),quality={uncategorized,unverified,brokenTransfers,uncertain,unreconciled,mismatched,vatUnconfirmed:vatControl.count,staffMissingHire,staffMissingLeaveNorm,cashCertified:unverified===0&&unreconciled===0&&walletSetupComplete};
    const attention=uncategorized+unverified+brokenTransfers+uncertain+unreconciled+vatControl.count+staffMissingHire+staffMissingLeaveNorm+payments30.filter(item=>item.days<=5).length+(liquidity<obligations?1:0)+projects.filter(item=>item.result<0&&item.realized>0).length;
    const previousFinancial=cashSummary.previous?core.ownerPeriodSnapshot(wipData,{from:cashSummary.previous.from,to:cashSummary.previous.to},org):null,earningsFlow=months.map(month=>{const monthBounds=core.ownerPeriodBounds('month',month.key+'-01'),x=core.ownerPeriodSnapshot(wipData,{...monthBounds,to:chartBounds.to&&chartBounds.to<monthBounds.to?chartBounds.to:monthBounds.to},org);return {label:month.label,income:Number(core.rubles(x.revenue)),outcome:Number(core.rubles(x.revenue-x.result+x.categories.belowIncome)),net:Number(core.rubles(x.result))}}),planFact=calendarPlanFact(db,bounds,org);
    return {org,cashSummary,financial,previousFinancial,earningsFlow,planFact,bounds,taxes,forecast,liquidityCents:org?walletMoney.byOrg[org]||0n:walletMoney.total,stock:core.ownerWarehouseSnapshot(warehouseState,fifo,org),plans:window.ArbatExperience.plans(db,org),months,flow,directions,projects,wallets,calendar,payments30,portfolio:{contract,realized,remaining,count:deals.length},quality,totals:{liquidity,operating,net,previousNet,obligations,attention}};
  }
  window.arbatDashboardSnapshot=snapshot;

  let activeChart='cash',latestDashboard=null;
  function ensure(){
    const overview=document.getElementById('overview');if(!overview)return null;
    let root=document.getElementById('dashboardVisuals');if(root)return root;
    root=document.createElement('div');root.id='dashboardVisuals';root.className='dashboard-visuals dashboard-decision-workspace';
    const panel=(className,title,id,action='')=>'<article class="dashboard-panel '+className+'"><div class="dashboard-panel-head"><h2>'+title+'</h2>'+action+'</div><div id="'+id+'"></div></article>';
    const route=(name,label)=>'<button type="button" class="dashboard-link" data-dashboard-route="'+name+'">'+label+' →</button>';
    root.innerHTML='<section class="dashboard-command"><div><h2 id="dashboardOwnerTitle">Финансовое состояние бизнеса</h2><p id="dashboardNarrative"></p></div><div class="dashboard-command-meta"><span id="dashboardStatus" class="dashboard-status"></span><small id="dashboardUpdated"></small></div></section><div id="dashboardKpis"><div class="dashboard-priority-grid"><div id="dashboardPriorityKpis" class="dashboard-kpis"></div><article id="dashboardPeriodSummary" class="dashboard-kpi dashboard-period-summary"></article></div><div class="dashboard-decision-main"><article class="dashboard-panel dashboard-flow-panel"><div class="dashboard-panel-head"><div><h2 id="dashboardDynamicsTitle">Динамика денег</h2><small id="dashboardDynamicsPeriod" class="dashboard-subtitle"></small></div><div class="dashboard-chart-switch" role="group" aria-label="Показатель динамики"><button type="button" data-dashboard-chart="cash" aria-pressed="true">ДДС</button><button type="button" data-dashboard-chart="earnings" aria-pressed="false">Прибыль и выручка</button></div></div><div id="dashboardChartLegend" class="dashboard-legend"><span><i class="legend-in"></i>Поступления</span><span><i class="legend-out"></i>Платежи</span><span><i class="legend-net"></i>Чистый поток</span></div><div id="dashboardCashFlow" class="dashboard-chart"></div></article><article class="dashboard-panel dashboard-attention-panel"><div class="dashboard-panel-head"><h2>Ближайшие решения <span id="dashboardAttentionCount" class="dashboard-count"></span></h2>'+route('calendar','Календарь')+'</div><div id="dashboardForecast"></div><div id="dashboardAttention"></div></article></div></div><div class="dashboard-detail-navigation" role="tablist" aria-label="Подробная аналитика">'+[['performance','Результат'],['cash','Деньги и планы'],['projects','Проекты'],['control','Контроль']].map(([id,label],i)=>'<button type="button" id="dashboardTab-'+id+'" role="tab" aria-controls="dashboardAnalysis" aria-selected="'+(!i)+'" tabindex="'+(i?-1:0)+'" data-dashboard-view="'+id+'">'+label+'</button>').join('')+'</div><div id="dashboardAnalysis" role="tabpanel" aria-labelledby="dashboardTab-performance" tabindex="0"><div class="dashboard-layout">'+panel('dashboard-finance-panel','Финансовый результат','dashboardFinancial','<span class="dashboard-period"></span>')+panel('dashboard-spend-panel','Состав расходов','dashboardSpending')+panel('dashboard-direction-panel','Результат по направлениям','dashboardDirections')+panel('dashboard-planfact-panel','План и факт ДДС','dashboardPlanFact',route('calendar','Планы календаря'))+panel('dashboard-wallet-panel','Счета и кассы','dashboardWallets')+panel('dashboard-project-panel','Проекты под контролем','dashboardProjects',route('deals','Все проекты'))+panel('dashboard-sales-panel','Продажи и сделки','dashboardSales',route('deals','Все сделки'))+panel('dashboard-tax-panel','Налоги и проверка расчёта','dashboardTaxes','<span id="dashboardTaxPeriod" class="dashboard-period"></span>')+panel('dashboard-warehouse-panel','Склад и материалы','dashboardWarehouse',route('materials:movement','На склад'))+panel('dashboard-events-panel','История действий','dashboardEvents',route('profile','Открыть'))+'</div></div>';
    overview.prepend(root);
    const groups={performance:['finance','spend','direction'],cash:['planfact','wallet'],projects:['project','sales'],control:['tax','warehouse','events']};
    function selectView(value,focus=false){
      if(!groups[value])value='performance';
      for(const button of root.querySelectorAll('[data-dashboard-view]')){const selected=button.dataset.dashboardView===value;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected&&focus)button.focus({preventScroll:true})}
      root.querySelector('#dashboardAnalysis').setAttribute('aria-labelledby','dashboardTab-'+value);
      for(const [group,classes] of Object.entries(groups))for(const name of classes)root.querySelector('.dashboard-'+name+'-panel').hidden=group!==value;
      try{sessionStorage.setItem('arbat-dashboard-view',value)}catch{}
    }
    let saved='performance';try{saved=sessionStorage.getItem('arbat-dashboard-view')||saved}catch{}selectView(saved);
    root.addEventListener('click',event=>{const button=event.target.closest('[data-dashboard-route],[data-dashboard-view],[data-dashboard-chart]');if(!button)return;
      if(button.dataset.dashboardView){selectView(button.dataset.dashboardView);return}
      if(button.dataset.dashboardChart){activeChart=button.dataset.dashboardChart;if(latestDashboard)cashChart(latestDashboard);return}
      if(button.dataset.dashboardRoute==='payables')window.arbatOpenPayables?.();else window.arbatNavigate?.(button.dataset.dashboardRoute);
    });
    root.querySelector('[role="tablist"]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...root.querySelectorAll('[data-dashboard-view]')],index=tabs.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectView(tabs[next].dataset.dashboardView,true)});
    return root;
  }
  function kpis(data){
    const target=document.getElementById('dashboardPriorityKpis');if(!target)return;const x=data.financial,p=data.previousFinancial;
    const card=(id,label,value,note,sub,action,tone='')=>'<article class="dashboard-kpi '+tone+'" data-dashboard-priority="'+id+'" data-value="'+value+'"><div class="dashboard-kpi-top"><span>'+label+'</span><small>'+ (id==='money'?'Сейчас':'За период')+'</small></div><button type="button" class="ux-value" '+action+' aria-label="'+esc(label+': '+exactRub(value)+'. Открыть расшифровку')+'">'+exactRub(value)+'</button><small class="dashboard-comparison">'+esc(note)+'</small>'+sub+'</article>';
    target.innerHTML=card('money','Деньги на счетах',data.liquidityCents,data.quality.cashCertified?'Сверено с выписками':'Расчётно — требуется сверка','<p class="dashboard-metric-context">Остаток сегодня. Поступления за период и заработанная прибыль показаны отдельно.</p><button type="button" class="dashboard-wallet-order dashboard-link" data-wallet-order>Порядок счетов</button>','data-ux-wallets',data.totals.liquidity<0?'bad':'')+card('result','Управленческий результат',x.result,comparisonNote(x.result,p?.result),'<dl class="dashboard-cash-totals"><div><dt>Выручка по реализации</dt><dd>'+exactRub(x.revenue)+'</dd></div><div><dt>Рентабельность</dt><dd>'+(x.revenue!==0n?percent(Number(x.result)/Number(x.revenue)*100):'Нет базы')+'</dd></div></dl><small class="dashboard-result-status">'+(x.issues.length?'Предварительно · замечаний: '+x.issues.length:'Доходы и расходы по начислению')+'</small>','data-ux-metric="result"',x.result<0n?'bad':'');
    const forecast=document.getElementById('dashboardForecast'),p7=data.forecast,complete=p7.forecastComplete&&data.quality.cashCertified,free=data.liquidityCents-p7.obligations7+p7.income.due7;
    const metric=(label,value,action)=>'<div><small>'+label+'</small><button type="button" class="ux-value" data-ux-plan="'+action+'">'+value+'</button></div>';
    forecast.innerHTML='<div class="dashboard-forecast-values">'+metric('Поступления · 7 дней',exactRub(p7.income.due7),'income')+metric('Платежи · 7 дней',exactRub(p7.obligations7),'outcome')+metric('После планов · 7 дней',complete?exactRub(free):'Не определён','forecast')+'</div><p class="dashboard-forecast-note">'+(complete?'По внесённым срокам, включая просроченные платежи.':'Прогноз неполный — уточните сроки и сверку.')+'</p><div id="supplierObligations" class="dashboard-supplier-status"><button type="button" class="dashboard-link" data-pay-dashboard data-dashboard-route="payables">Поставщикам: '+(p7.supplier.review?'Требует сверки · подтверждено ':'')+exactRub(p7.supplier.total)+' →</button>'+(p7.combined.overdue>0n?'<button type="button" class="dashboard-link" data-ux-plan="overdue">Просрочено '+exactRub(p7.combined.overdue)+'</button>':'')+'</div>';
  }

  function narrative(data){
    const target=document.getElementById('dashboardNarrative'),status=document.getElementById('dashboardStatus');if(!target||!status)return;
    let text='Внесённые обязательства на 30 дней покрываются денежным остатком.',tone='good',label='По внесённым данным';
    if(!data.forecast.forecastComplete){text='Прогноз неполный: у части обязательств не указан срок или требуется сверка. Свободный остаток пока не определён.';tone='warn';label='Прогноз неполный'}
    else if(data.financial.issues.length){text='Финансовый результат предварительный: исходные документы или признание затрат требуют проверки.';tone='warn';label='Результат требует сверки'}
    else if(!data.quality.cashCertified){text='Денежный остаток является расчётным: не все кошельки подтверждены начальной датой и банковской выпиской.';tone='warn';label='Деньги не сверены'}
    else if(data.quality.vatUnconfirmed){text='Выручка и прибыль рассчитаны с историческими допущениями: в части документов не зафиксирована ставка НДС.';tone='warn';label='НДС требует сверки'}
    else if(!data.portfolio.count&&!data.flow.some(item=>item.income||item.outcome||item.net)){text='Для управленческой картины пока недостаточно данных. Добавьте сделки, операции ДДС и обязательства.';tone='neutral';label='Недостаточно данных'}
    else if(data.totals.liquidity<data.totals.obligations){text='Ликвидности недостаточно для внесённых обязательств на 30 дней. Нужен план поступлений или перенос платежей.';tone='bad';label='Дефицит денег'}
    else if(data.totals.operating<0){text='Операционный результат отрицательный. Ниже показаны направления и проекты, требующие решения.';tone='bad';label='Требуется решение'}
    else if(data.totals.net<0){text='За выбранный период внесён отрицательный денежный поток, ближайшие обязательства покрыты ликвидностью.';tone='warn';label='Контроль потока'}
    else if(data.totals.attention){text='Есть отклонения и ближайшие контрольные точки, требующие проверки.';tone='warn';label='Есть отклонения'}
    target.textContent=text;status.className='dashboard-status '+tone;status.textContent=label;
    document.getElementById('dashboardUpdated').textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  let displayedCashFlow=null;
  function cashChart(data){
    const target=document.getElementById('dashboardCashFlow');if(!target)return;
    if(data.financial)latestDashboard=data;const earnings=activeChart==='earnings',flow=earnings?(data.earningsFlow||displayedCashFlow?.earningsFlow||[]):(data.flow||displayedCashFlow?.flow||[]);displayedCashFlow=data;const labels=earnings?['Выручка','Признанные расходы','Управленческий результат']:['Поступления','Платежи','Чистый поток'];
    document.querySelectorAll('[data-dashboard-chart]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dashboardChart===activeChart)));
    document.getElementById('dashboardDynamicsTitle').textContent=earnings?'Динамика результата':'Динамика денег';document.getElementById('dashboardDynamicsPeriod').textContent=(data.months||latestDashboard?.months||[]).map(x=>x.key).filter((_,i,a)=>i===0||i===a.length-1).join(' — ')+(data.bounds?.to&&data.bounds.to!==window.ArbatFinanceCore.ownerPeriodBounds('month',data.bounds.to).to?' · по '+data.bounds.to:'');const chartNote=document.querySelector('.dashboard-flow-panel>.ux-help');if(chartNote)chartNote.textContent=earnings?'Выручка по реализации; расходы с учётом НЗП. Результат также включает прочие доходы.':'Фактические поступления и платежи за указанные 6 месяцев. Внутренние переводы исключены.';document.getElementById('dashboardChartLegend').innerHTML=labels.map((label,i)=>'<span><i class="legend-'+['in','out','net'][i]+'"></i>'+label+'</span>').join('');
    const maximum=Math.max(1,...flow.flatMap(x=>[Math.abs(x.income),Math.abs(x.outcome),Math.abs(x.net??x.income-x.outcome)]));
    if(!flow.some(item=>item.income||item.outcome||item.net)){target.innerHTML='<div class="dashboard-empty ft-chart-empty">'+(earnings?'Нет реализаций и признанных расходов за эти 6 месяцев.':'Нет движения денег за последние 6 месяцев.')+'</div>';return}
    // Only geometry uses the existing snapshot numbers; financial values are never read back from the SVG.
    const width=Math.max(260,Math.round(target.getBoundingClientRect().width||560)),zero=120,half=84,left=48,right=10,step=(width-left-right)/Math.max(1,flow.length),bar=Math.min(22,step*.28);
    let points=[],groups=[],svg='<svg class="ft-cash-chart" viewBox="0 0 '+width+' 244" role="group" aria-label="'+(earnings?'Выручка, признанные расходы и управленческий результат за 6 месяцев.':'Движение денег за последние 6 месяцев. Поступления, платежи и чистый поток.')+'">';
    for(let level=-1;level<=1;level++){const y=zero-level*half;svg+='<line class="'+(level===0?'axis':'grid')+'" x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'"/><text class="ft-chart-axis-label" x="'+(left-7)+'" y="'+(y+4)+'" text-anchor="end">'+esc(new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(maximum*level))+'</text>'}
    flow.forEach((item,index)=>{
      const x=left+step*(index+.5),income=half*item.income/maximum,outcome=half*item.outcome/maximum,net=item.net??item.income-item.outcome,netY=zero-net/maximum*half;
      points.push(x+','+netY);
      const label=item.label+'\n'+labels[0]+': '+rub(item.income)+'\n'+labels[1]+': '+rub(item.outcome)+'\n'+labels[2]+': '+rub(net);
      groups.push('<g class="ft-chart-point" tabindex="0" role="img" aria-label="'+esc(label.replace(/\n/g,'. '))+'" data-chart-tooltip="'+esc(label)+'" data-chart-month="'+index+'" data-chart-income="'+item.income+'" data-chart-outcome="'+item.outcome+'" data-chart-net="'+net+'"><rect class="ft-chart-hit" x="'+(left+step*index)+'" y="24" width="'+step+'" height="205" rx="5"/><rect x="'+(x-bar-2)+'" y="'+Math.min(zero,zero-income)+'" width="'+bar+'" height="'+Math.abs(income)+'" rx="2" class="cash-in"/><rect x="'+(x+2)+'" y="'+Math.min(zero,zero-outcome)+'" width="'+bar+'" height="'+Math.abs(outcome)+'" rx="2" class="cash-out"/><circle cx="'+x+'" cy="'+netY+'" r="3.5" class="net-dot"/><text x="'+x+'" y="232" text-anchor="middle">'+esc(item.label)+'</text></g>');
    });
    if(points.length>1)svg+='<polyline points="'+points.join(' ')+'" class="net-line"/>';
    const values='<details class="ft-chart-data"><summary>Данные графика</summary><div class="ft-chart-data-scroll"><table><caption>'+esc(earnings?'Выручка и результат за 6 месяцев':'Движение денег за последние 6 месяцев')+'</caption><thead><tr><th>Месяц</th><th>'+labels[0]+'</th><th>'+labels[1]+'</th><th>'+labels[2]+'</th></tr></thead><tbody>'+flow.map(item=>'<tr><th scope="row">'+esc(item.label)+'</th><td>'+rub(item.income)+'</td><td>'+rub(item.outcome)+'</td><td>'+rub(item.net??item.income-item.outcome)+'</td></tr>').join('')+'</tbody></table></div></details>';
    target.innerHTML=svg+groups.join('')+'</svg>'+values;
  }
  function attention(data){
    const target=document.getElementById('dashboardAttention');if(!target)return;const issues=[];
    if(data.totals.liquidity<data.totals.obligations)issues.push(['bad','Дефицит ликвидности','Не хватает '+rub(data.totals.obligations-data.totals.liquidity)+' на обязательства 30 дней','calendar']);
    if(data.forecast.supplier.undatedCount)issues.push(['warn','Обязательства без срока',exactRub(data.forecast.supplier.undated)+' — укажите условия оплаты','payables']);
    if(data.forecast.review.length)issues.push(['warn','Обязательства требуют сверки',data.forecast.review.length+' записей — прогноз неполный','calendar']);
    if(data.forecast.manual.undatedCount||data.forecast.income.undatedCount)issues.push(['warn','В календаре не уточнены даты','Прогноз неполный — проверьте записи','calendar']);
    if(data.financial.issues.length)issues.push(['warn','Финансовый результат требует проверки',data.financial.issues.length+' замечаний к документам и НЗП','reports:pnl']);
    const soon=data.calendar.filter(item=>item.days<=5);if(soon.length)issues.push(['warn','Платежи в ближайшие 5 дней',soon.length+' шт. на '+exactRub(soon.reduce((v,x)=>v+x.amount,0n)),'calendar']);
    if(data.quality.uncategorized)issues.push(['bad','ДДС без статьи',data.quality.uncategorized+' операций требуют классификации','cash']);
    if(data.quality.brokenTransfers)issues.push(['bad','Незавершённые переводы',data.quality.brokenTransfers+' операций без получателя','cash']);
    if(data.quality.uncertain)issues.push(['warn','Расходы требуют оценки',data.quality.uncertain+' складских позиций','materials:movement']);
    if(data.quality.unverified)issues.push(['bad','Кошельки не классифицированы',data.quality.unverified+' кошельков не включены в остаток','settings']);
    if(data.quality.unreconciled)issues.push([data.quality.mismatched?'bad':'warn','Денежные остатки не подтверждены',data.quality.unreconciled+' кошельков без успешной банковской сверки','settings']);
    if(data.quality.vatUnconfirmed)issues.push(['bad','НДС документов не подтверждён',data.quality.vatUnconfirmed+' документов без явно заданной ставки НДС','reports']);
    if(data.quality.staffMissingHire||data.quality.staffMissingLeaveNorm)issues.push(['bad','Отпуска нельзя подтвердить',(data.quality.staffMissingHire?data.quality.staffMissingHire+' сотрудников без даты приёма':'')+(data.quality.staffMissingHire&&data.quality.staffMissingLeaveNorm?'; ':'')+(data.quality.staffMissingLeaveNorm?data.quality.staffMissingLeaveNorm+' без нормы отпуска':''),'labor']);
    const loss=data.projects.filter(item=>item.result<0&&item.realized>0);if(loss.length)issues.push(['bad','Убыточные проекты',loss.length+' проектов с отрицательным фактом','deals']);
    document.getElementById('dashboardAttentionCount').textContent=issues.length?issues.length:'0';
    target.innerHTML=issues.length?'<div class="dashboard-attention-list">'+issues.map((item,index)=>(index===3?'<details class="dashboard-other-risks"><summary>Ещё '+(issues.length-3)+' проверок</summary>':'')+'<button type="button" data-dashboard-route="'+item[3]+'" class="dashboard-attention '+item[0]+'"><i></i><span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></span><b>›</b></button>').join('')+(issues.length>3?'</details>':'')+'</div>':'<div class="dashboard-all-good"><span>✓</span><strong>Автоматические проверки без замечаний</strong><small>Проверка охватывает внесённые документы; полноту первичных данных нужно сверять.</small></div>';
  }
  function directions(data){
    const target=document.getElementById('dashboardDirections');if(!target)return;const active=data.directions.filter(item=>item.revenue||item.cost).sort((a,b)=>b.revenue-a.revenue);
    if(!active.length){target.innerHTML='<div class="dashboard-empty">Добавьте реализации и расходы — здесь появится сравнение направлений.</div>';return}
    const max=Math.max(1,...active.flatMap(item=>[Math.abs(item.revenue),Math.abs(item.cost)]));target.innerHTML='<div class="dashboard-direction-table"><div class="dashboard-direction-row head"><span>Направление</span><span>Выручка</span><span>Затраты</span><span>Результат</span><span>Маржа</span></div>'+active.map(item=>'<div class="dashboard-direction-row" tabindex="0" data-chart-tooltip="'+esc(item.name+'\nВыручка: '+rub(item.revenue)+'\nЗатраты: '+rub(item.cost)+'\nРезультат: '+rub(item.result))+'"><span class="direction-name" title="'+esc(item.name)+'">'+esc(item.name)+'<i><b style="width:'+Math.max(0,Math.min(100,item.revenue/max*100))+'%"></b></i></span><span>'+rub(item.revenue)+'</span><span>'+rub(item.cost)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+rub(item.result)+'</strong><em class="'+(item.margin<0?'dashboard-negative':'')+'">'+percent(item.margin)+'</em></div>').join('')+'</div>';
  }
  function wallets(data){
    const target=document.getElementById('dashboardWallets');if(!target)return;const rows=window.arbatOrderedWallets?window.arbatOrderedWallets(data.wallets):[...data.wallets];
    if(!rows.length){target.innerHTML='<div class="dashboard-empty">Добавьте и подтвердите счёт или кассу — здесь появится остаток.</div>';return}
    target.innerHTML='<div class="dashboard-wallet-balances">'+rows.map(item=>{const status=item.reconciliation?.status==='matched'?'Сверено':item.reconciliation?.status==='mismatch'?'Есть расхождение':'Нужна сверка';return '<div class="dashboard-wallet-balance"><span><button type="button" class="ux-text-link" data-ux-source="wallets" data-ux-id="'+esc(item.walletId)+'">'+esc(item.name)+'</button><small>'+esc(item.org+' · '+item.kind+' · '+status)+'</small></span><b class="'+(item.balance<0?'dashboard-negative':'')+'">'+rub(item.balance)+'</b></div>'}).join('')+'</div>';
  }
  function taxes(data){
    const target=document.getElementById('dashboardTaxes'),period=document.getElementById('dashboardTaxPeriod');if(!target)return;
    const tax=data.taxes,air=tax.air,arbat=tax.arbat,threshold=air.vatThreshold;
    if(period)period.textContent='НДС: '+tax.bounds.label;
    const item=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+exactRub(value)+'</dd></div>';
    const total=(scope,label,value,ready)=>'<div class="dashboard-tax-due" data-tax-total="'+scope+'"><small>'+esc(label)+'</small><strong>'+exactRub(value)+'</strong><small class="dashboard-tax-status" data-tax-completeness>'+ (ready?'По внесённым данным':'Расчёт неполный · Требует проверки')+'</small></div>';
    const group=(scope,label,html)=>'<details class="dashboard-tax-details" data-tax-scope="'+scope+'"><summary>'+esc(label)+'</summary><dl>'+html+'</dl><p>Расчётная величина по внесённым данным; не сумма к перечислению.</p></details>';
    const range=tax.yearBounds.from+' — '+tax.yearBounds.to;
    const thresholdText=threshold.limit===null?'Лимит этого года требует проверки.':('Доходы для контроля НДС на '+threshold.asOf+': '+exactRub(threshold.observedIncome)+' из '+exactRub(threshold.limit)+'. '+(threshold.effectiveFrom?'По внесённым данным НДС возникает с '+threshold.effectiveFrom+'. Подтвердите режим и ставку.':'Превышение по внесённым данным не найдено. Это не подтверждение полноты доходов.')+' Доходы предыдущего года в системе: '+exactRub(threshold.previousIncome)+'.');
    target.innerHTML='<p class="ux-help">УСН и прибыль: с начала года по '+esc(tax.yearBounds.to)+'. НДС: выбранный квартал. Суммы по обработанным документам — не подтверждённое обязательство и не сумма к перечислению. Замечания показаны отдельно; после их разбора расчёт может измениться.</p><div class="dashboard-tax-grid"><div class="dashboard-tax-company"><div class="dashboard-tax-title"><span>АИР-КЛИМАТ</span><small>УСН «доходы минус расходы» · 15%</small></div>'+total('usn','Расчёт УСН с начала года',air.accrued,air.ready)+group('usn','Доходы, расходы и минимальный налог',item('Доходы с начала года',air.income)+item('Подтверждённые расходы',air.expenses)+item('База УСН',air.base)+item('Расчёт по ставке 15%',air.regularTax)+item(air.minimumApplicable?'Минимальный налог за год · 1%':'Справочно: 1% доходов; применяется только по итогам года',air.minimumTax)+item('Расчёт УСН до зачёта авансов',air.accrued))+'<details class="dashboard-tax-details"><summary>Лимит и режим НДС</summary><p data-tax-threshold>'+esc(thresholdText)+'</p><p>Право на освобождение проверяется для выбранного года. При возникновении обязанности возможна ставка 5% при соблюдении условий; выбор и дата подтверждаются отдельно.</p></details></div><div class="dashboard-tax-company"><div class="dashboard-tax-title"><span>АРБАТ.ГК</span><small>ОСНО · основной НДС 22% · прибыль 25%</small></div>'+total('vat','Разница НДС за квартал',arbat.outputVat-arbat.inputVat,arbat.vatReady)+group('vat','Начисления и подтверждённые вычеты',item('Исходящий НДС',arbat.outputVat)+item('Подтверждённый входящий НДС',arbat.inputVat)+item('Расчётная разница',arbat.outputVat-arbat.inputVat))+total('profit','Расчёт налога на прибыль с начала года',arbat.profitTax,arbat.profitReady)+group('profit','Налоговые доходы и расходы',item('Доходы без НДС',arbat.profitRevenue)+item('Подтверждённые налоговые расходы',arbat.profitExpenses)+item('База по прибыли',arbat.profitBase)+item('Расчёт по ставке 25%',arbat.profitTax))+'<p>Период прибыли: '+esc(range)+'. Отрицательная разница НДС сама по себе не подтверждает возмещение.</p></div></div><p data-tax-review-count>Замечаний к данным: '+tax.issues.length+'. <button type="button" class="ux-text-link" data-ux-tax>Открыть расчёт и причины →</button></p><p class="ux-help">Подтверждение налоговых расходов, авансы НДС, перенос убытков и складской налоговый регистр требуют завершения. Нулевая сумма по подтверждённым строкам не означает отсутствие налога.</p>';
  }
  function projects(data){
    const target=document.getElementById('dashboardProjects');if(!target)return;
    const count=document.getElementById('dashboardProjectCount');if(count)count.textContent=data.projects.length;
    if(!data.projects.length){target.innerHTML='<div class="dashboard-empty">Создайте первую сделку — портфель появится здесь.</div>';return}
    const deals=db.deals||[];
    const projectLabels={planned:'Планируется',active:'В работе',paused:'Приостановлен',completed:'Завершён'};
    const rows=[...data.projects].sort((a,b)=>(a.result<0?0:1)-(b.result<0?0:1)||b.remaining-a.remaining).slice(0,6);
    const field=(label,value)=>'<dl class="dashboard-project-field"><dt>'+esc(label)+'</dt><dd>'+value+'</dd></dl>';
    target.innerHTML='<div class="dashboard-project-table executive-project-table"><div class="dashboard-project-row head"><span>Проект</span><span>Договор</span><span>План затрат</span><span>Расходы: начислено / признано</span><span>НЗП</span><span>Реализация</span><span>Прибыль</span><span>Маржа</span><span>Статус</span></div>'+rows.map(item=>{
      const deal=deals.find(d=>projectKey(d)===item.key),plan=Number(deal?.cost??deal?.directCostPlan??deal?.plannedDirectCosts??deal?.planCosts??NaN);
      const known=Number.isFinite(plan),left=plan-item.cost,margin=item.revenue?item.result/item.revenue*100:NaN;
      return '<div class="dashboard-project-row"><span class="project-name" title="'+esc(item.name)+'"><button type="button" class="ux-text-link" data-ux-project="'+esc(deal?._id||'')+'">'+esc(item.name)+'</button><small>'+esc(item.org||'')+'</small></span>'+field('Договор',rub(item.contract))+field('План затрат',known?rub(plan)+'<small>остаток '+rub(left)+'</small>':'—')+field('Расходы: начислено / признано','<strong>'+rub(item.cost)+'</strong><small>признано '+(item.recognizedCost===null?'—':rub(item.recognizedCost))+'</small>')+field('НЗП',item.wipCost===null?'—':rub(item.wipCost))+field('Реализация',rub(item.realized))+field('Прибыль','<strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+(item.reviewRequired?'Требует проверки':rub(item.result))+'</strong>')+field('Маржа',item.reviewRequired?'—':percent(margin))+field('Статус','<span class="executive-project-status '+(item.result<0?'risk':'normal')+'">'+esc(projectLabels[deal?.projectStatus]||'Не указан')+'</span>')+'</div>'
    }).join('')+'</div>';
  }
  function calendar(data){
    const target=document.getElementById('dashboardCalendar');if(!target)return;const rows=data.payments30.slice(0,6);
    if(!rows.length){target.innerHTML='<div class="dashboard-all-good compact"><span>✓</span><strong>Нет платежей с известным сроком на 30 дней</strong><small>Проверьте обязательства без даты и документы на сверке.</small></div>';return}
    target.innerHTML='<div class="dashboard-calendar-list">'+rows.map(item=>'<div class="dashboard-calendar-item"><span class="dashboard-date"><strong>'+new Date(item.occurrence+'T12:00:00').getDate()+'</strong><small>'+new Date(item.occurrence+'T12:00:00').toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+'</small></span><span class="dashboard-payment"><strong title="'+esc(item.name)+'">'+esc(item.name)+'</strong><small title="'+esc(item.payee||item.org)+'">'+esc(item.payee||item.org)+'</small></span><b>'+exactRub(item.amount)+'</b></div>').join('')+'</div>';
  }
  function executiveExtras(data){
    const title=document.querySelector('.dashboard-finance-panel .dashboard-period');if(title)title.textContent=data.bounds.label;
    const currentMonth=data.bounds?.from?.slice(0,7)||'';
    const current=data.cashSummary;
    const core=window.ArbatFinanceCore,revenue=Number(core.rubles(data.financial.revenue)),direct=Number(core.rubles(data.financial.categories.direct-data.financial.deferredChange));
    const financialRows=x=>[['Реализация',x.revenue,'revenue'],['Признанные прямые затраты',x.categories.direct-x.deferredChange,'direct'],['Валовый результат',x.grossProfit,'gross'],['Общепроизводственные расходы',x.categories.production,'production'],['EBITDA',x.ebitda,'ebitda'],['Налог на доход (прибыль)',x.rows.some(r=>r.kind==='management-tax')?x.incomeTax:null,'taxPnl'],['Управленческий результат',x.result,'result']];
    const rows=financialRows(data.financial),previous=data.previousFinancial?financialRows(data.previousFinancial):null,fin=document.getElementById('dashboardFinancial');
    if(fin)fin.innerHTML='<p class="dashboard-comparison-scope">'+(data.cashSummary.previous?'Сравнение с '+esc(data.cashSummary.previous.from+' — '+data.cashSummary.previous.to):'За всё время · предыдущий период не выбран')+'</p><div class="dashboard-financial-scroll"><table class="dashboard-financial-comparison"><thead><tr><th>Показатель</th><th>Факт</th><th>Предыдущий</th><th>Изменение</th></tr></thead><tbody>'+rows.map(([label,value,metric],i)=>{const prior=previous?.[i][1],delta=value!==null&&prior!==null&&prior!==undefined?value-prior:null;return '<tr><th scope="row">'+esc(label)+'</th><td><button type="button" data-ux-metric="'+metric+'" class="ux-value '+(value<0n?'dashboard-negative':'')+'">'+(value===null?'Не внесено':exactRub(value))+'</button></td><td>'+(prior===null||prior===undefined?'—':exactRub(prior))+'</td><td>'+(delta===null?'—':(delta>0n?'+':'')+exactRub(delta))+'</td></tr>'}).join('')+'</tbody></table></div><p class="executive-note">Источник: реализации и начисленные расходы с изменением НЗП. План прибыли не задан; бюджеты проектов доступны во вкладке «Проекты».</p>';
    if(fin&&data.financial.issues.length)fin.insertAdjacentHTML('afterbegin','<p class="pay-notice">Предварительный результат: '+data.financial.issues.length+' замечаний к документам и признанию затрат. Проверьте источники показателей.</p>');
    const plan=document.getElementById('dashboardPlanFact');
    if(plan){const x=data.planFact,rows=[['Поступления',x.income,data.cashSummary.income],['Платежи',x.outgoing,data.cashSummary.outgoing]];plan.innerHTML='<p class="ux-help">Активные самостоятельные планы календаря за выбранный период и факт ДДС. Это не утверждённый бюджет. Связанные обязательства поставщиков проверяются отдельно; факт не закрывает план автоматически.</p><div class="dashboard-financial-scroll"><table class="dashboard-financial-comparison"><thead><tr><th>Показатель</th><th>План</th><th>Факт</th><th>Исполнение</th></tr></thead><tbody>'+rows.map(([label,budget,actual],index)=>{const incomplete=x.issues.some(rule=>isCalendarIncome(rule)===(index===0));return '<tr><th scope="row">'+label+'</th><td>'+(budget===null?'План не задан':exactRub(budget))+'</td><td>'+exactRub(actual)+'</td><td>'+(budget===null?'—':incomplete?'План неполный':budget===0n?'Нет базы для процента':percent(Number(actual)/Number(budget)*100))+(budget!==null?'<small>Отклонение '+(actual-budget>0n?'+':'')+exactRub(actual-budget)+'</small>':'')+'</td></tr>'}).join('')+'</tbody></table></div>'+(x.issues.length?'<p class="pay-notice">Не включены планы без корректной суммы или даты: '+x.issues.length+'. Уточните источники.</p>':'')+'<details class="dashboard-plan-sources"><summary>Источники планов · '+x.rows.length+'</summary>'+x.rows.map(row=>'<p><button type="button" class="ux-text-link" data-ux-source="calendar" data-ux-id="'+esc(row.rule.id||row.rule._id)+'">'+esc(row.rule.name||'План календаря')+'</button><small>'+esc(row.date)+' · '+exactRub(row.amount)+'</small></p>').join('')+'</details>'}
    const spends=data.financial.rows.filter(x=>x.category!=='belowIncome');
    const groups=new Map();
    const categoryNames={direct:'Прямые расходы',production:'Производственные расходы',administrative:'Административные расходы',commercial:'Коммерческие расходы',belowIncome:'Прочие доходы',belowExpenses:'Расходы ниже операционного результата'};
    for(const x of spends){const key=categoryNames[x.category]||String(x.category||'Без категории');groups.set(key,(groups.get(key)||0)+Number(core.rubles(x.amount)))}
    const total=spends.reduce((v,x)=>v+Number(core.rubles(x.amount)),0),top=[...groups].sort((a,b)=>b[1]-a[1]),spend=document.getElementById('dashboardSpending');
    const hasNegative=top.some(([,value])=>value<0),canDraw=total>0&&!hasNegative;
    let offset=0;
    const segments=canDraw?top.filter(([,value])=>value>0).map(([name,value],i)=>{const share=value/total*100,from=offset;offset+=share;return '<circle class="ft-donut-segment" cx="90" cy="90" r="65" pathLength="100" fill="none" stroke="'+COLORS[i%COLORS.length]+'" stroke-width="25" stroke-dasharray="'+share+' '+(100-share)+'" stroke-dashoffset="'+(-from)+'" transform="rotate(-90 90 90)" tabindex="0" role="img" aria-label="'+esc(name+': '+rub(value)+', '+percent(share))+'" data-chart-tooltip="'+esc(name+'\n'+rub(value)+' · '+percent(share))+'"/>'}).join(''):'';
    if(spend)spend.innerHTML=top.length?'<div class="executive-spend"><div class="ft-donut-chart" data-chart-total="'+total+'"><svg viewBox="0 0 180 180" role="group" aria-label="Расходы за период: '+esc(rub(total))+'"><circle class="ft-donut-track" cx="90" cy="90" r="65" fill="none" stroke-width="25"/>'+segments+'</svg><div class="ft-donut-total"><strong>'+rub(total)+'</strong><small>Расходы за период</small></div></div><div class="executive-spend-list ft-chart-legend" role="list" aria-label="Категории расходов">'+top.map(([name,value],i)=>'<div role="listitem" tabindex="0" data-chart-value="'+value+'" data-chart-tooltip="'+esc(name+'\n'+rub(value)+(canDraw?' · '+percent(value/total*100):''))+'"><i style="background:'+COLORS[i%COLORS.length]+'"></i><span>'+esc(name)+'</span><strong>'+rub(value)+'</strong><small>'+(canDraw?percent(value/total*100):'')+'</small></div>').join('')+'</div></div>'+(hasNegative?'<p class="ux-help ft-chart-state">Есть корректировки со знаком минус — круговая диаграмма не строится. Суммы показаны в легенде.</p>':total<=0?'<p class="ux-help ft-chart-state">Итог расходов не положительный — суммы показаны в легенде.</p>':''):'<div class="dashboard-empty ft-chart-empty">Нет расходов за выбранный период.</div>';
    const sales=document.getElementById('dashboardSales'),stages=new Map();
    const stageLabels={new:'Новая',negotiations:'Переговоры',proposal:'Коммерческое предложение',contract:'Договор',realization:'Реализация',completed:'Завершена',cancelled:'Отменена'};
    for(const d of (db.deals||[]).filter(x=>matchesOrg(x,data.org))){const label=stageLabels[d.dealStage]||'Этап не указан';const v=stages.get(label)||{count:0,total:0};v.count++;v.total+=money(d.contractTotal??d.revenue);stages.set(label,v)}
    const sorted=[...stages].sort((a,b)=>b[1].total-a[1].total),max=Math.max(1,...sorted.map(x=>x[1].total));
    if(sales)sales.innerHTML=sorted.length?'<div class="executive-sales">'+sorted.slice(0,6).map(([name,v])=>'<button type="button" class="ft-sales-row" data-dashboard-route="deals" data-chart-tooltip="'+esc(name+'\nСделок: '+v.count+'\nСумма договоров: '+rub(v.total))+'"><span>'+esc(name)+'</span><strong>'+v.count+'</strong><i aria-hidden="true"><b style="width:'+Math.max(0,Math.min(100,v.total/max*100))+'%"></b></i><em>'+rub(v.total)+'</em></button>').join('')+'</div>':'<div class="dashboard-empty">Пока нет сделок.</div>';
    const wh=document.getElementById('dashboardWarehouse');
    if(wh)wh.innerHTML='<div class="executive-warehouse"><div><small>Стоимость остатков</small><button type="button" class="ux-value" data-ux-stock>'+(data.stock.totalValue===null?'Требует оценки':rub(Number(core.rubles(data.stock.totalValue))))+'</button></div><div><small>Позиции по местам хранения</small><button type="button" class="ux-value" data-ux-stock>'+data.stock.rows.filter(x=>x.qty>0).length+'</button></div><div><small>Замечания к оценке</small><strong>'+data.stock.issues.length+'</strong></div></div><div class="executive-note">Источник: движения материалов и оценка FIFO. Нажмите остаток для расшифровки.</div>';
    const ev=document.getElementById('dashboardEvents');
    if(ev)ev.innerHTML='<div class="dashboard-empty">История действий доступна в личном кабинете администратора.</div>';
  }
  function render(){
    if(typeof db==='undefined'||!ensure())return;
    // Keep the tax audit reachable even when malformed money/VAT blocks P&L.
    taxes({taxes:taxSnapshot()});let data;
    try{data=snapshot()}catch(error){
      document.getElementById('dashboardVisuals').classList.add('dashboard-calculation-error');
      document.getElementById('dashboardNarrative').textContent='Финансовая сводка требует проверки исходных документов. Откройте налоговый расчёт и замечания; предыдущие суммы скрыты.';
      return;
    }
    document.getElementById('dashboardVisuals').classList.remove('dashboard-calculation-error');
    narrative(data);periodSummary(data);kpis(data);cashChart(data);attention(data);wallets(data);projects(data);directions(data);executiveExtras(data);
  }
  window.arbatRenderDashboard=render;
  let warehouseRefreshPending=false;
  const refreshWarehouse=()=>{if(warehouseRefreshPending)return;warehouseRefreshPending=true;requestAnimationFrame(()=>{warehouseRefreshPending=false;render()})};
  window.addEventListener('arbat-warehouse-changed',refreshWarehouse);
  window.addEventListener('arbat:cloud-update',refreshWarehouse);
  const original=window.render;if(typeof original==='function')window.render=function(){
    let result;try{result=original.apply(this,arguments)}catch(error){
      render();if(!document.getElementById('dashboardVisuals')?.classList.contains('dashboard-calculation-error'))throw error;
      return;
    }
    render();return result;
  };
  document.getElementById('orgFilter')?.addEventListener('change',()=>requestAnimationFrame(render));render();
  if(typeof ResizeObserver==='function'){let width=0,frame=0;const target=document.getElementById('dashboardCashFlow');if(target)new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next&&next!==width){width=next;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(displayedCashFlow)cashChart(displayedCashFlow)})}}).observe(target)}
})();
