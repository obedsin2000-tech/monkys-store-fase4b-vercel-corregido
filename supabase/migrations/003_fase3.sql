-- MONKY'S STORE ERP · FASE 3
-- Ejecutar SOLO después de 001_fase1.sql y 002_fase2.sql, como rol postgres.
-- No elimina ni reescribe productos, ventas ni pagos existentes.
-- Antes de ejecutarla, hacer copia de seguridad de los datos y del proyecto.
BEGIN;

-- Ejecutar como SECURITY DEFINER; el usuario activo no recibe acceso adicional
-- a las tablas subyacentes. Todos los reportes económicos requieren admin.
CREATE FUNCTION public.report_phase3(p_start date, p_end date, p_section text DEFAULT 'overview')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_from timestamptz;
 v_until timestamptz;
 v_result jsonb;
BEGIN
 PERFORM public.require_admin();
 IF p_start IS NULL OR p_end IS NULL OR p_start > p_end OR p_end - p_start > 365
   OR p_end > (now() AT TIME ZONE 'America/Lima')::date + 1 THEN
   RAISE EXCEPTION 'Selecciona un periodo válido de 1 a 366 días, sin fechas futuras';
 END IF;
 v_from := p_start::timestamp AT TIME ZONE 'America/Lima';
 v_until := (p_end + 1)::timestamp AT TIME ZONE 'America/Lima';

 IF p_section = 'overview' THEN
  WITH sales AS (
   SELECT coalesce(sum(o.total),0) revenue, count(*) orders
   FROM public.orders o WHERE o.status='confirmed' AND o.confirmed_at>=v_from AND o.confirmed_at<v_until
  ), cost AS (
   SELECT coalesce(sum(l.unit_cost*l.quantity),0) cogs
   FROM public.order_lines l JOIN public.orders o ON o.id=l.order_id
   WHERE o.status='confirmed' AND o.confirmed_at>=v_from AND o.confirmed_at<v_until
  ), returns_in_period AS (
   SELECT coalesce(sum(l.line_total*rl.quantity/l.quantity),0) returned_sales,
          coalesce(sum(CASE WHEN rl.condition='sellable' THEN l.unit_cost*rl.quantity ELSE 0 END),0) restored_cost
   FROM public.returns r JOIN public.return_lines rl ON rl.return_id=r.id
   JOIN public.order_lines l ON l.id=rl.order_line_id
   WHERE r.created_at>=v_from AND r.created_at<v_until
  ), flows AS (
   SELECT
    (SELECT coalesce(sum(amount),0) FROM public.payments WHERE received_at>=v_from AND received_at<v_until) payments,
    (SELECT coalesce(sum(amount),0) FROM public.refunds WHERE refunded_at>=v_from AND refunded_at<v_until) refunds,
    (SELECT coalesce(sum(amount),0) FROM public.cash_expenses WHERE occurred_at>=v_from AND occurred_at<v_until) expenses
  ), stock AS (
   SELECT coalesce(sum(on_hand),0) physical,coalesce(sum(reserved),0) reserved,
    coalesce(sum(on_hand-reserved-blocked),0) available,
    coalesce(sum(on_hand*avg_cost),0) inventory_value,
    count(*) FILTER (WHERE active AND on_hand-reserved-blocked<=min_stock) low_stock
   FROM public.variants
  )
  SELECT jsonb_build_object(
   'gross_sales',round(sales.revenue,2),'confirmed_orders',sales.orders,
   'return_value',round(ret.returned_sales,2),'net_sales',round(sales.revenue-ret.returned_sales,2),
   'cogs_net',round(cost.cogs-ret.restored_cost,2),
   'gross_profit_estimate',round(sales.revenue-ret.returned_sales-cost.cogs+ret.restored_cost,2),
   'payments',round(flows.payments,2),'refunds_paid',round(flows.refunds,2),
   'expenses',round(flows.expenses,2),
   'cash_net',round(flows.payments-flows.refunds-flows.expenses,2),
   'physical',stock.physical,'reserved',stock.reserved,'available',stock.available,
   'inventory_value',round(stock.inventory_value,2),'low_stock',stock.low_stock,
   'active_reservations',(SELECT count(*) FROM public.orders WHERE status='reserved')
  ) INTO v_result FROM sales, cost, returns_in_period ret, flows, stock;

 ELSIF p_section = 'daily' THEN
  -- report_date evita emplear DAY como alias/identificador en la consulta SQL.
  WITH calendar_dates AS (
   SELECT gs.generated_at::date AS report_date
   FROM pg_catalog.generate_series(
    p_start::timestamp,
    p_end::timestamp,
    interval '1 day'
   ) AS gs(generated_at)
  ), sales AS (
   SELECT (confirmed_at AT TIME ZONE 'America/Lima')::date AS report_date,
    sum(total) AS gross, count(*) AS orders
   FROM public.orders
   WHERE status='confirmed' AND confirmed_at>=v_from AND confirmed_at<v_until
   GROUP BY 1
  ), returns_daily AS (
   SELECT (r.created_at AT TIME ZONE 'America/Lima')::date AS report_date,
    sum(l.line_total*rl.quantity/l.quantity) AS returned
   FROM public.returns r
   JOIN public.return_lines rl ON rl.return_id=r.id
   JOIN public.order_lines l ON l.id=rl.order_line_id
   WHERE r.created_at>=v_from AND r.created_at<v_until
   GROUP BY 1
  ), collections AS (
   SELECT (received_at AT TIME ZONE 'America/Lima')::date AS report_date,
    sum(amount) AS received
   FROM public.payments
   WHERE received_at>=v_from AND received_at<v_until
   GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'day',d.report_date,
   'gross_sales',coalesce(s.gross,0),
   'returns',coalesce(r.returned,0),
   'net_sales',coalesce(s.gross,0)-coalesce(r.returned,0),
   'orders',coalesce(s.orders,0),
   'payments',coalesce(c.received,0)
  ) ORDER BY d.report_date),'[]'::jsonb)
  INTO v_result
  FROM calendar_dates d
  LEFT JOIN sales s USING(report_date)
  LEFT JOIN returns_daily r USING(report_date)
  LEFT JOIN collections c USING(report_date);

 ELSIF p_section = 'channels' THEN
  WITH sales AS (
   SELECT channel,coalesce(sum(total),0) gross,count(*) orders
   FROM public.orders WHERE status='confirmed' AND confirmed_at>=v_from AND confirmed_at<v_until GROUP BY channel
  ), returns_channel AS (
   SELECT o.channel,sum(l.line_total*rl.quantity/l.quantity) returned
   FROM public.returns r JOIN public.orders o ON o.id=r.order_id
   JOIN public.return_lines rl ON rl.return_id=r.id JOIN public.order_lines l ON l.id=rl.order_line_id
   WHERE r.created_at>=v_from AND r.created_at<v_until GROUP BY o.channel
  ), channels AS (SELECT unnest(ARRAY['tiktok','whatsapp','directo']) AS channel)
  SELECT coalesce(jsonb_agg(jsonb_build_object('channel',c.channel,'gross_sales',coalesce(s.gross,0),
   'returned',coalesce(r.returned,0),'net_sales',coalesce(s.gross,0)-coalesce(r.returned,0),
   'orders',coalesce(s.orders,0)) ORDER BY c.channel),'[]'::jsonb)
  INTO v_result FROM channels c LEFT JOIN sales s USING(channel) LEFT JOIN returns_channel r USING(channel);

 ELSIF p_section = 'products' THEN
  WITH sold AS (
   SELECT l.variant_id,sum(l.quantity) units,sum(l.line_total) gross,
    sum(l.unit_cost*l.quantity) cost
   FROM public.order_lines l JOIN public.orders o ON o.id=l.order_id
   WHERE o.status='confirmed' AND o.confirmed_at>=v_from AND o.confirmed_at<v_until GROUP BY l.variant_id
  ), returned AS (
   SELECT l.variant_id,sum(rl.quantity) units,sum(l.line_total*rl.quantity/l.quantity) returned,
    sum(CASE WHEN rl.condition='sellable' THEN rl.quantity*l.unit_cost ELSE 0 END) restored_cost
   FROM public.returns r JOIN public.return_lines rl ON rl.return_id=r.id
   JOIN public.order_lines l ON l.id=rl.order_line_id
   WHERE r.created_at>=v_from AND r.created_at<v_until GROUP BY l.variant_id
  ), joined AS (
   SELECT v.sku,v.size,v.color,p.name product,
    coalesce(s.units,0) units,coalesce(s.gross,0) gross,coalesce(ret.units,0) units_returned,
    coalesce(ret.returned,0) returned,
    coalesce(s.gross,0)-coalesce(ret.returned,0)-coalesce(s.cost,0)+coalesce(ret.restored_cost,0) profit,
    v.on_hand-v.reserved-v.blocked available
   FROM public.variants v JOIN public.products p ON p.id=v.product_id
   LEFT JOIN sold s ON s.variant_id=v.id LEFT JOIN returned ret ON ret.variant_id=v.id
   WHERE s.variant_id IS NOT NULL OR ret.variant_id IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.gross DESC,z.sku),'[]'::jsonb) INTO v_result
  FROM (SELECT * FROM joined ORDER BY gross DESC,sku LIMIT 200) z;

 ELSIF p_section = 'inventory' THEN
  WITH sold AS (
    SELECT l.variant_id,sum(l.quantity) sold_units
    FROM public.orders o JOIN public.order_lines l ON l.order_id=o.id
    WHERE o.status='confirmed' AND o.confirmed_at>=v_from AND o.confirmed_at<v_until
    GROUP BY l.variant_id
  ), listed AS (
   SELECT v.sku,p.name product,v.size,v.color,v.active, v.on_hand physical,
    v.reserved,v.blocked, v.on_hand-v.reserved-v.blocked available,
    v.min_stock,coalesce(s.sold_units,0) sold_units,
    round(v.on_hand*v.avg_cost,2) inventory_value,
    v.avg_cost, (v.on_hand-v.reserved-v.blocked)<=v.min_stock low_stock
   FROM public.variants v JOIN public.products p ON p.id=v.product_id
   LEFT JOIN sold s ON s.variant_id=v.id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.low_stock DESC,z.sold_units DESC,z.sku),'[]'::jsonb)
   INTO v_result FROM (SELECT * FROM listed ORDER BY low_stock DESC,sold_units DESC,sku LIMIT 500) z;

 ELSIF p_section = 'suppliers' THEN
  WITH units AS (
   SELECT pl.purchase_id,sum(pl.quantity) units
   FROM public.purchase_lines pl GROUP BY pl.purchase_id
  ), summarized AS (
   SELECT s.id,s.name,s.phone,count(p.id) deliveries,coalesce(sum(p.total),0) total,
    coalesce(sum(u.units),0) units,max(p.received_at) last_purchase
   FROM public.suppliers s LEFT JOIN public.purchases p ON p.supplier_id=s.id
    AND p.received_at>=v_from AND p.received_at<v_until
   LEFT JOIN units u ON u.purchase_id=p.id
   GROUP BY s.id,s.name,s.phone
  )
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.total DESC,z.name),'[]'::jsonb)
   INTO v_result FROM (SELECT * FROM summarized ORDER BY total DESC,name LIMIT 200) z;
 ELSE
  RAISE EXCEPTION 'Sección de reporte no permitida';
 END IF;
 RETURN coalesce(v_result,'[]'::jsonb);
