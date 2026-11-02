-- Monky's Store ERP: protección de DNI en envíos.
-- Ejecutar una sola vez después de 006_fase4b_operaciones.sql.
-- Añade lectura administrativa vía RPC y evita borrar DNI al editar como operador.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.shipments') IS NULL
     OR to_regprocedure('public.require_admin()') IS NULL
     OR to_regprocedure('public.require_active()') IS NULL THEN
    RAISE EXCEPTION 'La migración 007 requiere la Fase 4B y la tabla shipments. No se aplicaron cambios';
  END IF;
END;
$preflight$;

-- La función SECURITY DEFINER entrega DNI solo tras comprobar el rol.
CREATE OR REPLACE FUNCTION public.admin_get_shipment_dni(p_orders uuid[])
RETURNS TABLE(order_id uuid, dni text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
    SELECT s.order_id, s.dni
    FROM public.shipments AS s
    WHERE s.order_id = ANY(coalesce(p_orders, ARRAY[]::uuid[]));
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_get_shipment_dni(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_shipment_dni(uuid[]) TO authenticated;

-- Los operadores pueden guardar los demás datos sin borrar ni leer el DNI.
CREATE OR REPLACE FUNCTION public.save_shipment(p_order uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE v_id uuid; o public.orders%rowtype; v_status text; v_dni text;
BEGIN
 PERFORM public.require_active();
 SELECT * INTO o FROM public.orders WHERE id=p_order;
 IF NOT FOUND OR o.status IN ('cancelled','expired') THEN RAISE EXCEPTION 'Pedido no válido para envío'; END IF;
 SELECT status INTO v_status FROM public.shipments WHERE order_id=p_order FOR UPDATE;
 IF v_status IN ('dispatched','delivered') THEN RAISE EXCEPTION 'No se pueden editar datos de un envío despachado'; END IF;
 IF length(trim(coalesce(p_data->>'recipient_name','')))<2 OR length(trim(coalesce(p_data->>'phone','')))<6
  OR length(trim(coalesce(p_data->>'province','')))<2 OR length(trim(coalesce(p_data->>'agency_address','')))<4 THEN
  RAISE EXCEPTION 'Faltan datos: destinatario, teléfono, provincia o agencia'; END IF;
 IF public.is_admin() THEN
   v_dni := nullif(trim(coalesce(p_data->>'dni','')),'');
 ELSE
   v_dni := NULL;
 END IF;
 INSERT INTO public.shipments(order_id,recipient_name,phone,dni,department,province,district,carrier,agency_address,updated_by)
 VALUES(p_order,trim(p_data->>'recipient_name'),trim(p_data->>'phone'),v_dni,
 nullif(trim(coalesce(p_data->>'department','')),''),trim(p_data->>'province'),
 nullif(trim(coalesce(p_data->>'district','')),''),
 CASE WHEN p_data->>'carrier'='otro' THEN 'otro' ELSE 'shalom' END,
 trim(p_data->>'agency_address'),(SELECT auth.uid()))
 ON CONFLICT (order_id) DO UPDATE SET recipient_name=excluded.recipient_name,phone=excluded.phone,
 dni=CASE WHEN public.is_admin() THEN excluded.dni ELSE public.shipments.dni END,
 department=excluded.department,province=excluded.province,district=excluded.district,
 carrier=excluded.carrier,agency_address=excluded.agency_address,updated_at=now(),updated_by=(SELECT auth.uid())
 RETURNING id INTO v_id;
 INSERT INTO public.audit_events(actor_id,event,entity_id) VALUES((SELECT auth.uid()),'save_shipment',p_order::text);
 RETURN v_id;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.save_shipment(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shipment(uuid,jsonb) TO authenticated;
COMMIT;
