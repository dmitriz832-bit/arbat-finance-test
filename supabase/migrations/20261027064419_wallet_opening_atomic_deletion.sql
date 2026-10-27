-- Preserve the existing atomic wallet + cash deletion path in open periods.
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
   if exists(select 1 from jsonb_array_elements(case when fresh is null then coalesce(new.payload->'cash','[]'::jsonb) else coalesce(old.payload->'cash','[]'::jsonb)||coalesce(new.payload->'cash','[]'::jsonb) end) c where c.value->>'walletId'=row_id or c.value->>'toWalletId'=row_id) then
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
