(()=>{
  const COLORS=['#168b68','#2385c7','#d88b22','#755bc2','#c85b8e','#4b8d8a','#8c6b49'];
  const money=value=>Number(value||0);
  const sum=(rows,selector=item=>money(item.amount))=>rows.reduce((total,item)=>total+selector(item),0);
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
  function walletRows(org){
    const core=window.ArbatFinanceCore;
    if(!core)throw new Error('Финансовый расчетный модуль не загружен');
    return (db.wallets||[]).filter(wallet=>wallet.verified&&(!org||wallet.org===org||wallet.org==='Общий')).map(wallet=>{
      const balance=core.walletBalance(wallet.openingBalance||0,db.cash||[],wallet.id);
      return {...wallet,balance:Number(core.rubles(balance))};
    });
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
    const flow=months.map(month=>({label:month.label,income:sum(cash.filter(item=>item.type==='in'&&monthKey(item.date)===month.key)),outcome:sum(cash.filter(item=>item.type==='out'&&monthKey(item.date)===month.key))}));
    const names=[...new Set([...(typeof dirs!=='undefined'?dirs:[]),...deals.map(item=>item.dir).filter(Boolean)])];
    const directions=names.map(name=>{const selected=deals.filter(deal=>deal.dir===name),keys=new Set(selected.map(projectKey)),core=window.ArbatFinanceCore;const revenueC=realizations.filter(item=>keys.has(item.projectKey)).reduce((total,item)=>total+core.netAmount(item.amount,item.org,item.vatRate),0n);const projectExpenses=expenses.filter(item=>keys.has(item.projectKey)).map(item=>item.amount||0),work=acts.filter(item=>keys.has(item.projectKey)).map(item=>core.rubles((core.cents(item.rate||0)*core.cents(item.qty||0)+50n)/100n));const assigned=costs.filter(item=>item.dir===name).map(item=>item.amount||0);const productionWages=labor.filter(item=>item.expenseType==='production'&&item.dir===name).map(item=>item.amount||0);const costC=core.sum([...projectExpenses,...work,...assigned,...productionWages]);const revenue=Number(core.rubles(revenueC)),direct=Number(core.rubles(costC));return {name,revenue,cost:direct,result:Number(core.rubles(revenueC-costC)),margin:revenueC?Number(revenueC-costC)/Number(revenueC)*100:NaN}});
    const warehouseState=(()=>{try{return JSON.parse(localStorage.getItem('arbat-warehouse-v1')||'{}')}catch{return {}}})();const fifo=typeof window.arbatFifo==='function'?window.arbatFifo(warehouseState):null;const projects=deals.map(deal=>{const key=projectKey(deal),core=window.ArbatFinanceCore,snapshot=core.projectSnapshot({realizations,expenses:db.expenses||[],workActs:acts,labor:db.labor||[],warehouse:warehouseState,fifo},deal,key),gross=sum(realizations.filter(item=>item.projectKey===key)),contract=money(deal.contractTotal??deal.revenue),remaining=Math.max(0,contract-gross),revenue=Number(core.rubles(snapshot.revenue)),cost=Number(core.rubles(snapshot.cost));return {key,name:deal.name||'Без названия',org:deal.org,contract,realized:gross,revenue,cost,result:snapshot.issues.length?null:Number(core.rubles(snapshot.result)),reviewRequired:snapshot.issues.length>0,issues:snapshot.issues,remaining,progress:contract?Math.min(100,gross/contract*100):0}}).sort((a,b)=>b.remaining-a.remaining);
    const wallets=walletRows(org),calendar=calendarOccurrences(org),payments30=calendar.filter(item=>item.days<=30),contract=sum(deals,deal=>money(deal.contractTotal??deal.revenue)),realized=sum(realizations),remaining=Math.max(0,contract-realized),uncategorized=cash.filter(item=>item.type!=='transfer'&&!item.articleId).length,unverified=(db.wallets||[]).filter(item=>!item.verified&&(!org||item.org===org||item.org==='Общий')).length,brokenTransfers=cash.filter(item=>item.type==='transfer'&&!item.toWalletId).length,uncertain=expenses.filter(item=>item.valuationStatus==='requires-review').length;
    const core=window.ArbatFinanceCore;const liquidity=Number(core.rubles(core.sum(wallets.map(item=>item.balance)))),operating=Number(core.rubles(core.preliminaryPeriod({realizations,expenses,costs,labor,workActs:acts},monthKey(iso(new Date())),org).result)),current=flow.at(-1)||{income:0,outcome:0},previous=flow.at(-2)||{income:0,outcome:0},net=current.income-current.outcome,previousNet=previous.income-previous.outcome,obligations=sum(payments30),quality={uncategorized,unverified,brokenTransfers,uncertain};
    const attention=Object.values(quality).reduce((a,b)=>a+b,0)+calendar.filter(item=>item.days<=5).length+(liquidity<obligations?1:0)+projects.filter(item=>item.result<0&&item.realized>0).length;
    return {org,months,flow,directions,projects,wallets,calendar,payments30,portfolio:{contract,realized,remaining,count:deals.length},quality,totals:{liquidity,operating,net,previousNet,obligations,attention}};
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
      ['Деньги сейчас',rub(data.totals.liquidity),'На подтверждённых счетах',data.totals.liquidity<0?'bad':'good','wallet'],
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
    if(!data.portfolio.count&&!data.flow.some(item=>item.income||item.outcome)){text='Для управленческой картины пока недостаточно данных. Добавьте сделки, операции ДДС и обязательства.';tone='neutral';label='Недостаточно данных'}
    else if(data.totals.liquidity<data.totals.obligations){text='Ликвидности недостаточно для внесённых обязательств на 30 дней. Нужен план поступлений или перенос платежей.';tone='bad';label='Дефицит денег'}
    else if(data.totals.operating<0){text='Операционный результат отрицательный. Ниже показаны направления и проекты, требующие решения.';tone='bad';label='Требуется решение'}
    else if(data.totals.net<0){text='Текущий месяц идёт с отрицательным денежным потоком, ближайшие обязательства покрыты ликвидностью.';tone='warn';label='Контроль потока'}
    else if(data.totals.attention){text='Финансовое состояние устойчивое, но есть отклонения и ближайшие контрольные точки.';tone='warn';label='Есть отклонения'}
    target.textContent=text;status.className='dashboard-status '+tone;status.textContent=label;
    document.getElementById('dashboardUpdated').textContent='Обновлено '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }
  function cashChart(data){
    const target=document.getElementById('dashboardCashFlow');if(!target)return;const max=Math.max(1,...data.flow.flatMap(item=>[item.income,item.outcome,Math.abs(item.income-item.outcome)])),base=206,height=150,step=112,start=64,bar=25;
    let points=[],svg='<svg viewBox="0 0 760 244" role="img" aria-label="Движение денег за шесть месяцев"><line class="axis" x1="42" y1="'+base+'" x2="744" y2="'+base+'"/>';
    for(let level=0;level<=3;level++){const y=base-height*level/3;svg+='<line class="grid" x1="42" y1="'+y+'" x2="744" y2="'+y+'"/><text x="4" y="'+(y+4)+'">'+esc(new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:0}).format(max*level/3))+'</text>'}
    data.flow.forEach((item,index)=>{const x=start+index*step,income=height*item.income/max,outcome=height*item.outcome/max,net=item.income-item.outcome,netY=base-Math.max(0,net)/max*height;points.push((x+27)+','+netY);svg+='<rect x="'+x+'" y="'+(base-income)+'" width="'+bar+'" height="'+income+'" rx="5" class="cash-in"><title>'+esc(item.label+': поступления '+rub(item.income))+'</title></rect><rect x="'+(x+30)+'" y="'+(base-outcome)+'" width="'+bar+'" height="'+outcome+'" rx="5" class="cash-out"><title>'+esc(item.label+': выбытия '+rub(item.outcome))+'</title></rect><text x="'+(x+27)+'" y="230" text-anchor="middle">'+esc(item.label)+'</text>'});
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
    if(data.quality.unverified)issues.push(['warn','Кошельки не настроены',data.quality.unverified+' кошельков без сверки','settings']);
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
    target.innerHTML='<div class="dashboard-project-table executive-project-table"><div class="dashboard-project-row head"><span>Проект</span><span>Договор</span><span>План затрат</span><span>Факт</span><span>Остаток</span><span>Реализация</span><span>Прибыль</span><span>Маржа</span><span>Статус</span></div>'+rows.map(item=>{
      const deal=deals.find(d=>projectKey(d)===item.key),plan=Number(deal?.cost??deal?.directCostPlan??deal?.plannedDirectCosts??deal?.planCosts??NaN);
      const known=Number.isFinite(plan),left=plan-item.cost,margin=item.revenue?item.result/item.revenue*100:NaN;
      return '<div class="dashboard-project-row"><span class="project-name" title="'+esc(item.name)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(item.org||'')+'</small></span><span>'+rub(item.contract)+'</span><span>'+(known?rub(plan):'—')+'</span><span>'+rub(item.cost)+'</span><span class="'+(known&&left<0?'dashboard-negative':'dashboard-positive')+'">'+(known?rub(left):'—')+'</span><span>'+rub(item.realized)+'</span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+rub(item.result)+'</strong><span>'+percent(margin)+'</span><span class="executive-project-status '+(item.result<0?'risk':'normal')+'">'+esc(projectLabels[deal?.projectStatus]||'Не указан')+'</span></div>'
    }).join('')+'</div>';
  }
  function calendar(data){
    const target=document.getElementById('dashboardCalendar');if(!target)return;const rows=data.payments30.slice(0,6);
    if(!rows.length){target.innerHTML='<div class="dashboard-all-good compact"><span>✓</span><strong>На 30 дней платежей нет</strong><small>По внесённым обязательствам.</small></div>';return}
    target.innerHTML='<div class="dashboard-calendar-list">'+rows.map(item=>'<div class="dashboard-calendar-item"><span class="dashboard-date"><strong>'+new Date(item.occurrence+'T12:00:00').getDate()+'</strong><small>'+new Date(item.occurrence+'T12:00:00').toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+'</small></span><span class="dashboard-payment"><strong title="'+esc(item.name)+'">'+esc(item.name)+'</strong><small title="'+esc(item.payee||item.org)+'">'+esc(item.payee||item.org)+'</small></span><b>'+rub(item.amount)+'</b></div>').join('')+'</div>';
  }
  function executiveExtras(data){
    const currentMonth=lastMonths(1)[0]?.key;
    const current=data.flow.at(-1)||{income:0,outcome:0};
    const revenue=sum(data.directions,d=>d.revenue),direct=sum(data.directions,d=>d.cost);
    const rows=[['Реализация',revenue],['Прямые затраты',direct],['Валовый результат',revenue-direct],['Операционный результат',data.totals.operating]];
    const fin=document.getElementById('dashboardFinancial');
    if(fin)fin.innerHTML='<div class="executive-finance-table"><div class="executive-finance-row head"><span>Показатель</span><span>Факт</span><span>Комментарий</span></div>'+rows.map(([label,value],i)=>'<div class="executive-finance-row"><span>'+esc(label)+'</span><strong class="'+(value<0?'dashboard-negative':'')+'">'+rub(value)+'</strong><small>'+(i===0?'По актам реализации':i===1?'Учтённые прямые расходы':i===2?'До косвенных расходов':'По внесённым данным')+'</small></div>').join('')+'</div><div class="executive-note">План и отклонения появятся после внесения утверждённого бюджета. Значения не являются условными.</div>';
    const spends=(db.expenses||[]).filter(x=>matchesOrg(x,data.org)&&monthKey(x.date)===currentMonth);
    const groups=new Map();
    for(const x of spends){const key=String(x.article||x.category||x.purpose||'Без категории');groups.set(key,(groups.get(key)||0)+money(x.amount))}
    const total=sum(spends),top=[...groups].sort((a,b)=>b[1]-a[1]).slice(0,6),spend=document.getElementById('dashboardSpending');
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
