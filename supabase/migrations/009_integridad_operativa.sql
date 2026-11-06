-- Monky's Store ERP: correcciones verificadas de integridad y reintentos.
-- Ejecutar una vez, después de 008. No modifica saldos, pedidos ni DNI existentes.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.admin_get_shipment_dni(uuid[])') IS NULL
    OR to_regclass('public.purchases') IS NULL THEN
  RAISE EXCEPTION 'La migración 009 requiere las migraciones 001 a 008';
 END IF;
END;
$preflight$;

-- SQL NULL nunca debe saltarse validaciones que el formulario ya exige.
CREATE OR REPLACE FUNCTION public.create_order(p_key uuid,p_buyer text,p_handle text,p_customer uuid,
 p_channel text,p_mode text,p_method text,p_minutes int,p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_order uuid; r record; v public.variants%rowtype; v_total numeric(14,2):=0;
 v_status text; v_payment text; v_exp timestamptz; previous public.orders%rowtype; expected_lines jsonb; saved_lines jsonb; previous_mode text;
begin
 perform public.require_active();
 if p_key is null then raise exception 'Identificador de operación requerido'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('create_order:'||p_key::text,0));
 select id into v_order from public.orders where request_key=p_key;
 if found then
  select * into previous from public.orders where id=v_order;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'La clave pertenece a otra operación'; end if;
  select jsonb_agg(jsonb_build_object('variant_id',x.variant_id,'quantity',x.quantity) order by x.variant_id)
   into expected_lines from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity integer);
  select jsonb_agg(jsonb_build_object('variant_id',l.variant_id,'quantity',l.quantity) order by l.variant_id)
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
 for r in select * from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int) order by variant_id loop
   if r.quantity is null or r.quantity<=0 then raise exception 'Cantidad inválida'; end if;
   select * into v from public.variants where id=r.variant_id and active for update;
   if not found then raise exception 'Variante no disponible'; end if;
   if v.on_hand-v.reserved-v.blocked < r.quantity then
     raise exception 'Stock insuficiente para SKU % (disponible: %)',v.sku,v.on_hand-v.reserved-v.blocked;
   end if;
   v_total:=v_total+round(r.quantity*v.sale_price,2);
 end loop;
 insert into public.orders(request_key,customer_id,buyer_name,tiktok_handle,channel,status,payment_status,
  payment_method,total,expires_at,created_by,confirmed_at)
 values(p_key,p_customer,nullif(trim(coalesce(p_buyer,'')),''),nullif(trim(coalesce(p_handle,'')),''),p_channel,
  v_status,v_payment,case when p_mode='paid' then p_method else null end,v_total,v_exp,(select auth.uid()),
  case when p_mode='paid' then now() else null end)
 returning id into v_order;
 for r in select * from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int) order by variant_id loop
   select * into v from public.variants where id=r.variant_id for update;
   insert into public.order_lines(order_id,variant_id,quantity,unit_price,unit_cost,line_total)
     values(v_order,r.variant_id,r.quantity,v.sale_price,v.avg_cost,round(r.quantity*v.sale_price,2));
   if p_mode='reserve' then
     update public.variants set reserved=reserved+r.quantity where id=r.variant_id;
   else
     update public.variants set on_hand=on_hand-r.quantity where id=r.variant_id;
     insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by)
       values(r.variant_id,'sale',-r.quantity,v.on_hand-r.quantity,v.avg_cost,'order',v_order::text,(select auth.uid()));
   end if;
 end loop;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'create_order',v_order::text,jsonb_build_object('mode',p_mode));
 return v_order;
end; $$;

CREATE OR REPLACE FUNCTION public.confirm_reservation(p_order uuid,p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; r record; v public.variants%rowtype;
begin
 perform public.require_active();
 perform public.expire_reservations();
 if p_method is null or p_method not in ('efectivo','yape','plin','transferencia') then raise exception 'Método de pago inválido'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'reserved' or o.expires_at<=now() then
  raise exception 'La reserva no está activa'; end if;
 for r in select variant_id,quantity from public.order_lines where order_id=o.id order by variant_id loop
  select * into v from public.variants where id=r.variant_id for update;
  if v.on_hand<r.quantity or v.reserved<r.quantity then raise exception 'Reserva inconsistente'; end if;
  update public.variants set on_hand=on_hand-r.quantity,reserved=reserved-r.quantity where id=r.variant_id;
  insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by)
   values(r.variant_id,'sale',-r.quantity,v.on_hand-r.quantity,v.avg_cost,'order',o.id::text,(select auth.uid()));
 end loop;
 update public.orders set status='confirmed',payment_status='paid',payment_method=p_method,
  confirmed_at=now(),expires_at=null where id=o.id;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'confirm_reservation',o.id::text);
