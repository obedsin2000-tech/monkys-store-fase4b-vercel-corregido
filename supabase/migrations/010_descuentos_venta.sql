-- Monky’s Store: descuento opcional por unidad en Venta rápida.
-- Ejecutar después de 009. Conserva todos los pedidos, pagos y saldos existentes.
-- No modifica precios del catálogo ni permisos de las tablas.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.receive_purchase_once(uuid,uuid,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Aplica primero las migraciones 001 a 009';
 END IF;
END;
$preflight$;

-- NULL identifica líneas históricas. No se recalculan ventas anteriores.
ALTER TABLE public.order_lines ADD COLUMN IF NOT EXISTS catalog_unit_price numeric(12,2)
 CHECK(catalog_unit_price>=unit_price);

CREATE OR REPLACE FUNCTION public.create_order(p_key uuid,p_buyer text,p_handle text,p_customer uuid,
 p_channel text,p_mode text,p_method text,p_minutes int,p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_order uuid; r record; v public.variants%rowtype; v_total numeric(14,2):=0;
 v_status text; v_payment text; v_exp timestamptz; previous public.orders%rowtype; expected_lines jsonb; saved_lines jsonb; previous_mode text; v_unit_discount numeric; v_discount_total numeric(14,2):=0;
begin
 perform public.require_active();
 if p_key is null then raise exception 'Identificador de operación requerido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_order:'||p_key::text,0));
 select id into v_order from public.orders where request_key=p_key;
 if found then
  select * into previous from public.orders where id=v_order;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'La clave pertenece a otra operación'; end if;
  select jsonb_agg(jsonb_build_object('variant_id',x.variant_id,'quantity',x.quantity,'unit_discount',coalesce(x.unit_discount,0)) order by x.variant_id)
   into expected_lines from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity integer,unit_discount numeric);
  select jsonb_agg(jsonb_build_object('variant_id',l.variant_id,'quantity',l.quantity,'unit_discount',coalesce(l.catalog_unit_price,l.unit_price)-l.unit_price) order by l.variant_id)
   into saved_lines from public.order_lines l where l.order_id=v_order;
  select data->>'mode' into previous_mode from public.audit_events where event='create_order' and entity_id=v_order::text order by id desc limit 1;
  if previous.customer_id is distinct from p_customer
   or previous.buyer_name is distinct from nullif(trim(coalesce(p_buyer,'')),'')
   or previous.tiktok_handle is distinct from nullif(trim(coalesce(p_handle,'')),'')
   or previous.channel is distinct from p_channel or expected_lines is distinct from saved_lines
   or (previous_mode is not null and previous_mode is distinct from p_mode) then
   raise exception 'Esta clave pertenece a otra operación. Revisa el pedido registrado antes de cambiar los datos';
  end if;
  return v_order;
 end if;
 perform public.expire_reservations();
 if p_channel is null or p_mode is null or p_channel not in ('tiktok','whatsapp','directo') or p_mode not in ('reserve','paid') then
  raise exception 'Canal o tipo de operación inválidos'; end if;
 if p_mode='paid' and (p_method is null or p_method not in ('efectivo','yape','plin','transferencia')) then
  raise exception 'Indique el medio de pago verificado'; end if;
 if p_mode='reserve' and (p_minutes is null or p_minutes<5 or p_minutes>720) then
  raise exception 'Reserva entre 5 y 720 minutos'; end if;
 if p_customer is not null and not exists(select 1 from public.customers where id=p_customer) then
  raise exception 'Cliente inválido'; end if;
 if length(trim(coalesce(p_buyer,'')))<2 and length(trim(coalesce(p_handle,'')))<2 and p_customer is null then
  raise exception 'Indique nombre, usuario TikTok o cliente'; end if;
 if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
  raise exception 'La venta requiere de 1 a 50 líneas'; end if;
 if jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>50 then
  raise exception 'La venta requiere de 1 a 50 líneas'; end if;
 if exists(select 1 from (select variant_id,count(*) c from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int)
   group by variant_id having count(*)>1) q) then raise exception 'SKUs duplicados en la venta'; end if;
 v_status:=case when p_mode='paid' then 'confirmed' else 'reserved' end;
 v_payment:=case when p_mode='paid' then 'paid' else 'pending' end;
 v_exp:=case when p_mode='reserve' then now()+make_interval(mins=>p_minutes) else null end;
 -- Bloqueo de filas en orden fijo previene carreras sobre el último stock.
 for r in select * from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int,unit_discount numeric,expected_unit_price numeric) order by variant_id loop
   if r.quantity is null or r.quantity<=0 then raise exception 'Cantidad inválida'; end if;
   select * into v from public.variants where id=r.variant_id and active for update;
   if not found then raise exception 'Variante no disponible'; end if;
   if v.on_hand-v.reserved-v.blocked < r.quantity then
     raise exception 'Stock insuficiente para SKU % (disponible: %)',v.sku,v.on_hand-v.reserved-v.blocked;
   end if;
   v_unit_discount:=coalesce(r.unit_discount,0);
   if v_unit_discount<0 or round(v_unit_discount,2)<>v_unit_discount
      or (v_unit_discount>0 and v_unit_discount>=v.sale_price) then
     raise exception 'Descuento inválido para SKU %: usa hasta dos decimales y un importe menor al precio por unidad',v.sku;
   end if;
   if r.expected_unit_price is not null and r.expected_unit_price is distinct from v.sale_price then
     raise exception 'El precio de % cambió. Vuelve a buscar la prenda para actualizarlo antes de confirmar',v.sku;
   end if;
   v_total:=v_total+round(r.quantity*(v.sale_price-v_unit_discount),2);
   v_discount_total:=v_discount_total+r.quantity*v_unit_discount;
 end loop;
 insert into public.orders(request_key,customer_id,buyer_name,tiktok_handle,channel,status,payment_status,
  payment_method,total,expires_at,created_by,confirmed_at)
 values(p_key,p_customer,nullif(trim(coalesce(p_buyer,'')),''),nullif(trim(coalesce(p_handle,'')),''),p_channel,
  v_status,v_payment,case when p_mode='paid' then p_method else null end,v_total,v_exp,(select auth.uid()),
  case when p_mode='paid' then now() else null end)
 returning id into v_order;
 for r in select * from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int,unit_discount numeric,expected_unit_price numeric) order by variant_id loop
   select * into v from public.variants where id=r.variant_id for update;
   v_unit_discount:=coalesce(r.unit_discount,0);
   insert into public.order_lines(order_id,variant_id,quantity,unit_price,unit_cost,line_total,catalog_unit_price)
     values(v_order,r.variant_id,r.quantity,v.sale_price-v_unit_discount,v.avg_cost,
       round(r.quantity*(v.sale_price-v_unit_discount),2),v.sale_price);
   if p_mode='reserve' then
     update public.variants set reserved=reserved+r.quantity where id=r.variant_id;
   else
     update public.variants set on_hand=on_hand-r.quantity where id=r.variant_id;
     insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by)
       values(r.variant_id,'sale',-r.quantity,v.on_hand-r.quantity,v.avg_cost,'order',v_order::text,(select auth.uid()));
   end if;
 end loop;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'create_order',v_order::text,jsonb_build_object('mode',p_mode,'discount_total',v_discount_total));
 return v_order;
end; $$;

-- Entrada explícita para que una aplicación nueva no pueda perder el descuento
-- silenciosamente si la base aún tiene instalada la versión anterior.
CREATE OR REPLACE FUNCTION public.create_order_with_discounts(p_key uuid,p_buyer text,p_handle text,p_customer uuid,
 p_channel text,p_mode text,p_method text,p_minutes int,p_lines jsonb) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT public.create_order(p_key,p_buyer,p_handle,p_customer,p_channel,p_mode,p_method,p_minutes,p_lines)
$$;
REVOKE ALL ON FUNCTION public.create_order_with_discounts(uuid,text,text,uuid,text,text,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_discounts(uuid,text,text,uuid,text,text,text,integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_order(uuid,text,text,uuid,text,text,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid,text,text,uuid,text,text,text,integer,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
