(()=>{
  const COLORS=['#168b68','#2385c7','#d88b22','#755bc2','#c85b8e','#4b8d8a','#8c6b49'];
  const money=value=>Number(value||0);
  const sum=(rows,selector=item=>money(item.amount))=>Number(window.ArbatFinanceCore.rubles(window.ArbatFinanceCore.sum(rows.map(selector))));
  const rub=value=>money(value).toLocaleString('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0});
  const compact=value=>new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(money(value))+' ₽';
  const percent=value=>Number.isFinite(value)?value.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'—';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const projectKey=deal=>window.arbatDealKey?.(deal)||(deal.org+'::'+deal.name);
  const matchesOrg=(item,org)=>!org||item.org===org;
  const monthKey=date=>String(date||'').slice(0,7);
  const iso=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const days=(from,to)=>Math.round((new Date(to+'T12:00:00')-new Date(from+'T12:00:00'))/86400000);

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
  function calendarOccurrences(org){
    const today=iso(new Date()),out=[];
    for(const rule of db.calendar||[]){
      if(rule.active==='no'||!rule.dueDate||org&&rule.org!==org)continue;
      let due=rule.dueDate;
      for(let i=0;i<24;i++){
        const delta=days(today,due);if(delta>90)break;if(delta>=0)out.push({...rule,occurrence:due,days:delta});
        if(rule.frequency!=='monthly')break;
        const current=new Date(due+'T12:00:00'),day=current.getDate(),next=new Date(current.getFullYear(),current.getMonth()+1,1),last=new Date(next.getFullYear(),next.getMonth()+1,0).getDate();next.setDate(Math.min(day,last));const nextIso=iso(next);if(nextIso<=due)break;due=nextIso;
      }
    }
    return out.sort((a,b)=>a.occurrence.localeCompare(b.occurrence));
  }
  function snapshot(){
    const org=document.getElementById('orgFilter')?.value||'',months=lastMonths(),cash=(db.cash||[]).filter(item=>matchesOrg(item,org)),deals=(db.deals||[]).filter(item=>matchesOrg(item,org)),realizations=(db.realizations||[]).filter(item=>matchesOrg(item,org)),expenses=(db.expenses||[]).filter(item=>matchesOrg(item,org)),costs=(db.costs||[]).filter(item=>matchesOrg(item,org)),labor=(db.labor||[]).filter(item=>matchesOrg(item,org)),acts=(db.workActs||[]).filter(item=>item.status==='approved'&&matchesOrg(item,org));
    const flow=months.map(month=>{const core=window.ArbatFinanceCore,result=core.cashFlow(cash,month.key,org);return {label:month.label,income:Number(core.rubles(result.income)),outcome:Number(core.rubles(result.outgoing))}});
    const names=[...new Set([...(typeof dirs!=='undefined'?dirs:[]),...deals.map(item=>item.dir).filter(Boolean)])];
    const warehouseState=(()=>{try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}})();const fifo=typeof window.arbatFifo==='function'?window.arbatFifo(warehouseState):null;const period=monthKey(iso(new Date())),wipData={deals,realizations,expenses,costs,labor,workActs:acts,people:db.people,warehouse:warehouseState,fifo,wipAccounting:true};const directions=names.map(name=>{const core=window.ArbatFinanceCore,bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',document.getElementById('ownerPeriodReference')?.value||iso(new Date()),document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),selected=core.ownerPeriodSnapshot({...db,wipAccounting:true},bounds,org),assigned=selected.rows.filter(x=>x.dir===name),revenueDocs=selected.revenueDocuments.filter(x=>deals.some(d=>d.dir===name&&projectKey(d)===x.projectKey)),revenue=revenueDocs.reduce((v,x)=>v+core.documentPnlAmount(x),0n),cost=assigned.reduce((v,x)=>v+(x.category==='belowIncome'?-x.amount:x.amount),0n),result=revenue-cost,num=x=>Number(core.rubles(x));return {name,revenue:num(revenue),cost:num(cost),result:num(result),margin:revenue?Number(result)/Number(revenue)*100:NaN}});
    const projects=deals.map(deal=>{const key=projectKey(deal),core=window.ArbatFinanceCore,snapshot=core.projectSnapshot(wipData,deal,key),wip=core.projectWipSnapshot(wipData,deal,key),vat=core.vatControlRegister(wipData,{projectKey:key}),gross=sum(realizations.filter(item=>item.projectKey===key)),contract=money(deal.contractTotal??deal.revenue),remaining=Math.max(0,contract-gross),revenue=Number(core.rubles(snapshot.revenue)),cost=Number(core.rubles(snapshot.cost)),recognizedCost=wip.status==='calculated'?Number(core.rubles(wip.recognizedCost)):null,wipCost=wip.status==='calculated'?Number(core.rubles(wip.wip)):null,reviewRequired=snapshot.issues.length>0||wip.status!=='calculated'||vat.count>0;return {key,name:deal.name||'Без названия',org:deal.org,contract,realized:gross,revenue,cost,recognizedCost,wipCost,result:reviewRequired?null:Number(core.rubles(wip.operatingProfit)),reviewRequired,issues:[...snapshot.issues,...wip.issues,...vat.issues],remaining,progress:contract?Math.min(100,gross/contract*100):0}}).sort((a,b)=>b.remaining-a.remaining);
    const people=db.people||[],activePeople=people.filter(item=>item.workStatus!=='Не работает'),staffMissingHire=activePeople.filter(item=>!item.hireDate).length,staffMissingLeaveNorm=activePeople.filter(item=>item.annualLeaveDays===''||item.annualLeaveDays==null).length;
    const core=window.ArbatFinanceCore,walletMoney=core.walletConsolidation(db.wallets||[],db.cash||[]),wallets=walletRows(org,walletMoney),calendar=calendarOccurrences(org),payments30=calendar.filter(item=>item.days<=30),contract=sum(deals,deal=>money(deal.contractTotal??deal.revenue)),realized=sum(realizations),remaining=Math.max(0,contract-realized),uncategorized=cash.filter(item=>item.type!=='transfer'&&!item.articleId).length,unverified=(db.wallets||[]).filter(item=>!item.verified&&(!org||item.org===org)).length,brokenTransfers=cash.filter(item=>item.type==='transfer'&&!item.toWalletId).length,uncertain=expenses.filter(item=>item.valuationStatus==='requires-review').length,unreconciled=wallets.filter(item=>item.reconciliation?.status!=='matched').length,mismatched=wallets.filter(item=>item.reconciliation?.status==='mismatch'||item.reconciliation?.status==='invalid-statement'||item.reconciliation?.status==='invalid-statement-date').length;
    const bounds=core.ownerPeriodBounds(document.getElementById('ownerPeriodMode')?.value||'month',document.getElementById('ownerPeriodReference')?.value||iso(new Date()),document.getElementById('ownerPeriodFrom')?.value||'',document.getElementById('ownerPeriodTo')?.value||''),liquidity=Number(core.rubles(org?walletMoney.byOrg[org]||0n:walletMoney.total)),financial=core.ownerPeriodSnapshot({...db,wipAccounting:true},bounds,org),vatControl=core.vatControlRegister({deals,realizations,expenses,costs},{org,from:bounds.from,to:bounds.to}),operating=Number(core.rubles(financial.result)),current=flow.at(-1)||{income:0,outcome:0},previous=flow.at(-2)||{income:0,outcome:0},net=current.income-current.outcome,previousNet=previous.income-previous.outcome,obligations=sum(payments30),quality={uncategorized,unverified,brokenTransfers,uncertain,unreconciled,mismatched,vatUnconfirmed:vatControl.count,staffMissingHire,staffMissingLeaveNorm,cashCertified:unverified===0&&unreconciled===0};
    const attention=uncategorized+unverified+brokenTransfers+uncertain+unreconciled+vatControl.count+staffMissingHire+staffMissingLeaveNorm+calendar.filter(item=>item.days<=5).length+(liquidity<obligations?1:0)+projects.filter(item=>item.result<0&&item.realized>0).length;
    return {org,financial,bounds,months,flow,directions,projects,wallets,calendar,payments30,portfolio:{contract,realized,remaining,count:deals.length},quality,totals:{liquidity,operating,net,previousNet,obligations,attention}};
  }
  window.arbatDashboardSnapshot=snapshot;

  function ensure(){
    const overview=document.getElementById('overview');if(!overview)return null;
    let root=document.getElementById('dashboardVisuals');if(root)return root;
    root=document.createElement('div');root.id='dashboardVisuals';root.className='dashboard-visuals';
    root.innerHTML="<section class=\"dashboard-command\"><div><h2 id=\"dashboardOwnerTitle\">Сводка собственника</h2><p id=\"dashboardNarrative\">Ключевые показатели бизнеса, финансов, проектов и рисков на сегодня.</p></div><div class=\"dashboard-command-meta\"><span id=\"dashboardStatus\" class=\"dashboard-status\"></span><small id=\"dashboardUpdated\"></small></div></section><div id=\"dashboardKpis\" class=\"dashboard-kpis\"></div><article class=\"dashboard-panel dashboard-attention-panel\"><div class=\"dashboard-panel-head\"><h2>⚠ Требует внимания <span id=\"dashboardAttentionCount\" class=\"dashboard-count\"></span></h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"calendar\">Все уведомления →</button></div><div id=\"dashboardAttention\"></div></article><div class=\"dashboard-layout\"><article class=\"dashboard-panel dashboard-finance-panel\"><div class=\"dashboard-panel-head\"><h2>Финансовый результат</h2><span class=\"dashboard-period\">Текущий месяц</span></div><div id=\"dashboardFinancial\"></div></article><article class=\"dashboard-panel dashboard-flow-panel\"><div class=\"dashboard-panel-head\"><h2>Денежная позиция / ДДС</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"cash\">Подробнее →</button></div><div class=\"dashboard-legend\"><span><i class=\"legend-in\"></i>Поступления</span><span><i class=\"legend-out\"></i>Платежи</span><span><i class=\"legend-net\"></i>Чистый поток</span></div><div id=\"dashboardCashFlow\" class=\"dashboard-chart\"></div></article><article class=\"dashboard-panel dashboard-spend-panel\"><div class=\"dashboard-panel-head\"><h2>Расходы по категориям</h2></div><div id=\"dashboardSpending\"></div></article><article class=\"dashboard-panel dashboard-project-panel\"><div class=\"dashboard-panel-head\"><h2>Проекты под контролем</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"deals\">Все проекты →</button></div><div id=\"dashboardProjects\"></div></article><article class=\"dashboard-panel dashboard-sales-panel\"><div class=\"dashboard-panel-head\"><h2>Продажи и сделки</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"deals\">Все сделки →</button></div><div id=\"dashboardSales\"></div></article><article class=\"dashboard-panel dashboard-warehouse-panel\"><div class=\"dashboard-panel-head\"><h2>Склад и материалы</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"materials:movement\">Перейти на склад →</button></div><div id=\"dashboardWarehouse\"></div></article><article class=\"dashboard-panel dashboard-events-panel\"><div class=\"dashboard-panel-head\"><h2>Последние события</h2><button type=\"button\" class=\"dashboard-link\" data-dashboard-route=\"profile\">Все события →</button></div><div id=\"dashboardEvents\"></div></article></div>";
    root.querySelector('#dashboardOwnerTitle').textContent='Финансовое состояние бизнеса';
    root.querySelector('#dashboardNarrative').textContent='Деньги, результат, проекты и риски на текущую дату.';
    overview.prepend(root);
    root.addEventListener('click',event=>{const button=event.target.closest('[data-dashboard-route]');if(button)window.arbatNavigate?.(button.dataset.dashboardRoute)});
    return root;
  }
  function changeNote(current,previous){if(!previous)return 'Нет базы для сравнения';const change=(current-previous)/Math.abs(previous)*100;return (change>=0?'↑ ':'↓ ')+Math.abs(change).toLocaleString('ru-RU',{maximumFractionDigits:0})+'% к прошлому месяцу'}
  function kpis(data){
    const target=document.getElementById('dashboardKpis');if(!target)return;
    const coverage=data.totals.obligations?data.totals.liquidity/data.totals.obligations:Infinity;
    const nextWeek=data.calendar.filter(item=>item.days>=0&&item.days<=7);
    const incoming=nextWeek.filter(item=>item.type==='in'||item.kind==='income');
    const outgoings=nextWeek.filter(item=>!incoming.includes(item));
    const rows=[
      ['Деньги сейчас',rub(data.totals.liquidity),data.quality.cashCertified?'Сверено с выписками':'Расчётно — требуется сверка',data.quality.mismatched||data.totals.liquidity<0?'bad':data.quality.cashCertified?'good':'warn','wallet'],
      ['Поступления 7 дней',rub(sum(incoming)),'По платёжному календарю','good','flow'],
      ['Платежи 7 дней',rub(sum(outgoings)),'По платёжному календарю','warn','calendar'],
      ['Свободный остаток',rub(data.totals.liquidity-sum(outgoings)+sum(incoming)),'Прогноз после платежей',data.totals.liquidity-sum(outgoings)+sum(incoming)<0?'bad':'good','result'],
      ['К реализации',rub(data.portfolio.remaining),data.portfolio.count+' сделок','accent','portfolio'],
      ['Обязательства 30 дней',rub(data.totals.obligations),'По календарю',data.totals.obligations>data.totals.liquidity?'bad':'warn','calendar']
    ];
    const icons={wallet:'₽',flow:'↕',result:'∑',portfolio:'◫',calendar:'◷'};
    target.innerHTML=rows.map(item=>'<article class="dashboard-kpi '+item[3]+'"><div class="dashboard-kpi-top"><span>'+esc(item[0])+'</span><i>'+icons[item[4]]+'</i></div><strong title="'+esc(item[1])+'">'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></article>').join('');
  }
  function narrative(data){
    const target=document.getElementById('dashboardNarrative'),status=document.getElementById('dashboardStatus');if(!target||!status)return;
    let text='Деньги и обязательства сбалансированы, операционный результат положительный.',tone='good',label='Показатели в норме';
    if(!data.quality.cashCertified){text='Денежный остаток является расчётным: не все кошельки подтверждены начальной датой и банковской выпиской.';tone='warn';label='Деньги не сверены'}
    else if(data.quality.vatUnconfirmed){text='Выручка и прибыль рассчитаны с историческими допущениями: в части документов не зафиксирована ставка НДС.';tone='warn';label='НДС требует сверки'}
    else if(!data.portfolio.count&&!data.flow.some(item=>item.income||item.outcome)){text='Для управленческой картины пока недостаточно данных. Добавьте сделки, операции ДДС и обязательства.';tone='neutral';label='Недостаточно данных'}
    else if(data.totals.liquidity<data.totals.obligations){text='Ликвидности недостаточно для внесённых обязательств на 30 дней. Нужен план поступлений или перенос платежей.';tone='bad';label='Дефицит денег'}
    else if(data.totals.operating<0){text='Операционный результат отрицательный. Ниже показаны направления и проекты, требующие решения.';tone='bad';label='Требуется решение'}
    else if(data.totals.net<0){text='Текущий месяц идёт с отрицательным денежным потоком, ближайшие обязательства покрыты ликвидностью.';tone='warn';label='Контроль потока'}
    else if(data.totals.attention){text='Финансовое состояние устойчивое, но есть отклонения и ближайшие контрольные точки.';tone='warn';label='Есть отклонения'}
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
    const soon=data.calendar.filter(item=>item.days<=5);if(soon.length)issues.push(['warn','Платежи в ближайшие 5 дней',soon.length+' шт. на '+rub(sum(soon)),'calendar']);
    if(data.quality.uncategorized)issues.push(['bad','ДДС без статьи',data.quality.uncategorized+' операций требуют классификации','cash']);
    if(data.quality.brokenTransfers)issues.push(['bad','Незавершённые переводы',data.quality.brokenTransfers+' операций без получателя','cash']);
    if(data.quality.uncertain)issues.push(['warn','Расходы требуют оценки',data.quality.uncertain+' складских позиций','materials:movement']);
    if(data.quality.unverified)issues.push(['bad','Кошельки не классифицированы',data.quality.unverified+' кошельков не включены в остаток','settings']);
    if(data.quality.unreconciled)issues.push([data.quality.mismatched?'bad':'warn','Денежные остатки не подтверждены',data.quality.unreconciled+' кошельков без успешной банковской сверки','settings']);
    if(data.quality.vatUnconfirmed)issues.push(['bad','НДС документов не подтверждён',data.quality.vatUnconfirmed+' документов без явно заданной ставки НДС','reports']);
    if(data.quality.staffMissingHire||data.quality.staffMissingLeaveNorm)issues.push(['bad','Отпуска нельзя подтвердить',(data.quality.staffMissingHire?data.quality.staffMissingHire+' сотрудников без даты приёма':'')+(data.quality.staffMissingHire&&data.quality.staffMissingLeaveNorm?'; ':'')+(data.quality.staffMissingLeaveNorm?data.quality.staffMissingLeaveNorm+' без нормы отпуска':''),'labor']);
    const loss=data.projects.filter(item=>item.result<0&&item.realized>0);if(loss.length)issues.push(['bad','Убыточные проекты',loss.length+' проектов с отрицательным фактом','deals']);
    document.getElementById('dashboardAttentionCount').textContent=issues.length?issues.length:'0';
    target.innerHTML=issues.length?'<div class="dashboard-attention-list">'+issues.slice(0,6).map(item=>'<button type="button" data-dashboard-route="'+item[3]+'" class="dashboard-attention '+item[0]+'"><i></i><span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></span><b>›</b></button>').join('')+'</div>':'<div class="dashboard-all-good"><span>✓</span><strong>Критичных вопросов нет</strong><small>Данные заполнены, ближайшие обязательства покрыты.</small></div>';
  }
  function directions(data){
    const target=document.getElementById('dashboardDirections');if(!target)return;const active=data.directions.filter(item=>item.revenue||item.cost).sort((a,b)=>b.revenue-a.revenue);
    if(!active.length){target.innerHTML='<div class="dashboard-empty">Добавьте реализации и расходы — здесь появится сравнение направлений.</div>';return}
    const max=Math.max(1,...active.flatMap(item=>[item.revenue,item.cost]));target.innerHTML='<div class="dashboard-direction-table"><div class="dashboard-direction-row head"><span>Направление</span><span>Выручка</span><span>Затраты</span><span>Результат</span><span>Маржа</span></div>'+active.map(item=>'<div class="dashboard-direction-row"><span class="direction-name" title="'+esc(item.name)+'">'+esc(item.name)+'<i><b style="width:'+Math.max(item.revenue?2:0,item.revenue/max*100)+'%"></b></i></span><span>'+rub(item.revenue)+'</span><span>'+rub(item.cost)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+rub(item.result)+'</strong><em class="'+(item.margin<0?'dashboard-negative':'')+'">'+percent(item.margin)+'</em></div>').join('')+'</div>';
  }
  function wallets(data){
    const target=document.getElementById('dashboardWallets');if(!target)return;const rows=data.wallets.filter(item=>item.balance!==0).sort((a,b)=>b.balance-a.balance);
    if(!rows.length){target.innerHTML='<div class="dashboard-empty">Настройте кошельки, чтобы увидеть структуру ликвидности.</div>';return}
    const positive=rows.filter(item=>item.balance>0),total=sum(positive,item=>item.balance);let angle=0,stops=[];positive.forEach((item,index)=>{const next=angle+(total?item.balance/total*360:0);stops.push(COLORS[index%COLORS.length]+' '+angle+'deg '+next+'deg');angle=next});
    target.innerHTML='<div class="dashboard-wallet-layout"><div class="dashboard-donut" style="background:conic-gradient('+(stops.length?stops.join(','):'#e8eef3 0deg 360deg')+')"><div class="dashboard-donut-center"><strong>'+rows.length+'</strong><small>кошельков</small></div></div><div class="dashboard-wallet-legend">'+rows.slice(0,7).map((item,index)=>'<div class="dashboard-wallet-item"><i style="background:'+COLORS[index%COLORS.length]+'"></i><span title="'+esc(item.name)+'">'+esc(item.name)+'</span><strong class="'+(item.balance<0?'dashboard-negative':'')+'">'+esc(compact(item.balance))+'</strong></div>').join('')+'</div></div>';
  }
  function projects(data){
    const target=document.getElementById('dashboardProjects');if(!target)return;
    const count=document.getElementById('dashboardProjectCount');if(count)count.textContent=data.projects.length;
    if(!data.projects.length){target.innerHTML='<div class="dashboard-empty">Создайте первую сделку — портфель появится здесь.</div>';return}
    const deals=db.deals||[];
    const projectLabels={planned:'Планируется',active:'В работе',paused:'Приостановлен',completed:'Завершён'};
    const rows=[...data.projects].sort((a,b)=>(a.result<0?0:1)-(b.result<0?0:1)||b.remaining-a.remaining).slice(0,6);
    target.innerHTML='<div class="dashboard-project-table executive-project-table"><div class="dashboard-project-row head"><span>Проект</span><span>Договор</span><span>План затрат</span><span>Начислено / признано</span><span>НЗП</span><span>Реализация</span><span>Прибыль</span><span>Маржа</span><span>Статус</span></div>'+rows.map(item=>{
      const deal=deals.find(d=>projectKey(d)===item.key),plan=Number(deal?.cost??deal?.directCostPlan??deal?.plannedDirectCosts??deal?.planCosts??NaN);
      const known=Number.isFinite(plan),left=plan-item.cost,margin=item.revenue?item.result/item.revenue*100:NaN;
      return '<div class="dashboard-project-row"><span class="project-name" title="'+esc(item.name)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(item.org||'')+'</small></span><span>'+rub(item.contract)+'</span><span>'+(known?rub(plan)+'<small>остаток '+rub(left)+'</small>':'—')+'</span><span><strong>'+rub(item.cost)+'</strong><small>признано '+(item.recognizedCost===null?'—':rub(item.recognizedCost))+'</small></span><span>'+(item.wipCost===null?'—':rub(item.wipCost))+'</span><span>'+rub(item.realized)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+(item.reviewRequired?'Требует проверки':rub(item.result))+'</strong><span>'+(item.reviewRequired?'—':percent(margin))+'</span><span class="executive-project-status '+(item.result<0?'risk':'normal')+'">'+esc(projectLabels[deal?.projectStatus]||'Не указан')+'</span></div>'
    }).join('')+'</div>';
  }
  function calendar(data){
    const target=document.getElementById('dashboardCalendar');if(!target)return;const rows=data.payments30.slice(0,6);
    if(!rows.length){target.innerHTML='<div class="dashboard-all-good compact"><span>✓</span><strong>На 30 дней платежей нет</strong><small>По внесённым обязательствам.</small></div>';return}
    target.innerHTML='<div class="dashboard-calendar-list">'+rows.map(item=>'<div class="dashboard-calendar-item"><span class="dashboard-date"><strong>'+new Date(item.occurrence+'T12:00:00').getDate()+'</strong><small>'+new Date(item.occurrence+'T12:00:00').toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+'</small></span><span class="dashboard-payment"><strong title="'+esc(item.name)+'">'+esc(item.name)+'</strong><small title="'+esc(item.payee||item.org)+'">'+esc(item.payee||item.org)+'</small></span><b>'+rub(item.amount)+'</b></div>').join('')+'</div>';
  }
  function executiveExtras(data){
    const title=document.querySelector('.dashboard-finance-panel .dashboard-period');if(title)title.textContent=data.bounds.label;
    const currentMonth=data.bounds?.from?.slice(0,7)||'';
    const current=data.flow.at(-1)||{income:0,outcome:0};
    const core=window.ArbatFinanceCore,revenue=Number(core.rubles(data.financial.revenue)),direct=Number(core.rubles(data.financial.categories.direct+data.financial.categories.production));
    const rows=[['Реализация',revenue],['Прямые затраты',direct],['Валовый результат',revenue-direct],['Операционный результат',data.totals.operating]];
    const fin=document.getElementById('dashboardFinancial');
    if(fin)fin.innerHTML='<div class="executive-finance-table"><div class="executive-finance-row head"><span>Показатель</span><span>Факт</span><span>Комментарий</span></div>'+rows.map(([label,value],i)=>'<div class="executive-finance-row"><span>'+esc(label)+'</span><strong class="'+(value<0?'dashboard-negative':'')+'">'+rub(value)+'</strong><small>'+(i===0?'По актам реализации':i===1?'Учтённые прямые расходы':i===2?'До косвенных расходов':'По внесённым данным')+'</small></div>').join('')+'</div><div class="executive-note">План и отклонения появятся после внесения утверждённого бюджета. Значения не являются условными.</div>';
    const spends=data.financial.rows;
    const groups=new Map();
    for(const x of spends){const key=String(x.category||'Без категории');groups.set(key,(groups.get(key)||0)+Number(core.rubles(x.amount)))}
    const total=spends.reduce((v,x)=>v+Number(core.rubles(x.amount)),0),top=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,6),spend=document.getElementById('dashboardSpending');
    if(spend)spend.innerHTML=total?'<div class="executive-spend"><div class="executive-donut" style="--p:'+Math.round(top[0]?.[1]/total*100||0)+'%"><strong>'+rub(total)+'</strong><small>Расходы месяца</small></div><div class="executive-spend-list">'+top.map(([name,value],i)=>'<div><i style="background:'+COLORS[i%COLORS.length]+'"></i><span title="'+esc(name)+'">'+esc(name)+'</span><strong>'+rub(value)+'</strong><small>'+percent(value/total*100)+'</small></div>').join('')+'</div></div>':'<div class="dashboard-empty">Нет расходов за текущий месяц.</div>';
    const sales=document.getElementById('dashboardSales'),stages=new Map();
    const stageLabels={new:'Новая',negotiations:'Переговоры',proposal:'Коммерческое предложение',contract:'Договор',realization:'Реализация',completed:'Завершена',cancelled:'Отменена'};
    for(const d of (db.deals||[]).filter(x=>matchesOrg(x,data.org))){const label=stageLabels[d.dealStage]||'Этап не указан';const v=stages.get(label)||{count:0,total:0};v.count++;v.total+=money(d.contractTotal??d.revenue);stages.set(label,v)}
    const sorted=[...stages].sort((a,b)=>b[1].total-a[1].total),max=Math.max(1,...sorted.map(x=>x[1].total));
    if(sales)sales.innerHTML=sorted.length?'<div class="executive-sales">'+sorted.slice(0,6).map(([name,v])=>'<div><span>'+esc(name)+'</span><strong>'+v.count+'</strong><i><b style="width:'+Math.max(2,v.total/max*100)+'%"></b></i><em>'+rub(v.total)+'</em></div>').join('')+'</div>':'<div class="dashboard-empty">Пока нет сделок.</div>';
    const wh=document.getElementById('dashboardWarehouse');
    if(wh)wh.innerHTML='<div class="executive-warehouse"><div><small>Активные проекты</small><strong>'+data.portfolio.count+'</strong></div><div><small>Проекты с убытком</small><strong>'+data.projects.filter(x=>x.result<0&&x.realized>0).length+'</strong></div><div><small>Материалы требуют оценки</small><strong>'+data.quality.uncertain+'</strong></div></div><div class="executive-note">Стоимость склада показывается в специализированном складском разделе; неподтверждённые остатки не подменяются нулём.</div>';
    const ev=document.getElementById('dashboardEvents');
    if(ev)ev.innerHTML='<div class="dashboard-empty">История действий доступна в личном кабинете администратора.</div>';
  }
  function render(){if(typeof db==='undefined'||!ensure())return;const data=snapshot();narrative(data);kpis(data);cashChart(data);attention(data);projects(data);executiveExtras(data)}
  const original=window.render;if(typeof original==='function')window.render=function(){const result=original.apply(this,arguments);render();return result};
  document.getElementById('orgFilter')?.addEventListener('change',()=>requestAnimationFrame(render));render();
})();
