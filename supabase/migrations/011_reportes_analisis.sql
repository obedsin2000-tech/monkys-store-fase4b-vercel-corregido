-- Reportes conciliables. Ejecutar después de 010 como propietario del proyecto.
-- Solo añade funciones de lectura; no modifica registros históricos ni permisos de tablas.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.create_order_with_discounts(uuid,text,text,uuid,text,text,text,integer,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Aplica primero las migraciones 001 a 010';
 END IF;
END $$;

-- Fuente común para tarjetas, gráfico, detalle y exportación. Precios/costos históricos.
CREATE OR REPLACE FUNCTION public._report_entries(p_start date,p_end date,p_cutoff timestamptz,p_kinds text[] DEFAULT NULL)
RETURNS TABLE(id text,kind text,operation_id uuid,order_id uuid,order_number bigint,occurred_at timestamptz,
 channel text,party text,variant_id uuid,sku text,product text,variant text,amount numeric,cost numeric,
 recovered_cost numeric,discount numeric,discount_known boolean,units bigint,condition text,
 supplier_key text,reference text,method text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT 'sale:'||l.id,'sale',o.id,o.id,o.order_number,o.confirmed_at,o.channel,
  coalesce(o.buyer_name,c.name,o.tiktok_handle,'Cliente'),v.id,v.sku,p.name,v.size||' / '||v.color,
  l.line_total,l.quantity*l.unit_cost,0::numeric,
  (coalesce(l.catalog_unit_price,l.unit_price)-l.unit_price)*l.quantity,l.catalog_unit_price IS NOT NULL,
  l.quantity::bigint,NULL::text,NULL::text,'Pedido #'||o.order_number,o.payment_method
 FROM public.orders o JOIN public.order_lines l ON l.order_id=o.id
 JOIN public.variants v ON v.id=l.variant_id JOIN public.products p ON p.id=v.product_id
 LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE (p_kinds IS NULL OR 'sale'=ANY(p_kinds)) AND o.status='confirmed' AND o.confirmed_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND o.confirmed_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND o.confirmed_at<=p_cutoff
 UNION ALL
 SELECT 'return:'||rl.id,'return',r.id,o.id,o.order_number,r.created_at,o.channel,
  coalesce(o.buyer_name,c.name,o.tiktok_handle,'Cliente'),v.id,v.sku,p.name,v.size||' / '||v.color,
  round(l.line_total*rl.quantity/l.quantity,2),rl.quantity*l.unit_cost,
  CASE WHEN rl.condition='sellable' THEN rl.quantity*l.unit_cost ELSE 0 END,
  0::numeric,true,rl.quantity::bigint,rl.condition,NULL::text,'Devolución · Pedido #'||o.order_number,NULL::text
 FROM public.returns r JOIN public.return_lines rl ON rl.return_id=r.id
 JOIN public.order_lines l ON l.id=rl.order_line_id JOIN public.orders o ON o.id=r.order_id
 JOIN public.variants v ON v.id=l.variant_id JOIN public.products p ON p.id=v.product_id
 LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE (p_kinds IS NULL OR 'return'=ANY(p_kinds)) AND r.created_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND r.created_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND r.created_at<=p_cutoff
 UNION ALL
 SELECT 'payment:'||f.id,'payment',f.id,o.id,o.order_number,f.received_at,o.channel,
  coalesce(o.buyer_name,c.name,o.tiktok_handle,'Cliente'),NULL::uuid,NULL::text,NULL::text,NULL::text,
  f.amount,0::numeric,0::numeric,0::numeric,true,0::bigint,NULL::text,NULL::text,
  'Cobro · Pedido #'||o.order_number,f.method
 FROM public.payments f JOIN public.orders o ON o.id=f.order_id LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE (p_kinds IS NULL OR 'payment'=ANY(p_kinds)) AND f.received_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND f.received_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND f.received_at<=p_cutoff
 UNION ALL
 SELECT 'refund:'||f.id,'refund',f.id,o.id,o.order_number,f.refunded_at,o.channel,
  coalesce(o.buyer_name,c.name,o.tiktok_handle,'Cliente'),NULL::uuid,NULL::text,NULL::text,NULL::text,
  f.amount,0::numeric,0::numeric,0::numeric,true,0::bigint,NULL::text,NULL::text,
  'Reembolso · Pedido #'||o.order_number,f.method
 FROM public.refunds f JOIN public.orders o ON o.id=f.order_id LEFT JOIN public.customers c ON c.id=o.customer_id
 WHERE (p_kinds IS NULL OR 'refund'=ANY(p_kinds)) AND f.refunded_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND f.refunded_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND f.refunded_at<=p_cutoff
 UNION ALL
 SELECT 'expense:'||f.id,'expense',f.id,NULL::uuid,NULL::bigint,f.occurred_at,NULL::text,f.concept,
  NULL::uuid,NULL::text,NULL::text,NULL::text,f.amount,0::numeric,0::numeric,0::numeric,true,
  0::bigint,NULL::text,NULL::text,f.concept,f.method
 FROM public.cash_expenses f WHERE (p_kinds IS NULL OR 'expense'=ANY(p_kinds)) AND f.occurred_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND f.occurred_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND f.occurred_at<=p_cutoff
 UNION ALL
 SELECT 'purchase:'||f.id,'purchase',f.id,NULL::uuid,NULL::bigint,f.received_at,NULL::text,
  coalesce(s.name,'Sin proveedor registrado'),NULL::uuid,NULL::text,NULL::text,NULL::text,
  f.total,0::numeric,0::numeric,0::numeric,true,coalesce(u.units,0)::bigint,NULL::text,
  coalesce(f.supplier_id::text,'unassigned'),coalesce(nullif(f.reference,''),'Recepción '||left(f.id::text,8)),NULL::text
 FROM public.purchases f LEFT JOIN public.suppliers s ON s.id=f.supplier_id
 LEFT JOIN LATERAL (SELECT sum(l.quantity) units FROM public.purchase_lines l WHERE l.purchase_id=f.id) u ON true
 WHERE (p_kinds IS NULL OR 'purchase'=ANY(p_kinds)) AND f.received_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
  AND f.received_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND f.received_at<=p_cutoff
$$;

CREATE OR REPLACE FUNCTION public._report_stock(p_start date,p_end date,p_cutoff timestamptz)
RETURNS TABLE(variant_id uuid,sku text,product text,size text,color text,active boolean,physical integer,
 reserved integer,blocked integer,available integer,min_stock integer,sold_units bigint,inventory_value numeric,
 avg_cost numeric,low_stock boolean,no_sales boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH sold AS (
  SELECT l.variant_id,sum(l.quantity)::bigint n FROM public.orders o JOIN public.order_lines l ON l.order_id=o.id
  WHERE o.status='confirmed' AND o.confirmed_at>=p_start::timestamp AT TIME ZONE 'America/Lima'
   AND o.confirmed_at<(p_end+1)::timestamp AT TIME ZONE 'America/Lima' AND o.confirmed_at<=p_cutoff GROUP BY l.variant_id
 )
 SELECT v.id,v.sku,p.name,v.size,v.color,v.active,v.on_hand,v.reserved,v.blocked,
  v.on_hand-v.reserved-v.blocked,v.min_stock,coalesce(s.n,0),round(v.on_hand*v.avg_cost,2),v.avg_cost,
  v.active AND v.on_hand-v.reserved-v.blocked<=v.min_stock,
  v.active AND v.on_hand-v.reserved-v.blocked>0 AND coalesce(s.n,0)=0
 FROM public.variants v JOIN public.products p ON p.id=v.product_id LEFT JOIN sold s ON s.variant_id=v.id
$$;

CREATE OR REPLACE FUNCTION public._report_receivables()
RETURNS TABLE(order_id uuid,order_number bigint,occurred_at timestamptz,party text,channel text,total numeric,paid numeric,due numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id,o.order_number,o.created_at,coalesce(o.buyer_name,c.name,o.tiktok_handle,'Cliente'),o.channel,o.total,
  coalesce(p.paid,0),greatest(0,o.total-coalesce(p.paid,0))
 FROM public.orders o LEFT JOIN public.customers c ON c.id=o.customer_id
 LEFT JOIN LATERAL (SELECT sum(f.amount) paid FROM public.payments f WHERE f.order_id=o.id) p ON true
 WHERE o.status='reserved' AND (o.expires_at>statement_timestamp() OR coalesce(p.paid,0)>0)
  AND o.total>coalesce(p.paid,0)
$$;

CREATE OR REPLACE FUNCTION public._report_suppliers(p_start date,p_end date,p_cutoff timestamptz)
RETURNS TABLE(supplier_key text,id uuid,name text,phone text,deliveries bigint,total numeric,units bigint,last_purchase timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH bought AS (
  SELECT e.supplier_key,count(*) n,sum(e.amount) total,sum(e.units) units,max(e.occurred_at) last_purchase
  FROM public._report_entries(p_start,p_end,p_cutoff,ARRAY['purchase']) e WHERE e.kind='purchase' GROUP BY e.supplier_key
 )
 SELECT s.id::text,s.id,s.name,s.phone,coalesce(b.n,0),coalesce(b.total,0),coalesce(b.units,0)::bigint,b.last_purchase
 FROM public.suppliers s LEFT JOIN bought b ON b.supplier_key=s.id::text
 UNION ALL
 SELECT 'unassigned',NULL::uuid,'Sin proveedor registrado',NULL::text,b.n,b.total,b.units::bigint,b.last_purchase
 FROM bought b WHERE b.supplier_key='unassigned'
$$;

-- Los auxiliares no son una API: solo las funciones administrativas pueden usarlos.
REVOKE ALL ON FUNCTION public._report_entries(date,date,timestamptz,text[]),public._report_stock(date,date,timestamptz),
 public._report_receivables(),public._report_suppliers(date,date,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._report_detail_rows(p_start date,p_end date,p_cutoff timestamptz,p_metric text)
RETURNS TABLE(row_data jsonb,value numeric,occurred_at timestamptz,id text,channel text,search text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH e AS MATERIALIZED (
  SELECT * FROM public._report_entries(p_start,p_end,p_cutoff,CASE
   WHEN p_metric IN ('sales','orders','discounts') THEN ARRAY['sale']
   WHEN p_metric IN ('returns') THEN ARRAY['return']
   WHEN p_metric IN ('net_sales','profit','cogs') THEN ARRAY['sale','return']
   WHEN p_metric='payments' THEN ARRAY['payment'] WHEN p_metric='refunds' THEN ARRAY['refund']
   WHEN p_metric='expenses' THEN ARRAY['expense'] WHEN p_metric='purchases' THEN ARRAY['purchase']
   WHEN p_metric='cash_net' THEN ARRAY['payment','refund','expense'] ELSE ARRAY[]::text[] END)
 ), valued AS (
  SELECT e.*,CASE
   WHEN p_metric='discounts' THEN e.discount
   WHEN p_metric='profit' THEN CASE WHEN e.kind='sale' THEN e.amount-e.cost ELSE -e.amount+e.recovered_cost END
   WHEN p_metric='cogs' THEN CASE WHEN e.kind='sale' THEN e.cost ELSE -e.recovered_cost END
   WHEN p_metric='net_sales' THEN CASE WHEN e.kind='sale' THEN e.amount ELSE -e.amount END
   WHEN p_metric='cash_net' THEN CASE WHEN e.kind='payment' THEN e.amount ELSE -e.amount END
   ELSE e.amount END v
  FROM e WHERE p_metric<>'orders' AND (p_metric<>'discounts' OR e.discount>0)
 )
 SELECT to_jsonb(t)-'v'||jsonb_build_object('value',round(t.v,2)),round(t.v,2),t.occurred_at,t.id,t.channel,
  concat_ws(' ',t.party,t.reference,t.sku,t.product,t.variant,t.order_number::text)
 FROM valued t
 UNION ALL
 SELECT jsonb_build_object('id','order:'||e.order_id,'kind','order','operation_id',e.order_id,'order_id',e.order_id,
  'order_number',e.order_number,'occurred_at',max(e.occurred_at),'channel',e.channel,'party',e.party,
  'reference','Pedido #'||e.order_number,'amount',sum(e.amount),'cost',sum(e.cost),'discount',sum(e.discount),
  'units',sum(e.units),'value',1),1::numeric,max(e.occurred_at),'order:'||e.order_id,e.channel,
  concat_ws(' ',e.party,'Pedido',e.order_number::text)
 FROM e WHERE p_metric='orders' AND e.kind='sale' GROUP BY e.order_id,e.order_number,e.channel,e.party
 UNION ALL
 SELECT to_jsonb(s)||jsonb_build_object('id','stock:'||s.variant_id,'kind','stock','occurred_at',statement_timestamp(),
  'variant',s.size||' / '||s.color,'reference',s.sku,'party',s.product,'amount',s.inventory_value,
  'value',CASE WHEN p_metric='physical' THEN s.physical WHEN p_metric='available' THEN s.available
   WHEN p_metric='inventory_value' THEN s.inventory_value ELSE 1 END),
  CASE WHEN p_metric='physical' THEN s.physical WHEN p_metric='available' THEN s.available
   WHEN p_metric='inventory_value' THEN s.inventory_value ELSE 1 END,
  statement_timestamp(),'stock:'||s.variant_id,NULL::text,concat_ws(' ',s.sku,s.product,s.size,s.color)
 FROM public._report_stock(p_start,p_end,p_cutoff) s
 WHERE p_metric IN ('physical','available','inventory_value','low_stock','no_sales')
  AND (p_metric<>'low_stock' OR s.low_stock) AND (p_metric<>'no_sales' OR s.no_sales)
 UNION ALL
 SELECT to_jsonb(r)||jsonb_build_object('id','reservation:'||r.order_id,'kind','reservation','reference','Pedido #'||r.order_number,
  'amount',r.total,'value',r.due),r.due,r.occurred_at,'reservation:'||r.order_id,r.channel,
  concat_ws(' ',r.party,'Pedido',r.order_number::text)
 FROM public._report_receivables() r WHERE p_metric='receivables'
$$;
REVOKE ALL ON FUNCTION public._report_detail_rows(date,date,timestamptz,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.report_analysis(p_start date,p_end date,p_tab text,p_options jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_cutoff timestamptz:=coalesce(nullif(p_options->>'as_of','')::timestamptz,statement_timestamp());
 v_from timestamptz;v_until timestamptz;v_prev_start date;v_prev_end date;v_prev_cutoff timestamptz;
 v_days integer;v_page integer:=greatest(1,coalesce((p_options->>'page')::integer,1));
 v_size integer:=least(100,greatest(1,coalesce((p_options->>'size')::integer,50)));
 v_export boolean:=coalesce((p_options->>'export')::boolean,false);
 v_sort text:=coalesce(nullif(p_options->>'sort',''),CASE p_tab WHEN 'inventory' THEN 'low_stock' WHEN 'suppliers' THEN 'purchases' WHEN 'detail' THEN 'newest' ELSE 'sales' END);
 v_q text:=left(trim(coalesce(p_options->>'q','')),80);v_focus text:=coalesce(p_options->>'focus','all');
 v_metric text:=coalesce(p_options->>'metric','sales');v_channel text:=nullif(p_options->>'channel','');
 v_variant text:=nullif(p_options->>'variant','');v_supplier text:=nullif(p_options->>'supplier','');
 v_meta jsonb;v_result jsonb;v_partial boolean;
BEGIN
 PERFORM public.require_admin();
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end OR p_end-p_start>365
  OR p_end>(statement_timestamp() AT TIME ZONE 'America/Lima')::date THEN
  RAISE EXCEPTION 'Selecciona de 1 a 366 días y no utilices fechas futuras'; END IF;
 IF p_options IS NULL OR jsonb_typeof(p_options)<>'object' THEN RAISE EXCEPTION 'Filtros inválidos'; END IF;
 IF v_cutoff>statement_timestamp() OR v_cutoff<p_end::timestamp AT TIME ZONE 'America/Lima' THEN
  RAISE EXCEPTION 'Corte inválido. Actualiza los datos para consultar el período'; END IF;
 IF v_channel IS NOT NULL AND v_channel NOT IN ('tiktok','whatsapp','directo') THEN RAISE EXCEPTION 'Canal inválido'; END IF;
 IF v_focus NOT IN ('all','low_stock','no_sales') THEN RAISE EXCEPTION 'Filtro de inventario inválido'; END IF;
 IF v_variant IS NOT NULL AND v_variant!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Variante inválida'; END IF;
 IF v_supplier IS NOT NULL AND v_supplier<>'unassigned' AND v_supplier!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Proveedor inválido'; END IF;
 IF p_tab<>'detail' AND (v_channel IS NOT NULL OR v_variant IS NOT NULL OR v_supplier IS NOT NULL) THEN RAISE EXCEPTION 'Usa los filtros de operación en el detalle'; END IF;
 IF p_tab='sales' AND (v_q<>'' OR v_focus<>'all') THEN RAISE EXCEPTION 'Usa la búsqueda desde el detalle de cada indicador'; END IF;
 IF p_tab='detail' AND v_focus<>'all' AND v_metric NOT IN ('physical','available','inventory_value','low_stock','no_sales') THEN RAISE EXCEPTION 'Disponibilidad solo se aplica a inventario'; END IF;
 IF v_export THEN v_page:=1;v_size:=10000; END IF;
 v_days:=p_end-p_start+1;v_prev_end:=p_start-1;v_prev_start:=p_start-v_days;
 v_from:=p_start::timestamp AT TIME ZONE 'America/Lima';v_until:=(p_end+1)::timestamp AT TIME ZONE 'America/Lima';
 v_partial:=(v_cutoff AT TIME ZONE 'America/Lima')::date=p_end;
 v_prev_cutoff:=CASE WHEN v_partial THEN (v_prev_end+(v_cutoff AT TIME ZONE 'America/Lima')::time) AT TIME ZONE 'America/Lima'
  ELSE (v_prev_end+1)::timestamp AT TIME ZONE 'America/Lima' END;
 v_meta:=jsonb_build_object('start',p_start,'end',p_end,'days',v_days,'as_of',v_cutoff,'generated_at',statement_timestamp(),
  'previous_start',v_prev_start,'previous_end',v_prev_end,'previous_cutoff',v_prev_cutoff,'partial_comparison',v_partial,'inventory_at',statement_timestamp());

 IF p_tab='sales' THEN
  IF v_sort NOT IN ('sales','units','profit','discounts','returns') THEN RAISE EXCEPTION 'Orden inválido'; END IF;
  WITH e AS MATERIALIZED (SELECT * FROM public._report_entries(v_prev_start,p_end,v_cutoff,ARRAY['sale','return','payment','refund','expense'])),
  windows(tag,from_at,until_at,cutoff) AS (VALUES ('current',v_from,v_until,v_cutoff),
   ('previous',v_prev_start::timestamp AT TIME ZONE 'America/Lima',p_start::timestamp AT TIME ZONE 'America/Lima',v_prev_cutoff)),
  stats AS (
   SELECT w.tag,coalesce(sum(e.amount) FILTER(WHERE e.kind='sale'),0) sales,
    count(DISTINCT e.order_id) FILTER(WHERE e.kind='sale') orders,
    coalesce(sum(e.amount) FILTER(WHERE e.kind='return'),0) returned,
    coalesce(sum(e.cost) FILTER(WHERE e.kind='sale'),0) cost,
    coalesce(sum(e.recovered_cost) FILTER(WHERE e.kind='return'),0) recovered,
    coalesce(sum(e.amount) FILTER(WHERE e.kind='payment'),0) payments,
    coalesce(sum(e.amount) FILTER(WHERE e.kind='refund'),0) refunds,
    coalesce(sum(e.amount) FILTER(WHERE e.kind='expense'),0) expenses,
    coalesce(sum(e.discount) FILTER(WHERE e.kind='sale'),0) discounts,
    count(*) FILTER(WHERE e.kind='sale' AND NOT e.discount_known) unknown_lines
   FROM windows w LEFT JOIN e ON e.occurred_at>=w.from_at AND e.occurred_at<w.until_at AND e.occurred_at<=w.cutoff GROUP BY w.tag
  ), metrics AS (
   SELECT tag,jsonb_build_object('gross_sales',round(sales,2),'confirmed_orders',orders,'return_value',round(returned,2),
    'net_sales',round(sales-returned,2),'cogs_net',round(cost-recovered,2),'gross_profit_estimate',round(sales-returned-cost+recovered,2),
    'payments',round(payments,2),'refunds_paid',round(refunds,2),'expenses',round(expenses,2),'cash_net',round(payments-refunds-expenses,2),
    'discounts',round(discounts,2),'unknown_discount_lines',unknown_lines) val FROM stats
  ), current_e AS MATERIALIZED (SELECT * FROM e WHERE occurred_at>=v_from),
  days AS (SELECT d::date AS day FROM generate_series(p_start::timestamp,p_end::timestamp,interval '1 day') d),
  day_totals AS (
   SELECT (occurred_at AT TIME ZONE 'America/Lima')::date AS day,
    coalesce(sum(amount) FILTER(WHERE kind='sale'),0) sales,coalesce(sum(amount) FILTER(WHERE kind='payment'),0) payments,
    coalesce(sum(amount) FILTER(WHERE kind='return'),0) returned,count(DISTINCT order_id) FILTER(WHERE kind='sale') orders
   FROM current_e GROUP BY 1
  ), channel_totals AS (
   SELECT channel,coalesce(sum(amount) FILTER(WHERE kind='sale'),0) sales,
    coalesce(sum(amount) FILTER(WHERE kind='return'),0) returned,
    coalesce(sum(cost) FILTER(WHERE kind='sale'),0) cost,coalesce(sum(recovered_cost) FILTER(WHERE kind='return'),0) recovered,
    coalesce(sum(discount) FILTER(WHERE kind='sale'),0) discounts,count(DISTINCT order_id) FILTER(WHERE kind='sale') orders
   FROM current_e WHERE kind IN ('sale','return') GROUP BY channel
  ), products AS MATERIALIZED (
   SELECT v.id variant_id,v.sku,p.name product,v.size,v.color,
    coalesce(sum(e.units) FILTER(WHERE e.kind='sale'),0) units,coalesce(sum(e.amount) FILTER(WHERE e.kind='sale'),0) gross,
    coalesce(sum(e.units) FILTER(WHERE e.kind='return'),0) units_returned,coalesce(sum(e.amount) FILTER(WHERE e.kind='return'),0) returned,
    coalesce(sum(CASE WHEN e.kind='sale' THEN e.amount-e.cost ELSE -e.amount+e.recovered_cost END),0) profit,
    coalesce(sum(e.discount) FILTER(WHERE e.kind='sale'),0) discounts,v.on_hand-v.reserved-v.blocked available
   FROM current_e e JOIN public.variants v ON v.id=e.variant_id JOIN public.products p ON p.id=v.product_id
   WHERE e.kind IN ('sale','return') GROUP BY v.id,p.name
  ), product_stats AS (SELECT count(*) n,coalesce(sum(units),0) units,coalesce(sum(gross),0) gross,
   coalesce(sum(returned),0) returned,coalesce(sum(units_returned),0) units_returned,coalesce(sum(profit),0) profit,coalesce(sum(discounts),0) discounts FROM products),
  product_page AS (SELECT * FROM products ORDER BY
   CASE v_sort WHEN 'sales' THEN gross WHEN 'units' THEN units WHEN 'profit' THEN profit WHEN 'discounts' THEN discounts WHEN 'returns' THEN returned END DESC,sku
   LIMIT v_size OFFSET (least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM product_stats)))-1)*v_size)
  SELECT jsonb_build_object('current',(SELECT val FROM metrics WHERE tag='current'),'previous',(SELECT val FROM metrics WHERE tag='previous'),
   'daily',(SELECT jsonb_agg(jsonb_build_object('day',d.day,'gross_sales',coalesce(t.sales,0),'payments',coalesce(t.payments,0),'returns',coalesce(t.returned,0),
    'net_sales',coalesce(t.sales,0)-coalesce(t.returned,0),'orders',coalesce(t.orders,0)) ORDER BY d.day) FROM days d LEFT JOIN day_totals t USING(day)),
   'channels',(SELECT jsonb_agg(jsonb_build_object('channel',c.channel,'orders',coalesce(t.orders,0),'gross_sales',coalesce(t.sales,0),'returned',coalesce(t.returned,0),
    'net_sales',coalesce(t.sales,0)-coalesce(t.returned,0),'profit',coalesce(t.sales,0)-coalesce(t.returned,0)-coalesce(t.cost,0)+coalesce(t.recovered,0),
    'discounts',coalesce(t.discounts,0),'share',CASE WHEN (SELECT sales FROM stats WHERE tag='current')>0
    THEN round(100*coalesce(t.sales,0)/(SELECT sales FROM stats WHERE tag='current'),2) ELSE NULL END) ORDER BY c.channel)
    FROM unnest(ARRAY['tiktok','whatsapp','directo']) c(channel) LEFT JOIN channel_totals t USING(channel)),
   'products',jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM product_page p),'[]'::jsonb),'count',(SELECT n FROM product_stats),
    'page',least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM product_stats))),'pages',greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM product_stats)),
    'size',v_size,'summary',(SELECT to_jsonb(s)-'n' FROM product_stats s)),
   'receivables',(SELECT jsonb_build_object('count',count(*),'total',coalesce(sum(due),0)) FROM public._report_receivables())) INTO v_result;

 ELSIF p_tab='inventory' THEN
  IF v_sort NOT IN ('low_stock','units','value','sku') THEN RAISE EXCEPTION 'Orden inválido'; END IF;
  WITH rows AS MATERIALIZED (SELECT * FROM public._report_stock(p_start,p_end,v_cutoff) s
   WHERE (v_q='' OR strpos(lower(concat_ws(' ',s.sku,s.product,s.size,s.color)),lower(v_q))>0)
    AND (v_focus<>'low_stock' OR s.low_stock) AND (v_focus<>'no_sales' OR s.no_sales)),
  totals AS (SELECT count(*) n,coalesce(sum(physical),0) physical,coalesce(sum(available),0) available,
   coalesce(sum(reserved),0) reserved,coalesce(sum(blocked),0) blocked,coalesce(sum(sold_units),0) sold_units,coalesce(sum(inventory_value),0) inventory_value,
   count(*) FILTER(WHERE low_stock) low_stock,count(*) FILTER(WHERE no_sales) no_sales FROM rows),
  page_rows AS (SELECT * FROM rows ORDER BY CASE WHEN v_sort='low_stock' THEN low_stock::integer END DESC,
   CASE WHEN v_sort='units' THEN sold_units WHEN v_sort='value' THEN inventory_value END DESC,sku
   LIMIT v_size OFFSET (least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)))-1)*v_size)
  SELECT jsonb_build_object('current',(SELECT to_jsonb(t)-'n' FROM totals t),'previous',NULL,
   'stock',jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM page_rows r),'[]'::jsonb),'count',(SELECT n FROM totals),
    'page',least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals))),'pages',greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)),
    'size',v_size,'summary',(SELECT to_jsonb(t)-'n' FROM totals t))) INTO v_result;

 ELSIF p_tab='suppliers' THEN
  IF v_sort NOT IN ('purchases','deliveries','units','name') THEN RAISE EXCEPTION 'Orden inválido'; END IF;
  WITH rows AS MATERIALIZED (SELECT * FROM public._report_suppliers(p_start,p_end,v_cutoff) s
   WHERE v_q='' OR strpos(lower(s.name),lower(v_q))>0),
  old_rows AS (SELECT * FROM public._report_suppliers(v_prev_start,v_prev_end,v_prev_cutoff) s WHERE v_q='' OR strpos(lower(s.name),lower(v_q))>0),
  totals AS (SELECT count(*) n,coalesce(sum(total),0) purchases,coalesce(sum(deliveries),0) deliveries,coalesce(sum(units),0) units FROM rows),
  page_rows AS (SELECT * FROM rows ORDER BY CASE v_sort WHEN 'purchases' THEN total WHEN 'deliveries' THEN deliveries WHEN 'units' THEN units END DESC,name,supplier_key
   LIMIT v_size OFFSET (least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)))-1)*v_size)
  SELECT jsonb_build_object('current',(SELECT to_jsonb(t)-'n' FROM totals t),'previous',(SELECT jsonb_build_object('purchases',coalesce(sum(total),0),
    'deliveries',coalesce(sum(deliveries),0),'units',coalesce(sum(units),0)) FROM old_rows),
   'suppliers',jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM page_rows r),'[]'::jsonb),'count',(SELECT n FROM totals),
    'page',least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals))),'pages',greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)),
    'size',v_size,'summary',(SELECT to_jsonb(t)-'n' FROM totals t))) INTO v_result;

 ELSIF p_tab='detail' THEN
  IF v_metric NOT IN ('sales','orders','returns','net_sales','profit','cogs','discounts','payments','refunds','expenses','cash_net','receivables','physical','available','inventory_value','low_stock','no_sales','purchases')
   OR v_sort NOT IN ('newest','oldest','amount_desc','amount_asc') THEN RAISE EXCEPTION 'Detalle inválido'; END IF;
  IF v_channel IS NOT NULL AND v_metric IN ('expenses','cash_net','physical','available','inventory_value','low_stock','no_sales','purchases') THEN
   RAISE EXCEPTION 'Este indicador no tiene asignación completa por canal'; END IF;
  IF v_variant IS NOT NULL AND v_metric NOT IN ('sales','returns','net_sales','profit','cogs','discounts','physical','available','inventory_value','low_stock','no_sales') THEN
   RAISE EXCEPTION 'No se asignan cobros ni movimientos generales a una variante'; END IF;
  IF v_supplier IS NOT NULL AND v_metric<>'purchases' THEN RAISE EXCEPTION 'Filtro de proveedor no aplicable'; END IF;
  WITH base AS MATERIALIZED (SELECT * FROM public._report_detail_rows(p_start,p_end,v_cutoff,v_metric) r
   WHERE (v_channel IS NULL OR r.channel=v_channel)
    AND (v_variant IS NULL OR r.row_data->>'variant_id'=v_variant)
    AND (v_supplier IS NULL OR r.row_data->>'supplier_key'=v_supplier)
    AND (v_focus<>'low_stock' OR (r.row_data->>'low_stock')::boolean IS TRUE)
    AND (v_focus<>'no_sales' OR (r.row_data->>'no_sales')::boolean IS TRUE)),
  filtered AS MATERIALIZED (SELECT * FROM base WHERE v_q='' OR strpos(lower(CASE WHEN v_metric='purchases' THEN row_data->>'party' ELSE search END),lower(v_q))>0),
  totals AS (SELECT count(*) n,coalesce(sum(value),0) total FROM filtered),
  page_rows AS (SELECT * FROM filtered ORDER BY CASE WHEN v_sort='amount_desc' THEN value END DESC,
   CASE WHEN v_sort='amount_asc' THEN value END ASC,CASE WHEN v_sort='oldest' THEN occurred_at END ASC,
   occurred_at DESC,id LIMIT v_size OFFSET (least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)))-1)*v_size)
  SELECT jsonb_build_object('detail',jsonb_build_object('rows',coalesce((SELECT jsonb_agg(row_data) FROM page_rows),'[]'::jsonb),
   'count',(SELECT n FROM totals),'page',least(v_page,greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals))),
   'pages',greatest(1,(SELECT ceil(n::numeric/v_size)::integer FROM totals)),'size',v_size,
   'total',(SELECT coalesce(sum(value),0) FROM base),'filtered_total',(SELECT total FROM totals),
   'page_total',(SELECT coalesce(sum(value),0) FROM page_rows),'summary','{}'::jsonb,
   'unit',CASE WHEN v_metric IN ('orders','low_stock','no_sales') THEN 'registros' WHEN v_metric IN ('physical','available') THEN 'unidades' ELSE 'PEN' END,
   'scope',CASE WHEN v_metric IN ('receivables','physical','available','inventory_value','low_stock','no_sales') THEN 'current' ELSE 'period' END)) INTO v_result;
 ELSE RAISE EXCEPTION 'Pestaña de reporte no permitida'; END IF;

 IF v_export AND coalesce((v_result->CASE p_tab WHEN 'sales' THEN 'products' WHEN 'inventory' THEN 'stock' WHEN 'suppliers' THEN 'suppliers' ELSE 'detail' END->>'count')::bigint,0)>10000 THEN
  RAISE EXCEPTION 'La exportación supera 10000 filas. Reduce el período o utiliza filtros; no se exportó una lista incompleta'; END IF;
 RETURN v_result||jsonb_build_object('version',2,'tab',p_tab,'meta',v_meta,'options',p_options,
  'capabilities',jsonb_build_object('supplier_balances',false,'historical_stock',false));
END;
$$;
REVOKE ALL ON FUNCTION public.report_analysis(date,date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_analysis(date,date,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
