\set ON_ERROR_STOP on
begin;
do $$ begin if to_regclass('public.finance_state') is not null then raise exception 'Use empty disposable database';end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end $$;
create schema if not exists auth;
create table auth.users(id uuid,email text);
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create table public.finance_periods(period text,status text);
create table public.finance_state(payload jsonb,revision bigint);
create table public.staff_activity(user_id uuid,email text,event text,details jsonb);
\ir ../supabase/migrations/20261024173546_tax_event_registers.sql
insert into public.finance_state values('{"vatAdvanceEvents":[],"taxObligationEvents":[]}',1);
insert into public.finance_periods values('2026-01','closed');
do $$ declare section text; begin
 foreach section in array array['vatAdvanceEvents','taxObligationEvents'] loop
  begin update public.finance_state set payload=jsonb_set(payload,array[section],'[{"_id":"x","date":"2026-01-01"}]');raise exception 'Expected closed rejection';exception when others then if sqlerrm not like 'Financial period 2026-01 is closed:%' then raise;end if;end;
 end loop;
 begin update public.finance_state set payload=jsonb_set(payload,'{taxObligationEvents}','[{"_id":"x","date":"2026-04-01","period":"2026-Q1"}]');raise exception 'Expected tax quarter rejection';exception when others then if sqlerrm not like 'Financial period 2026-01 is closed:%' then raise;end if;end;
 update public.finance_state set payload=jsonb_set(payload,'{vatAdvanceEvents}','[{"_id":"x","date":"2026-02-01"}]');
 if (select count(*) from public.staff_activity where event='document_created')<>1 then raise exception 'Create audit missing';end if;
 insert into public.finance_periods values('2026-02','closed');
 begin update public.finance_state set payload=jsonb_set(payload,'{vatAdvanceEvents}','[]');raise exception 'Expected closed deletion rejection';exception when others then if sqlerrm not like 'Financial period 2026-02 is closed:%' then raise;end if;end;
 delete from public.finance_periods where period='2026-02';
 update public.finance_state set payload=jsonb_set(payload,'{vatAdvanceEvents,0,document}','"basis"');
 update public.finance_state set payload=jsonb_set(payload,'{vatAdvanceEvents}','[]');
 if (select count(*) from public.staff_activity where event='document_updated')<>1 or (select count(*) from public.staff_activity where event='document_deleted')<>1 then raise exception 'Change audit missing';end if;
 if has_function_privilege('authenticated','public.enforce_tax_event_register_periods()','execute') or has_function_privilege('anon','public.audit_tax_event_registers()','execute') then raise exception 'Trigger endpoint exposed';end if;
end $$;
rollback;
