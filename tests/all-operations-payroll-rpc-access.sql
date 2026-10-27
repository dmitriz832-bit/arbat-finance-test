\set ON_ERROR_STOP on
-- EMPTY DISPOSABLE DATABASE ONLY. psql entry point; no production-state reads.
-- This guard runs before any auth/table/function replacement. The complete
-- fixture transaction is rolled back, including roles created for this test.
BEGIN;
DO $guard$ BEGIN
  IF to_regclass('public.finance_state') IS NOT NULL OR to_regclass('public.staff_access') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing payroll access fixture: requires empty disposable database';
  END IF;
END $guard$;
CREATE SCHEMA IF NOT EXISTS auth;
DO $roles$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
END $roles$;
CREATE TABLE public.finance_state(id text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE public.staff_access(user_id uuid PRIMARY KEY,employee_id text,enabled boolean NOT NULL);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $uid$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;
CREATE OR REPLACE FUNCTION public.require_active_finance_session() RETURNS void LANGUAGE plpgsql AS $session$
BEGIN IF current_setting('arbat.payroll_fixture_session',true) IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Finance session revoked';END IF;END $session$;
-- The integration runner may replace this psql include with the exact migration
-- bytes; it must not replace the empty-database guard or fixture-only stubs.
\ir ../supabase/migrations/20261027093002_align_employee_payroll_snapshot.sql
-- Pure monetary controls share this transaction; nested rollback would erase
-- the migration and skip the own-identity/ACL checks below.
\ir all-operations-payroll-rpc.sql
INSERT INTO public.staff_access VALUES('11111111-1111-4111-8111-111111111111','own',true);
INSERT INTO public.finance_state VALUES('main','{"labor":[{"_id":"own-salary","org":"A","personId":"own","amount":100,"ndfl":13,"otherDeductions":2,"employerContributions":30},{"_id":"other-salary","org":"B","personId":"other","amount":900}]}');
GRANT USAGE ON SCHEMA public TO authenticated,anon;
-- No SELECT privileges on either fixture table; the wrapper must enforce its
-- own identity through its existing SECURITY DEFINER boundary.
SET LOCAL request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
SET LOCAL arbat.payroll_fixture_session='active';
SET LOCAL ROLE authenticated;
DO $own$ DECLARE result jsonb;BEGIN
  result:=public.my_payroll();
  IF (result->>'earned')::numeric<>100 OR (result->>'withheld')::numeric<>15 OR (result->>'payable')::numeric<>85 OR jsonb_array_length(result->'rows')<>1 OR result#>>'{rows,0,id}'<>'own-salary' THEN RAISE EXCEPTION 'Own-profile isolation failed: %',result;END IF;
  BEGIN
    PERFORM public.payroll_employee_snapshot('{}','other');
    RAISE EXCEPTION 'FAIL: authenticated caller executed private helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $own$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='';
SET LOCAL ROLE authenticated;
DO $missing$ BEGIN
  BEGIN PERFORM public.my_payroll();RAISE EXCEPTION 'FAIL: missing UID accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Access denied' THEN RAISE;END IF;END;
END $missing$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
DO $unmapped$ BEGIN
  BEGIN PERFORM public.my_payroll();RAISE EXCEPTION 'FAIL: unmapped UID accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Access denied' THEN RAISE;END IF;END;
END $unmapped$;
RESET ROLE;
SET LOCAL request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
UPDATE public.staff_access SET enabled=false;
SET LOCAL ROLE authenticated;
DO $disabled$ BEGIN
  BEGIN PERFORM public.my_payroll();RAISE EXCEPTION 'FAIL: disabled staff accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Access denied' THEN RAISE;END IF;END;
END $disabled$;
RESET ROLE;
UPDATE public.staff_access SET enabled=true;
SET LOCAL arbat.payroll_fixture_session='revoked';
SET LOCAL ROLE authenticated;
DO $revoked$ BEGIN
  BEGIN PERFORM public.my_payroll();RAISE EXCEPTION 'FAIL: revoked session accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Finance session revoked' THEN RAISE;END IF;END;
END $revoked$;
RESET ROLE;
SET LOCAL arbat.payroll_fixture_session='active';
SET LOCAL ROLE anon;
DO $anonymous$ BEGIN
  BEGIN PERFORM public.my_payroll();RAISE EXCEPTION 'FAIL: anonymous caller executed own-payroll RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $anonymous$;
RESET ROLE;
DO $acl$ BEGIN
 IF has_function_privilege('anon','public.my_payroll()','EXECUTE') OR NOT has_function_privilege('authenticated','public.my_payroll()','EXECUTE') THEN RAISE EXCEPTION 'Own-payroll RPC ACL mismatch';END IF;
END $acl$;
ROLLBACK;
\echo Payroll monetary controls, own-identity access, session and ACL checks passed
