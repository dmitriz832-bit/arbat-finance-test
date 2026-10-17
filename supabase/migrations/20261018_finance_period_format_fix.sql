alter table public.finance_periods drop constraint if exists finance_periods_period_check;
alter table public.finance_periods add constraint finance_periods_period_check check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
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
