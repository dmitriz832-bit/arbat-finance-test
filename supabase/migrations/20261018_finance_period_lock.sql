-- Period status and immutable financial document protection.
create table if not exists public.finance_periods(
  period text primary key check(period ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  status text not null check(status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopen_reason text
);
alter table public.finance_periods enable row level security;
revoke all on public.finance_periods from anon,authenticated;
grant select on public.finance_periods to authenticated;
create policy "Finance staff can view period status" on public.finance_periods for select to authenticated using(
  exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role in ('admin','accountant'))
);

create or replace function public.enforce_closed_finance_periods()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text; rec jsonb; period_key text;
begin
 if old.payload is not distinct from new.payload then return new;end if;
 foreach section in array array['cash','expenses','realizations','labor','costs','workActs','materials','crewSettlements'] loop
   -- Symmetric multiset difference detects updates, deletions and newly backdated documents.
   for rec in
     (select value from jsonb_array_elements(coalesce(old.payload->section,'[]'::jsonb)) as o(value)
      except all
      select value from jsonb_array_elements(coalesce(new.payload->section,'[]'::jsonb)) as n(value))
     union all
     (select value from jsonb_array_elements(coalesce(new.payload->section,'[]'::jsonb)) as n(value)
      except all
      select value from jsonb_array_elements(coalesce(old.payload->section,'[]'::jsonb)) as o(value))
   loop
     period_key:=left(coalesce(rec->>'date',rec->>'approvedAt',rec->>'createdAt',''),7);
     if exists(select 1 from public.finance_periods p where p.period=period_key and p.status='closed') then
       raise exception 'Financial period % is closed: % cannot be changed. Use a subsequent-period correction referencing the original document.',period_key,section;
     end if;
   end loop;
 end loop;
 return new;
end $$;
drop trigger if exists finance_closed_period_guard on public.finance_state;
create trigger finance_closed_period_guard before update of payload on public.finance_state for each row execute function public.enforce_closed_finance_periods();
revoke all on function public.enforce_closed_finance_periods() from public,anon,authenticated;

create or replace function public.set_finance_period_status(p_period text,p_status text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_email text;
begin
 if p_period !~ '^\\d{4}-(0[1-9]|1[0-2])$' or p_status not in ('open','closed') then raise exception 'Invalid period or status';end if;
 if not exists(select 1 from public.staff_access where user_id=auth.uid() and enabled and role='admin') then raise exception 'Administrator only';end if;
 if p_status='open' and (p_reason is null or length(trim(p_reason))<10) then raise exception 'Reopening requires a reason (10+ characters)';end if;
 select email into actor_email from auth.users where id=auth.uid();
 if p_status='closed' then
   insert into public.finance_periods(period,status,closed_at,closed_by) values(p_period,'closed',now(),auth.uid())
   on conflict(period) do update set status='closed',closed_at=now(),closed_by=auth.uid();
 else
   if not exists(select 1 from public.finance_periods where period=p_period and status='closed') then raise exception 'Period is not closed';end if;
   update public.finance_periods set status='open',reopened_at=now(),reopened_by=auth.uid(),reopen_reason=trim(p_reason) where period=p_period;
 end if;
 insert into public.staff_activity(user_id,email,event,details)
 values(auth.uid(),actor_email,case when p_status='closed' then 'finance_period_closed' else 'finance_period_reopened' end,
        jsonb_build_object('period',p_period,'status',p_status,'reason',p_reason,'actor',auth.uid(),'at',now()));
 return jsonb_build_object('period',p_period,'status',p_status);
end $$;
revoke all on function public.set_finance_period_status(text,text,text) from public,anon;
grant execute on function public.set_finance_period_status(text,text,text) to authenticated;
