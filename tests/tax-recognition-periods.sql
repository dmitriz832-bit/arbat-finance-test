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
\ir ../supabase/migrations/20261024164500_tax_recognition_event_period_guard.sql
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
 -- Event-level dates are protected on insert, update, and removal.
 begin
  update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionEvents}','[{"id":"a","date":"2026-11-02","amount":10,"document":"УПД"}]'::jsonb);
  raise exception 'Expected event insertion rejection';
 exception when others then if sqlerrm not like 'Financial period 2026-11 is closed:%' then raise;end if;end;
 update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionEvents}','[{"id":"a","date":"2026-10-02","amount":10,"document":"УПД"}]'::jsonb);
 begin
  update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionEvents,0,date}','"2026-11-03"');
  raise exception 'Expected event moved into closed month rejection';
 exception when others then if sqlerrm not like 'Financial period 2026-11 is closed:%' then raise;end if;end;
 -- Once a month is closed, old event dates protect edits, deletion and moving out.
 insert into public.finance_periods values('2026-10','closed');
 foreach field in array array['usnRecognitionEvents','profitTaxRecognitionEvents'] loop
  -- Both event kinds use the same guard; seed a fixture without changing real documents.
  alter table public.finance_state disable trigger finance_tax_period_guard;
  update public.finance_state set payload=jsonb_build_object('cash',jsonb_build_array(jsonb_build_object('_id','event','date','2026-09-01',field,jsonb_build_array(jsonb_build_object('id','a','date','2026-10-02','amount',10,'document','Act')))));
  alter table public.finance_state enable trigger finance_tax_period_guard;
  begin
   update public.finance_state set payload=jsonb_set(payload,array['cash','0',field,'0','amount'],'20');
   raise exception 'Expected closed event edit rejection';
  exception when others then if sqlerrm not like 'Financial period 2026-10 is closed:%' then raise;end if;end;
  begin
   update public.finance_state set payload=jsonb_set(payload,array['cash','0',field],'[]');
   raise exception 'Expected closed event removal rejection';
  exception when others then if sqlerrm not like 'Financial period 2026-10 is closed:%' then raise;end if;end;
  begin
   update public.finance_state set payload=jsonb_set(payload,array['cash','0',field,'0','date'],'"2026-12-01"');
   raise exception 'Expected closed event move rejection';
  exception when others then if sqlerrm not like 'Financial period 2026-10 is closed:%' then raise;end if;end;
 end loop;
 delete from public.finance_periods where period='2026-10';
 -- Forms persist empty event controls as JSON null, which uses legacy recognition.
 update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionEvents}','null');
 update public.finance_state set payload=jsonb_set(payload,'{cash,0,profitTaxRecognitionEvents}','null');
 begin
  update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionEvents}','{}');
  raise exception 'Expected malformed collection rejection';
 exception when others then if sqlerrm not like 'Invalid tax recognition event collection%' then raise;end if;end;
 -- An unchanged closed record does not prevent an independent open record edit.
 update public.finance_state set payload=jsonb_set(payload,'{cash,0,usnRecognitionDate}','"2026-10-02"');
 update public.finance_state set payload=payload;
 if exists(select 1 from information_schema.routine_privileges where routine_schema='public' and routine_name='enforce_tax_recognition_periods' and grantee in ('PUBLIC','anon','authenticated')) then raise exception 'Trigger function exposed';end if;
end $$;
rollback;
