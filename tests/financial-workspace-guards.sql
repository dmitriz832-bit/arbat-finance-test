\set ON_ERROR_STOP on
begin;
do $$ begin if to_regclass('public.finance_state') is not null then raise exception 'Use empty disposable database';end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end $$;
create schema if not exists auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.workspace_uid',true),'')::uuid$$;
create table public.staff_access(user_id uuid,enabled boolean,role text);
create table public.finance_periods(period text,status text);
create table public.finance_state(payload jsonb);
\ir ../supabase/migrations/20261027010000_financial_workspace_guards.sql
insert into public.finance_state values ('{"cash":[{"_id":"c","date":"2026-01-01"}]}');
insert into public.finance_periods values ('2026-01','closed');
do $$ declare section text; begin
 foreach section in array array['loanContracts','fixedAssets','budgetVersions','paymentRequests','deals'] loop
  begin update public.finance_state set payload=jsonb_set(payload,array[section],'[{"_id":"new","schedule":[{"dueDate":"2026-01-31"}]}]');raise exception 'Expected nested date rejection';exception when others then if sqlerrm not like 'Financial period 2026-01 is closed:%' then raise;end if;end;
 end loop;
 begin update public.finance_state set payload=payload||'{"fixedAssets":[{"_id":"a","inServiceDate":"2026-10-01","paymentLinks":[{"cashId":"c","amount":"1"}]}]}'::jsonb;raise exception 'Expected linked cash rejection';exception when others then if sqlerrm not like 'Financial period 2026-01 is closed:%' then raise;end if;end;
 update public.finance_state set payload=payload||'{"budgetVersions":[{"id":"b","status":"approved","cells":[{"month":"2026-02","amount":"10"}]}]}'::jsonb;
 begin update public.finance_state set payload=jsonb_set(payload,'{budgetVersions,0,cells,0,amount}','"11"');raise exception 'Expected immutable rejection';exception when others then if sqlerrm not like 'Approved budget is immutable:%' then raise;end if;end;
 update public.finance_state set payload=jsonb_set(payload,'{budgetVersions,0,updatedAt}','"2026-10-27T00:00:00Z"');
 if has_function_privilege('authenticated','public.enforce_financial_workspaces()','execute') then raise exception 'Trigger exposed';end if;
end $$;
do $$ begin
 update public.finance_state set payload=payload||'{"costs":[{"_id":"post","managementAccrual":true,"amount":"10","date":"2026-02-01"}],"paymentRequests":[{"id":"r","status":"approved","amount":"100","date":"2026-02-01"}],"calendar":[{"id":"alias","requestId":"r","amount":"100"}]}'::jsonb;
 begin update public.finance_state set payload=jsonb_set(payload,'{costs,0,amount}','"99"');raise exception 'Expected immutable accrual rejection';exception when others then if sqlerrm not like 'Posted management accrual is immutable:%' then raise;end if;end;
 begin update public.finance_state set payload=jsonb_set(payload,'{calendar,0,amount}','"1"');raise exception 'Expected owned calendar rejection';exception when others then if sqlerrm<>'Payment request owns its calendar plan' then raise;end if;end;
end $$;
insert into public.staff_access values ('11111111-1111-1111-1111-111111111111',true,'accountant');
select set_config('test.workspace_uid','11111111-1111-1111-1111-111111111111',true);
do $$ begin
 update public.finance_state set payload=payload||'{"paymentRequests":[{"id":"req","status":"draft","date":"2026-10-27"}]}'::jsonb;
 begin update public.finance_state set payload=jsonb_set(payload,'{paymentRequests,0,status}','"approved"');raise exception 'Expected accountant approval rejection';exception when others then if sqlerrm<>'Admin approval required' then raise;end if;end;
end $$;
rollback;
