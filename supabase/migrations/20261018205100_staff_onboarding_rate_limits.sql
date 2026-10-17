-- Atomic server-side throttling for unauthenticated staff onboarding and recovery.
create table if not exists public.staff_onboarding_rate_limits (
  token_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.staff_onboarding_rate_limits enable row level security;
revoke all on public.staff_onboarding_rate_limits from public, anon, authenticated;
grant select, insert, update on public.staff_onboarding_rate_limits to service_role;

create or replace function public.consume_onboarding_rate_limit(
  p_key text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_allowed boolean;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'Forbidden';
  end if;
  if length(p_key) <> 64 or p_limit < 1 or p_limit > 1000
    or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit configuration';
  end if;
  insert into public.staff_onboarding_rate_limits as l
    (token_hash, window_started_at, attempts, updated_at)
  values (p_key, now(), 1, now())
  on conflict (token_hash) do update
  set attempts = case
      when l.window_started_at <= now() - (p_window_seconds * interval '1 second') then 1
      else l.attempts + 1 end,
    window_started_at = case
      when l.window_started_at <= now() - (p_window_seconds * interval '1 second') then now()
      else l.window_started_at end,
    updated_at = now()
  where l.window_started_at <= now() - (p_window_seconds * interval '1 second')
     or l.attempts < p_limit
  returning true into v_allowed;
  return coalesce(v_allowed,false);
end;
$$;
revoke all on function public.consume_onboarding_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_onboarding_rate_limit(text,integer,integer) to service_role;
