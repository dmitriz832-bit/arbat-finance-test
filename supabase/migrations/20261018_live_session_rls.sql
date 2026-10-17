-- Validate active GoTrue session for every sensitive read.
-- Revoking a session in auth.sessions immediately blocks new data requests, even
-- while the previously minted JWT remains within its expiry window.
create or replace function public.has_active_finance_session()
returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null
 and nullif(auth.jwt()->>'session_id','') is not null
 and exists (
   select 1 from auth.sessions s
   where s.id::text=auth.jwt()->>'session_id'
     and s.user_id=auth.uid()
     and (s.not_after is null or s.not_after>now())
 );
$$;
revoke all on function public.has_active_finance_session() from public,anon;
grant execute on function public.has_active_finance_session() to authenticated;
drop policy if exists "read finance for admin and accountant" on public.finance_state;
create policy "read finance for admin and accountant" on public.finance_state
for select to authenticated using (
  public.has_active_finance_session()
  and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role in ('admin','accountant'))
);
drop policy if exists "read warehouse for admin and accountant" on public.warehouse_state;
create policy "read warehouse for admin and accountant" on public.warehouse_state
for select to authenticated using (
  public.has_active_finance_session()
  and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role in ('admin','accountant'))
);
drop policy if exists "employee reads own salary or admin" on public.salary_accruals;
create policy "employee reads own salary or admin" on public.salary_accruals
for select to authenticated using (
  public.has_active_finance_session()
  and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and (s.role='admin' or s.employee_id=salary_accruals.employee_id))
);
drop policy if exists "admin writes salary" on public.salary_accruals;
create policy "admin writes salary" on public.salary_accruals
for all to authenticated using (
  public.has_active_finance_session()
  and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role='admin')
) with check (
  public.has_active_finance_session()
  and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role='admin')
);
