const test=require('node:test'),assert=require('node:assert/strict');
const f=require('../app/finance-core.js');
test('income below EBITDA increases management result and does not become an expense',()=>{
 const data={realizations:[{date:'2026-10-18',org:'A',amount:'10000',vatRate:0}],pnlArticles:[
 {id:'other',name:'Прочие доходы',type:'income',level:'below'},
 {id:'shop',name:'Цеховые',type:'expense',group:'Общепроизводственные'},
 {id:'sales',name:'Реклама',type:'expense',group:'Коммерческие'},
 {id:'admin',name:'Администрация',type:'expense',group:'Административные'},
 {id:'interest',name:'Проценты',type:'expense',level:'below'}
 ],costs:[
 {date:'2026-10-18',org:'A',name:'Прочие доходы',pnlArticleId:'other',amount:'500'},
 {date:'2026-10-18',org:'A',name:'Цеховые',pnlArticleId:'shop',amount:'1000'},
 {date:'2026-10-18',org:'A',name:'Реклама',pnlArticleId:'sales',amount:'300'},
 {date:'2026-10-18',org:'A',name:'Администрация',pnlArticleId:'admin',amount:'200'},
 {date:'2026-10-18',org:'A',name:'Проценты',pnlArticleId:'interest',amount:'100'}
 ]};
 const r=f.preliminaryPeriod(data,'2026-10','A');
 for(const [key,expected] of Object.entries({revenue:'10000.00',production:'1000.00',commercial:'300.00',administrative:'200.00',gross:'10000.00',ebitda:'8500.00',belowIncome:'500.00',belowExpenses:'100.00',result:'8900.00'}))assert.equal(f.rubles(r[key]),expected,key);
});
test('legacy unclassified expenses retain pre-existing administrative and direct semantics',()=>{
 const d={costs:[{date:'2026-10-18',amount:100},{date:'2026-10-18',amount:50,dir:'Сервис'}]};
 const r=f.preliminaryPeriod(d,'2026-10');
 assert.equal(f.rubles(r.administrative),'100.00');assert.equal(f.rubles(r.direct),'50.00');assert.equal(f.rubles(r.result),'-150.00');
});