end; $$;

CREATE OR REPLACE FUNCTION public.receive_purchase(p_supplier uuid,p_reference text,p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_purchase uuid; r record; v public.variants%rowtype; v_total numeric(14,2):=0;
begin
 perform public.require_admin();
 if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
  raise exception 'La compra requiere entre 1 y 100 líneas'; end if;
 if jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>100 then
  raise exception 'La compra requiere entre 1 y 100 líneas'; end if;
 if p_supplier is not null and not exists(select 1 from public.suppliers where id=p_supplier) then
  raise exception 'Proveedor inválido'; end if;
 if exists(select 1 from (select variant_id,count(*) c from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int,unit_cost numeric)
   group by variant_id having count(*)>1) t) then raise exception 'La compra contiene SKUs duplicados'; end if;
 insert into public.purchases(supplier_id,reference,created_by) values(p_supplier,nullif(trim(p_reference),''),(select auth.uid())) returning id into v_purchase;
 for r in select * from jsonb_to_recordset(p_lines) as x(variant_id uuid,quantity int,unit_cost numeric)
  order by variant_id loop
  if r.quantity is null or r.quantity<=0 or r.unit_cost is null or r.unit_cost<0 then
   raise exception 'Cantidad o costo inválido'; end if;
  select * into v from public.variants where id=r.variant_id and active for update;
  if not found then raise exception 'Variante no válida'; end if;
  update public.variants set
   avg_cost=round(((v.on_hand*v.avg_cost)+(r.quantity*r.unit_cost))/(v.on_hand+r.quantity),4),
   on_hand=v.on_hand+r.quantity where id=r.variant_id;
  insert into public.purchase_lines(purchase_id,variant_id,quantity,unit_cost,line_total)
   values(v_purchase,r.variant_id,r.quantity,r.unit_cost,round(r.quantity*r.unit_cost,2));
  insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by)
   values(r.variant_id,'purchase',r.quantity,v.on_hand+r.quantity,r.unit_cost,'purchase',v_purchase::text,(select auth.uid()));
  v_total:=v_total+round(r.quantity*r.unit_cost,2);
 end loop;
 update public.purchases set total=v_total where id=v_purchase;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'receive_purchase',v_purchase::text);
 return v_purchase;
end; $$;

CREATE OR REPLACE FUNCTION public.record_payment(p_key uuid,p_order uuid,p_amount numeric,p_method text,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; v_amount numeric(14,2); v_paid numeric(14,2); v_id uuid;
 r record; v public.variants%rowtype;
begin
 perform public.require_active();
 if p_key is null or p_order is null then raise exception 'Operación inválida'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('record_payment:'||p_key::text,0));
 select id into v_id from public.payments where request_key=p_key;
 if found then
  if not exists(select 1 from public.payments where id=v_id and order_id=p_order and amount=p_amount and method=p_method and coalesce(reference,'')=trim(coalesce(p_reference,''))) then
   raise exception 'Esta clave pertenece a otro cobro. Revisa el pago registrado antes de cambiar los datos';
  end if;
  return v_id;
 end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999 or round(p_amount,2)<>p_amount
    or p_method is null or p_method not in ('efectivo','yape','plin','transferencia') then
  raise exception 'Monto o medio de pago inválido';
 end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'reserved' then raise exception 'Solo se registran adelantos de reservas activas'; end if;
 if o.expires_at is not null and o.expires_at<=now() then raise exception 'La reserva venció. Actualiza los pedidos antes de registrar el pago'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where order_id=p_order;
 v_amount:=o.total-v_paid;
 if p_amount>v_amount then raise exception 'El pago excede el saldo pendiente (S/ %)',v_amount; end if;
 insert into public.payments(request_key,order_id,amount,method,reference,received_by)
 values(p_key,p_order,p_amount,p_method,nullif(trim(coalesce(p_reference,'')),''),(select auth.uid())) returning id into v_id;
 if p_amount+v_paid<o.total then
  update public.orders set payment_status='partial',expires_at=null where id=p_order;
 else
  for r in select variant_id,quantity from public.order_lines where order_id=p_order order by variant_id loop
   select * into v from public.variants where id=r.variant_id for update;
   if v.reserved<r.quantity or v.on_hand<r.quantity then raise exception 'Stock reservado inconsistente'; end if;
   update public.variants set on_hand=on_hand-r.quantity,reserved=reserved-r.quantity where id=r.variant_id;
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by)
   values(r.variant_id,'sale',-r.quantity,v.on_hand-r.quantity,v.avg_cost,'order',p_order::text,(select auth.uid()));
  end loop;
  update public.orders set status='confirmed',payment_status='paid',payment_method=p_method,
    confirmed_at=now(),expires_at=null where id=p_order;
 end if;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'record_payment',p_order::text,jsonb_build_object('amount',p_amount,'method',p_method));
 return v_id;
