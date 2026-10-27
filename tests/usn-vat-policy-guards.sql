\set ON_ERROR_STOP on
begin;
do $$ begin if to_regclass('public.finance_state') is not null then raise exception 'Use empty disposable database';end if; if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end $$;
create schema if not exists auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.policy_uid',true),'')::uuid$$;
create table public.staff_access(user_id uuid,enabled boolean,role text);
create table public.finance_periods(period text,status text);
create table public.finance_state(payload jsonb);
\ir ../supabase/migrations/20261027061323_usn_vat_policy_guard.sql
\ir ../supabase/migrations/20261027064419_wallet_opening_atomic_deletion.sql
insert into public.finance_state values ('{}');
insert into public.finance_periods values ('2028-03','closed');
do $$ declare base jsonb='{"_id":"policy1","orgId":"air-climat","org":"АИР-КЛИМАТ","effectiveDate":"2026-10-01","threshold":"20000000.01","reason":"Проверка","createdBy":"tester","createdAt":"2026-10-27T00:00:00Z"}'; bad jsonb;begin
 begin update public.finance_state set payload=jsonb_build_object('usnVatPolicies',jsonb_build_array(base));raise exception 'Expected future year rejection';exception when others then if sqlerrm not like 'Financial period 2028-03 is closed:%' then raise;end if;end;
 delete from public.finance_periods;
 update public.finance_state set payload=jsonb_build_object('usnVatPolicies',jsonb_build_array(base));
 for bad in select value from jsonb_array_elements('[{"threshold":"1.001"},{"effectiveDate":"2026-02-30"},{"threshold":"0"},{"org":"АРБАТ.ГК"},{"reason":""},{"createdAt":"invalid"},{"orgId":"arbat"}]') loop
  begin update public.finance_state set payload=jsonb_build_object('usnVatPolicies',jsonb_build_array(base,base||bad||'{"_id":"bad","effectiveDate":"2027-01-01"}'::jsonb||case when bad ? 'effectiveDate' then bad else '{}'::jsonb end));raise exception 'Expected invalid policy rejection';exception when others then if sqlerrm not like 'Invalid USN VAT policy%' then raise;end if;end;
 end loop;
 begin update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies,0,threshold}','"2.00"');raise exception 'Expected immutable policy rejection';exception when others then if sqlerrm not like 'USN VAT policy is append-only:%' then raise;end if;end;
 begin update public.finance_state set payload='{}';raise exception 'Expected immutable deletion rejection';exception when others then if sqlerrm not like 'USN VAT policy is append-only:%' then raise;end if;end;
 begin update public.finance_state set payload=jsonb_build_object('usnVatPolicies',jsonb_build_array(base,base||'{"_id":"other"}'));raise exception 'Expected duplicate date rejection';exception when others then if sqlerrm not like 'Duplicate USN VAT policy%' then raise;end if;end;
 update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies,0,updatedBy}','{"id":"tester"}');
 -- Insertion before a midyear version can affect VAT through December.
 update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies}',(payload->'usnVatPolicies')||jsonb_build_array(base||'{"_id":"july","effectiveDate":"2027-07-01"}'));
 insert into public.finance_periods values ('2027-12','closed');
 begin update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies}',(payload->'usnVatPolicies')||jsonb_build_array(base||'{"_id":"june","effectiveDate":"2027-06-01"}'));raise exception 'Expected year end influence rejection';exception when others then if sqlerrm not like 'Financial period 2027-12 is closed:%' then raise;end if;end;
 -- A Jan1 version stops influence before that new year.
 delete from public.finance_periods;
 update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies}',(payload->'usnVatPolicies')||jsonb_build_array(base||'{"_id":"jan","effectiveDate":"2028-01-01"}'));
 insert into public.finance_periods values ('2028-03','closed');
 update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies}',(payload->'usnVatPolicies')||jsonb_build_array(base||'{"_id":"dec","effectiveDate":"2027-12-01"}'));
 if has_function_privilege('authenticated','public.enforce_usn_vat_policies()','execute') then raise exception 'Trigger exposed';end if;
