const {createManager}=require('../../app/deletion-backups.js');
module.exports=async function withDeletionBackup(window,finance,warehouse,action){
 const records=new Map();let next=0;
 const archive={async write(row){records.set(++next,row);return next},async read(id){return records.get(id)},async list(){return [...records.values()]}};
 const manager=createManager({storage:{length:0},archive}),state={finance:JSON.stringify(finance),financeModel:JSON.stringify(finance),warehouse:JSON.stringify(warehouse)};
 window.ArbatBackups=manager;const ticket=await manager.prepare(state);return ticket.run(action);
};
