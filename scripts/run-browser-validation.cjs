/* Keep the full six-width, two-engine cash workflow out of shorter file shards. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const group=process.argv[2],cash='cash-workspace.cjs';
if(!['1','2','3','cash'].includes(group))throw Error('Expected browser group 1, 2, 3 or cash');
const root=path.resolve(__dirname,'..'),all=fs.readdirSync(path.join(root,'e2e')).filter(name=>name.endsWith('.cjs')).sort();
if(!all.includes(cash))throw Error('Cash workflow is missing');
const files=(group==='cash'?[cash]:all.filter(name=>name!==cash)).map(name=>'e2e/'+name);
const args=['--test','--test-concurrency=2',...(group==='cash'?[]:['--test-shard='+group+'/3']),...files];
const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
