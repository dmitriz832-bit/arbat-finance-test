// Run with node --test tests/warehouse-regression.cjs; uses the actual app functions.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
function declaration(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const next=source.indexOf('\nfunction ',start+1);return source.slice(start,next);}
function fixture(){
 const db={deals:[{_id:'p1',org:'АИР-КЛИМАТ'},{_id:'p2',org:'АРБАТ.ГК'}]};
 const context=vm.createContext({db});
 vm.runInContext(`const qty=(d,i,p)=>d.moves.reduce((n,m)=>m.itemId!==i?n:n+(m.to===p?Number(m.qty):0)-(m.from===p?Number(m.qty):0),0);`+['allocations','planned','crewFree','sameCrewPlaces','selectedCrewFree','projectAvailability'].map(declaration).join('\n'),context);
 const d={items:[{id:'bracket',name:'Кронштейн'}],places:[{id:'wa',org:'АИР-КЛИМАТ',type:'warehouse'},{id:'wb',org:'АРБАТ.ГК',type:'warehouse'},{id:'ca',org:'АИР-КЛИМАТ',type:'crew',linkedCrewId:'crew1'},{id:'cb',org:'АРБАТ.ГК',type:'crew',linkedCrewId:'crew1'},{id:'other',org:'АИР-КЛИМАТ',type:'crew',linkedCrewId:'crew2'}],moves:[],plans:[{dealId:'p1',lines:[{itemId:'bracket',qty:5}]}],projectIssues:[]};
 const stock=(to,qty)=>d.moves.push({to,itemId:'bracket',qty});
 return {d,stock,context};
}
test('warehouse issues cannot be reserved again as crew free stock',()=>{const {d,stock,context:c}=fixture();stock('ca',10);d.projectIssues.push({crewId:'ca',dealId:'p1',closed:false,lines:[{itemId:'bracket',issued:7,fromCrew:2}]});assert.equal(c.crewFree(d,'bracket','ca'),3);});
test('selected crew combines both organizations but excludes another crew',()=>{const {d,stock,context:c}=fixture();stock('ca',2);stock('cb',3);stock('other',100);assert.equal(c.selectedCrewFree(d,'bracket','ca'),5);assert.equal(c.projectAvailability(d,'p1','ca')[0].stat.shortage,0);});
test('other project reservations cannot be offered as available warehouse stock',()=>{const {d,stock,context:c}=fixture();stock('wb',7);d.plans.unshift({dealId:'p2',lines:[{itemId:'bracket',qty:5}]});const state=c.projectAvailability(d,'p1','ca')[0].stat;assert.equal(state.warehouseAvailable,2);assert.equal(state.shortage,3);});
test('repeated issue proposes only remaining need, net of consumption and open issues',()=>{const {d,context:c}=fixture();d.moves.push({kind:'consume',dealId:'p1',itemId:'bracket',qty:1});d.projectIssues.push({dealId:'p1',crewId:'ca',closed:false,lines:[{itemId:'bracket',issued:3}]});assert.equal(c.projectAvailability(d,'p1','ca')[0].stat.outstanding,1);});
test('closed issues do not keep crew stock reserved',()=>{const {d,stock,context:c}=fixture();stock('ca',2);d.projectIssues.push({crewId:'ca',closed:true,lines:[{itemId:'bracket',issued:7}]});assert.equal(c.crewFree(d,'bracket','ca'),2);});