end $$;
do $$ declare wallet jsonb='{"id":"w","org":"АИР-КЛИМАТ","verified":true,"openingBalance":"100.01","openingBalanceDate":"2026-10-01"}';begin
 delete from public.finance_periods;
 update public.finance_state set payload=jsonb_set(payload,'{wallets}',jsonb_build_array(wallet));
 insert into public.finance_periods values ('2027-02','closed');
 begin update public.finance_state set payload=jsonb_set(payload,'{wallets,0,openingBalance}','"100.02"');raise exception 'Expected later balance period rejection';exception when others then if sqlerrm not like 'Financial period 2027-02 is closed:%' then raise;end if;end;
 update public.finance_state set payload=jsonb_set(payload,'{wallets,0,name}','"Новое название"');
 delete from public.finance_periods;
 update public.finance_state set payload=payload||'{"cash":[{"_id":"cash","walletId":"w","type":"in","date":"2026-10-02","org":"АИР-КЛИМАТ","amount":"1.00"}]}'::jsonb;
 begin update public.finance_state set payload=jsonb_set(payload,'{wallets,0,org}','"АРБАТ.ГК"');raise exception 'Expected linked owner rejection';exception when others then if sqlerrm<>'Wallet with cash documents cannot be deleted or change organization' then raise;end if;end;
 begin update public.finance_state set payload=jsonb_set(payload,'{wallets}','[]');raise exception 'Expected linked deletion rejection';exception when others then if sqlerrm<>'Wallet with cash documents cannot be deleted or change organization' then raise;end if;end;
 begin update public.finance_state set payload=jsonb_set(payload,'{wallets,0,openingBalanceDate}','"2026-02-30"');raise exception 'Expected invalid opening rejection';exception when others then if sqlerrm<>'Invalid wallet opening date or amount' then raise;end if;end;
 -- The existing confirmed bulk removal deletes wallet and all open-period cash together.
 update public.finance_state set payload=jsonb_set(jsonb_set(payload,'{cash}','[]'),'{wallets}','[]');
 -- Legacy unverified imported account can be classified only with matching cash.
 update public.finance_state set payload=jsonb_set(payload,'{cash}','[]');
 update public.finance_state set payload=payload||'{"wallets":[{"id":"legacy","org":"","verified":false,"openingBalanceDate":""}],"cash":[{"_id":"old","walletId":"legacy","type":"in","date":"2026-01-05","org":"АИР-КЛИМАТ","amount":"1.00"}]}'::jsonb;
 insert into public.finance_periods values ('2026-01','closed');
 begin update public.finance_state set payload=jsonb_set(payload,'{wallets}',jsonb_build_array(wallet||'{"id":"legacy"}'));raise exception 'Expected legacy closed cash rejection';exception when others then if sqlerrm not like 'Financial period 2026-01 is closed:%' then raise;end if;end;
 delete from public.finance_periods;
 update public.finance_state set payload=jsonb_set(payload,'{wallets}',jsonb_build_array(wallet||'{"id":"legacy"}'));
 if has_function_privilege('authenticated','public.enforce_wallet_opening_positions()','execute') then raise exception 'Opening trigger exposed';end if;
end $$;
insert into public.staff_access values ('11111111-1111-1111-1111-111111111111',true,'employee');
select set_config('test.policy_uid','11111111-1111-1111-1111-111111111111',true);
do $$ begin
 begin update public.finance_state set payload=jsonb_set(payload,'{usnVatPolicies}',(payload->'usnVatPolicies')||'[{"_id":"new"}]');raise exception 'Expected role rejection';exception when others then if sqlerrm<>'Financial policy change requires accountant or admin' then raise;end if;end;
end $$;
rollback;
