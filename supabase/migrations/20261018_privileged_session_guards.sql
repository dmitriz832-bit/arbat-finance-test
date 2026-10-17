-- Guard every exposed privileged RPC against revoked GoTrue sessions.
create or replace function public.require_active_finance_session()
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.has_active_finance_session() then
   raise exception 'Session revoked or expired' using errcode='28000';
 end if;
end $$;
revoke all on function public.require_active_finance_session() from public,anon;
grant execute on function public.require_active_finance_session() to authenticated;
-- Early checks run inside the caller transaction, before privileged functions execute.

create or replace function public.claim_staff_access()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text; v_allowed public.allowed_emails%rowtype; v_full_name text; v_session text;
begin perform public.require_active_finance_session();
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Email confirmation required'; end if;
 select * into v_allowed from public.allowed_emails where lower(email)=v_email and enabled;
 if not found then raise exception 'Email not authorized'; end if;
 select p.value->>'name' into v_full_name from public.finance_state f,lateral jsonb_array_elements(coalesce(f.payload->'people','[]'::jsonb)) p(value) where f.id='main' and p.value->>'id'=v_allowed.employee_id limit 1;
 v_full_name:=coalesce(nullif(v_full_name,''),nullif(v_allowed.full_name,''),v_email);
 insert into public.staff_access(user_id,email,employee_id,role,enabled) values(auth.uid(),v_email,v_allowed.employee_id,v_allowed.role,true)
 on conflict(user_id) do update set email=excluded.email,employee_id=excluded.employee_id,role=excluded.role,enabled=true;
 v_session:=nullif(auth.jwt()->>'session_id','');
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext(coalesce(v_session,'login')));
 if not exists(select 1 from public.staff_activity a where a.user_id=auth.uid() and a.event='login'
 and ((v_session is not null and a.details->>'session_id'=v_session)
 or (v_session is null and a.created_at>now()-interval '30 minutes'))) then
 insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),v_email,'login',jsonb_build_object('session_id',v_session));
 end if;
 return jsonb_build_object('role',v_allowed.role,'employee_id',v_allowed.employee_id,'email',v_email,'full_name',v_full_name,'user_id',auth.uid());
end $function$
;

create or replace function public.my_payroll()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare employee text;src jsonb;act jsonb;payment jsonb;payment_cash jsonb;members text[];position_in_crew integer;member_count integer;total_cents bigint;member_cents bigint;total_earned numeric:=0;total_withheld numeric:=0;total_paid numeric:=0;line_items jsonb:='[]'::jsonb;amount numeric;tax numeric;
begin perform public.require_active_finance_session();
select s.employee_id into employee from public.staff_access s where s.user_id=auth.uid() and s.enabled;if employee is null then raise exception 'Access denied';end if;select f.payload into src from public.finance_state f where f.id='main';
for act in select value from jsonb_array_elements(coalesce(src->'workActs','[]'::jsonb)) loop
if act->>'status' is distinct from 'approved' or jsonb_typeof(act->'memberIds') is distinct from 'array' then continue;end if;
select array_agg(distinct m.value order by m.value)into members from jsonb_array_elements_text(act->'memberIds')m(value);member_count:=coalesce(cardinality(members),0);if member_count=0 then continue;end if;position_in_crew:=array_position(members,employee);if position_in_crew is null then continue;end if;
total_cents:=round(coalesce(nullif(act->>'qty','')::numeric,0)*coalesce(nullif(act->>'rate','')::numeric,0)*100)::bigint;member_cents:=case when position_in_crew=member_count then total_cents-(total_cents/member_count)*(member_count-1) else total_cents/member_count end;amount:=member_cents/100.0;total_earned:=total_earned+amount;line_items:=line_items||jsonb_build_array(jsonb_build_object('kind','accrual','date',act->>'date','description',act->>'priceName','project',act->>'projectKey','amount',amount,'ndfl',0,'id',act->>'id'));end loop;
for act in select value from jsonb_array_elements(coalesce(src->'labor','[]'::jsonb)) loop
if act->>'personId' is distinct from employee or coalesce(act->>'employeeVisible','true')='false' then continue;end if;amount:=coalesce(nullif(act->>'amount','')::numeric,0);tax:=coalesce(nullif(act->>'ndfl','')::numeric,0);total_earned:=total_earned+amount;total_withheld:=total_withheld+tax;line_items:=line_items||jsonb_build_array(jsonb_build_object('kind','accrual','date',act->>'date','description',case act->>'accrualType' when 'salary'then'Заработная плата' when'bonus'then'Премия' when'vacation'then'Отпускные' when'sick'then'Больничный' when'compensation'then'Компенсация' when'alimony'then'Удержание' else coalesce(act->>'article','Начисление')end,'project',coalesce(act->>'deal',''),'amount',amount,'ndfl',tax,'id',act->>'_id'));end loop;
for payment in select value from jsonb_array_elements(coalesce(src->'crewSettlements','[]'::jsonb)) loop
if payment->>'personId' is distinct from employee then continue;end if;payment_cash:=null;select c.value into payment_cash from jsonb_array_elements(coalesce(src->'cash','[]'::jsonb))c(value)where c.value->>'_id'=payment->>'cashId' and c.value->>'type'='out' limit 1;if payment_cash is null then continue;end if;amount:=coalesce(nullif(payment->>'amount','')::numeric,0);total_paid:=total_paid+amount;line_items:=line_items||jsonb_build_array(jsonb_build_object('kind','payment','date',payment_cash->>'date','description',coalesce(payment_cash->>'note','Выплата'),'amount',amount,'id',payment->>'id'));end loop;
for payment in select value from jsonb_array_elements(coalesce(src->'cash','[]'::jsonb)) loop
if payment->>'type' is distinct from'out' or payment->>'personId' is distinct from employee then continue;end if;if exists(select 1 from jsonb_array_elements(coalesce(src->'crewSettlements','[]'::jsonb))link(value)where link.value->>'cashId'=payment->>'_id' and link.value->>'personId'=employee)then continue;end if;if not exists(select 1 from jsonb_array_elements(coalesce(src->'articles','[]'::jsonb))article(value)where article.value->>'id'=payment->>'articleId' and(article.value->>'name' ilike'%зарплат%' or article.value->>'name' ilike'%оплат% труда%' or article.value->>'name' ilike'%расчет% персонал%' or article.value->>'name' ilike'%выплат% сотрудник%'))and coalesce(payment->>'note','')not ilike'%зарплат%' then continue;end if;amount:=coalesce(nullif(payment->>'amount','')::numeric,0);total_paid:=total_paid+amount;line_items:=line_items||jsonb_build_array(jsonb_build_object('kind','payment','date',payment->>'date','description',coalesce(payment->>'note','Выплата зарплаты'),'amount',amount,'id',payment->>'_id'));end loop;
return jsonb_build_object('earned',total_earned,'withheld',total_withheld,'paid',total_paid,'balance',total_earned-total_withheld-total_paid,'rows',line_items);end$function$
;

