/* The full receipt-to-profit workflow has its own worker, without skipping cases. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const group=process.argv[2],cycle='business-cycle.cjs';
if(!['1','2','3','cycle'].includes(group))throw Error('Expected business group 1, 2, 3 or cycle');
const root=path.resolve(__dirname,'..'),all=fs.readdirSync(path.join(root,'acceptance')).filter(name=>name.endsWith('.cjs')).sort();
if(!all.includes(cycle))throw Error('Full business workflow is missing');
const files=(group==='cycle'?[cycle]:all.filter(name=>name!==cycle)).map(name=>'acceptance/'+name);
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...(group==='cycle'?[]:['--test-shard='+group+'/3']),...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
