const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../app/report-analysis-model.js'),model=fs.existsSync(file)?require(file):{},core=require('../app/finance-core.js');
const A='АИР-КЛИМАТ',B='АРБАТ.ГК',key=A+'::1C#AN-1';
const fixture=()=>({deals:[{_id:'deal',org:A,order1c:'AN-1',name:'Объект',dir:'Монтаж',contractTotal:'1000',vatRate:0}],articles:[{id:'sales',name:'Продажи'},{id:'supply',name:'Материалы'},{id:'zero',name:'Без операций'}],wallets:[{id:'wa',name:'Расчётный счёт',org:A},{id:'wb',name:'Касса',org:B}],counterparties:[{id:'p',name:'Поставщик'}],cash:[{_id:'c1',org:A,date:'2026-01-02',type:'in',amount:'9007199254740993.01',articleId:'sales',walletId:'wa',projectKey:key,payee:'Клиент'},{_id:'c2',org:A,date:'2026-02-03',type:'out',amount:'23.45',articleId:'supply',walletId:'wa',counterpartyId:'p'},{_id:'c3',org:A,date:'2026-04-03',type:'in',amount:'7.02',articleId:'sales',walletId:'wa'},{_id:'ct',org:A,date:'2026-02-06',type:'transfer',amount:'50',walletId:'wa',toWalletId:'wb'},{_id:'other',org:B,date:'2026-01-02',type:'in',amount:'777',articleId:'sales',walletId:'wb'}],realizations:[{_id:'r1',org:A,date:'2026-01-08',projectKey:key,amount:'500',vatRate:0,document:'Акт'},{_id:'r2',org:A,date:'2026-03-08',projectKey:key,amount:'500',vatRate:0,document:'Акт 2'}],expenses:[{_id:'e1',org:A,date:'2026-01-02',projectKey:key,amount:'300',vatRate:0}],costs:[{_id:'other-income',org:A,date:'2026-02-05',amount:'-25.43',vatRate:0,pnlType:'income',name:'Возврат дохода'},{_id:'tax',org:A,date:'2026-01-31',amount:'13.11',vatRate:0,managementTax:true,managementTaxType:'usn',managementTaxPeriod:'2026-01',document:'Налог января'}],people:[],labor:[],workActs:[],warehouse:{},wipAccounting:true});
const opts={kind:'cash',from:'2026-01-01',to:'2026-12-31',org:A,granularity:'month',groupBy:'article'};
const sum=rows=>rows.reduce((s,r)=>s+r.amount,0n);
test('report periods clip real days and weeks; monthly, quarterly and yearly exact totals reconcile beyond Number precision',()=>{
 assert.equal(typeof model.snapshot,'function');
 const data=fixture(),monthly=model.snapshot(data,opts,core),quarterly=model.snapshot(data,{...opts,granularity:'quarter'},core),yearly=model.snapshot(data,{...opts,granularity:'year'},core);
 assert.equal(monthly.columns.length,12);assert.equal(quarterly.columns.length,4);assert.equal(yearly.columns.length,1);
 const expected=core.cents('9007199254740993.01')+702n-2345n;
 for(const view of [monthly,quarterly,yearly]){assert.equal(view.totals.net,expected);const row=view.rows.find(r=>r.id==='net');assert.equal(row.total.amount,expected);for(const cell of [...row.cells,row.total])assert.equal(sum(cell.sources),cell.amount);}
 assert.deepEqual(model.periods('2026-01-30','2026-02-03','month').map(x=>[x.from,x.to]),[['2026-01-30','2026-01-31'],['2026-02-01','2026-02-03']]);
 assert.deepEqual(model.periods('2026-01-04','2026-01-06','week').map(x=>[x.from,x.to]),[['2026-01-04','2026-01-04'],['2026-01-05','2026-01-06']]);
 assert.throws(()=>model.periods('2026-02-30','2026-03-01','day'),/дат|date/i);
});
test('cash group/date/org filters change exact cells, totals and source rows together; transfers stay separate',()=>{
 const data=fixture();
 for(const groupBy of ['article','direction','wallet','party']){
  const view=model.snapshot(data,{...opts,groupBy},core),net=view.rows.find(x=>x.id==='net');assert.equal(sum(net.total.sources),view.totals.net);assert.equal(net.total.sources.some(x=>x.id==='ct'||x.id==='other'),false);
  for(const row of view.rows)for(const cell of [...row.cells,row.total])assert.equal(sum(cell.sources),cell.amount,groupBy+' '+row.label);
 }
 const selected=model.snapshot(data,{...opts,groupFilter:'sales',from:'2026-04-01',to:'2026-04-30'},core);assert.equal(selected.totals.net,702n);assert.deepEqual(selected.rows.find(x=>x.id==='net').total.sources.map(x=>x.id),['c3']);
 const query=model.snapshot(data,{...opts,search:'Материалы'},core);assert.equal(query.totals.net,-2345n);assert.deepEqual(query.rows.find(x=>x.id==='net').total.sources.map(x=>x.id),['c2']);
 const all=model.snapshot(data,{...opts,hideZero:false},core),nonzero=model.snapshot(data,{...opts,hideZero:true},core);assert.ok(all.rows.some(x=>x.groupKey==='zero'));assert.equal(nonzero.rows.some(x=>x.groupKey==='zero'),false);
 assert.equal(model.snapshot(data,{...opts,org:B},core).totals.net,77700n);
});
test('P&L preserves the core monthly WIP, negative other income, monthly tax and exact source bijection at every granularity',()=>{
 const data=fixture(),pnl={...opts,kind:'pnl',groupBy:'category'};
 for(const granularity of ['day','week','month','quarter','year']){
  const view=model.snapshot(data,{...pnl,granularity},core),coreTotal=core.ownerPeriodSnapshot(data,{from:opts.from,to:opts.to},A);assert.equal(view.totals.result,coreTotal.result,granularity);
  for(const row of view.rows)for(const cell of [...row.cells,row.total])assert.equal(sum(cell.sources),cell.amount,granularity+' '+row.label);
  assert.equal(view.rows.find(x=>x.id==='belowIncome').total.amount,-2543n);assert.equal(view.rows.find(x=>x.id==='tax').total.amount,-1311n);
 }
 const jan=model.snapshot(data,{...pnl,to:'2026-01-31'},core);assert.equal(jan.rows.find(x=>x.id==='wip').total.amount,15000n);assert.equal(jan.rows.find(x=>x.id==='wip').total.sources[0].calculated,true);
 for(const groupBy of ['source','direction']){const v=model.snapshot(data,{...pnl,groupBy},core);assert.equal(sum(v.rows.filter(x=>x.groupKey).map(r=>({amount:r.total.amount}))),v.totals.result);}
 const filtered=model.snapshot(data,{...pnl,groupBy:'source',groupFilter:'management-tax'},core);assert.equal(filtered.totals.result,-1311n);assert.deepEqual(filtered.rows.find(x=>x.id==='result').total.sources.map(x=>x.id),['tax']);
});
test('percentage denominators are positive revenue or matching cash family, never a zero/negative net; CSV uses exact numeric rubles and safe names',()=>{
 const data=fixture(),view=model.snapshot(data,opts,core),out=view.rows.find(x=>x.id==='out:supply');assert.equal(out.total.denominator,2345n);assert.equal(out.total.percent,'100,0%');assert.equal(view.rows.find(x=>x.id==='net').total.percent,null);
 const filtered=model.snapshot(data,{...opts,kind:'pnl',groupBy:'source',groupFilter:'management-tax'},core);assert.equal(filtered.rows.find(x=>x.id==='result').total.percent,null);
 data.articles[0].name='=HYPERLINK("bad")';const csv=model.csv(model.snapshot(data,opts,core),core);assert.match(csv,/9007199254740993\.01/);assert.doesNotMatch(csv,/₽/);assert.match(csv,/'=HYPERLINK/);
 const before=JSON.stringify(data);model.snapshot(data,{...opts,rowOrder:['out:supply','in:sales']},core);assert.equal(JSON.stringify(data),before,'analysis never posts or mutates source documents');
});
test('saved row order remains inside its financial section without moving subtotal rows or duplicating ids',()=>{
 const data=fixture(),view=model.snapshot(data,{...opts,hideZero:false,rowOrder:['in:zero','in:supply','in:sales','out:sales','out:supply','out:zero']},core),ids=view.rows.map(x=>x.id);
 assert.deepEqual(ids.slice(0,4),['in','in:zero','in:supply','in:sales']);assert.equal(ids.indexOf('out'),model.snapshot(data,{...opts,hideZero:false},core).rows.findIndex(x=>x.id==='out'));assert.equal(new Set(ids).size,ids.length);assert.equal(view.rows.find(x=>x.id==='net').total.amount,core.cents('9007199254740976.58'));
});
test('cash counterparty grouping uses native customer, employee and free-text fields with inclusive ISO day cutoffs',()=>{
 const data={counterparties:[{id:'same',name:'Покупатель'}],people:[{id:'same',name:'Монтажник'}],cash:[{_id:'client',date:'2026-04-12T10:15:00Z',org:A,type:'in',amount:'10',customerId:'same'},{_id:'person',date:'2026-04-12',org:A,type:'out',amount:'2',personId:'same'},{_id:'text',date:'2026-04-12',org:A,type:'out',amount:'3',counterparty:'Свободное имя'}]};
 const view=model.snapshot(data,{...opts,from:'2026-04-12',to:'2026-04-12',groupBy:'party'},core);assert.equal(view.totals.net,500n);assert.equal(view.rows.find(x=>x.id==='in:cp:same')?.label,'Покупатель');assert.equal(view.rows.find(x=>x.id==='out:person:same')?.label,'Монтажник');assert.equal(view.rows.find(x=>x.id==='out:Свободное имя')?.total.amount,300n);assert.equal(model.snapshot(data,{...opts,from:'2026-04-12',to:'2026-04-12',groupBy:'party',groupFilter:'cp:same'},core).totals.net,1000n);
});
test('P&L all organizations reconcile and directional filters retain allocated source parts without inventing tax documents',()=>{
 const data=fixture();data.realizations.push({_id:'b-sale',org:B,date:'2026-04-15',amount:'1220',vatRate:22});data.costs.push({_id:'b-cost',org:B,date:'2026-04-15',amount:'122',vatRate:22,pnlGroup:'Административные'});data.costs.push({_id:'allocated',org:A,date:'2026-04-15',amount:'9.99',vatRate:0,pnlAllocationRule:'proportional',pnlAllocations:[{dir:'Монтаж',weight:1},{dir:'Сервис',weight:2}]});
 const options={...opts,kind:'pnl',groupBy:'direction'},all=model.snapshot(data,{...options,org:''},core),a=model.snapshot(data,options,core),b=model.snapshot(data,{...options,org:B},core);assert.equal(all.totals.result,a.totals.result+b.totals.result);assert.equal(b.totals.result,87800n,'unconfirmed input VAT stays in expense under the existing core');const service=model.snapshot(data,{...options,groupFilter:'Сервис'},core);assert.equal(service.totals.result,-666n);assert.deepEqual(service.rows.find(x=>x.id==='result').total.sources.map(x=>[x.id,x.amount]),[['allocated',-666n]]);assert.equal(service.rows.find(x=>x.id==='result').total.sources.some(x=>x.collection==='taxPnl'),false);
});
test('native cash allocations split exact direction contributions and retain original document amounts, with residual and direct-key semantics',()=>{
 const projects=[{org:A,order1c:'D1',dir:'Монтаж'},{org:A,order1c:'D2',dir:'Сервис'}],first=core.dealKey(projects[0]),second=core.dealKey(projects[1]),source={_id:'split',date:'2026-04-12',org:A,type:'out',amount:'100',allocations:[{projectKey:first,amount:'40'},{projectKey:second,amount:'60'}]},data={deals:projects,cash:[source]},options={...opts,groupBy:'direction'},before=JSON.stringify(data);
 for(const [groupFilter,expected] of [['Монтаж',4000n],['Сервис',6000n]]){const view=model.snapshot(data,{...options,groupFilter},core),row=view.rows.find(x=>x.id==='out:'+groupFilter);assert.equal(view.totals.outgoing,expected);assert.equal(view.totals.net,-expected);assert.equal(row.total.amount,expected);assert.equal(sum(row.total.sources),expected);assert.equal(row.total.sources[0].source,source);assert.equal(row.total.sources[0].documentAmount,10000n);assert.equal(row.total.sources[0].allocatedAmount,expected);}
 let view=model.snapshot(data,options,core);assert.equal(view.totals.net,-10000n);assert.equal(sum(view.rows.find(x=>x.id==='net').total.sources),-10000n);
 source.allocations[1].amount='59.99';view=model.snapshot(data,options,core);assert.equal(view.rows.find(x=>x.id==='out:unassigned').total.amount,1n);assert.equal(view.totals.outgoing,10000n);
 source.allocations=[{projectKey:second,amount:'100'}];source.projectKey=first;assert.equal(model.snapshot(data,{...options,groupFilter:'Сервис'},core).totals.outgoing,10000n,'explicit native allocation wins over a stale direct project key');
 source.allocations=[];assert.equal(model.snapshot(data,{...options,groupFilter:'Монтаж'},core).totals.outgoing,10000n,'an empty allocation list retains a valid direct project binding');
 delete source.allocations;source.projectAllocations=[{projectKey:second,amount:'100'}];assert.equal(model.snapshot(data,{...options,groupFilter:'Сервис'},core).totals.outgoing,10000n,'legacy core receipt allocation spelling stays supported');
 data.cash=[{...source,projectKey:'',projectAllocations:undefined,allocations:[{projectKey:first,amount:'9007199254740993.01'},{projectKey:second,amount:'0.02'}],amount:'9007199254740993.03'}];view=model.snapshot(data,options,core);assert.equal(view.totals.outgoing,900719925474099303n);assert.equal(view.rows.find(x=>x.id==='out:'+first)?.total.amount,undefined);assert.equal(model.snapshot(data,{...options,groupFilter:'Монтаж'},core).totals.outgoing,900719925474099301n);
 assert.notEqual(JSON.stringify(data),before,'fixture edits above are intentional');const stable=JSON.stringify(data);model.snapshot(data,options,core);assert.equal(JSON.stringify(data),stable,'projection never writes amounts or allocations');
});
test('invalid native direction allocation sets are kept wholly unassigned and reported for review, never partially attributed',()=>{
 const projects=[{org:A,order1c:'V1',dir:'Монтаж'},{org:A,order1c:'V2',dir:'Сервис'},{org:B,order1c:'V3',dir:'Чужое направление'}],first=core.dealKey(projects[0]),second=core.dealKey(projects[1]),foreign=core.dealKey(projects[2]),options={...opts,groupBy:'direction'};
 for(const allocations of [[{projectKey:first,amount:'40'},{projectKey:second,amount:'60.01'}],[{projectKey:first,amount:'40'},{projectKey:second,amount:'-1'}],[{projectKey:first,amount:'40'},{projectKey:'missing',amount:'60'}],[{projectKey:first,amount:'40'},{projectKey:foreign,amount:'60'}],[{projectKey:first,amount:'40'},{projectKey:second,amount:'bad'}],[{projectKey:first,amount:'40'},{projectKey:first,amount:'60'}]]){
  const source={_id:'invalid',date:'2026-04-12',org:A,type:'out',amount:'100',projectKey:first,allocations},data={deals:projects,cash:[source]},view=model.snapshot(data,options,core);assert.equal(view.rows.find(x=>x.id==='out:unassigned')?.total.amount,10000n);assert.equal(view.totals.outgoing,10000n);assert.equal(sum(view.rows.find(x=>x.id==='net').total.sources),-10000n);assert.equal(model.snapshot(data,{...options,groupFilter:'Монтаж'},core).totals.outgoing,0n);assert.ok(view.issues.some(x=>x.source===source&&/cash-direction-allocation/.test(x.code)));assert.equal(view.rows.find(x=>x.id==='out:unassigned').total.sources[0].documentAmount,10000n);
 }
});
