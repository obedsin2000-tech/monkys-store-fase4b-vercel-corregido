-- MONKY'S STORE ERP - FASE 2 | MIGRACIÓN SOBRE LA FASE 1 EXISTENTE
-- IMPORTANTE: ejecutar una única vez como postgres. NO EJECUTAR 001_fase1.sql de nuevo.
-- Realizar respaldo antes de ejecutar. No elimina órdenes ni datos previos.
begin;

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
 check (payment_status in ('pending','partial','paid','partial_refund','refunded'));
alter table public.orders drop constraint if exists order_state_valid;
alter table public.orders add constraint order_state_valid check (
 (status='reserved' and payment_status in ('pending','partial')) or
 (status='confirmed' and payment_status in ('paid','partial_refund','refunded') and confirmed_at is not null) or
 (status in ('cancelled','expired') and payment_status='pending')
);
alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check
 check(movement_type in ('initial','purchase','sale','adjustment','return'));

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 order_id uuid not null references public.orders(id),
 amount numeric(14,2) not null check (amount>0),
 method text not null check(method in ('efectivo','yape','plin','transferencia')),
 reference text,
 notes text,
 received_by uuid references public.profiles(id),
 received_at timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);
create index payments_date_idx on public.payments(received_at desc);

-- Relleno de operaciones ya confirmadas en Fase 1 para los reportes de caja.
insert into public.payments(request_key,order_id,amount,method,reference,notes,received_by,received_at)
select gen_random_uuid(),id,total,coalesce(payment_method,'efectivo'),'FASE1','Venta registrada antes de Fase 2',created_by,coalesce(confirmed_at,created_at)
from public.orders where status='confirmed' and total>0;

create table public.shipments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id),
 recipient_name text not null check(length(trim(recipient_name)) between 2 and 120),
 phone text not null check(length(trim(phone)) between 6 and 30),
 dni text,
 department text,
 province text not null check(length(trim(province)) between 2 and 100),
 district text,
 carrier text not null default 'shalom' check(carrier in ('shalom','otro')),
 agency_address text not null check(length(trim(agency_address)) between 4 and 250),
 tracking_code text,
 status text not null default 'pending' check(status in ('pending','preparing','dispatched','delivered')),
 prepared_at timestamptz,
 dispatched_at timestamptz,
 delivered_at timestamptz,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id)
);
create index shipments_status_idx on public.shipments(status);

create table public.returns (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 order_id uuid not null references public.orders(id),
 reason text not null check(length(trim(reason))>=5),
 total_value numeric(14,2) not null check(total_value>=0),
 refund_amount numeric(14,2) not null default 0 check(refund_amount>=0),
 refund_method text check(refund_method in ('efectivo','yape','plin','transferencia')),
 created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id)
);
create index returns_order_idx on public.returns(order_id);
create table public.return_lines (
 id uuid primary key default gen_random_uuid(),
 return_id uuid not null references public.returns(id),
 order_line_id uuid not null references public.order_lines(id),
 quantity integer not null check(quantity>0),
 condition text not null check(condition in ('sellable','damaged')),
 unique(return_id,order_line_id)
);

create table public.refunds (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique default gen_random_uuid(),
 return_id uuid references public.returns(id),
 order_id uuid not null references public.orders(id),
 amount numeric(14,2) not null check(amount>0),
 method text not null check(method in ('efectivo','yape','plin','transferencia')),
 refunded_at timestamptz not null default now(),
 refunded_by uuid references public.profiles(id)
);
create index refunds_date_idx on public.refunds(refunded_at desc);
create index refunds_return_idx on public.refunds(return_id);

