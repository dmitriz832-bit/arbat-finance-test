\set ON_ERROR_STOP on
-- An empty disposable database only; refusal to replace real tables is intentional.
begin;
do $$ begin
 if to_regclass('public.finance_state') is not null then raise exception 'Use an empty disposable database';end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
end $$;
create table public.finance_periods(period text primary key,status text);
create table public.finance_state(id text primary key,payload jsonb);
create table public.warehouse_state(id text primary key,payload jsonb);
\ir ../supabase/migrations/20261024163056_tax_recognition_period_guard.sql
insert into public.finance_periods values('2026-11','closed');
insert into public.finance_state values('main','{"cash":[{"_id":"open","date":"2026-10-01","amount":100}],"costs":[{"_id":"old","date":"2026-10-01","profitTaxRecognitionDate":"2026-11-01"}]}');
insert into public.warehouse_state values('main','{"moves":[{"id":"r","date":"2026-10-01","vatDeductionDate":"2026-11-01"}]}');
do $$ declare field text; begin
 foreach field in array array['usnRecognitionDate','profitTaxRecognitionDate','vatDeductionDate'] loop
  begin
   update public.finance_state set payload=jsonb_set(payload,array['cash','0',field],'"2026-11-02"');
   raise exception 'Expected closed tax month rejection';
  exception when others then if sqlerrm not like 'Financial period 2026-11 is closed:%' then raise;end if;end;
 end loop;
 begin
  update public.finance_state set payload=jsonb_set(payload,'{costs,0,profitTaxRecognitionDate}','"2026-12-01"');
  raise exception 'Expected old recognition month rejection';
 exception when others then if sqlerrm not like 'Financial period 2026-11 is closed:%' then raise;end if;end;
 begin
  update public.warehouse_state set payload='{"moves":[]}'::jsonb;
  raise exception 'Expected receipt deletion rejection';
 exception when others then if sqlerrm not like 'Financial period 2026-11 is closed:%' then raise;end if;end;
 -- An unchanged closed record does not prevent an independent open record edit.
 update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionDate}','"2026-10-02"');
 update public.finance_state set payload=payload;
 if exists(select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name='enforce_tax_recognition_periods' and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'Trigger function exposed';end if;
end $$;
rollback;
