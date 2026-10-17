const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'app/index.html'),'utf8');
const auth=fs.readFileSync(path.join(root,'app/auth.js'),'utf8');
const business=fs.readFileSync(path.join(root,'app/business-system.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'app/dashboard.js'),'utf8');

test('all local scripts and styles referenced by the app exist',()=>{
  const assets=[...html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)].map(match=>match[1]);
  assert.ok(assets.length>=10);
  for(const asset of assets)assert.ok(fs.existsSync(path.join(root,'app',asset)),`Missing app asset: ${asset}`);
});

test('static HTML ids are unique',()=>{
  const body=html.replace(/<script\b[\s\S]*?<\/script>/gi,'');
  const ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  const repeated=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
  assert.deepEqual(repeated,[]);
});

test('every legacy navigation key has a matching section',()=>{
  const source=html.match(/const keys=\[([^\]]+)\]/)?.[1]||'';
  const keys=[...source.matchAll(/'([^']+)'/g)].map(match=>match[1]);
  assert.ok(keys.length>=12);
  for(const key of keys)assert.match(html,new RegExp(`<section id="${key}"(?:\\s|>)`),`Missing section for route ${key}`);
  assert.doesNotMatch(html,/<title>[^<]*(?:demo|демо)/i);
});

test('owner dashboard contains distinct decision views and uses real business collections',()=>{
  for(const id of ['dashboardKpis','dashboardCashFlow','dashboardAttention','dashboardFinancial','dashboardSpending','dashboardProjects','dashboardSales','dashboardWarehouse','dashboardEvents'])assert.match(dashboard,new RegExp(id));
  for(const collection of ['db.cash','db.wallets','db.deals','db.realizations','db.expenses'])assert.match(dashboard,new RegExp(collection.replace('.','\\.')));
  assert.match(dashboard,/Финансовое состояние бизнеса/);
  assert.match(dashboard,/Проекты под контролем/);
  assert.doesNotMatch(dashboard,/Math\.random\(\).*chart|fake|mock/i);
});

test('column resizing persists every independent width and rechecks visible views',()=>{
  assert.match(business,/table\.dataset\.independentColumns/);
  assert.match(business,/syncTableWidth\(table,group\)/);
  assert.match(business,/group\.children\[index\]\.style\.width/);
  assert.match(business,/group\.children\.length!==headers\.length/);
  assert.match(business,/preferences\.columns\[key\]=\[\.\.\.group\.children\]/);
  assert.match(business,/ResizeObserver\(enhanceTables\)/);
  assert.match(business,/available<160/);
});

test('first login requires an invite or recovery session before password update',()=>{
  assert.match(auth,/\['invite','recovery'\]\.includes\(hash\.get\('type'\)\)/);
  assert.match(auth,/call\('\/auth\/v1\/user',\{password:passwordField\.value\},true,'PUT'\)/);
  assert.match(auth,/passwordField\.value!==passwordConfirm\.value/);
  assert.match(auth,/onboarding\('recover'\)/);
  assert.match(auth,/\/functions\/v1\/staff-onboarding/);
  assert.match(auth,/showFirstLogin/);
  assert.match(auth,/Отправить ссылку для первого входа/);
  assert.match(auth,/Забыли пароль\?/);
  assert.match(auth,/if\(!session&&authMode!=='setup'\)\{showLogin\(\)/);
  assert.doesNotMatch(auth,/service_role|sb_secret_/);
});
