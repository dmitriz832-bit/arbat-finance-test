'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app/fintablo-ui.css'),'utf8');

test('dashboard loads the standalone visual layer after existing CSS',()=>{
  assert.match(html,/<link rel="stylesheet" href="\.\/fintablo-ui\.css">/);
  const mainStyle=html.indexOf('</style>');
  const theme=html.indexOf('href="./fintablo-ui.css"');
  assert.ok(mainStyle>=0&&theme>mainStyle);
});
test('existing dashboard data hooks are retained',()=>{
  for(const id of ['overview','kpis','ownerPeriodMode','ownerPeriodReference','ownerMetricDetails','ownerDebtStats','ownerStockStats','ownerLiquidity','walletBalances','calendarAlerts','results','warnings']){
    assert.ok(html.includes('id="'+id+'"'),'Missing dashboard hook: '+id);
  }
});
test('light theme and responsive breakpoints are present',()=>{
  for(const token of ['--ui-bg','--ui-surface','--ui-blue','--ui-line']) assert.ok(css.includes(token),'Missing theme token: '+token);
  assert.match(css,/#overview\.active\s*\{/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
});
