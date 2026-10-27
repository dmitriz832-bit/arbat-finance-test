\set ON_ERROR_STOP on
-- Empty disposable PostgreSQL only. Every object and fixture rolls back.
begin;
do $$ begin
 if to_regprocedure('public.update_shared_state(text,jsonb,bigint)') is not null or to_regclass('public.finance_state') is not null then raise exception 'Use an empty disposable database';end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select '10000000-0000-0000-0000-000000000001'::uuid$$;
create function public.has_active_finance_session() returns boolean language sql stable as $$select current_setting('test.active',true)='true'$$;
create table public.staff_access(user_id uuid,enabled boolean,role text);
insert into public.staff_access values(auth.uid(),true,'accountant');
create table public.finance_state(id text primary key,payload jsonb not null,revision bigint not null,updated_at timestamptz,updated_by uuid);
create table public.warehouse_state(like public.finance_state including all);
create table public.finance_periods(period text primary key,status text);
create table public.stock_fixture_audit(store text,revision bigint);
create function public.stock_fixture_audit_write() returns trigger language plpgsql as $$begin insert into public.stock_fixture_audit values(tg_table_name,new.revision);return new;end$$;
create trigger finance_fixture_audit after update on public.finance_state for each row execute function public.stock_fixture_audit_write();
create trigger warehouse_fixture_audit after update on public.warehouse_state for each row execute function public.stock_fixture_audit_write();
-- Exact deployed writer body: the migration must retain this auth/CAS path.
create function public.update_shared_state(p_store text,p_payload jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_rev bigint;
begin
 if not public.has_active_finance_session() then raise exception 'Session revoked or expired';end if;
 if not exists(select 1 from public.staff_access a where a.user_id=auth.uid() and a.enabled and a.role in ('admin','accountant')) then raise exception 'Access denied';end if;
 if p_store='finance' then
   update public.finance_state set payload=p_payload,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id='main' and revision=p_expected_revision returning revision into v_rev;
 elsif p_store='warehouse' then
   update public.warehouse_state set payload=p_payload,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id='main' and revision=p_expected_revision returning revision into v_rev;
 else raise exception 'Unknown store';end if;
 if v_rev is null then raise exception 'Version conflict';end if;
 return v_rev;
end $$;
revoke all on function public.update_shared_state(text,jsonb,bigint) from public,anon;
grant execute on function public.update_shared_state(text,jsonb,bigint) to authenticated;
\ir ../supabase/migrations/20261018190000_extend_finance_period_lock.sql
create trigger finance_closed_period_guard before update of payload on public.finance_state for each row execute function public.enforce_closed_finance_periods();
\ir ../supabase/migrations/20261024163056_tax_recognition_period_guard.sql
\ir ../supabase/migrations/20261023155814_atomic_shared_state_batch.sql
\ir ../supabase/migrations/20261027124945_general_stock_operation_guards.sql

create function public.stock_fixture_finance() returns jsonb language sql immutable as $$select '{
 "deals":[{"_id":"deal","org":"Org","name":"Project"}],
 "expenses":[{"_id":"warehouse-consume-m","warehouseMoveId":"m","stockPurpose":"sale","saleRealizationId":"r","org":"Org","projectKey":"Org::Project","date":"2026-10-27","amount":"100.00","amountGross":"100.00","amountNet":"100.00","vatRate":0,"vatAmount":"0.00","vatDeductible":false,"warehouseGrossAmount":"120.00","warehouseValuationParts":[{"source":"source","qty":2,"grossValueCents":"12000","expenseValueCents":"10000","sourceGrossValueCents":"60000","sourceExpenseValueCents":"50000","expenseValuationStatus":"verified"}]}],
 "realizations":[{"_id":"r","warehouseSale":true,"warehouseDocumentId":"STOCK-op","warehouseMoveIds":["m"],"org":"Org","projectKey":"Org::Project","date":"2026-10-27","amount":"250.00","amountGross":"250.00","amountNet":"250.00","vatRate":0,"vatAmount":"0.00","lines":[{"itemId":"item","qty":2,"price":"125.00","amountGross":"250.00"}]}]
}'::jsonb$$;
create function public.stock_fixture_warehouse() returns jsonb language sql immutable as $$select '{"places":[{"id":"wh","org":"Org"}],"items":[{"id":"item"}],"moves":[
 {"id":"source","kind":"receipt","org":"Org","itemId":"item","date":"2026-10-01","to":"wh","qty":10,"price":"60.00","amountGross":"600.00","amountNet":"500.00","vatRate":20,"vatAmount":"100.00","vatDeductible":true},
 {"id":"m","kind":"consume","stockOperationKind":"sale","stockOperationId":"op","documentId":"STOCK-op","saleRealizationId":"r","stockPurpose":"sale","org":"Org","dealId":"deal","itemId":"item","from":"wh","qty":2,"date":"2026-10-27T10:00:00Z"}
]}'::jsonb$$;
create function public.stock_expect_failure(bf jsonb,bw jsonb,af jsonb,aw jsonb,label text) returns void language plpgsql as $$begin
 begin
  perform public.validate_general_stock_operation_graph(bf,bw,af,aw);
  raise exception 'UNEXPECTED ACCEPT: %',label;
 exception when others then if sqlerrm like 'UNEXPECTED ACCEPT:%' then raise;end if;end;
