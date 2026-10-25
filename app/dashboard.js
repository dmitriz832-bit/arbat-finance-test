(()=>{
  const COLORS=['#168b68','#2385c7','#d88b22','#755bc2','#c85b8e','#4b8d8a','#8c6b49'];
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

  function lastMonths(count=6){
    const today=new Date(),result=[];
    for(let offset=count-1;offset>=0;offset--){const date=new Date(today.getFullYear(),today.getMonth()-offset,1);result.push({key:date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0'),label:date.toLocaleDateString('ru-RU',{month:'short'}).replace('.','')})}
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
    const org=document.getElementById('orgFilter')?.value||'',months=lastMonths(),cash=(db.cash||[]).filter(item=>matchesOrg(item,org)),deals=(db.deals||[]).filter(item=>matchesOrg(item,org)),realizations=(db.realizations||[]).filter(item=>matchesOrg(item,org)),expenses=(db.expenses||[]).filter(item=>matchesOrg(item,org)),costs=(db.costs||[]).filter(item=>matchesOrg(item,org)),labor=(db.labor||[]).filter(item=>matchesOrg(item,org)),acts=(db.workActs||[]).filter(item=>item.status==='approved'&&matchesOrg(item,org));
    const flow=months.map(month=>{const core=window.ArbatFinanceCore,result=core.cashFlow(cash,month.key,org);return {label:month.label,income:Number(core.rubles(result.income)),outcome:Number(core.rubles(result.outgoing))}});
    const names=[...new Set([...(typeof dirs!=='undefined'?dirs:[]),...deals.map(item=>item.dir).filter(Boolean)])];
    const warehouseState=(()=>{try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}})();const fifo=typeof window.arbatFifo==='function'?window.arbatFifo(warehouseState):null;const period=monthKey(iso(new Date())),wipData={...db,warehouse:warehouseState,fifo,wipAccounting:true};const directions=names.map(name=>{const core=window.ArbatFinanceCore,bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',document.getElementById('ownerPeriodReference')?.value||iso(new Date()),document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),selected=core.ownerPeriodSnapshot(wipData,bounds,org),assigned=selected.rows.filter(x=>x.dir===name),revenueDocs=selected.revenueDocuments.filter(x=>deals.some(d=>d.dir===name&&projectKey(d)===x.projectKey)),revenue=revenueDocs.reduce((v,x)=>v+core.documentPnlAmount(x),0n),cost=assigned.reduce((v,x)=>v+(x.category==='belowIncome'?-x.amount:x.amount),0n),adjustment=selected.wipBridges.flatMap(b=>b.projects).filter(p=>p.dir===name).reduce((v,p)=>v+p.deferredChange,0n),result=revenue-cost+adjustment,num=x=>Number(core.rubles(x));return {name,revenue:num(revenue),cost:num(cost-adjustment),result:num(result),margin:revenue?Number(result)/Number(revenue)*100:NaN}});
    const projects=deals.map(deal=>{const key=projectKey(deal),core=window.ArbatFinanceCore,snapshot=core.projectSnapshot(wipData,deal,key),wip=core.projectWipSnapshot(wipData,deal,key),vat=core.vatControlRegister(wipData,{projectKey:key}),gross=sum(realizations.filter(item=>item.projectKey===key)),contract=money(deal.contractTotal??deal.revenue),remaining=Math.max(0,contract-gross),revenue=Number(core.rubles(snapshot.revenue)),cost=Number(core.rubles(snapshot.cost)),recognizedCost=wip.status==='calculated'?Number(core.rubles(wip.recognizedCost+(wip.nonDirectCost||0n))):null,wipCost=wip.status==='calculated'?Number(core.rubles(wip.wip)):null,reviewRequired=snapshot.issues.length>0||wip.status!=='calculated'||vat.count>0;return {key,name:deal.name||'Без названия',org:deal.org,contract,realized:gross,revenue,cost,recognizedCost,wipCost,result:reviewRequired?null:Number(core.rubles(wip.operatingProfit)),reviewRequired,issues:[...snapshot.issues,...wip.issues,...vat.issues],remaining,progress:contract?Math.min(100,gross/contract*100):0}}).sort((a,b)=>b.remaining-a.remaining);
    const people=db.people||[],activePeople=people.filter(item=>item.workStatus!=='Не работает'),staffMissingHire=activePeople.filter(item=>!item.hireDate).length,staffMissingLeaveNorm=activePeople.filter(item=>item.annualLeaveDays===''||item.annualLeaveDays==null).length;
    const core=window.ArbatFinanceCore,walletMoney=core.walletConsolidation(db.wallets||[],db.cash||[]),wallets=walletRows(org,walletMoney),forecast=window.ArbatLiquidity.snapshot(db,warehouseState,org,iso(new Date())),calendar=forecast.rows.filter(item=>item.days!==null&&item.days>=0&&item.days<=90),payments30=forecast.rows.filter(item=>item.days!==null&&item.days<30),contract=sum(deals,deal=>money(deal.contractTotal??deal.revenue)),realized=sum(realizations),remaining=Math.max(0,contract-realized),uncategorized=cash.filter(item=>item.type!=='transfer'&&!item.articleId).length,unverified=(db.wallets||[]).filter(item=>!item.verified&&(!org||item.org===org)).length,brokenTransfers=cash.filter(item=>item.type==='transfer'&&!item.toWalletId).length,uncertain=expenses.filter(item=>item.valuationStatus==='requires-review').length,unreconciled=wallets.filter(item=>item.reconciliation?.status!=='matched').length,mismatched=wallets.filter(item=>item.reconciliation?.status==='mismatch'||item.reconciliation?.status==='invalid-statement'||item.reconciliation?.status==='invalid-statement-date').length;
    const reference=document.getElementById('ownerPeriodReference')?.value||iso(new Date()),bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',reference,document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),liquidity=Number(core.rubles(org?walletMoney.byOrg[org]||0n:walletMoney.total)),financial=core.ownerPeriodSnapshot(wipData,bounds,org),vatControl=core.vatControlRegister({deals,realizations,expenses,costs},{org,from:bounds.from,to:bounds.to}),taxes=core.quarterTaxSnapshot(wipData,document.getElementById('uxTaxReference')?.value||iso(new Date())),operating=Number(core.rubles(financial.result)),current=flow.at(-1)||{income:0,outcome:0},previous=flow.at(-2)||{income:0,outcome:0},net=current.income-current.outcome,previousNet=previous.income-previous.outcome,obligations=Number(core.rubles(forecast.obligations30)),scopedWallets=(db.wallets||[]).filter(item=>matchesOrg(item,org)),walletSetupComplete=wallets.length>0&&wallets.length===scopedWallets.length&&scopedWallets.every(item=>validWalletDate(item.openingBalanceDate)&&validWalletDate(item.bankStatementDate)),quality={uncategorized,unverified,brokenTransfers,uncertain,unreconciled,mismatched,vatUnconfirmed:vatControl.count,staffMissingHire,staffMissingLeaveNorm,cashCertified:unverified===0&&unreconciled===0&&walletSetupComplete};
    const attention=uncategorized+unverified+brokenTransfers+uncertain+unreconciled+vatControl.count+staffMissingHire+staffMissingLeaveNorm+payments30.filter(item=>item.days<=5).length+(liquidity<obligations?1:0)+projects.filter(item=>item.result<0&&item.realized>0).length;
    return {org,financial,bounds,taxes,forecast,liquidityCents:org?walletMoney.byOrg[org]||0n:walletMoney.total,stock:core.ownerWarehouseSnapshot(warehouseState,fifo,org),plans:window.ArbatExperience.plans(db,org),months,flow,directions,projects,wallets,calendar,payments30,portfolio:{contract,realized,remaining,count:deals.length},quality,totals:{liquidity,operating,net,previousNet,obligations,attention}};
  }
  window.arbatDashboardSnapshot=snapshot;

  function ensure(){
    const overview=document.getElementById('overview');if(!overview)return null;
    let root=document.getElementById('dashboardVisuals');if(root)return root;
    root=document.createElement('div');root.id='dashboardVisuals';root.className='dashboard-visuals';
    root.innerHTML="<section class=\"dashboard-command\"><div><h2 id=\"dashboardOwnerTitle\">Сводка собственника</h2><p id=\"dashboardNarrative\">Ключевые показатели бизнеса, финансов, проектов и рисков на сегодня.</p></div><div class=\"dashboard-command-meta\"><span id=\"dashboardStatus\" class=\"dashboard-status\"></span><small id=\"dashboardUpdated\"></small></div></section><div id=\"dashboardKpis\" class=\"dashboard-kpis\"></div><article class=\"dashboard-panel dashboard-attention-panel\"><div class=\"dashboard-panel-head\"><h2>⚠ Требует внимания <span id=\"dashboardAttentionCount\" class=\"dashboard-count\"></span></h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"calendar\">Открыть календарь →</button></div><div id=\"dashboardAttention\"></div></article><div class=\"dashboard-layout\"><article class=\"dashboard-panel dashboard-finance-panel\"><div class=\"dashboard-panel-head\"><h2>Финансовый результат</h2><span class=\"dashboard-period\">Текущий месяц</span></div><div id=\"dashboardFinancial\"></div></article><article class=\"dashboard-panel dashboard-flow-panel\"><div class=\"dashboard-panel-head\"><h2>Денежная позиция / ДДС</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"cash\">Подробнее →</button></div><div class=\"dashboard-legend\"><span><i class=\"legend-in\"></i>Поступления</span><span><i class=\"legend-out\"></i>Платежи</span><span><i class=\"legend-net\"></i>Чистый поток</span></div><div id=\"dashboardCashFlow\" class=\"dashboard-chart\"></div></article><article class=\"dashboard-panel dashboard-spend-panel\"><div class=\"dashboard-panel-head\"><h2>Расходы по категориям</h2></div><div id=\"dashboardSpending\"></div></article><article class=\"dashboard-panel dashboard-project-panel\"><div class=\"dashboard-panel-head\"><h2>Проекты под контролем</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"deals\">Все проекты →</button></div><div id=\"dashboardProjects\"></div></article><article class=\"dashboard-panel dashboard-sales-panel\"><div class=\"dashboard-panel-head\"><h2>Продажи и сделки</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"deals\">Все сделки →</button></div><div id=\"dashboardSales\"></div></article><article class=\"dashboard-panel dashboard-warehouse-panel\"><div class=\"dashboard-panel-head\"><h2>Склад и материалы</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"materials:movement\">Перейти на склад →</button></div><div id=\"dashboardWarehouse\"></div></article><article class=\"dashboard-panel dashboard-events-panel\"><div class=\"dashboard-panel-head\"><h2>Последние события</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"profile\">Все события →</button></div><div id=\"dashboardEvents\"></div></article></div>";
    root.querySelector('.dashboard-project-panel')?.insertAdjacentHTML('beforebegin','<article class="dashboard-panel dashboard-wallet-panel"><div class="dashboard-panel-head"><h2>Деньги по счетам и кассам</h2><button type="button" class="dashboard-link" data-wallet-order>Порядок счетов</button></div><div id="dashboardWallets"></div></article><article class="dashboard-panel dashboard-tax-panel"><div class="dashboard-panel-head"><h2>Налоги и проверка расчёта</h2><span id="dashboardTaxPeriod" class="dashboard-period"></span></div><div id="dashboardTaxes"></div></article>');
    root.querySelector('#dashboardOwnerTitle').textContent='Финансовое состояние бизнеса';
    root.querySelector('#dashboardNarrative').textContent='Деньги, результат, проекты и риски на текущую дату.';
    overview.prepend(root);
    root.addEventListener('click',event=>{const button=event.target.closest('[data-dashboard-route]');if(button){if(button.dataset.dashboardRoute==='payables')window.arbatOpenPayables?.();else window.arbatNavigate?.(button.dataset.dashboardRoute)}});
    return root;
  }
  function changeNote(current,previous){if(!previous)return 'Нет базы для сравнения';const change=(current-previous)/Math.abs(previous)*100;return (change>=0?'↑ ':'↓ ')+Math.abs(change).toLocaleString('ru-RU',{maximumFractionDigits:2})+'% к прошлому месяцу'}
  function kpis(data){
    const target=document.getElementById('dashboardKpis');if(!target)return;
    const p=data.forecast,complete=p.forecastComplete&&data.quality.cashCertified,free=data.liquidityCents-p.obligations7+p.income.due7;
    const rows=[
      ['Деньги сейчас',exactRub(data.liquidityCents),data.quality.cashCertified?'Сверено с выписками':'Расчётно — требуется сверка',data.quality.mismatched||data.totals.liquidity<0?'bad':data.quality.cashCertified?'good':'warn','data-ux-wallets'],
      ['Поступления 7 дней',exactRub(p.income.due7),'По внесённым планам','good','data-ux-plan="income"'],
      ['Платежи 7 дней',exactRub(p.obligations7),'Документы и календарь, включая просроченные','warn','data-ux-plan="outcome"'],
      ['Остаток после планов 7 дней',complete?exactRub(free):'Не определён',complete?'По срокам поставщиков и планам календаря':'Прогноз неполный — уточните сроки и сверку',!complete?'warn':free<0n?'bad':'good','data-ux-plan="forecast"'],
      ['К реализации',rub(data.portfolio.remaining),data.portfolio.count+' сделок','accent','data-ux-projects'],
      ['Долг поставщикам',exactRub(p.supplier.total),'Без срока: '+exactRub(p.supplier.undated)+' · На сверке: '+p.supplier.review,'warn','data-pay-dashboard']
    ];
    target.innerHTML=rows.map(item=>'<article '+(item[4]==='data-pay-dashboard'?'id="supplierObligations" ':'')+'class="dashboard-kpi '+item[3]+'"><div class="dashboard-kpi-top"><span>'+esc(item[0])+'</span></div><button type="button" class="ux-value" aria-label="'+esc(item[0]+': '+item[1]+'. Открыть расшифровку')+'" '+item[4]+'>'+esc(item[1])+'</button><small>'+esc(item[2])+'</small></article>').join('');
    target.querySelector('[data-pay-dashboard]')?.addEventListener('click',()=>window.arbatOpenPayables?.());
    if(p.combined.overdue>0n)target.insertAdjacentHTML('beforeend','<article class="dashboard-kpi warn"><div class="dashboard-kpi-top">Срок оплаты прошёл</div><button type="button" class="ux-value" data-ux-plan="overdue">'+exactRub(p.combined.overdue)+'</button><small>Документы и разовые планы — проверить оплату</small></article>');
  }

  function narrative(data){
    const target=document.getElementById('dashboardNarrative'),status=document.getElementById('dashboardStatus');if(!target||!status)return;
    let text='Внесённые обязательства на 30 дней покрываются денежным остатком.',tone='good',label='По внесённым данным';
    if(!data.forecast.forecastComplete){text='Прогноз неполный: у части обязательств не указан срок или требуется сверка. Свободный остаток пока не определён.';tone='warn';label='Прогноз неполный'}
    else if(data.financial.issues.length){text='Финансовый результат предварительный: исходные документы или признание затрат требуют проверки.';tone='warn';label='Результат требует сверки'}
    else if(!data.quality.cashCertified){text='Денежный остаток является расчётным: не все кошельки подтверждены начальной датой и банковской выпиской.';tone='warn';label='Деньги не сверены'}
    else if(data.quality.vatUnconfirmed){text='Выручка и прибыль рассчитаны с историческими допущениями: в части документов не зафиксирована ставка НДС.';tone='warn';label='НДС требует сверки'}
    else if(!data.portfolio.count&&!data.flow.some(item=>item.income||item.outcome)){text='Для управленческой картины пока недостаточно данных. Добавьте сделки, операции ДДС и обязательства.';tone='neutral';label='Недостаточно данных'}
    else if(data.totals.liquidity<data.totals.obligations){text='Ликвидности недостаточно для внесённых обязательств на 30 дней. Нужен план поступлений или перенос платежей.';tone='bad';label='Дефицит денег'}
    else if(data.totals.operating<0){text='Операционный результат отрицательный. Ниже показаны направления и проекты, требующие решения.';tone='bad';label='Требуется решение'}
    else if(data.totals.net<0){text='Текущий месяц идёт с отрицательным денежным потоком, ближайшие обязательства покрыты ликвидностью.';tone='warn';label='Контроль потока'}
    else if(data.totals.attention){text='Есть отклонения и ближайшие контрольные точки, требующие проверки.';tone='warn';label='Есть отклонения'}
    target.textContent=text;status.className='dashboard-status '+tone;status.textContent=label;
    document.getElementById('dashboardUpdated').textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  function cashChart(data){
    const target=document.getElementById('dashboardCashFlow');if(!target)return;
    const flow=data.flow,maximum=Math.max(1,...flow.flatMap(x=>[x.income,x.outcome,Math.abs(x.income-x.outcome)]));
    const top=25,zero=135,half=87,step=112,start=64,bar=25;
    let points=[],svg='<svg viewBox="0 0 760 260" role="img" aria-label="Движение денег: положительный и отрицательный чистый поток"><line class="axis" x1="42" y1="'+zero+'" x2="744" y2="'+zero+'"/>';
    for(let level=-1;level<=1;level++){const y=zero-level*half;svg+='<line class="grid" x1="42" y1="'+y+'" x2="744" y2="'+y+'"/><text x="2" y="'+(y+4)+'">'+esc(new Intl.NumberFormat('ru-RU',{notation:'compact'}).format(maximum*level))+'</text>'}
    flow.forEach((item,index)=>{
      const x=start+index*step,income=half*item.income/maximum,outcome=half*item.outcome/maximum,net=item.income-item.outcome,netY=zero-net/maximum*half;
      points.push((x+27)+','+netY);
      svg+='<rect x="'+x+'" y="'+(zero-income)+'" width="'+bar+'" height="'+income+'" rx="3" class="cash-in"><title>'+esc(item.label+': поступления '+rub(item.income))+'</title></rect><rect x="'+(x+30)+'" y="'+(zero-outcome)+'" width="'+bar+'" height="'+outcome+'" rx="3" class="cash-out"><title>'+esc(item.label+': выплаты '+rub(item.outcome))+'</title></rect><text x="'+(x+27)+'" y="248" text-anchor="middle">'+esc(item.label)+'</text>';
    });
    if(points.length>1)svg+='<polyline points="'+points.join(' ')+'" class="net-line"/>'+points.map(point=>{const [x,y]=point.split(',');return '<circle cx="'+x+'" cy="'+y+'" r="4" class="net-dot"/>'}).join('');
    target.innerHTML=svg+'</svg>';
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
    target.innerHTML=issues.length?'<div class="dashboard-attention-list">'+issues.map(item=>'<button type="button" data-dashboard-route="'+item[3]+'" class="dashboard-attention '+item[0]+'"><i></i><span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></span><b>›</b></button>').join('')+'</div>':'<div class="dashboard-all-good"><span>✓</span><strong>Автоматические проверки без замечаний</strong><small>Проверка охватывает внесённые документы; полноту первичных данных нужно сверять.</small></div>';
  }
  function directions(data){
    const target=document.getElementById('dashboardDirections');if(!target)return;const active=data.directions.filter(item=>item.revenue||item.cost).sort((a,b)=>b.revenue-a.revenue);
    if(!active.length){target.innerHTML='<div class="dashboard-empty">Добавьте реализации и расходы — здесь появится сравнение направлений.</div>';return}
    const max=Math.max(1,...active.flatMap(item=>[item.revenue,item.cost]));target.innerHTML='<div class="dashboard-direction-table"><div class="dashboard-direction-row head"><span>Направление</span><span>Выручка</span><span>Затраты</span><span>Результат</span><span>Маржа</span></div>'+active.map(item=>'<div class="dashboard-direction-row"><span class="direction-name" title="'+esc(item.name)+'">'+esc(item.name)+'<i><b style="width:'+Math.max(item.revenue?2:0,item.revenue/max*100)+'%"></b></i></span><span>'+rub(item.revenue)+'</span><span>'+rub(item.cost)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+rub(item.result)+'</strong><em class="'+(item.margin<0?'dashboard-negative':'')+'">'+percent(item.margin)+'</em></div>').join('')+'</div>';
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
    target.innerHTML='<div class="dashboard-project-table executive-project-table"><div class="dashboard-project-row head"><span>Проект</span><span>Договор</span><span>План затрат</span><span>Расходы: начислено / признано</span><span>НЗП</span><span>Реализация</span><span>Прибыль</span><span>Маржа</span><span>Статус</span></div>'+rows.map(item=>{
      const deal=deals.find(d=>projectKey(d)===item.key),plan=Number(deal?.cost??deal?.directCostPlan??deal?.plannedDirectCosts??deal?.planCosts??NaN);
      const known=Number.isFinite(plan),left=plan-item.cost,margin=item.revenue?item.result/item.revenue*100:NaN;
      return '<div class="dashboard-project-row"><span class="project-name" title="'+esc(item.name)+'"><button type="button" class="ux-text-link" data-ux-project="'+esc(deal?._id||'')+'">'+esc(item.name)+'</button><small>'+esc(item.org||'')+'</small></span><span>'+rub(item.contract)+'</span><span>'+(known?rub(plan)+'<small>остаток '+rub(left)+'</small>':'—')+'</span><span><strong>'+rub(item.cost)+'</strong><small>признано '+(item.recognizedCost===null?'—':rub(item.recognizedCost))+'</small></span><span>'+(item.wipCost===null?'—':rub(item.wipCost))+'</span><span>'+rub(item.realized)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+(item.reviewRequired?'Требует проверки':rub(item.result))+'</strong><span>'+(item.reviewRequired?'—':percent(margin))+'</span><span class="executive-project-status '+(item.result<0?'risk':'normal')+'">'+esc(projectLabels[deal?.projectStatus]||'Не указан')+'</span></div>'
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
    const current=data.flow.at(-1)||{income:0,outcome:0};
    const core=window.ArbatFinanceCore,revenue=Number(core.rubles(data.financial.revenue)),direct=Number(core.rubles(data.financial.categories.direct-data.financial.deferredChange));
    const rows=[['Реализация',revenue,'revenue'],['Признанные прямые затраты',direct,'direct'],['Валовый результат',Number(core.rubles(data.financial.grossProfit)),'gross'],['Общепроизводственные расходы',Number(core.rubles(data.financial.categories.production)),'production'],['EBITDA',Number(core.rubles(data.financial.ebitda)),'ebitda'],['Управленческий результат',data.totals.operating,'result']];
    const fin=document.getElementById('dashboardFinancial');
    if(fin)fin.innerHTML='<div class="executive-finance-table"><div class="executive-finance-row head"><span>Показатель</span><span>Факт</span><span>Комментарий</span></div>'+rows.map(([label,value,metric],i)=>'<div class="executive-finance-row"><span>'+esc(label)+'</span><button type="button" data-ux-metric="'+metric+'" class="ux-value '+(value<0?'dashboard-negative':'')+'">'+rub(value)+'</button><small>'+(i===0?'По актам реализации':i===1?'Начислено − изменение НЗП':i===2?'С учётом изменения НЗП':'По внесённым данным')+'</small></div>').join('')+'</div><div class="executive-note">План и отклонения появятся после внесения утверждённого бюджета.</div>';
    if(fin&&data.financial.issues.length)fin.insertAdjacentHTML('afterbegin','<p class="pay-notice">Предварительный результат: '+data.financial.issues.length+' замечаний к документам и признанию затрат. Проверьте источники показателей.</p>');
    const spends=data.financial.rows.filter(x=>x.category!=='belowIncome');
    const groups=new Map();
    const categoryNames={direct:'Прямые расходы',production:'Производственные расходы',administrative:'Административные расходы',commercial:'Коммерческие расходы',belowIncome:'Прочие доходы',belowExpenses:'Расходы ниже операционного результата'};
    for(const x of spends){const key=categoryNames[x.category]||String(x.category||'Без категории');groups.set(key,(groups.get(key)||0)+Number(core.rubles(x.amount)))}
    const total=spends.reduce((v,x)=>v+Number(core.rubles(x.amount)),0),top=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,6),spend=document.getElementById('dashboardSpending');
    let offset=0;const hasNegative=top.some(([,value])=>value<0),segments=top.map(([,value],i)=>{const from=offset;offset+=total>0?value/total*100:0;return COLORS[i%COLORS.length]+' '+from+'% '+offset+'%'});
    if(spend)spend.innerHTML=top.length?'<div class="executive-spend"><div class="executive-donut" style="background:'+(hasNegative||total<=0?'#e3edf4':'conic-gradient('+segments.join(',')+')')+'"><strong>'+rub(total)+'</strong><small>Расходы за период</small></div><div class="executive-spend-list">'+top.map(([name,value],i)=>'<div><i style="background:'+COLORS[i%COLORS.length]+'"></i><span>'+esc(name)+'</span><strong>'+rub(value)+'</strong><small>'+(hasNegative||total<=0?'':percent(value/total*100))+'</small></div>').join('')+'</div></div>'+(hasNegative?'<p class="ux-help">Есть корректировки со знаком минус — круговая диаграмма не строится.</p>':''):'<div class="dashboard-empty">Нет расходов за выбранный период.</div>';
    const sales=document.getElementById('dashboardSales'),stages=new Map();
    const stageLabels={new:'Новая',negotiations:'Переговоры',proposal:'Коммерческое предложение',contract:'Договор',realization:'Реализация',completed:'Завершена',cancelled:'Отменена'};
    for(const d of (db.deals||[]).filter(x=>matchesOrg(x,data.org))){const label=stageLabels[d.dealStage]||'Этап не указан';const v=stages.get(label)||{count:0,total:0};v.count++;v.total+=money(d.contractTotal??d.revenue);stages.set(label,v)}
    const sorted=[...stages].sort((a,b)=>b[1].total-a[1].total),max=Math.max(1,...sorted.map(x=>x[1].total));
    if(sales)sales.innerHTML=sorted.length?'<div class="executive-sales">'+sorted.slice(0,6).map(([name,v])=>'<div><span>'+esc(name)+'</span><strong>'+v.count+'</strong><i><b style="width:'+Math.max(2,v.total/max*100)+'%"></b></i><em>'+rub(v.total)+'</em></div>').join('')+'</div>':'<div class="dashboard-empty">Пока нет сделок.</div>';
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
    narrative(data);kpis(data);cashChart(data);attention(data);wallets(data);projects(data);executiveExtras(data);
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
})();
