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
    const wallets=(db.wallets||[]).filter(wallet=>wallet.verified&&(!org||wallet.org===org||wallet.org==='Общий'));
    return wallets.map(wallet=>{const rows=(db.cash||[]).filter(item=>item.walletId===wallet.id||item.type==='transfer'&&item.toWalletId===wallet.id),received=sum(rows.filter(item=>item.type==='in'&&item.walletId===wallet.id||item.type==='transfer'&&item.toWalletId===wallet.id)),spent=sum(rows.filter(item=>item.type==='out'&&item.walletId===wallet.id||item.type==='transfer'&&item.walletId===wallet.id));return {...wallet,balance:money(wallet.openingBalance)+received-spent}});
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
    const directions=names.map(name=>{const selected=deals.filter(deal=>deal.dir===name),keys=new Set(selected.map(projectKey)),revenue=sum(realizations.filter(item=>keys.has(item.projectKey)),item=>money(item.amount)/(item.org==='АРБАТ.ГК'?1.22:1)),direct=sum(expenses.filter(item=>keys.has(item.projectKey)))+sum(acts.filter(item=>keys.has(item.projectKey)),item=>money(item.qty)*money(item.rate))+sum(costs.filter(item=>item.dir===name));return {name,revenue,cost:direct,result:revenue-direct,margin:revenue?(revenue-direct)/revenue*100:NaN}});
    const projects=deals.map(deal=>{const key=projectKey(deal),gross=sum(realizations.filter(item=>item.projectKey===key)),revenue=sum(realizations.filter(item=>item.projectKey===key),item=>money(item.amount)/(item.org==='АРБАТ.ГК'?1.22:1)),direct=sum(expenses.filter(item=>item.projectKey===key))+sum(acts.filter(item=>item.projectKey===key),item=>money(item.qty)*money(item.rate))+sum(costs.filter(item=>item.projectKey===key)),contract=money(deal.contractTotal??deal.revenue),remaining=Math.max(0,contract-gross);return {key,name:deal.name||'Без названия',org:deal.org,contract,realized:gross,revenue,cost:direct,result:revenue-direct,remaining,progress:contract?Math.min(100,gross/contract*100):0}}).sort((a,b)=>b.remaining-a.remaining);
    const wallets=walletRows(org),calendar=calendarOccurrences(org),payments30=calendar.filter(item=>item.days<=30),contract=sum(deals,deal=>money(deal.contractTotal??deal.revenue)),realized=sum(realizations),remaining=Math.max(0,contract-realized),uncategorized=cash.filter(item=>item.type!=='transfer'&&!item.articleId).length,unverified=(db.wallets||[]).filter(item=>!item.verified&&(!org||item.org===org||item.org==='Общий')).length,brokenTransfers=cash.filter(item=>item.type==='transfer'&&!item.toWalletId).length,uncertain=expenses.filter(item=>item.valuationStatus==='requires-review').length;
    const liquidity=sum(wallets,item=>item.balance),operating=sum(directions,item=>item.result)-sum(costs.filter(item=>!item.dir))-sum(labor,item=>money(item.amount??item.salary)),current=flow.at(-1)||{income:0,outcome:0},previous=flow.at(-2)||{income:0,outcome:0},net=current.income-current.outcome,previousNet=previous.income-previous.outcome,obligations=sum(payments30),quality={uncategorized,unverified,brokenTransfers,uncertain};
    const attention=Object.values(quality).reduce((a,b)=>a+b,0)+calendar.filter(item=>item.days<=5).length+(liquidity<obligations?1:0)+projects.filter(item=>item.result<0&&item.realized>0).length;
    return {org,months,flow,directions,projects,wallets,calendar,payments30,portfolio:{contract,realized,remaining,count:deals.length},quality,totals:{liquidity,operating,net,previousNet,obligations,attention}};
  }
  window.arbatDashboardSnapshot=snapshot;

  function ensure(){
    const overview=document.getElementById('overview');if(!overview)return null;
    let root=document.getElementById('dashboardVisuals');if(root)return root;
    root=document.createElement('div');root.id='dashboardVisuals';root.className='dashboard-visuals';
    root.innerHTML='<section class="dashboard-command"><div><span class="dashboard-eyebrow">УПРАВЛЕНЧЕСКАЯ ОТЧЁТНОСТЬ</span><h2 id="dashboardOwnerTitle">Финансовое состояние бизнеса</h2><p id="dashboardNarrative"></p></div><div class="dashboard-command-meta"><span id="dashboardStatus" class="dashboard-status"></span><small id="dashboardUpdated"></small></div></section><div id="dashboardKpis" class="dashboard-kpis"></div><div class="dashboard-layout"><article class="dashboard-panel dashboard-flow-panel"><div class="dashboard-panel-head"><div><h2>Движение денег</h2><p class="dashboard-subtitle">Поступления, выбытия и чистый поток по месяцам</p></div><div class="dashboard-legend"><span><i class="legend-in"></i>Поступления</span><span><i class="legend-out"></i>Выбытия</span><span><i class="legend-net"></i>Чистый поток</span></div></div><div id="dashboardCashFlow" class="dashboard-chart"></div><button type="button" class="dashboard-link" data-dashboard-route="cash">Открыть журнал ДДС →</button></article><article class="dashboard-panel dashboard-attention-panel"><div class="dashboard-panel-head"><div><h2>Требует внимания</h2><p class="dashboard-subtitle">То, что влияет на деньги и управляемость</p></div><span id="dashboardAttentionCount" class="dashboard-count"></span></div><div id="dashboardAttention"></div></article><article class="dashboard-panel dashboard-direction-panel"><div class="dashboard-panel-head"><div><h2>Эффективность направлений</h2><p class="dashboard-subtitle">Фактическая выручка, прямые затраты и маржа</p></div></div><div id="dashboardDirections"></div><button type="button" class="dashboard-link" data-dashboard-route="reports:pnl">Открыть ОПиУ →</button></article><article class="dashboard-panel dashboard-wallet-panel"><div class="dashboard-panel-head"><div><h2>Где находятся деньги</h2><p class="dashboard-subtitle">Структура ликвидности по кошелькам</p></div></div><div id="dashboardWallets"></div></article><article class="dashboard-panel dashboard-project-panel"><div class="dashboard-panel-head"><div><h2>Ключевые проекты</h2><p class="dashboard-subtitle">Крупнейший нереализованный портфель и фактический результат</p></div><span id="dashboardProjectCount" class="dashboard-count"></span></div><div id="dashboardProjects"></div><button type="button" class="dashboard-link" data-dashboard-route="deals">Все сделки →</button></article><article class="dashboard-panel dashboard-calendar-panel"><div class="dashboard-panel-head"><div><h2>Платёжный горизонт</h2><p class="dashboard-subtitle">Ближайшие обязательства на 30 дней</p></div></div><div id="dashboardCalendar"></div><button type="button" class="dashboard-link" data-dashboard-route="calendar">Открыть платёжный календарь →</button></article></div>';
    overview.prepend(root);
    root.addEventListener('click',event=>{const button=event.target.closest('[data-dashboard-route]');if(button)window.arbatNavigate?.(button.dataset.dashboardRoute)});
    return root;
  }
  function changeNote(current,previous){if(!previous)return 'Нет базы для сравнения';const change=(current-previous)/Math.abs(previous)*100;return (change>=0?'↑ ':'↓ ')+Math.abs(change).toLocaleString('ru-RU',{maximumFractionDigits:0})+'% к прошлому месяцу'}
  function kpis(data){
    const target=document.getElementById('dashboardKpis');if(!target)return;
    const coverage=data.totals.obligations?data.totals.liquidity/data.totals.obligations:Infinity;
    const rows=[
      ['Ликвидность',rub(data.totals.liquidity),data.wallets.length+' кошельков',data.totals.liquidity<0?'bad':'good','wallet'],
      ['Чистый поток месяца',rub(data.totals.net),changeNote(data.totals.net,data.totals.previousNet),data.totals.net<0?'bad':'good','flow'],
      ['Операционный результат',rub(data.totals.operating),data.totals.operating>=0?'Бизнес работает в плюс':'Расходы выше выручки',data.totals.operating<0?'bad':'good','result'],
      ['Портфель к реализации',rub(data.portfolio.remaining),data.portfolio.count+' активных сделок','accent','portfolio'],
      ['Платежи на 30 дней',rub(data.totals.obligations),data.totals.obligations?(coverage>=1?'Покрытие ×'+coverage.toLocaleString('ru-RU',{maximumFractionDigits:1}):'Не хватает '+rub(data.totals.obligations-data.totals.liquidity)):'Обязательства не внесены',coverage<1?'bad':'warn','calendar']
    ];
    const icons={wallet:'₽',flow:'↕',result:'∑',portfolio:'◫',calendar:'◷'};
    target.innerHTML=rows.map(item=>'<article class="dashboard-kpi '+item[3]+'"><div class="dashboard-kpi-top"><span>'+esc(item[0])+'</span><i>'+icons[item[4]]+'</i></div><strong title="'+esc(item[1])+'">'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></article>').join('');
  }
  function narrative(data){
    const target=document.getElementById('dashboardNarrative'),status=document.getElementById('dashboardStatus');if(!target||!status)return;
    let text='Деньги и обязательства сбалансированы, операционный результат положительный.',tone='good',label='Стабильно';
    if(!data.portfolio.count&&!data.flow.some(item=>item.income||item.outcome)){text='Данных пока недостаточно. Добавьте сделки, операции ДДС и обязательства — управленческая картина соберётся автоматически.';tone='neutral';label='Нужны данные'}
    else if(data.totals.liquidity<data.totals.obligations){text='Ликвидности недостаточно для внесённых обязательств на 30 дней. Нужен план поступлений или перенос платежей.';tone='bad';label='Дефицит денег'}
    else if(data.totals.operating<0){text='Бизнес имеет отрицательный операционный результат. Ниже видно, какие направления и проекты требуют решения.';tone='bad';label='Нужны действия'}
    else if(data.totals.net<0){text='Месяц идёт с отрицательным денежным потоком, но ближайшие обязательства покрыты текущей ликвидностью.';tone='warn';label='Под наблюдением'}
    else if(data.totals.attention){text='Финансовое состояние устойчивое, но есть вопросы качества данных и ближайшие контрольные точки.';tone='warn';label='Есть замечания'}
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
    const target=document.getElementById('dashboardProjects');if(!target)return;document.getElementById('dashboardProjectCount').textContent=data.projects.length;
    if(!data.projects.length){target.innerHTML='<div class="dashboard-empty">Создайте первую сделку — портфель появится здесь.</div>';return}
    target.innerHTML='<div class="dashboard-project-table"><div class="dashboard-project-row head"><span>Проект</span><span>Договор</span><span>Выполнено</span><span>Результат</span></div>'+data.projects.slice(0,6).map(item=>'<div class="dashboard-project-row"><span class="project-name" title="'+esc(item.name)+'"><strong>'+esc(item.name)+'</strong><small>'+esc(item.org||'')+'</small></span><span>'+rub(item.contract)+'</span><span class="project-progress"><b>'+rub(item.realized)+'</b><i><em style="width:'+item.progress+'%"></em></i></span><strong class="'+(item.result<0?'dashboard-negative':'dashboard-positive')+'">'+rub(item.result)+'</strong></div>').join('')+'</div>';
  }
  function calendar(data){
    const target=document.getElementById('dashboardCalendar');if(!target)return;const rows=data.payments30.slice(0,6);
    if(!rows.length){target.innerHTML='<div class="dashboard-all-good compact"><span>✓</span><strong>На 30 дней платежей нет</strong><small>По внесённым обязательствам.</small></div>';return}
    target.innerHTML='<div class="dashboard-calendar-list">'+rows.map(item=>'<div class="dashboard-calendar-item"><span class="dashboard-date"><strong>'+new Date(item.occurrence+'T12:00:00').getDate()+'</strong><small>'+new Date(item.occurrence+'T12:00:00').toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+'</small></span><span class="dashboard-payment"><strong title="'+esc(item.name)+'">'+esc(item.name)+'</strong><small title="'+esc(item.payee||item.org)+'">'+esc(item.payee||item.org)+'</small></span><b>'+rub(item.amount)+'</b></div>').join('')+'</div>';
  }
  function render(){if(typeof db==='undefined'||!ensure())return;const data=snapshot();narrative(data);kpis(data);cashChart(data);attention(data);directions(data);wallets(data);projects(data);calendar(data)}
  const original=window.render;if(typeof original==='function')window.render=function(){const result=original.apply(this,arguments);render();return result};
  document.getElementById('orgFilter')?.addEventListener('change',()=>requestAnimationFrame(render));render();
})();
