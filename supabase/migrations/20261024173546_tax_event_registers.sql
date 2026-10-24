-- New explicit tax registers inherit the shared-state RPC, RLS and CAS permissions.
create or replace function public.enforce_tax_event_register_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; locked text; changed record;
begin
 foreach section in array array['vatAdvanceEvents','taxObligationEvents'] loop
  if new.payload ? section and jsonb_typeof(new.payload->section) not in ('array','null') then raise exception 'Invalid tax event register %',section;end if;
 end loop;
 -- A source or earlier offset may change a later deduction through cumulative rounding.
 -- Expand changed events to their downstream chain, never to already closed earlier events.
 for changed in
  with old_rows as (
   select s.section,e.value from unnest(array['cash','realizations','vatAdvanceEvents','taxObligationEvents']) s(section)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(old.payload->s.section)='array' then old.payload->s.section else '[]'::jsonb end) e(value)
  ),new_rows as (
   select s.section,e.value from unnest(array['cash','realizations','vatAdvanceEvents','taxObligationEvents']) s(section)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(new.payload->s.section)='array' then new.payload->s.section else '[]'::jsonb end) e(value)
  ),delta as ((select * from old_rows except all select * from new_rows) union all (select * from new_rows except all select * from old_rows)),
  events as (select * from old_rows where old_rows.section in ('vatAdvanceEvents','taxObligationEvents') union select * from new_rows where new_rows.section in ('vatAdvanceEvents','taxObligationEvents')),
  seeds as (
   select * from delta where delta.section in ('vatAdvanceEvents','taxObligationEvents')
   union
   select e.* from events e join delta d on
    (d.section='cash' and e.value->>'cashId'=coalesce(d.value->>'_id',d.value->>'id')) or
    (d.section='realizations' and e.value->>'realizationId'=coalesce(d.value->>'_id',d.value->>'id'))
  )
  select * from seeds
  union
  select e.* from events e join seeds s on e.section='vatAdvanceEvents' and s.section='vatAdvanceEvents'
   and coalesce(nullif(e.value->>'advanceId',''),e.value->>'_id',e.value->>'id')=coalesce(nullif(s.value->>'advanceId',''),s.value->>'_id',s.value->>'id')
   and e.value->>'date'>=s.value->>'date'
 loop
  section:=changed.section;rec:=changed.value;
  select p.period into locked from public.finance_periods p where p.status='closed' and
   (p.period=left(rec->>'date',7) or section='taxObligationEvents' and rec->>'kind' in ('accrual','openingDebt','openingCredit') and
    (p.period=rec->>'period' or left(p.period,4)=rec->>'period' or rec->>'period'=left(p.period,4)||'-Q'||(((right(p.period,2)::int-1)/3)+1)::text)) limit 1;
  if locked is not null then raise exception 'Financial period % is closed: % cannot be changed.',locked,section;end if;
 end loop;
 -- Validate source budgets on the server as well: CAS can merge independent collections.
 if exists(
  with allocations as (
   select e.value,case when e.value->>'kind'='received' then 'in' else 'out' end as direction
   from jsonb_array_elements(case when jsonb_typeof(new.payload->'vatAdvanceEvents')='array' then new.payload->'vatAdvanceEvents' else '[]'::jsonb end) e
   where e.value->>'kind' in ('received','refund') and e.value ? 'amount'
   union all
   select e.value,case when e.value->>'kind'='refund' then 'in' else 'out' end
   from jsonb_array_elements(case when jsonb_typeof(new.payload->'taxObligationEvents')='array' then new.payload->'taxObligationEvents' else '[]'::jsonb end) e
   where e.value->>'kind' in ('payment','refund') and e.value->>'confirmed'='true' and e.value ? 'amount'
  ),cash as (select value from jsonb_array_elements(case when jsonb_typeof(new.payload->'cash')='array' then new.payload->'cash' else '[]'::jsonb end))
  select 1 from allocations a where
   (select count(*) from cash c where coalesce(c.value->>'_id',c.value->>'id')=a.value->>'cashId' and c.value->>'org'=a.value->>'org' and c.value->>'type'=a.direction and c.value->>'date'<=a.value->>'date')<>1
   or (select sum(round((x.value->>'amount')::numeric,2)) from allocations x where x.value->>'cashId'=a.value->>'cashId')>
      (select round((c.value->>'amount')::numeric,2) from cash c where coalesce(c.value->>'_id',c.value->>'id')=a.value->>'cashId' limit 1)
 ) then raise exception 'Tax event payment reference or amount exceeds source document';end if;
 if exists(
  with events as (select value from jsonb_array_elements(case when jsonb_typeof(new.payload->'vatAdvanceEvents')='array' then new.payload->'vatAdvanceEvents' else '[]'::jsonb end)),
  sales as (select value from jsonb_array_elements(case when jsonb_typeof(new.payload->'realizations')='array' then new.payload->'realizations' else '[]'::jsonb end))
  select 1 from events e where e.value->>'kind' in ('offset','refund') and e.value ? 'amount' and
   ((select count(*) from events a where coalesce(a.value->>'_id',a.value->>'id')=e.value->>'advanceId' and a.value->>'kind'='received' and a.value->>'org'=e.value->>'org' and a.value->>'date'<=e.value->>'date')<>1 or
    (select sum(round((x.value->>'amount')::numeric,2)) from events x where x.value->>'advanceId'=e.value->>'advanceId')>
     (select round((a.value->>'amount')::numeric,2) from events a where coalesce(a.value->>'_id',a.value->>'id')=e.value->>'advanceId' limit 1) or
    e.value->>'kind'='offset' and
     ((select count(*) from sales r where coalesce(r.value->>'_id',r.value->>'id')=e.value->>'realizationId' and r.value->>'org'=e.value->>'org' and r.value->>'date'=e.value->>'date')<>1 or
      (select sum(round((x.value->>'amount')::numeric,2)) from events x where x.value->>'kind'='offset' and x.value->>'realizationId'=e.value->>'realizationId')>
       (select round(coalesce(r.value->>'amountGross',r.value->>'amount')::numeric,2) from sales r where coalesce(r.value->>'_id',r.value->>'id')=e.value->>'realizationId' limit 1)))
 ) then raise exception 'Tax advance reference or settlement amount exceeds source document';end if;
 return new;
