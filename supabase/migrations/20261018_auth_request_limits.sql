create table if not exists public.auth_request_limits (
  scope text not null,
  identity_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (scope,identity_hash,window_start)
);
alter table public.auth_request_limits enable row level security;
revoke all on public.auth_request_limits from anon,authenticated;
create or replace function public.consume_auth_request_limit(p_scope text,p_identity_hash text,p_max_attempts integer,p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer; v_start timestamptz;
begin
 if p_scope not in ('first-login-ip','first-login-email','recovery-ip','recovery-email','status-ip') or p_identity_hash !~ '^[0-9a-f]{64}$' or p_max_attempts<1 or p_window_seconds<60 then
  raise exception 'Invalid auth rate-limit parameters';
 end if;
 v_start:=to_timestamp(floor(extract(epoch from now())/p_window_seconds)*p_window_seconds);
 insert into public.auth_request_limits(scope,identity_hash,window_start,attempts)
 values(p_scope,p_identity_hash,v_start,1)
 on conflict(scope,identity_hash,window_start) do update set attempts=public.auth_request_limits.attempts+1
 returning attempts into v_count;
 return v_count<=p_max_attempts;
end $$;
revoke all on function public.consume_auth_request_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_auth_request_limit(text,text,integer,integer) to service_role;