end; $$;

CREATE OR REPLACE FUNCTION public.process_return(p_key uuid,p_order uuid,p_reason text,p_lines jsonb,
 p_refund numeric,p_method text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; o public.orders%rowtype; r record; l public.order_lines%rowtype;
 v public.variants%rowtype; v_prev int; v_total numeric(14,2):=0;
 v_paid numeric(14,2); v_refunded numeric(14,2); v_all_returns numeric(14,2);
begin
 perform public.require_admin();
 if p_key is null then raise exception 'Identificador requerido'; end if;
 select id into v_id from public.returns where request_key=p_key;
 if found then return v_id; end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'confirmed' then raise exception 'Solo ventas confirmadas admiten devoluciones'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Explica el motivo'; end if;
 if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Selecciona prendas'; end if;
 if jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'Selecciona entre 1 y 50 prendas'; end if;
 if exists(select 1 from (select order_line_id,count(*) c from jsonb_to_recordset(p_lines) as x(order_line_id uuid,quantity int,condition text)
 group by order_line_id having count(*)>1) q) then raise exception 'Líneas duplicadas'; end if;
 for r in select * from jsonb_to_recordset(p_lines) as x(order_line_id uuid,quantity int,condition text) order by order_line_id loop
  select * into l from public.order_lines where id=r.order_line_id and order_id=p_order;
  if not found or r.quantity is null or r.quantity<1 or r.condition is null or r.condition not in ('sellable','damaged') then raise exception 'Prenda/cantidad inválida'; end if;
  select coalesce(sum(rl.quantity),0) into v_prev from public.return_lines rl
    join public.returns rt on rt.id=rl.return_id where rt.order_id=p_order and rl.order_line_id=l.id;
  if r.quantity+v_prev>l.quantity then raise exception 'La devolución supera la cantidad vendida'; end if;
  v_total:=v_total+round(r.quantity*l.unit_price,2);
 end loop;
 select coalesce(sum(amount),0) into v_paid from public.payments where order_id=p_order;
 select coalesce(sum(amount),0) into v_refunded from public.refunds where order_id=p_order;
 select coalesce(sum(total_value),0) into v_all_returns from public.returns where order_id=p_order;
 if p_refund is null or p_refund<0 or p_refund>v_total or round(p_refund,2)<>p_refund
  or p_refund>v_paid-v_refunded or p_refund+v_refunded>v_all_returns+v_total then
  raise exception 'Reembolso inválido o superior al saldo permitido'; end if;
 if p_refund>0 and (p_method is null or p_method not in ('efectivo','yape','plin','transferencia')) then raise exception 'Selecciona medio del reembolso'; end if;
 insert into public.returns(request_key,order_id,reason,total_value,refund_amount,refund_method,created_by)
 values(p_key,p_order,trim(p_reason),v_total,p_refund,case when p_refund>0 then p_method else null end,(select auth.uid())) returning id into v_id;
 for r in select * from jsonb_to_recordset(p_lines) as x(order_line_id uuid,quantity int,condition text) order by order_line_id loop
  select * into l from public.order_lines where id=r.order_line_id;
  select * into v from public.variants where id=l.variant_id for update;
  update public.variants set on_hand=on_hand+r.quantity,
    avg_cost=round(((v.on_hand*v.avg_cost)+(r.quantity*l.unit_cost))/(v.on_hand+r.quantity),4),
    blocked=blocked+case when r.condition='damaged' then r.quantity else 0 end where id=l.variant_id;
  insert into public.return_lines(return_id,order_line_id,quantity,condition) values(v_id,l.id,r.quantity,r.condition);
  insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by,notes)
  values(l.variant_id,'return',r.quantity,v.on_hand+r.quantity,l.unit_cost,'return',v_id::text,(select auth.uid()),
   case when r.condition='damaged' then 'Prenda no vendible: bloqueada' else 'Prenda apta para venta' end);
 end loop;
 if p_refund>0 then
  insert into public.refunds(return_id,order_id,amount,method,refunded_by)
  values(v_id,p_order,p_refund,p_method,(select auth.uid()));
 end if;
 select coalesce(sum(amount),0) into v_refunded from public.refunds where order_id=p_order;
 update public.orders set payment_status=case
  when v_refunded>=v_paid then 'refunded'
  when v_refunded>0 then 'partial_refund'
  else 'paid' end where id=p_order;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'process_return',p_order::text,jsonb_build_object('return',v_id,'refund',p_refund));
 return v_id;