end$$;
select public.validate_general_stock_operation_graph('{}','{}',public.stock_fixture_finance(),public.stock_fixture_warehouse());
select public.validate_general_stock_operation_graph(public.stock_fixture_finance(),public.stock_fixture_warehouse(),public.stock_fixture_finance(),public.stock_fixture_warehouse());
-- Ordinary unmarked legacy documents remain editable.
select public.validate_general_stock_operation_graph('{"realizations":[{"_id":"old","amount":1}]}','{"moves":[{"id":"old","kind":"consume"}]}','{"realizations":[]}','{"moves":[]}');
-- Complete removal of an open document is coherent.
select public.validate_general_stock_operation_graph(public.stock_fixture_finance(),public.stock_fixture_warehouse(),public.stock_fixture_finance()||'{"expenses":[],"realizations":[]}',jsonb_set(public.stock_fixture_warehouse(),'{moves}',jsonb_build_array(public.stock_fixture_warehouse()#>'{moves,0}')));
-- Zero quantities, unconfirmed links and field stripping are never legacy.
do $$ declare f jsonb:=public.stock_fixture_finance();w jsonb:=public.stock_fixture_warehouse();bad jsonb;path text[];begin
 foreach path slice 1 in array array[array['moves','1','stockOperationKind'],array['moves','1','stockOperationId'],array['moves','1','saleRealizationId'],array['moves','1','stockPurpose'],array['moves','1','documentId']] loop
  perform public.stock_expect_failure(f,w,f,w#-path,'remove movement field '||path[3]);
 end loop;
 foreach path slice 1 in array array[array['realizations','0','warehouseSale'],array['realizations','0','warehouseDocumentId'],array['realizations','0','warehouseMoveIds']] loop
  perform public.stock_expect_failure(f,w,f#-path,w,'remove realization field '||path[3]);
 end loop;
 foreach path slice 1 in array array[array['expenses','0','warehouseMoveId'],array['expenses','0','stockPurpose'],array['expenses','0','saleRealizationId'],array['expenses','0','warehouseValuationParts']] loop
  perform public.stock_expect_failure(f,w,f#-path,w,'remove expense field '||path[3]);
 end loop;
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{realizations}','[]'),w,'delete realization');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses}','[]'),w,'delete expense');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves}',jsonb_build_array(w#>'{moves,0}')),'delete movement');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{realizations,0,warehouseMoveIds}','["m","m"]'),w,'duplicate movement reference');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves}',(w->'moves')||jsonb_build_array(w#>'{moves,1}')),'duplicate movement');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses}',(f->'expenses')||jsonb_build_array(f#>'{expenses,0}')),w,'duplicate expense');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,org}','"Foreign"'),w,'cross organization');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,projectKey}','"Org::Other"'),w,'cross project');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,date}','"2026-10-28"'),w,'cross date');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,vatDeductible}','true'),w,'expense deduction tamper');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,amount}','"99.00"'),w,'expense amount tamper');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,category}','"Other"'),w,'generic expense edit');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{realizations,0,amountGross}','"251.00"'),w,'revenue line mismatch');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{realizations,0,vatAmount}','"1.00"'),w,'revenue tax tamper');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{realizations,0,lines,0,qty}','3'),w,'line quantity mismatch');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,1,qty}','0'),'zero qty');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,1,from}','"other"'),'generic movement edit');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,0,to}','"elsewhere"'),'source physical place tamper');
 perform public.stock_expect_failure('{}','{}',f,jsonb_set(w,'{moves,0,to}','"elsewhere"'),'claim source at another place');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,0,vatDeductible}','false'),'source tax tamper');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,0,amountGross}','"601.00"'),'source amount tamper');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,warehouseValuationParts,0,source}','"foreign"'),w,'foreign source');
 perform public.stock_expect_failure(f,w,jsonb_set(f,'{expenses,0,warehouseValuationParts,0,sourceExpenseValueCents}','"49999"'),w,'source valuation mismatch');
 -- Stripping every sale field from surviving rows still fails using the before graph.
 bad:=jsonb_set(w,'{moves,1}',(w#>'{moves,1}')-array['stockOperationId','stockOperationKind','stockPurpose','saleRealizationId','documentId']);
 perform public.stock_expect_failure(f,w,jsonb_set(jsonb_set(f,'{realizations}','[]'),'{expenses,0}',(f#>'{expenses,0}')-array['stockPurpose','saleRealizationId']),bad,'downgrade sale to legacy');
 -- Half-formed claims are rejected even with no previous state.
 perform public.stock_expect_failure('{}','{}','{"realizations":[{"warehouseSale":true}]}','{}','empty sale identity');
 perform public.stock_expect_failure('{}','{}','{}','{"moves":[{"stockPurpose":"sale"}]}','empty movement identity');
end$$;
-- A combined receipt and consumption is a single warehouse document, without revenue.
do $$ declare f jsonb:=public.stock_fixture_finance();w jsonb:=public.stock_fixture_warehouse();begin
 f:=jsonb_set(f,'{realizations}','[]');f:=jsonb_set(f,'{expenses,0}',(f#>'{expenses,0}')-array['stockPurpose','saleRealizationId']);
 w:=jsonb_set(w,'{moves,0}',(w#>'{moves,0}')||'{"qty":2,"amountGross":"120.00","amountNet":"100.00","vatAmount":"20.00","stockOperationId":"op","stockOperationKind":"receipt-consume","documentId":"STOCK-op","dealId":"deal","date":"2026-10-27"}');
 w:=jsonb_set(w,'{moves,1}',((w#>'{moves,1}')-array['stockPurpose','saleRealizationId'])||'{"stockOperationKind":"receipt-consume","receiptConsumptionId":"source"}');
 f:=jsonb_set(f,'{expenses,0,warehouseValuationParts,0,sourceGrossValueCents}','"12000"');f:=jsonb_set(f,'{expenses,0,warehouseValuationParts,0,sourceExpenseValueCents}','"10000"');
 perform public.validate_general_stock_operation_graph('{}','{}',f,w);
 perform public.validate_general_stock_operation_graph(f,w,f||'{"expenses":[]}'::jsonb,w||'{"moves":[]}'::jsonb);
 perform public.stock_expect_failure(f||'{"cash":[{"supplierAllocations":[{"documentKey":"receipt:[\"Org\",\"STOCK-op\"]","amount":"120.00"}]}]}'::jsonb,w,f||'{"expenses":[]}'::jsonb,w||'{"moves":[]}'::jsonb,'cancel paid receipt');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,1,receiptConsumptionId}','"other"'),'combined foreign receipt');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves}',jsonb_build_array(w#>'{moves,0}')),'combined delete consumption');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,0,documentId}','"STOCK-other"'),'combined document mismatch');
 perform public.stock_expect_failure(f,w,f,jsonb_set(w,'{moves,0,qty}','3'),'combined quantity mismatch');
 -- A cancelled document may not leave a surviving old consumption without stock.
 perform public.stock_expect_failure(f,w,f||'{"expenses":[]}'::jsonb,jsonb_set(w,'{moves}',jsonb_build_array('{"id":"legacy","kind":"consume","org":"Org","itemId":"item","from":"wh","qty":1,"date":"2026-10-28"}'::jsonb)),'cancel breaks surviving legacy flow');
 -- Plain project consumption uses the same expense graph and no realization.
 w:=jsonb_set(w,'{moves,0}',public.stock_fixture_warehouse()#>'{moves,0}');
 w:=jsonb_set(w,'{moves,1}',((w#>'{moves,1}')-'receiptConsumptionId')||'{"stockOperationKind":"consume"}');
 f:=jsonb_set(f,'{expenses,0,warehouseValuationParts,0,sourceGrossValueCents}','"60000"');f:=jsonb_set(f,'{expenses,0,warehouseValuationParts,0,sourceExpenseValueCents}','"50000"');
 perform public.validate_general_stock_operation_graph('{}','{}',f,w);
end$$;


-- Physical source proof follows dated transfers and rejects convenient forged lots.
do $$declare f jsonb:=public.stock_fixture_finance();w jsonb:=public.stock_fixture_warehouse();bad jsonb;begin
 w:=jsonb_set(w,'{places}',(w->'places')||'[{"id":"wh2","org":"Org"}]'::jsonb);
 w:=jsonb_set(w,'{moves}',jsonb_build_array(w#>'{moves,0}', '{"id":"transfer","kind":"transfer","org":"Org","itemId":"item","from":"wh","to":"wh2","qty":2,"date":"2026-10-10"}'::jsonb,(w#>'{moves,1}')||'{"from":"wh2"}'::jsonb));
 perform public.validate_general_stock_operation_graph('{}','{}',f,w);
 perform public.stock_expect_failure('{}','{}',f,jsonb_set(w,'{moves}',jsonb_build_array(w#>'{moves,0}',w#>'{moves,2}')),'claim transferred stock without transfer');
 perform public.stock_expect_failure('{}','{}',f,jsonb_set(w,'{moves,1,date}','"2026-10-28"'),'claim stock before transfer');
 w:=public.stock_fixture_warehouse();
 w:=jsonb_set(w,'{moves}',jsonb_build_array(w#>'{moves,0}',(w#>'{moves,0}')||'{"id":"cheap","date":"2026-10-02","price":"1.00","amountGross":"10.00","amountNet":"10.00","vatRate":0,"vatAmount":"0.00"}',w#>'{moves,1}'));
 f:=jsonb_set(f,'{expenses,0}',(f#>'{expenses,0}')||'{"amount":"2.00","amountGross":"2.00","amountNet":"2.00","warehouseGrossAmount":"2.00","warehouseValuationParts":[{"source":"cheap","qty":2,"grossValueCents":"200","expenseValueCents":"200","sourceGrossValueCents":"1000","sourceExpenseValueCents":"1000","expenseValuationStatus":"verified"}]}'::jsonb);
 perform public.stock_expect_failure('{}','{}',f,w,'select cheaper later lot instead of FIFO');
end$$;
-- Numeric normalization performed by the native expense reconciler is safe.
select public.validate_general_stock_operation_graph(public.stock_fixture_finance(),public.stock_fixture_warehouse(),jsonb_set(public.stock_fixture_finance(),'{expenses,0}',(public.stock_fixture_finance()#>'{expenses,0}')||'{"amount":100,"amountGross":100,"amountNet":100,"warehouseGrossAmount":120,"vatAmount":0,"note":"Refreshed native note","valuationStatus":"verified","vatRateSource":"internal-warehouse-cost"}'::jsonb),public.stock_fixture_warehouse());

insert into public.finance_state values('main',public.stock_fixture_finance()||'{"expenses":[],"realizations":[]}',1,null,null);
insert into public.warehouse_state values('main',jsonb_set(public.stock_fixture_warehouse(),'{moves}',jsonb_build_array(public.stock_fixture_warehouse()#>'{moves,0}')),1,null,null);
set local test.active='true';
set local role authenticated;
-- Direct single-store RPC cannot introduce a dangling graph.
do $$ begin
 begin perform public.update_shared_state('finance',public.stock_fixture_finance(),1);raise exception 'UNEXPECTED ACCEPT: unilateral finance';exception when others then if sqlerrm like 'UNEXPECTED ACCEPT:%' then raise;end if;end;
 begin perform public.update_shared_state('warehouse',public.stock_fixture_warehouse(),1);raise exception 'UNEXPECTED ACCEPT: unilateral warehouse';exception when others then if sqlerrm like 'UNEXPECTED ACCEPT:%' then raise;end if;end;
 begin perform public.update_shared_state_batch(jsonb_build_array(jsonb_build_object('store','finance','payload',public.stock_fixture_finance(),'expected_revision',1),jsonb_build_object('store','warehouse','payload',public.stock_fixture_warehouse(),'expected_revision',99)));raise exception 'UNEXPECTED ACCEPT: CAS';exception when others then if sqlerrm<>'Version conflict' then raise;end if;end;
end$$;
reset role;
do $$begin if exists(select 1 from public.finance_state where revision<>1) or exists(select 1 from public.warehouse_state where revision<>1) or exists(select 1 from public.stock_fixture_audit) then raise exception 'Rejected graph or CAS partially wrote state/audit';end if;end$$;
-- Actual existing period triggers reject even a coherent batch and roll back audit.
insert into public.finance_periods values('2026-10','closed');
set local role authenticated;
do $$begin
 begin perform public.update_shared_state_batch(jsonb_build_array(jsonb_build_object('store','finance','payload',public.stock_fixture_finance(),'expected_revision',1),jsonb_build_object('store','warehouse','payload',public.stock_fixture_warehouse(),'expected_revision',1)));raise exception 'UNEXPECTED ACCEPT: closed period';exception when others then if sqlerrm not like 'Financial period 2026-10 is closed:%' then raise;end if;end;
end$$;
reset role;
delete from public.finance_periods;
-- Finance writes first; a closed original warehouse receipt month must roll it
-- back together with the first audit, even though operation dates are open.
update public.warehouse_state set payload=jsonb_set(payload,'{moves,0,date}','"2026-09-01"') where id='main';
truncate public.stock_fixture_audit;
insert into public.finance_periods values('2026-09','closed');
set local role authenticated;
do $$declare w jsonb:=public.stock_fixture_warehouse();begin
 w:=jsonb_set(w,'{moves,0,date}','"2026-09-01"');w:=jsonb_set(w,'{moves,0,note}','"Warehouse guard must reject this edit"');
 begin perform public.update_shared_state_batch(jsonb_build_array(jsonb_build_object('store','finance','payload',public.stock_fixture_finance(),'expected_revision',1),jsonb_build_object('store','warehouse','payload',w,'expected_revision',1)));raise exception 'UNEXPECTED ACCEPT: second store closed period';exception when others then if sqlerrm not like 'Financial period 2026-09 is closed:%' then raise;end if;end;
end$$;
reset role;
do $$begin if exists(select 1 from public.finance_state where revision<>1) or exists(select 1 from public.warehouse_state where revision<>1) or exists(select 1 from public.stock_fixture_audit) then raise exception 'Second-store period guard partially committed state or audit';end if;end$$;
delete from public.finance_periods;
update public.warehouse_state set payload=jsonb_set(payload,'{moves,0,date}','"2026-10-01"') where id='main';
truncate public.stock_fixture_audit;
set local role authenticated;
set local test.active='false';
do $$begin
 begin perform public.update_shared_state_batch('[{"store":"finance","payload":{},"expected_revision":1}]');raise exception 'UNEXPECTED ACCEPT: revoked';exception when others then if sqlerrm<>'Session revoked or expired' then raise;end if;end;
 -- Calling the reserved path directly retains exactly the same session guard.
 begin perform public.update_shared_state('stock-batch','[{"store":"finance","payload":{},"expected_revision":1}]',0);raise exception 'UNEXPECTED ACCEPT: reserved path revoked';exception when others then if sqlerrm<>'Session revoked or expired' then raise;end if;end;
end$$;
set local test.active='true';
reset role;
update public.staff_access set role='employee';
set local role authenticated;
do $$begin begin perform public.update_shared_state_batch('[{"store":"finance","payload":{},"expected_revision":1}]');raise exception 'UNEXPECTED ACCEPT: employee';exception when others then if sqlerrm<>'Access denied' then raise;end if;end;end$$;
reset role;
update public.staff_access set role='accountant';
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.update_shared_state_batch(jsonb_build_array(jsonb_build_object('store','warehouse','payload',public.stock_fixture_warehouse(),'expected_revision',1),jsonb_build_object('store','finance','payload',public.stock_fixture_finance(),'expected_revision',1)));
 if result<>'{"finance":2,"warehouse":2}'::jsonb then raise exception 'Unexpected batch revisions: %',result;end if;
 begin perform public.update_shared_state('finance',jsonb_set(public.stock_fixture_finance(),'{realizations}','[]'),2);raise exception 'UNEXPECTED ACCEPT: generic realization removal';exception when others then if sqlerrm like 'UNEXPECTED ACCEPT:%' then raise;end if;end;
 begin perform public.update_shared_state('finance',jsonb_set(public.stock_fixture_finance(),'{expenses,0,vatDeductible}','true'),2);raise exception 'UNEXPECTED ACCEPT: generic tax edit';exception when others then if sqlerrm like 'UNEXPECTED ACCEPT:%' then raise;end if;end;
end$$;
reset role;
do $$declare signature text;begin
 if (select revision from public.finance_state where id='main')<>2 or (select revision from public.warehouse_state where id='main')<>2 or (select count(*) from public.stock_fixture_audit)<>2 then raise exception 'Batch did not atomically write both stores/audits';end if;
 if (select string_agg(store,',' order by ctid) from public.stock_fixture_audit)<>'finance_state,warehouse_state' then raise exception 'Unstable write order';end if;
 foreach signature in array array['public.stock_operation_fifo_parts(jsonb)','public.validate_general_stock_operation_graph(jsonb,jsonb,jsonb,jsonb)','public.stock_operation_uri_component(text)','public._update_shared_state_stock_base(text,jsonb,bigint)'] loop
  if has_function_privilege('anon',signature,'execute') or has_function_privilege('authenticated',signature,'execute') then raise exception 'Private helper execute exposed: %',signature;end if;
 end loop;
 if (select prosecdef from pg_proc where oid='public.stock_operation_fifo_parts(jsonb)'::regprocedure) or (select prosecdef from pg_proc where oid='public.validate_general_stock_operation_graph(jsonb,jsonb,jsonb,jsonb)'::regprocedure) or (select prosecdef from pg_proc where oid='public.update_shared_state_batch(jsonb)'::regprocedure) then raise exception 'Graph guard or batch escalates privileges';end if;
 if has_function_privilege('anon','public.update_shared_state(text,jsonb,bigint)','execute') or has_function_privilege('anon','public.update_shared_state_batch(jsonb)','execute') then raise exception 'Anonymous RPC exposed';end if;
 if not has_function_privilege('authenticated','public.update_shared_state(text,jsonb,bigint)','execute') or not has_function_privilege('authenticated','public.update_shared_state_batch(jsonb)','execute') then raise exception 'Authenticated RPC lost';end if;
 if has_table_privilege('authenticated','public.finance_state','update') or has_table_privilege('authenticated','public.warehouse_state','update') then raise exception 'Direct table writes exposed';end if;
 if pg_get_functiondef('public._update_shared_state_stock_base(text,jsonb,bigint)'::regprocedure) not like '%has_active_finance_session%' or pg_get_functiondef('public._update_shared_state_stock_base(text,jsonb,bigint)'::regprocedure) not like '%revision=p_expected_revision%' then raise exception 'Original writer auth/CAS hook lost';end if;
end$$;
rollback;
\echo General stock operation graph, original RPC guards and atomic rollback checks passed
