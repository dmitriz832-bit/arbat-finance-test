-- ARBAT FINANCE security hardening: shared state is read through RLS and written via update_shared_state RPC.
-- RLS does not protect TRUNCATE, REFERENCES or TRIGGER operations. Do not grant direct writes.
-- No rows are modified and SECURITY DEFINER RPC ownership is unchanged.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.finance_state, public.warehouse_state, public.staff_access, public.staff_activity
FROM anon, authenticated;
-- Anonymous clients cannot read the shared financial or staff state.
REVOKE SELECT ON TABLE public.finance_state, public.warehouse_state, public.staff_access, public.staff_activity FROM anon;