create or replace function public.set_finance_period_status(p_period text, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_email text;
begin perform public.require_active_finance_session();
 if p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_status not in ('open','closed') then raise exception 'Invalid period or status';end if;
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
end $function$
;

create or replace function public.admin_set_staff(p_email text, p_enabled boolean, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare who text;begin perform public.require_active_finance_session(); if not exists(select 1 from public.staff_access where user_id=auth.uid() and enabled and role='admin') then raise exception 'Admin only';end if;who:=lower(trim(p_email));if who=(select lower(email) from auth.users where id=auth.uid()) and (not p_enabled or (p_role is not null and p_role<>'admin')) then raise exception 'Cannot remove your own administrator access';end if;if p_role is not null and p_role not in ('admin','accountant','employee') then raise exception 'Unknown role';end if;update public.allowed_emails set enabled=p_enabled,role=coalesce(p_role,role) where lower(email)=who;if not found then raise exception 'Staff record not found';end if;update public.staff_access set enabled=p_enabled,role=coalesce(p_role,role) where lower(email)=who;insert into public.staff_activity(user_id,email,event,details) values(auth.uid(),(select email from auth.users where id=auth.uid()),'access_changed',jsonb_build_object('target',who,'enabled',p_enabled,'role',p_role));return jsonb_build_object('ok',true);end $function$
;

CREATE OR REPLACE FUNCTION public.admin_people_list()
 RETURNS TABLE(employee_id text, full_name text, "position" text, work_status text, employment_status text, annual_leave_days numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select p.value->>'id',p.value->>'name',p.value->>'position',p.value->>'workStatus',p.value->>'status',coalesce(nullif(p.value->>'annualLeaveDays','')::numeric,case when p.value->>'status'='Трудовой договор' then 28 else 0 end) from public.finance_state f,lateral jsonb_array_elements(coalesce(f.payload->'people','[]'::jsonb))p(value) where f.id='main' and public.has_active_finance_session() and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role='admin') order by p.value->>'name'$function$
;

CREATE OR REPLACE FUNCTION public.admin_staff_list()
 RETURNS TABLE(email text, role text, enabled boolean, employee_id text, last_login timestamp with time zone, full_name text, "position" text, work_status text, employment_status text, annual_leave_days numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
select a.email,a.role,a.enabled,a.employee_id,u.last_sign_in_at,coalesce(nullif(p.person->>'name',''),nullif(a.full_name,''),a.email),p.person->>'position',p.person->>'workStatus',p.person->>'status',coalesce(nullif(p.person->>'annualLeaveDays','')::numeric,case when p.person->>'status'='Трудовой договор' then 28 else 0 end)
from public.allowed_emails a left join auth.users u on lower(u.email)=lower(a.email)
left join lateral(select p.value person from public.finance_state f,lateral jsonb_array_elements(coalesce(f.payload->'people','[]'::jsonb)) p(value) where f.id='main' and p.value->>'id'=a.employee_id limit 1)p on true
where public.has_active_finance_session() and exists(select 1 from public.staff_access s where s.user_id=auth.uid() and s.enabled and s.role='admin') order by coalesce(nullif(p.person->>'name',''),nullif(a.full_name,''),a.email)$function$
;
