-- Monky's Store ERP: cerrar lectura directa del DNI de envíos.
-- Ejecutar después de desplegar el código que usa admin_get_shipment_dni().
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.shipments') IS NULL
     OR to_regprocedure('public.admin_get_shipment_dni(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'La migración 008 requiere shipments y la función admin_get_shipment_dni() de la migración 007';
  END IF;
END;
$preflight$;

-- RLS sigue filtrando filas por usuario activo. Los usuarios autenticados solo
-- reciben columnas logísticas; el DNI queda disponible exclusivamente por RPC.
REVOKE SELECT ON public.shipments FROM authenticated;
GRANT SELECT (
  id, order_id, recipient_name, phone, department, province, district,
  carrier, agency_address, tracking_code, status, prepared_at,
  dispatched_at, delivered_at, updated_at, updated_by
) ON public.shipments TO authenticated;
COMMIT;