end $$;
revoke all on function public.enforce_tax_event_register_periods() from public,anon,authenticated;
drop trigger if exists finance_tax_event_register_guard on public.finance_state;
create trigger finance_tax_event_register_guard before update of payload on public.finance_state for each row execute function public.enforce_tax_event_register_periods();

create or replace function public.audit_tax_event_registers()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; oldarr jsonb; newarr jsonb; item jsonb; prev jsonb; rid text; actor text;
begin
 select email into actor from auth.users where id=auth.uid();
 foreach section in array array['vatAdvanceEvents','taxObligationEvents'] loop
  oldarr:=case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end;
  newarr:=case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end;
  for item in select value from jsonb_array_elements(newarr) loop
   rid:=coalesce(item->>'_id',item->>'id');prev:=null;
   select value into prev from jsonb_array_elements(oldarr) where coalesce(value->>'_id',value->>'id')=rid limit 1;
   if item is distinct from prev then insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),coalesce(actor,'system'),case when prev is null then 'document_created' else 'document_updated' end,jsonb_build_object('store','finance_state','collection',section,'document_id',rid,'revision',new.revision,'before',prev,'after',item));end if;
  end loop;
  for item in select value from jsonb_array_elements(oldarr) loop
   rid:=coalesce(item->>'_id',item->>'id');
   if not exists(select 1 from jsonb_array_elements(newarr) n where coalesce(n.value->>'_id',n.value->>'id')=rid) then insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),coalesce(actor,'system'),'document_deleted',jsonb_build_object('store','finance_state','collection',section,'document_id',rid,'revision',new.revision,'before',item));end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.audit_tax_event_registers() from public,anon,authenticated;
drop trigger if exists finance_tax_event_register_audit on public.finance_state;
create trigger finance_tax_event_register_audit after update of payload on public.finance_state for each row execute function public.audit_tax_event_registers();