END;
$$;

CREATE INDEX IF NOT EXISTS orders_report_confirmed_idx ON public.orders(confirmed_at) WHERE status='confirmed';
CREATE INDEX IF NOT EXISTS returns_report_date_idx ON public.returns(created_at);
CREATE INDEX IF NOT EXISTS purchases_report_date_idx ON public.purchases(received_at);

-- Solo admin puede activar/desactivar cuentas o asignar rol.
CREATE FUNCTION public.manage_team_member(p_user uuid,p_role text,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old public.profiles%rowtype; v_admins integer;
BEGIN
 PERFORM public.require_admin();
 IF p_user IS NULL OR p_role NOT IN ('admin','operator') OR p_active IS NULL THEN
  RAISE EXCEPTION 'Datos del usuario inválidos';
 END IF;
 -- Serializar cambios de permisos para impedir desactivar al último administrador.
 PERFORM pg_catalog.pg_advisory_xact_lock(381199,3);
 SELECT * INTO v_old FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no registrado en profiles'; END IF;
 IF p_user=(SELECT auth.uid()) AND (NOT p_active OR p_role<>'admin') THEN
  RAISE EXCEPTION 'No puedes quitar tus propios permisos de administrador';
 END IF;
 IF v_old.role='admin' AND v_old.active AND (p_role<>'admin' OR NOT p_active) THEN
  SELECT count(*) INTO v_admins FROM public.profiles WHERE role='admin' AND active;
  IF v_admins<=1 THEN RAISE EXCEPTION 'Debe existir al menos un administrador activo'; END IF;
 END IF;
 UPDATE public.profiles SET role=p_role,active=p_active WHERE id=p_user;
 INSERT INTO public.audit_events(actor_id,event,entity_id,data)
 VALUES((SELECT auth.uid()),'manage_team_member',p_user::text,
  jsonb_build_object('old_role',v_old.role,'old_active',v_old.active,'new_role',p_role,'new_active',p_active));
END;$$;

REVOKE ALL ON FUNCTION public.report_phase3(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_phase3(date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.manage_team_member(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_team_member(uuid,text,boolean) TO authenticated;

COMMIT;
