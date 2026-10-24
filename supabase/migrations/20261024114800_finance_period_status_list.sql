-- Read-only register for authorized finance users; no financial rows or period statuses are changed.
create or replace function public.finance_period_status_list()
returns table(period text,status text,closed_at timestamptz,closed_name text,reopened_at timestamptz,reopened_name text,reopen_reason text)
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_finance_session();
 if not exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role in ('admin','accountant')) then
  raise exception 'Finance access required';
 end if;
 return query
 select p.period,p.status,p.closed_at,
  coalesce(nullif(trim(c.full_name),''),cu.email::text,'Сотрудник не указан'),
  p.reopened_at,coalesce(nullif(trim(r.full_name),''),ru.email::text,'Сотрудник не указан'),p.reopen_reason
 from public.finance_periods p
 left join auth.users cu on cu.id=p.closed_by
 left join auth.users ru on ru.id=p.reopened_by
 left join public.allowed_emails c on c.email=cu.email
 left join public.allowed_emails r on r.email=ru.email
 order by p.period desc;
end $$;
revoke all on function public.finance_period_status_list() from public,anon,authenticated;
grant execute on function public.finance_period_status_list() to authenticated;
