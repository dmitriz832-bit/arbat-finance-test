/* Give long multi-width workflows their own workers; all other files retain three shards. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const group=process.argv[2],long={cash:'cash-workspace.cjs',navigation:'navigation-containment.cjs',experience:'experience.cjs',stock:'general-stock-operations.cjs'};
if(!['1','2','3',...Object.keys(long)].includes(group))throw Error('Expected a numbered browser shard or named long workflow');
const root=path.resolve(__dirname,'..'),all=fs.readdirSync(path.join(root,'e2e')).filter(name=>name.endsWith('.cjs')).sort();
for(const name of Object.values(long))if(!all.includes(name))throw Error('Long workflow is missing: '+name);
const files=(long[group]?[long[group]]:all.filter(name=>!Object.values(long).includes(name))).map(name=>'e2e/'+name);
const args=['--test','--test-concurrency=2',...(long[group]?[]:['--test-shard='+group+'/3']),...files];
const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
