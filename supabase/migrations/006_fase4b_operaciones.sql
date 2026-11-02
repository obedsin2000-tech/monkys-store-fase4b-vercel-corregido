-- Fase 4B: diagnóstico ampliado e índices para las colas operativas.
-- Ejecutar una sola vez después de 005_fase4b.sql. No modifica datos de negocio.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $indexes$
DECLARE v_trgm_schema text;
BEGIN
  SELECT n.nspname INTO v_trgm_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pg_trgm';
  IF v_trgm_schema IS NULL THEN RAISE EXCEPTION 'La extensión pg_trgm no quedó disponible'; END IF;
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS products_name_trgm_f4b_idx ON public.products USING gin (name %I.gin_trgm_ops)',v_trgm_schema);
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS variants_sku_trgm_f4b_idx ON public.variants USING gin (sku %I.gin_trgm_ops)',v_trgm_schema);
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS variants_size_trgm_f4b_idx ON public.variants USING gin (size %I.gin_trgm_ops)',v_trgm_schema);
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS variants_color_trgm_f4b_idx ON public.variants USING gin (color %I.gin_trgm_ops)',v_trgm_schema);
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS orders_buyer_name_trgm_f4b_idx ON public.orders USING gin (buyer_name %I.gin_trgm_ops)',v_trgm_schema);
  EXECUTE pg_catalog.format('CREATE INDEX IF NOT EXISTS orders_tiktok_handle_trgm_f4b_idx ON public.orders USING gin (tiktok_handle %I.gin_trgm_ops)',v_trgm_schema);
END;
$indexes$;
CREATE INDEX IF NOT EXISTS variants_barcode_f4b_idx
  ON public.variants (barcode);
CREATE INDEX IF NOT EXISTS orders_created_at_f4b_idx
  ON public.orders (created_at DESC);

-- Incluye las tablas de conteo Fase 4B en el diagnóstico del panel de seguridad.
CREATE OR REPLACE FUNCTION public.phase4a_security_report()
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
  v_direct_counts_write boolean;
  v_direct_count_lines_write boolean;
BEGIN
  PERFORM public.require_admin();
  WITH expected(name) AS (
    VALUES ('profiles'),('categories'),('products'),('variants'),('customers'),
           ('suppliers'),('purchases'),('purchase_lines'),('orders'),('order_lines'),
           ('stock_movements'),('audit_events'),('payments'),('shipments'),
           ('returns'),('return_lines'),('refunds'),('cash_expenses'),('cash_closings'),
           ('inventory_counts'),('inventory_count_lines')
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
    'name',table_name,'exists',exists_in_db,'rls',rls_enabled,'anon_can_read',anon_can_read
  ) ORDER BY table_name),'[]'::jsonb) INTO v_tables FROM evaluated;

  SELECT count(*) INTO v_functions_exposed
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');
  SELECT count(*) FILTER (WHERE role='admin' AND active),count(*)
    INTO v_admins,v_users FROM public.profiles;
  SELECT count(*) INTO v_activity FROM public.audit_events
    WHERE created_at > pg_catalog.now() - interval '30 days';
  SELECT pg_catalog.has_table_privilege('authenticated','public.variants','UPDATE') INTO v_direct_variants_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.orders','UPDATE') INTO v_direct_orders_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.profiles','UPDATE') INTO v_direct_profiles_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.inventory_counts','INSERT')
      OR pg_catalog.has_table_privilege('authenticated','public.inventory_counts','UPDATE')
      OR pg_catalog.has_table_privilege('authenticated','public.inventory_counts','DELETE') INTO v_direct_counts_write;
  SELECT pg_catalog.has_table_privilege('authenticated','public.inventory_count_lines','INSERT')
      OR pg_catalog.has_table_privilege('authenticated','public.inventory_count_lines','UPDATE')
      OR pg_catalog.has_table_privilege('authenticated','public.inventory_count_lines','DELETE') INTO v_direct_count_lines_write;

  RETURN pg_catalog.jsonb_build_object(
    'generated_at',pg_catalog.now(),'phase','4B','tables',v_tables,
    'anon_security_definer_count',v_functions_exposed,'active_admins',v_admins,
    'registered_profiles',v_users,'audit_events_30d',v_activity,
    'direct_writes',pg_catalog.jsonb_build_object(
      'variants',v_direct_variants_write,'orders',v_direct_orders_write,'profiles',v_direct_profiles_write,
      'inventory_counts',v_direct_counts_write,'inventory_count_lines',v_direct_count_lines_write
    ),'backup_status','NO_VERIFICADO_EN_EL_SERVIDOR'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.phase4a_security_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phase4a_security_report() TO authenticated;
COMMIT;
