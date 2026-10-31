-- MONKY'S STORE ERP | Fase 4A: seguridad y diagnóstico
-- REQUIERE que 001, 002 y 003 se hayan ejecutado correctamente.
-- Ejecutar solo en la base correcta y como rol postgres, TRAS realizar respaldo.
-- No borra tablas, inventarios, pedidos, pagos ni cuentas.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.audit_events') IS NULL
     OR to_regclass('public.shipments') IS NULL
     OR to_regclass('public.returns') IS NULL
     OR to_regprocedure('public.report_phase3(date,date,text)') IS NULL
  THEN
    RAISE EXCEPTION 'Fase 4A requiere migraciones 001, 002 y 003 completas. No se aplicaron cambios.';
  END IF;
END;
$preflight$;

-- Evita ejecución anónima de RPC anteriores, sin modificar sus permisos
-- expresamente otorgados a authenticated en Fases 1-3.
-- Aplicar SOLO en este proyecto dedicado a Monky's Store.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

CREATE INDEX IF NOT EXISTS audit_events_created_at_f4a_idx
  ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_access_f4a_idx
  ON public.profiles (role, active);

-- Diagnóstico de SOLO LECTURA. Para ejecutarlo se exige el rol admin
-- vigente en la base; no basta ocultar elementos de la interfaz.
CREATE FUNCTION public.phase4a_security_report()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_tables jsonb;
  v_functions_exposed integer;
  v_admins integer;
  v_users integer;
  v_activity bigint;
  v_direct_variants_write boolean;
  v_direct_orders_write boolean;
  v_direct_profiles_write boolean;
BEGIN
  PERFORM public.require_admin();
  WITH expected(name) AS (
    VALUES ('profiles'),('categories'),('products'),('variants'),('customers'),
           ('suppliers'),('purchases'),('purchase_lines'),('orders'),('order_lines'),
           ('stock_movements'),('audit_events'),('payments'),('shipments'),
           ('returns'),('return_lines'),('refunds'),('cash_expenses'),('cash_closings')
  ), evaluated AS (
    SELECT e.name AS table_name,
      c.oid IS NOT NULL AS exists_in_db,
      coalesce(c.relrowsecurity,false) AS rls_enabled,
      coalesce(pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),false) AS anon_can_read
    FROM expected e
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
      AND c.relname=e.name AND c.relkind IN ('r','p')
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',table_name,'exists',exists_in_db,
    'rls',rls_enabled,'anon_can_read',anon_can_read
  ) ORDER BY table_name),'[]'::jsonb)
  INTO v_tables FROM evaluated;

  SELECT count(*) INTO v_functions_exposed
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  SELECT count(*) FILTER (WHERE role='admin' AND active),count(*)
  INTO v_admins,v_users FROM public.profiles;
  SELECT count(*) INTO v_activity FROM public.audit_events
    WHERE created_at > pg_catalog.now() - interval '30 days';

  SELECT pg_catalog.has_table_privilege('authenticated','public.variants','UPDATE')
  INTO v_direct_variants_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.orders','UPDATE')
  INTO v_direct_orders_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.profiles','UPDATE')
  INTO v_direct_profiles_write;

  RETURN pg_catalog.jsonb_build_object(
    'generated_at',pg_catalog.now(),
    'phase','4A',
    'tables',v_tables,
    'anon_security_definer_count',v_functions_exposed,
    'active_admins',v_admins,
    'registered_profiles',v_users,
    'audit_events_30d',v_activity,
    'direct_writes',pg_catalog.jsonb_build_object(
       'variants',v_direct_variants_write,
       'orders',v_direct_orders_write,
       'profiles',v_direct_profiles_write
    ),
    'backup_status','NO_VERIFICADO_EN_EL_SERVIDOR'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.phase4a_security_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase4a_security_report() TO authenticated;

COMMIT;