create table public.cash_expenses (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 concept text not null check(length(trim(concept))>=4),
 amount numeric(14,2) not null check(amount>0),
 method text not null check(method in ('efectivo','yape','plin','transferencia')),
 notes text,
 occurred_at timestamptz not null default now(),
 created_by uuid references public.profiles(id)
);
create index expenses_date_idx on public.cash_expenses(occurred_at desc);
create table public.cash_closings (
 id uuid primary key default gen_random_uuid(),
 business_date date not null unique,
 opening_cash numeric(14,2) not null check(opening_cash>=0),
 counted_cash numeric(14,2) not null check(counted_cash>=0),
 expected_cash numeric(14,2) not null,
 difference numeric(14,2) not null,
 total_payments numeric(14,2) not null,
 total_refunds numeric(14,2) not null,
 total_expenses numeric(14,2) not null,
 notes text,
 closed_at timestamptz not null default now(),
 closed_by uuid references public.profiles(id)
);

-- Lectura solo con sesión activa; escritura SOLO vía funciones transaccionales.
do $$ declare t text; begin
 foreach t in array array['payments','shipments','returns','return_lines','refunds','cash_expenses','cash_closings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using ((select public.is_active()))',t||'_active_read',t);
 end loop;
end $$;

-- La Fase 1 puede crear una venta pagada o confirmar una reserva usando RPC antiguas.
-- Los triggers aseguran que esos cobros también figuren en el libro de caja,
-- sin duplicar los pagos hechos a través de la Fase 2.
create function public.log_legacy_sale_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare v_existing numeric(14,2); v_remaining numeric(14,2);
begin
 if tg_op='INSERT' then
  if new.status<>'confirmed' then return new; end if;
 elsif tg_op='UPDATE' then
  if new.status<>'confirmed' or old.status='confirmed' then return new; end if;
 end if;
 if new.status='confirmed' then
   select coalesce(sum(amount),0) into v_existing from public.payments where order_id=new.id;
   v_remaining:=new.total-v_existing;
   if v_remaining>0 then
    insert into public.payments(request_key,order_id,amount,method,notes,received_by,received_at)
    values(gen_random_uuid(),new.id,v_remaining,coalesce(new.payment_method,'efectivo'),
      'Cobro confirmado mediante el flujo de venta Fase 1',new.created_by,coalesce(new.confirmed_at,now()));
   end if;
 end if;
 return new;
end; $$;
create trigger log_payment_after_order_insert after insert on public.orders
for each row execute function public.log_legacy_sale_payment();
create trigger log_payment_after_order_update after update of status on public.orders
for each row execute function public.log_legacy_sale_payment();

-- Al haber un adelanto, la reserva se conserva hasta que el administrador la resuelva.
-- No expirar reservas con dinero recibido; evita perder una reserva pagada.
create or replace function public.expire_reservations() returns integer
language plpgsql security definer set search_path='' as $$
declare o record; l record; v_count integer:=0;
begin
 perform public.require_active();
 for o in select id from public.orders
   where status='reserved' and expires_at<=now()
     and not exists(select 1 from public.payments p where p.order_id=orders.id)
   order by created_at for update skip locked loop
   for l in select variant_id,quantity from public.order_lines where order_id=o.id order by variant_id loop
    update public.variants set reserved=reserved-l.quantity where id=l.variant_id;
   end loop;
   update public.orders set status='expired' where id=o.id;
   v_count:=v_count+1;
 end loop;
 return v_count;
end; $$;

-- Bloquear cancelación accidental de una reserva con adelantos; requiere un procedimiento de reembolso aparte.
create or replace function public.cancel_reservation(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; r record;
begin
 perform public.require_active();
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'reserved' then raise exception 'Solo reservas activas'; end if;
 if exists(select 1 from public.payments where order_id=o.id) then
  raise exception 'Esta reserva tiene adelantos. No puede cancelarse desde el botón simple. Solicita devolución supervisada.';
 end if;
 for r in select variant_id,quantity from public.order_lines where order_id=o.id order by variant_id loop
  update public.variants set reserved=reserved-r.quantity where id=r.variant_id;
 end loop;
 update public.orders set status='cancelled',expires_at=null where id=o.id;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'cancel_reservation',o.id::text);
end; $$;

