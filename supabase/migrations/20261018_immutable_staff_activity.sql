-- Historical staff audit records are append-only, including for service-role clients.
-- Backups must be taken before any exceptional administrator maintenance.
create or replace function public.reject_staff_activity_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 raise exception 'Audit events are immutable. Create a new corrective event instead of changing history.';
end;
$$;
revoke all on function public.reject_staff_activity_mutation() from public, anon, authenticated;
drop trigger if exists staff_activity_immutable on public.staff_activity;
create trigger staff_activity_immutable
before update or delete on public.staff_activity
for each row execute function public.reject_staff_activity_mutation();
revoke update, delete, truncate on public.staff_activity from anon, authenticated;
