\set ON_ERROR_STOP on
begin;
do $$ begin if to_regclass('public.finance_state') is not null then raise exception 'Use empty disposable database';end if;if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end $$;
create schema if not exists auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.asset_uid',true),'')::uuid$$;
create table public.staff_access(user_id uuid,enabled boolean,role text);
create table public.finance_periods(period text,status text);
create table public.finance_state(payload jsonb);
\ir ../supabase/migrations/20261027050452_financial_workspace_guards.sql
\ir ../supabase/migrations/20261027083119_asset_removal_integrity.sql
insert into public.staff_access values ('11111111-1111-1111-1111-111111111111',true,'accountant');
select set_config('test.asset_uid','11111111-1111-1111-1111-111111111111',true);
insert into public.finance_state values ('{}');
do $$ declare asset jsonb='{"_id":"a","org":"АИР-КЛИМАТ","inServiceDate":"2026-10-01"}'; patch jsonb;begin
 -- An unposted, unlinked mistake is removable by the accountant.
 update public.finance_state set payload=jsonb_build_object('fixedAssets',jsonb_build_array(asset));
 update public.finance_state set payload=jsonb_set(payload,'{fixedAssets}','[]');
 if jsonb_array_length((select payload->'fixedAssets' from public.finance_state))<>0 then raise exception 'Deletion failed';end if;
 -- History in either asset or cost register is protected; unrelated posted assets do not block deletion.
 foreach patch in array array[
  jsonb_build_object('fixedAssets',jsonb_build_array(asset||'{"depreciationPostings":[{"month":"2026-10"}]}'::jsonb)),
  jsonb_build_object('fixedAssets',jsonb_build_array(asset),'costs','[{"_id":"post","sourceAssetId":"a","amount":"10"}]'::jsonb)
 ] loop
  update public.finance_state set payload=patch;
  begin update public.finance_state set payload=jsonb_set(payload,'{fixedAssets}','[]');raise exception 'Expected posted rejection';exception when others then if sqlerrm not like 'Asset has posted accruals:%' then raise;end if;end;
  -- Reset the disposable fixture without triggering a destructive update.
  delete from public.finance_state;insert into public.finance_state values ('{}');
 end loop;
 foreach patch in array array[
  jsonb_build_object('fixedAssets',jsonb_build_array(asset||'{"paymentLinks":[{"cashId":"c","amount":"1"}]}'::jsonb)),
  jsonb_build_object('fixedAssets',jsonb_build_array(asset),'cash','[{"_id":"c","date":"2026-10-02","supplierAllocations":[{"documentKey":"fixedAssets:a","amount":"1"}]}]'::jsonb)
 ] loop
  update public.finance_state set payload=patch;
  begin update public.finance_state set payload=jsonb_set(payload,'{fixedAssets}','[]');raise exception 'Expected payment rejection';exception when others then if sqlerrm not like 'Asset has linked payments:%' then raise;end if;end;
  begin update public.finance_state set payload='{}';raise exception 'Expected atomic removal rejection';exception when others then if sqlerrm not like 'Asset has linked payments:%' then raise;end if;end;
  delete from public.finance_state;insert into public.finance_state values ('{}');
 end loop;
 update public.finance_state set payload=jsonb_build_object('fixedAssets',jsonb_build_array(asset,asset||'{"_id":"other","depreciationPostings":[{}]}'::jsonb),'costs','[{"sourceAssetId":"other"}]'::jsonb);
 update public.finance_state set payload=jsonb_set(payload,'{fixedAssets}',jsonb_build_array(asset||'{"_id":"other","depreciationPostings":[{}]}'::jsonb));
 delete from public.finance_state;insert into public.finance_state values (jsonb_build_object('fixedAssets',jsonb_build_array(asset)));
 insert into public.finance_periods values ('2026-10','closed');
 begin update public.finance_state set payload=jsonb_set(payload,'{fixedAssets}','[]');raise exception 'Expected period rejection';exception when others then if sqlerrm not like 'Financial period 2026-10 is closed:%' then raise;end if;end;
 if has_function_privilege('authenticated','public.enforce_asset_removal_integrity()','execute') then raise exception 'Trigger function exposed';end if;
end $$;
rollback;