-- Cobro parcial o total; al alcanzar el total, confirma la venta de manera atómica.
create function public.record_payment(p_key uuid,p_order uuid,p_amount numeric,p_method text,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; v_amount numeric(14,2); v_paid numeric(14,2); v_id uuid;
 r record; v public.variants%rowtype;
begin
 perform public.require_active();
 if p_key is null or p_order is null then raise exception 'Operación inválida'; end if;
 select id into v_id from public.payments where request_key=p_key;
 if found then return v_id; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999 or round(p_amount,2)<>p_amount
    or p_method not in ('efectivo','yape','plin','transferencia') then
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


-- Cancelación de reserva con adelanto, una vez que el dinero fue devuelto realmente.
create function public.cancel_paid_reservation(p_key uuid,p_order uuid,p_method text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; v_paid numeric(14,2); v_id uuid; r record;
begin
 perform public.require_admin();
 if p_key is null then raise exception 'Identificador requerido'; end if;
 select id into v_id from public.refunds where request_key=p_key;
 if found then return v_id; end if;
 if p_method not in ('efectivo','yape','plin','transferencia') or length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Indica método y motivo del reembolso'; end if;
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'reserved' then raise exception 'Solo reserva activa'; end if;
 select coalesce(sum(amount),0) into v_paid from public.payments where order_id=p_order;
 if v_paid<=0 then raise exception 'La reserva no tiene adelantos: usa Cancelar reserva simple'; end if;
 for r in select variant_id,quantity from public.order_lines where order_id=p_order order by variant_id loop
  update public.variants set reserved=reserved-r.quantity where id=r.variant_id;
 end loop;
 insert into public.refunds(request_key,order_id,amount,method,refunded_by)
 values(p_key,p_order,v_paid,p_method,(select auth.uid())) returning id into v_id;
 update public.orders set status='cancelled',payment_status='pending',expires_at=null where id=p_order;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'cancel_paid_reservation',p_order::text,
 jsonb_build_object('refund',v_paid,'reason',trim(p_reason)));
 return v_id;
end; $$;

-- Datos del envío (Shalom no se conecta a ninguna API: registro interno).
create function public.save_shipment(p_order uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; o public.orders%rowtype; v_status text;
begin
 perform public.require_active();
 select * into o from public.orders where id=p_order;
 if not found or o.status in ('cancelled','expired') then raise exception 'Pedido no válido para envío'; end if;
 select status into v_status from public.shipments where order_id=p_order for update;
 if v_status in ('dispatched','delivered') then raise exception 'No se pueden editar datos de un envío despachado'; end if;
 if length(trim(coalesce(p_data->>'recipient_name','')))<2 or length(trim(coalesce(p_data->>'phone','')))<6
  or length(trim(coalesce(p_data->>'province','')))<2 or length(trim(coalesce(p_data->>'agency_address','')))<4 then
  raise exception 'Faltan datos: destinatario, teléfono, provincia o agencia'; end if;
 insert into public.shipments(order_id,recipient_name,phone,dni,department,province,district,carrier,agency_address,updated_by)
 values(p_order,trim(p_data->>'recipient_name'),trim(p_data->>'phone'),nullif(trim(coalesce(p_data->>'dni','')),''),
 nullif(trim(coalesce(p_data->>'department','')),''),trim(p_data->>'province'),
 nullif(trim(coalesce(p_data->>'district','')),''),
 case when p_data->>'carrier'='otro' then 'otro' else 'shalom' end,
 trim(p_data->>'agency_address'),(select auth.uid()))
 on conflict (order_id) do update set recipient_name=excluded.recipient_name,phone=excluded.phone,
 dni=excluded.dni,department=excluded.department,province=excluded.province,district=excluded.district,
 carrier=excluded.carrier,agency_address=excluded.agency_address,updated_at=now(),updated_by=(select auth.uid())
 returning id into v_id;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'save_shipment',p_order::text);
 return v_id;
end; $$;

create function public.set_shipment_status(p_order uuid,p_status text,p_tracking text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.shipments%rowtype; v_order_status text;
begin
 perform public.require_active();
 select * into s from public.shipments where order_id=p_order for update;
 if not found then raise exception 'Primero registra los datos de envío'; end if;
 select status into v_order_status from public.orders where id=p_order;
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

create function public.process_return(p_key uuid,p_order uuid,p_reason text,p_lines jsonb,
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
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Selecciona prendas'; end if;
 if exists(select 1 from (select order_line_id,count(*) c from jsonb_to_recordset(p_lines) as x(order_line_id uuid,quantity int,condition text)
 group by order_line_id having count(*)>1) q) then raise exception 'Líneas duplicadas'; end if;
 for r in select * from jsonb_to_recordset(p_lines) as x(order_line_id uuid,quantity int,condition text) order by order_line_id loop
  select * into l from public.order_lines where id=r.order_line_id and order_id=p_order;
  if not found or r.quantity is null or r.quantity<1 or r.condition not in ('sellable','damaged') then raise exception 'Prenda/cantidad inválida'; end if;
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
 if p_refund>0 and p_method not in ('efectivo','yape','plin','transferencia') then raise exception 'Selecciona medio del reembolso'; end if;
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


-- Reembolsar posteriormente el importe pendiente de una devolución ya recibida.
create function public.refund_return(p_key uuid,p_return uuid,p_amount numeric,p_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; rt public.returns%rowtype; o public.orders%rowtype;
 v_refunded_return numeric(14,2); v_paid numeric(14,2); v_refunded_order numeric(14,2);
begin
 perform public.require_admin();
 if p_key is null then raise exception 'Identificador requerido'; end if;
 select id into v_id from public.refunds where request_key=p_key;
 if found then return v_id; end if;
 select * into rt from public.returns where id=p_return for update;
 if not found then raise exception 'Devolución no encontrada'; end if;
 select * into o from public.orders where id=rt.order_id for update;
 if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount
   or p_method not in ('efectivo','yape','plin','transferencia') then
   raise exception 'Monto o método de reembolso inválido';
 end if;
 select coalesce(sum(amount),0) into v_refunded_return from public.refunds where return_id=p_return;
 select coalesce(sum(amount),0) into v_paid from public.payments where order_id=rt.order_id;
 select coalesce(sum(amount),0) into v_refunded_order from public.refunds where order_id=rt.order_id;
 if p_amount>rt.total_value-v_refunded_return or p_amount>v_paid-v_refunded_order then
  raise exception 'Reembolso superior al saldo pendiente'; end if;
 insert into public.refunds(request_key,return_id,order_id,amount,method,refunded_by)
 values(p_key,p_return,rt.order_id,p_amount,p_method,(select auth.uid())) returning id into v_id;
 update public.returns set refund_amount=refund_amount+p_amount where id=p_return;
 v_refunded_order:=v_refunded_order+p_amount;
 update public.orders set payment_status=case
    when v_refunded_order>=v_paid then 'refunded'
    when v_refunded_order>0 then 'partial_refund' else 'paid' end where id=rt.order_id;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'refund_return',rt.order_id::text,
    jsonb_build_object('return',p_return,'amount',p_amount));
 return v_id;
end; $$;

create function public.record_expense(p_key uuid,p_concept text,p_amount numeric,p_method text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform public.require_admin();
 select id into v_id from public.cash_expenses where request_key=p_key;
 if found then return v_id; end if;
 if length(trim(coalesce(p_concept,'')))<4 or p_amount is null or p_amount<=0
  or round(p_amount,2)<>p_amount or p_method not in ('efectivo','yape','plin','transferencia') then
  raise exception 'Concepto, monto o método inválido'; end if;
 insert into public.cash_expenses(request_key,concept,amount,method,notes,created_by)
 values(p_key,trim(p_concept),p_amount,p_method,nullif(trim(coalesce(p_notes,'')),''),(select auth.uid())) returning id into v_id;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'record_expense',v_id::text,jsonb_build_object('amount',p_amount));
 return v_id;
end; $$;

create function public.cash_summary(p_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_pay numeric(14,2); v_ref numeric(14,2); v_exp numeric(14,2);
 v_cash_p numeric(14,2); v_cash_r numeric(14,2); v_cash_e numeric(14,2);
begin
 perform public.require_active();
 if p_day is null then raise exception 'Fecha requerida'; end if;
 select coalesce(sum(amount),0),coalesce(sum(amount) filter(where method='efectivo'),0)
 into v_pay,v_cash_p from public.payments where (received_at at time zone 'America/Lima')::date=p_day;
 select coalesce(sum(amount),0),coalesce(sum(amount) filter(where method='efectivo'),0)
 into v_ref,v_cash_r from public.refunds where (refunded_at at time zone 'America/Lima')::date=p_day;
 select coalesce(sum(amount),0),coalesce(sum(amount) filter(where method='efectivo'),0)
 into v_exp,v_cash_e from public.cash_expenses where (occurred_at at time zone 'America/Lima')::date=p_day;
 return jsonb_build_object('payments',v_pay,'refunds',v_ref,'expenses',v_exp,
  'net',v_pay-v_ref-v_exp,'cash_payments',v_cash_p,'cash_refunds',v_cash_r,
  'cash_expenses',v_cash_e,'cash_net',v_cash_p-v_cash_r-v_cash_e);
end; $$;

-- Corte de caja: instantánea auditable; NO bloquea movimientos posteriores.
create function public.close_cash(p_day date,p_opening numeric,p_counted numeric,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v jsonb; v_expected numeric(14,2);
begin
 perform public.require_admin();
 if p_day is null or p_day>(now() at time zone 'America/Lima')::date then raise exception 'Fecha no válida'; end if;
 if p_opening is null or p_counted is null or p_opening<0 or p_counted<0 then raise exception 'Montos inválidos'; end if;
 if exists(select 1 from public.cash_closings where business_date=p_day) then
  raise exception 'Ya existe un corte para esa fecha'; end if;
 v:=public.cash_summary(p_day);
 v_expected:=round(p_opening+(v->>'cash_net')::numeric,2);
 insert into public.cash_closings(business_date,opening_cash,counted_cash,expected_cash,difference,
 total_payments,total_refunds,total_expenses,notes,closed_by)
 values(p_day,p_opening,p_counted,v_expected,p_counted-v_expected,
 (v->>'payments')::numeric,(v->>'refunds')::numeric,(v->>'expenses')::numeric,
 nullif(trim(coalesce(p_notes,'')),''),(select auth.uid())) returning id into v_id;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'cash_cut',v_id::text,jsonb_build_object('business_date',p_day,'difference',p_counted-v_expected));
 return v_id;
end; $$;

-- Restringir ejecución pública; las funciones comprueban sesión/rol internamente.
revoke execute on function public.log_legacy_sale_payment(),public.record_payment(uuid,uuid,numeric,text,text),
 public.save_shipment(uuid,jsonb),public.set_shipment_status(uuid,text,text),
 public.process_return(uuid,uuid,text,jsonb,numeric,text),public.record_expense(uuid,text,numeric,text,text),
 public.cash_summary(date),public.close_cash(date,numeric,numeric,text),
 public.cancel_paid_reservation(uuid,uuid,text,text),public.refund_return(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.record_payment(uuid,uuid,numeric,text,text),
 public.save_shipment(uuid,jsonb),public.set_shipment_status(uuid,text,text),
 public.process_return(uuid,uuid,text,jsonb,numeric,text),public.record_expense(uuid,text,numeric,text,text),
 public.cash_summary(date),public.close_cash(date,numeric,numeric,text),
 public.cancel_paid_reservation(uuid,uuid,text,text),public.refund_return(uuid,uuid,numeric,text) to authenticated;
commit;