end; $$;

CREATE OR REPLACE FUNCTION public.save_shipment(p_order uuid,p_data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE v_id uuid; o public.orders%rowtype; v_status text; v_dni text;
BEGIN
 PERFORM public.require_active();
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.set_shipment_status(p_order uuid,p_status text,p_tracking text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.shipments%rowtype; v_order_status text;
begin
 perform public.require_active();
 select status into v_order_status from public.orders where id=p_order for update;
 if not found then raise exception 'Pedido inexistente'; end if;
 select * into s from public.shipments where order_id=p_order for update;
 if not found then raise exception 'Primero registra los datos de envío'; end if;
 if p_status=s.status then return; end if;
 if p_status='preparing' and s.status='pending' then
  update public.shipments set status='preparing',prepared_at=now(),updated_at=now(),updated_by=(select auth.uid()) where id=s.id;
 elsif p_status='dispatched' and s.status in ('pending','preparing') then
  if v_order_status<>'confirmed' then raise exception 'Solo pueden despacharse pedidos confirmados'; end if;
  update public.shipments set status='dispatched',dispatched_at=now(),tracking_code=nullif(trim(coalesce(p_tracking,'')),''),updated_at=now(),updated_by=(select auth.uid()) where id=s.id;
 elsif p_status='delivered' and s.status='dispatched' then
  update public.shipments set status='delivered',delivered_at=now(),updated_at=now(),updated_by=(select auth.uid()) where id=s.id;
 else
  raise exception 'Transición de envío no permitida';
 end if;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'shipment_status',p_order::text,jsonb_build_object('status',p_status));
end; $$;
-- Las compras históricas conservan request_key NULL. Solo nuevas recepciones
-- con clave se benefician de la deduplicación; el RPC anterior sigue disponible.
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS request_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_request_key_unique
 ON public.purchases(request_key) WHERE request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.receive_purchase_once(p_key uuid,p_supplier uuid,p_reference text,p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $func$
DECLARE v_id uuid; v_purchase public.purchases%rowtype; v_expected jsonb; v_saved jsonb;
BEGIN
 PERFORM public.require_admin();
 IF p_key IS NULL THEN RAISE EXCEPTION 'Identificador de recepción requerido'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'La compra requiere entre 1 y 100 líneas'; END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'La compra requiere entre 1 y 100 líneas'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('receive_purchase:'||p_key::text,0));
 SELECT * INTO v_purchase FROM public.purchases WHERE request_key=p_key;
 IF FOUND THEN
  SELECT jsonb_agg(jsonb_build_object('variant_id',x.variant_id,'quantity',x.quantity,'unit_cost',round(x.unit_cost,4)) ORDER BY x.variant_id)
   INTO v_expected FROM jsonb_to_recordset(p_lines) AS x(variant_id uuid,quantity integer,unit_cost numeric);
  SELECT jsonb_agg(jsonb_build_object('variant_id',l.variant_id,'quantity',l.quantity,'unit_cost',l.unit_cost) ORDER BY l.variant_id)
   INTO v_saved FROM public.purchase_lines l WHERE l.purchase_id=v_purchase.id;
  IF v_purchase.supplier_id IS DISTINCT FROM p_supplier
   OR v_purchase.reference IS DISTINCT FROM nullif(trim(p_reference),'')
   OR v_saved IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'Esta clave pertenece a otra recepción. Revisa la compra ya registrada antes de continuar';
  END IF;
  RETURN v_purchase.id;
 END IF;
 v_id:=public.receive_purchase(p_supplier,p_reference,p_lines);
 UPDATE public.purchases SET request_key=p_key WHERE id=v_id;
 RETURN v_id;
END;
$func$;
REVOKE ALL ON FUNCTION public.receive_purchase_once(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_once(uuid,uuid,text,jsonb) TO authenticated;
-- Refrescar la firma nueva en la API al confirmar la transacción.
NOTIFY pgrst, 'reload schema';
COMMIT;
