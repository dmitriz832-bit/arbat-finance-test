-- Close every dated register that can change accounting, payroll, liquidity or stock.
-- This migration deliberately keeps plans and directories editable: only posted or
-- dated events are locked.  A correction must be a new event in an open period.
create or replace function public.enforce_closed_finance_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; period_key text;
begin
 if old.payload is not distinct from new.payload then return new; end if;
 foreach section in array array[
   'cash','expenses','realizations','labor','costs','workActs','materials',
   'crewSettlements','calendar','leaveEvents','employeeEvents'
 ] loop
   for rec in
     (select value from jsonb_array_elements(
        case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end
      ) as o(value)
      except all
      select value from jsonb_array_elements(
        case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end
      ) as n(value))
     union all
     (select value from jsonb_array_elements(
        case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end
      ) as n(value)
      except all
      select value from jsonb_array_elements(
        case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end
      ) as o(value))
   loop
     period_key:=left(coalesce(
       rec->>'date',rec->>'dueDate',rec->>'approvedAt',rec->>'closedAt',
       rec->>'startDate',rec->>'endDate',rec->>'createdAt',''
     ),7);

     -- A crew settlement changes payroll for the date of the linked cash payment,
     -- not for the technical timestamp when the allocation was entered.
     if section='crewSettlements' and nullif(rec->>'cashId','') is not null then
       select left(c.value->>'date',7) into period_key
       from jsonb_array_elements(
         (case when jsonb_typeof(old.payload->'cash')='array' then old.payload->'cash' else '[]'::jsonb end)
         ||
         (case when jsonb_typeof(new.payload->'cash')='array' then new.payload->'cash' else '[]'::jsonb end)
       ) c(value)
       where c.value->>'_id'=rec->>'cashId'
       limit 1;
     end if;

     if exists(select 1 from public.finance_periods p where p.period=period_key and p.status='closed') then
       raise exception 'Financial period % is closed: % cannot be changed. Use a subsequent-period correction referencing the original document.',period_key,section;
     end if;
   end loop;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_closed_finance_periods() from public,anon,authenticated;

create or replace function public.enforce_closed_warehouse_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; period_key text;
begin
 if old.payload is not distinct from new.payload then return new; end if;
 foreach section in array array['moves','projectIssues'] loop
   for rec in
     (select value from jsonb_array_elements(
        case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end
      ) as o(value)
      except all
      select value from jsonb_array_elements(
        case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end
      ) as n(value))
     union all
     (select value from jsonb_array_elements(
        case when jsonb_typeof(new.payload->section)='array' then new.payload->section else '[]'::jsonb end
      ) as n(value)
      except all
      select value from jsonb_array_elements(
        case when jsonb_typeof(old.payload->section)='array' then old.payload->section else '[]'::jsonb end
      ) as o(value))
   loop
     period_key:=left(coalesce(rec->>'date',rec->>'closedAt',rec->>'createdAt',''),7);
     if exists(select 1 from public.finance_periods p where p.period=period_key and p.status='closed') then
       raise exception 'Financial period % is closed: warehouse % cannot be changed. Use a subsequent-period correction referencing the original document.',period_key,section;
     end if;
   end loop;
 end loop;
 return new;
end $$;
revoke all on function public.enforce_closed_warehouse_periods() from public,anon,authenticated;

drop trigger if exists warehouse_closed_period_guard on public.warehouse_state;
create trigger warehouse_closed_period_guard
before update of payload on public.warehouse_state
for each row execute function public.enforce_closed_warehouse_periods();
