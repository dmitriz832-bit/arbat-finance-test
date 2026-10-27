-- Effective USN/VAT policies are append-only and cannot affect closed months.
create or replace function public.enforce_usn_vat_policies()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb; rows jsonb; rec jsonb; fresh jsonb; row_id text; next_date date; until_date date; locked text; effective date; threshold numeric;
begin
 if (old.payload->'usnVatPolicies') is not distinct from (new.payload->'usnVatPolicies') then return new;end if;
 if auth.uid() is not null and not exists(select 1 from public.staff_access where user_id=auth.uid() and enabled and role in ('admin','accountant')) then raise exception 'Financial policy change requires accountant or admin';end if;
 if new.payload ? 'usnVatPolicies' and jsonb_typeof(new.payload->'usnVatPolicies')<>'array' then raise exception 'USN VAT policies must be an array';end if;
 prior:=case when jsonb_typeof(old.payload->'usnVatPolicies')='array' then old.payload->'usnVatPolicies' else '[]'::jsonb end;
 rows:=coalesce(new.payload->'usnVatPolicies','[]'::jsonb);
 for rec in select value from jsonb_array_elements(prior) loop
  select value into fresh from jsonb_array_elements(rows) where value->>'_id'=rec->>'_id';
  if (rec-array['updatedBy','updatedAt']) is distinct from (fresh-array['updatedBy','updatedAt']) then raise exception 'USN VAT policy is append-only: add a dated version';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(rows) group by value->>'_id' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(rows) group by value->>'orgId',value->>'effectiveDate' having count(*)>1) then raise exception 'Duplicate USN VAT policy identity or effective date';end if;
 for rec in select value from jsonb_array_elements(rows) loop
  if jsonb_typeof(rec)<>'object' or nullif(btrim(rec->>'_id'),'') is null or rec->>'orgId' is distinct from 'air-climat' or rec->>'org' is distinct from 'АИР-КЛИМАТ'
   or nullif(btrim(rec->>'reason'),'') is null or nullif(btrim(rec->>'createdBy'),'') is null
   or coalesce(rec->>'effectiveDate','')!~'^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$'
   or coalesce(rec->>'threshold','')!~'^[0-9]+([.][0-9]{1,2})?$'
   or coalesce(rec->>'createdAt','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then raise exception 'Invalid USN VAT policy';end if;
  begin
   effective:=(rec->>'effectiveDate')::date;threshold:=(rec->>'threshold')::numeric;
   if effective<'1900-01-01'::date or effective>'9998-12-31'::date or threshold<=0 or to_char(effective,'YYYY-MM-DD')<>rec->>'effectiveDate' then raise exception 'Invalid USN VAT policy';end if;
   perform (rec->>'createdAt')::timestamptz;
  exception when others then raise exception 'Invalid USN VAT policy';end;
  if exists(select 1 from jsonb_array_elements(prior) p where p.value->>'_id'=rec->>'_id') then continue;end if;
  select min((value->>'effectiveDate')::date) into next_date from jsonb_array_elements(rows) where value->>'orgId'=rec->>'orgId' and value->>'effectiveDate'>rec->>'effectiveDate';
  -- A threshold crossing persists for the remainder of its year, even if a later
  -- version increases the threshold. A January version resets the annual policy.
  until_date:=case when next_date is null then null when to_char(next_date,'MM-DD')='01-01' then next_date else make_date(extract(year from next_date)::integer+1,1,1) end;
  select period into locked from public.finance_periods where status='closed' and period>=left(rec->>'effectiveDate',7) and (until_date is null or period||'-01'<to_char(until_date,'YYYY-MM-DD')) order by period limit 1;
  if locked is not null then raise exception 'Financial period % is closed: USN VAT policy cannot be changed.',locked;end if;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_usn_vat_policies() from public,anon,authenticated;
drop trigger if exists finance_usn_vat_policy_guard on public.finance_state;
create trigger finance_usn_vat_policy_guard before update of payload on public.finance_state for each row execute function public.enforce_usn_vat_policies();

-- Wallet opening anchors affect every following balance, not only their entry month.
create or replace function public.enforce_wallet_opening_positions()
returns trigger language plpgsql security definer set search_path='' as $$
declare rec jsonb; fresh jsonb; before_rows jsonb; after_rows jsonb; row_id text; start_day text; locked text; amount_value numeric;
begin
 if (old.payload->'wallets') is not distinct from (new.payload->'wallets') then return new;end if;
 before_rows:=case when jsonb_typeof(old.payload->'wallets')='array' then old.payload->'wallets' else '[]'::jsonb end;
 after_rows:=case when jsonb_typeof(new.payload->'wallets')='array' then new.payload->'wallets' else '[]'::jsonb end;
 for row_id in select distinct coalesce(value->>'id',value->>'_id') from jsonb_array_elements(before_rows||after_rows) loop
  select value into rec from jsonb_array_elements(before_rows) where coalesce(value->>'id',value->>'_id')=row_id;
  select value into fresh from jsonb_array_elements(after_rows) where coalesce(value->>'id',value->>'_id')=row_id;
  if (rec->'openingBalance',rec->'openingBalanceDate',rec->'org',rec->'verified') is not distinct from (fresh->'openingBalance',fresh->'openingBalanceDate',fresh->'org',fresh->'verified') then continue;end if;
  if auth.uid() is not null and not exists(select 1 from public.staff_access where user_id=auth.uid() and enabled and role in ('admin','accountant')) then raise exception 'Financial opening change requires accountant or admin';end if;
  -- Unclassified imports remain reviewable; they have no certified opening position.
  if rec is null and coalesce(fresh->>'verified','false')<>'true' and coalesce(fresh->>'org','')='' then continue;end if;
  if fresh is null or rec->>'org' is distinct from fresh->>'org' then
   if exists(select 1 from jsonb_array_elements(coalesce(old.payload->'cash','[]'::jsonb)||coalesce(new.payload->'cash','[]'::jsonb)) c where c.value->>'walletId'=row_id or c.value->>'toWalletId'=row_id) then
    if fresh is null or nullif(rec->>'org','') is not null or rec->>'verified'='true' or exists(
     select 1 from jsonb_array_elements(coalesce(old.payload->'cash','[]'::jsonb)||coalesce(new.payload->'cash','[]'::jsonb)) c
     where (c.value->>'walletId'=row_id or c.value->>'toWalletId'=row_id) and
     not coalesce(case when c.value->>'walletId'=row_id then c.value->>'org'=fresh->>'org' else c.value->>'type'='transfer' and coalesce(c.value->>'destinationOrg',c.value->>'toOrg')=fresh->>'org' end,false)
    ) then raise exception 'Wallet with cash documents cannot be deleted or change organization';end if;
   end if;
  end if;
  if fresh->>'verified'='true' then
   if fresh->>'org' is null or fresh->>'org' not in ('АИР-КЛИМАТ','АРБАТ.ГК','Общий') or coalesce(fresh->>'openingBalanceDate','')!~'^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' or coalesce(fresh->>'openingBalance','')!~'^-?[0-9]+([.][0-9]{1,2})?$' then raise exception 'A verified wallet requires organization, exact opening amount and date';end if;
   begin
    if to_char((fresh->>'openingBalanceDate')::date,'YYYY-MM-DD')<>fresh->>'openingBalanceDate' then raise exception 'Invalid wallet opening date';end if;
    amount_value:=(fresh->>'openingBalance')::numeric;
   exception when others then raise exception 'Invalid wallet opening date or amount';end;
  end if;
  select min(value) into start_day from (
   select rec->>'openingBalanceDate' as value union all select fresh->>'openingBalanceDate'
   union all select c.value->>'date' from jsonb_array_elements(coalesce(old.payload->'cash','[]'::jsonb)||coalesce(new.payload->'cash','[]'::jsonb)) c where coalesce(rec->>'openingBalanceDate','')!~'^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' and (c.value->>'walletId'=row_id or c.value->>'toWalletId'=row_id)
  ) d where value~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  if start_day is not null and (rec->>'verified'='true' or fresh->>'verified'='true') then
   select period into locked from public.finance_periods where status='closed' and period>=left(start_day,7) order by period limit 1;
   if locked is not null then raise exception 'Financial period % is closed: wallet opening cannot be changed.',locked;end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_wallet_opening_positions() from public,anon,authenticated;
drop trigger if exists finance_wallet_opening_guard on public.finance_state;
create trigger finance_wallet_opening_guard before update of payload on public.finance_state for each row execute function public.enforce_wallet_opening_positions();
