-- Defense in depth: RLS does not cover TRUNCATE, REFERENCES or TRIGGER.
-- Existing authenticated row-level INSERT/UPDATE/DELETE behavior is preserved where needed.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.allowed_emails, public.salary_accruals, public.user_preferences FROM anon, authenticated;
-- No anonymous user can modify these protected records.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.allowed_emails, public.salary_accruals, public.user_preferences FROM anon;
-- Allowlist mutations are exclusively through privileged, role-checking administrative functions.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.allowed_emails FROM authenticated;
