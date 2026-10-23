\set ON_ERROR_STOP on
-- Disposable empty PostgreSQL database only. CREATE (not replace) of the stub
-- deliberately refuses to run against an application database. Everything rolls back.
begin;
do $$ begin
 if to_regprocedure('public.update_shared_state(text,jsonb,bigint)') is not null then raise exception 'Use an empty disposable database';end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;
end $$;
create table public.atomic_batch_fixture_state(store text primary key,payload jsonb not null,revision bigint not null);
create table public.atomic_batch_fixture_audit(store text,revision bigint);
insert into public.atomic_batch_fixture_state values ('finance','{"amount":10}',1),('warehouse','{"qty":1}',1);
create function public.update_shared_state(p_store text,p_payload jsonb,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 if current_setting('test.active',true) is distinct from 'true' then raise exception 'Session revoked or expired';end if;
 if current_setting('test.role',true) not in ('admin','accountant') then raise exception 'Access denied';end if;
 if p_payload->>'reject'='true' then raise exception 'Financial period is closed';end if;
 update public.atomic_batch_fixture_state set payload=p_payload,revision=revision+1 where store=p_store and revision=p_expected_revision returning revision into result;
 if result is null then raise exception 'Version conflict';end if;
 insert into public.atomic_batch_fixture_audit values(p_store,result);
 return result;
end $$;
revoke all on function public.update_shared_state(text,jsonb,bigint) from public,anon;
grant execute on function public.update_shared_state(text,jsonb,bigint) to authenticated;
\ir ../supabase/migrations/20261023170000_atomic_shared_state_batch.sql
set local test.active='true';
set local test.role='accountant';
set local role authenticated;
-- Finance would succeed first; warehouse CAS failure must roll it back.
do $$ begin
 begin
  perform public.update_shared_state_batch('[{"store":"finance","payload":{"amount":30},"expected_revision":1},{"store":"warehouse","payload":{"qty":3},"expected_revision":99}]');
  raise exception 'Expected version conflict';
 exception when others then if sqlerrm<>'Version conflict' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.atomic_batch_fixture_state where revision<>1) or exists(select 1 from public.atomic_batch_fixture_audit) then raise exception 'CAS conflict partially committed data or audit';end if;
end $$;
set local role authenticated;
-- A closed period on the second store must also roll back the first store and audit.
do $$ begin
 begin
  perform public.update_shared_state_batch('[{"store":"warehouse","payload":{"reject":true},"expected_revision":1},{"store":"finance","payload":{"amount":30},"expected_revision":1}]');
  raise exception 'Expected closed period failure';
 exception when others then if sqlerrm<>'Financial period is closed' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.atomic_batch_fixture_state where revision<>1) or exists(select 1 from public.atomic_batch_fixture_audit) then raise exception 'Period rejection partially committed data or audit';end if;
end $$;
set local role authenticated;
do $$ declare invalid jsonb;begin
 for invalid in select value from jsonb_array_elements('[null,{},[],[{}],[{"store":"other","payload":{},"expected_revision":1}],[{"store":"finance","payload":[],"expected_revision":1}],[{"store":"finance","payload":{},"expected_revision":-1}],[{"store":"finance","payload":{},"expected_revision":1},{"store":"finance","payload":{},"expected_revision":1}]]') loop
  begin
   perform public.update_shared_state_batch(invalid);raise exception 'Invalid request accepted';
  exception when others then if sqlerrm='Invalid request accepted' then raise;end if;end;
 end loop;
end $$;
set local test.active='false';
do $$ begin
 begin
  perform public.update_shared_state_batch('[{"store":"finance","payload":{},"expected_revision":1}]');raise exception 'Revoked session accepted';
 exception when others then if sqlerrm<>'Session revoked or expired' then raise;end if;end;
end $$;
set local test.active='true';
set local test.role='employee';
do $$ begin
 begin
  perform public.update_shared_state_batch('[{"store":"finance","payload":{},"expected_revision":1}]');raise exception 'Employee accepted';
 exception when others then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
set local test.role='accountant';
do $$ declare result jsonb;begin
 result:=public.update_shared_state_batch('[{"store":"warehouse","payload":{"qty":3},"expected_revision":1},{"store":"finance","payload":{"amount":30},"expected_revision":1}]');
 if result<>'{"finance":2,"warehouse":2}'::jsonb then raise exception 'Unexpected revisions: %',result;end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.atomic_batch_fixture_state where revision=2)<>2 or (select count(*) from public.atomic_batch_fixture_audit)<>2 then raise exception 'Successful batch did not commit both stores and audit';end if;
 if (select string_agg(store,',' order by ctid) from public.atomic_batch_fixture_audit)<>'finance,warehouse' then raise exception 'Unstable lock order';end if;
 if has_function_privilege('anon','public.update_shared_state_batch(jsonb)','execute') then raise exception 'Anonymous execute granted';end if;
 if not has_function_privilege('authenticated','public.update_shared_state_batch(jsonb)','execute') then raise exception 'Authenticated execute missing';end if;
 if (select prosecdef from pg_proc where oid='public.update_shared_state_batch(jsonb)'::regprocedure) then raise exception 'Batch unexpectedly SECURITY DEFINER';end if;
end $$;
rollback;
\echo Atomic shared-state batch PostgreSQL checks passed
