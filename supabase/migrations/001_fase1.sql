-- Monky's Store ERP — Fase 1
-- Ejecutar una vez en el SQL Editor de un proyecto Supabase NUEVO.
-- Requiere PostgreSQL 15+ y Supabase Auth.
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'operator' check (role in ('admin','operator')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.profile_on_signup() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id,email) values(new.id,coalesce(new.email,''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.profile_on_signup();

create function public.is_active() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active);
$$;
create function public.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin');
$$;
create function public.require_active() returns void language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null or not public.is_active() then
   raise exception 'Acceso no autorizado' using errcode='42501';
 end if;
end; $$;
create function public.require_admin() returns void language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_active();
 if not public.is_admin() then
   raise exception 'Esta operación requiere permisos de administrador' using errcode='42501';
 end if;
end; $$;

create table public.categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(trim(name)) between 2 and 80),
 created_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(),
 product_code text not null unique check (char_length(trim(product_code)) between 2 and 40),
 name text not null check (char_length(trim(name)) between 2 and 120),
 category_id uuid references public.categories(id),
 brand text,
 description text,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id),
 sku text not null unique check (char_length(trim(sku)) between 2 and 60),
 size text not null default 'Única',
 color text not null default 'Único',
 sale_price numeric(12,2) not null check (sale_price>=0),
 avg_cost numeric(12,4) not null default 0 check (avg_cost>=0),
 on_hand integer not null default 0 check (on_hand>=0),
 reserved integer not null default 0 check (reserved>=0),
 blocked integer not null default 0 check (blocked>=0),
 min_stock integer not null default 2 check (min_stock>=0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint variant_stock_valid check (on_hand >= reserved + blocked),
 unique(product_id,size,color)
);
create index variants_product_id_idx on public.variants(product_id);
create index products_name_idx on public.products(name);

create table public.customers (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 2 and 120),
 tiktok_handle text,
 phone text,
 created_at timestamptz not null default now()
);
create index customers_name_idx on public.customers(name);
create table public.suppliers (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(trim(name)) between 2 and 120),
 phone text,
 created_at timestamptz not null default now()
);
create table public.purchases (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid references public.suppliers(id),
 reference text,
 total numeric(14,2) not null default 0 check (total>=0),
 created_by uuid references public.profiles(id),
 received_at timestamptz not null default now()
);
create table public.purchase_lines (
 id uuid primary key default gen_random_uuid(),
 purchase_id uuid not null references public.purchases(id),
 variant_id uuid not null references public.variants(id),
 quantity integer not null check(quantity>0),
 unit_cost numeric(12,4) not null check(unit_cost>=0),
 line_total numeric(14,2) not null check(line_total>=0)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 order_number bigint generated always as identity unique,
 request_key uuid not null unique,
 customer_id uuid references public.customers(id),
 buyer_name text,
 tiktok_handle text,
 channel text not null check(channel in ('tiktok','whatsapp','directo')),
 status text not null check(status in ('reserved','confirmed','cancelled','expired')),
 payment_status text not null default 'pending' check(payment_status in ('pending','paid')),
 payment_method text check(payment_method in ('efectivo','yape','plin','transferencia')),
 total numeric(14,2) not null check(total>=0),
 expires_at timestamptz,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 confirmed_at timestamptz,
 constraint order_state_valid check(
    (status='reserved' and expires_at is not null and payment_status='pending') or
    (status='confirmed' and payment_status='paid' and confirmed_at is not null) or
    (status in ('cancelled','expired') and payment_status='pending')
 )
);
create table public.order_lines (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 variant_id uuid not null references public.variants(id),
 quantity integer not null check(quantity>0),
 unit_price numeric(12,2) not null check(unit_price>=0),
 unit_cost numeric(12,4) not null check(unit_cost>=0),
 line_total numeric(14,2) not null check(line_total>=0),
 unique(order_id,variant_id)
);
create index orders_created_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status,expires_at);
create table public.stock_movements (
 id bigint generated always as identity primary key,
 variant_id uuid not null references public.variants(id),
 movement_type text not null check(movement_type in ('initial','purchase','sale','adjustment')),
 quantity_delta integer not null check(quantity_delta<>0),
 balance_after integer not null check(balance_after>=0),
 unit_cost numeric(12,4),
 reference_type text not null,
 reference_id text not null,
 notes text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements(variant_id,created_at desc);
create table public.audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id),
 event text not null,
 entity_id text,
 data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

-- ACL: lectura de los usuarios activos, escritura directa SOLO donde sea seguro.
-- Los saldos, compras, pedidos y el Kardex SOLO cambian mediante RPC transaccionales.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

-- Revocar escrituras directas; SELECT sólo alcanza filas de las políticas RLS.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.categories,public.products,public.variants,
 public.customers,public.suppliers,public.purchases,public.purchase_lines,
 public.orders,public.order_lines,public.stock_movements,public.audit_events to authenticated;
grant insert,update on public.customers to authenticated;
grant insert,update on public.suppliers to authenticated;

create policy profile_read on public.profiles for select to authenticated
 using(id=(select auth.uid()) or (select public.is_admin()));
create policy category_read on public.categories for select to authenticated using((select public.is_active()));
create policy product_read on public.products for select to authenticated using((select public.is_active()));
create policy variant_read on public.variants for select to authenticated using((select public.is_active()));
create policy customer_read on public.customers for select to authenticated using((select public.is_active()));
create policy customer_insert on public.customers for insert to authenticated with check((select public.is_active()));
create policy customer_update on public.customers for update to authenticated
 using((select public.is_active())) with check((select public.is_active()));
create policy supplier_read on public.suppliers for select to authenticated using((select public.is_active()));
create policy supplier_insert on public.suppliers for insert to authenticated with check((select public.is_admin()));
create policy supplier_update on public.suppliers for update to authenticated
 using((select public.is_admin())) with check((select public.is_admin()));
create policy purchases_read on public.purchases for select to authenticated using((select public.is_active()));
create policy purchase_lines_read on public.purchase_lines for select to authenticated using((select public.is_active()));
create policy orders_read on public.orders for select to authenticated using((select public.is_active()));
create policy order_lines_read on public.order_lines for select to authenticated using((select public.is_active()));
create policy movements_read on public.stock_movements for select to authenticated using((select public.is_active()));
create policy audit_read on public.audit_events for select to authenticated using((select public.is_admin()));

create function public.create_catalog_item(p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_cat uuid; v_product uuid; v_variant uuid; v_qty int;
 v_code text; v_sku text; v_name text; v_size text; v_color text; v_price numeric; v_cost numeric;
begin
 perform public.require_admin();
 v_code:=upper(trim(p_data->>'product_code')); v_sku:=upper(trim(p_data->>'sku'));
 v_name:=trim(p_data->>'name'); v_size:=coalesce(nullif(trim(p_data->>'size'),''),'Única');
 v_color:=coalesce(nullif(trim(p_data->>'color'),''),'Único');
 v_qty:=coalesce((p_data->>'initial_stock')::int,0);
 v_price:=(p_data->>'sale_price')::numeric; v_cost:=coalesce((p_data->>'cost')::numeric,0);
 if length(v_code) not between 2 and 40 or length(v_sku) not between 2 and 60
  or length(v_name) not between 2 and 120 or v_qty < 0 or v_price<0 or v_cost<0
  or v_price is null then raise exception 'Datos del producto inválidos'; end if;
 if nullif(trim(coalesce(p_data->>'category','')),'') is not null then
  insert into public.categories(name) values(trim(p_data->>'category'))
  on conflict(name) do update set name=excluded.name returning id into v_cat;
 end if;
 insert into public.products(product_code,name,category_id,brand)
  values(v_code,v_name,v_cat,nullif(trim(coalesce(p_data->>'brand','')),'')) returning id into v_product;
 insert into public.variants(product_id,sku,size,color,sale_price,avg_cost,on_hand,min_stock)
 values(v_product,v_sku,v_size,v_color,v_price,v_cost,v_qty,coalesce((p_data->>'min_stock')::int,2))
 returning id into v_variant;
 if v_qty>0 then
  insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by,notes)
  values(v_variant,'initial',v_qty,v_qty,v_cost,'product',v_product::text,(select auth.uid()),'Stock inicial registrado');
 end if;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'create_product',v_product::text);
 return v_product;
end; $$;

create function public.add_variant(p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_variant uuid; v_qty int; v_product uuid;
begin
 perform public.require_admin();
 v_product:=(p_data->>'product_id')::uuid; v_qty:=coalesce((p_data->>'initial_stock')::int,0);
 if not exists(select 1 from public.products where id=v_product) or v_qty<0 then
  raise exception 'Producto o cantidad inválida'; end if;
 insert into public.variants(product_id,sku,size,color,sale_price,avg_cost,on_hand,min_stock)
 values(v_product,upper(trim(p_data->>'sku')),
 coalesce(nullif(trim(p_data->>'size'),''),'Única'),
 coalesce(nullif(trim(p_data->>'color'),''),'Único'),
 (p_data->>'sale_price')::numeric,coalesce((p_data->>'cost')::numeric,0),
 v_qty,coalesce((p_data->>'min_stock')::int,2)) returning id into v_variant;
 if v_qty>0 then
  insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by,notes)
  values(v_variant,'initial',v_qty,v_qty,coalesce((p_data->>'cost')::numeric,0),'variant',v_variant::text,(select auth.uid()),'Stock inicial de variante');
 end if;
 return v_variant;
end; $$;

-- Importación atómica: si una fila falla, no se importa ninguna. Sólo SKUs nuevos.
create function public.import_catalog(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_product uuid; v_cat uuid; v_variant uuid; v_count int:=0;
 v_code text; v_sku text; v_name text; v_qty int; v_price numeric; v_cost numeric;
begin
 perform public.require_admin();
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>500 then
  raise exception 'Importe entre 1 y 500 filas'; end if;
 for r in select value from jsonb_array_elements(p_rows) as t(value) loop
  v_code:=upper(trim(r->>'product_code')); v_sku:=upper(trim(r->>'sku'));
  v_name:=trim(r->>'name'); v_qty:=coalesce((r->>'initial_stock')::int,0);
  v_price:=(r->>'sale_price')::numeric; v_cost:=coalesce((r->>'cost')::numeric,0);
  if length(v_code) not between 2 and 40 or length(v_sku) not between 2 and 60
    or length(v_name) not between 2 and 120 or v_qty<0 or v_price is null or v_price<0 or v_cost<0 then
    raise exception 'Fila % inválida',v_count+1; end if;
  v_cat:=null;
  if nullif(trim(coalesce(r->>'category','')),'') is not null then
   insert into public.categories(name) values(trim(r->>'category'))
    on conflict(name) do update set name=excluded.name returning id into v_cat;
  end if;
  select id into v_product from public.products where product_code=v_code;
  if v_product is null then
   insert into public.products(product_code,name,category_id)
    values(v_code,v_name,v_cat) returning id into v_product;
  else
   if not exists(select 1 from public.products where id=v_product and name=v_name) then
     raise exception 'El código % ya pertenece a otro nombre de producto',v_code; end if;
  end if;
  insert into public.variants(product_id,sku,size,color,sale_price,avg_cost,on_hand,min_stock)
   values(v_product,v_sku,coalesce(nullif(trim(r->>'size'),''),'Única'),
    coalesce(nullif(trim(r->>'color'),''),'Único'),v_price,v_cost,v_qty,coalesce((r->>'min_stock')::int,2))
   returning id into v_variant;
  if v_qty>0 then
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by,notes)
    values(v_variant,'initial',v_qty,v_qty,v_cost,'import',v_sku,(select auth.uid()),'Importación de catálogo');
  end if;
  v_count:=v_count+1;
 end loop;
 insert into public.audit_events(actor_id,event,data) values((select auth.uid()),'import_catalog',jsonb_build_object('rows',v_count));
 return v_count;
end; $$;

create function public.adjust_stock(p_variant uuid,p_delta integer,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.variants%rowtype;
begin
 perform public.require_admin();
 if p_delta is null or p_delta=0 or length(trim(coalesce(p_reason,'')))<5 then
  raise exception 'Indique una cantidad distinta de cero y motivo de 5 caracteres o más'; end if;
 select * into v from public.variants where id=p_variant for update;
 if not found then raise exception 'Variante inexistente'; end if;
 if v.on_hand+p_delta<v.reserved+v.blocked then raise exception 'Ajuste excede el stock libre'; end if;
 update public.variants set on_hand=on_hand+p_delta where id=p_variant;
 insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,notes,created_by)
 values(p_variant,'adjustment',p_delta,v.on_hand+p_delta,v.avg_cost,'manual',gen_random_uuid()::text,trim(p_reason),(select auth.uid()));
end; $$;

create function public.receive_purchase(p_supplier uuid,p_reference text,p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_purchase uuid; r record; v public.variants%rowtype; v_total numeric(14,2):=0;
begin
 perform public.require_admin();
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>100 then
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

-- Liberación perezosa: se ejecuta al entrar al módulo y antes de crear/confirmar una venta.
-- No requiere cron, aunque puede existir un retraso visual hasta la próxima consulta.
create function public.expire_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare o record; l record; v_count int:=0;
begin
 perform public.require_active();
 for o in select id from public.orders
  where status='reserved' and expires_at<=now() order by created_at
  for update skip locked loop
  for l in select variant_id,quantity from public.order_lines where order_id=o.id order by variant_id loop
    update public.variants set reserved=reserved-l.quantity where id=l.variant_id;
  end loop;
  update public.orders set status='expired' where id=o.id;
  v_count:=v_count+1;
 end loop;
 return v_count;
end; $$;

create function public.create_order(p_key uuid,p_buyer text,p_handle text,p_customer uuid,
 p_channel text,p_mode text,p_method text,p_minutes int,p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_order uuid; r record; v public.variants%rowtype; v_total numeric(14,2):=0;
 v_status text; v_payment text; v_exp timestamptz;
begin
 perform public.require_active();
 if p_key is null then raise exception 'Identificador de operación requerido'; end if;
 select id into v_order from public.orders where request_key=p_key;
 if found then return v_order; end if;
 perform public.expire_reservations();
 if p_channel not in ('tiktok','whatsapp','directo') or p_mode not in ('reserve','paid') then
  raise exception 'Canal o tipo de operación inválidos'; end if;
 if p_mode='paid' and p_method not in ('efectivo','yape','plin','transferencia') then
  raise exception 'Indique el medio de pago verificado'; end if;
 if p_mode='reserve' and (p_minutes<5 or p_minutes>720) then
  raise exception 'Reserva entre 5 y 720 minutos'; end if;
 if p_customer is not null and not exists(select 1 from public.customers where id=p_customer) then
  raise exception 'Cliente inválido'; end if;
 if length(trim(coalesce(p_buyer,'')))<2 and length(trim(coalesce(p_handle,'')))<2 and p_customer is null then
  raise exception 'Indique nombre, usuario TikTok o cliente'; end if;
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 or jsonb_array_length(p_lines)>50 then
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

create function public.confirm_reservation(p_order uuid,p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; r record; v public.variants%rowtype;
begin
 perform public.require_active();
 perform public.expire_reservations();
 if p_method not in ('efectivo','yape','plin','transferencia') then raise exception 'Método de pago inválido'; end if;
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

create function public.cancel_reservation(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; r record;
begin
 perform public.require_active();
 select * into o from public.orders where id=p_order for update;
 if not found or o.status<>'reserved' then raise exception 'Solo se pueden cancelar reservas activas'; end if;
 for r in select variant_id,quantity from public.order_lines where order_id=o.id order by variant_id loop
  update public.variants set reserved=reserved-r.quantity where id=r.variant_id;
 end loop;
 update public.orders set status='cancelled',expires_at=null where id=o.id;
 insert into public.audit_events(actor_id,event,entity_id) values((select auth.uid()),'cancel_reservation',o.id::text);
end; $$;

-- Protegemos la ejecución pública de las funciones con privileges explícitos.
revoke execute on function public.is_active(),public.is_admin(),public.require_active(),public.require_admin() from public,anon;
revoke execute on function public.create_catalog_item(jsonb),public.add_variant(jsonb),public.import_catalog(jsonb),
 public.adjust_stock(uuid,integer,text),public.receive_purchase(uuid,text,jsonb),public.expire_reservations(),
 public.create_order(uuid,text,text,uuid,text,text,text,integer,jsonb),
 public.confirm_reservation(uuid,text),public.cancel_reservation(uuid) from public,anon;
grant execute on function public.is_active(),public.is_admin(),public.require_active(),public.require_admin() to authenticated;
grant execute on function public.create_catalog_item(jsonb),public.add_variant(jsonb),public.import_catalog(jsonb),
 public.adjust_stock(uuid,integer,text),public.receive_purchase(uuid,text,jsonb),public.expire_reservations(),
 public.create_order(uuid,text,text,uuid,text,text,text,integer,jsonb),
 public.confirm_reservation(uuid,text),public.cancel_reservation(uuid) to authenticated;

-- Bootstrap administrador (ejecutar DESPUÉS de crear usuario desde /ingresar):
-- update public.profiles set role='admin', active=true where email='TU_EMAIL_REAL';

-- Agregados en la base de datos: no dependen de límites de paginación del cliente.
create function public.dashboard_stats() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_sales numeric; v_paid_count bigint; v_reserved bigint; v_low bigint;
 v_units bigint; v_available bigint;
begin
 perform public.require_active();
 select coalesce(sum(total),0),count(*) into v_sales,v_paid_count
 from public.orders where status='confirmed' and (confirmed_at at time zone 'America/Lima')::date=(now() at time zone 'America/Lima')::date;
 select count(*) into v_reserved from public.orders where status='reserved' and expires_at>now();
 select count(*) into v_low from public.variants where active and (on_hand-reserved-blocked)<=min_stock;
 select coalesce(sum(on_hand),0),coalesce(sum(on_hand-reserved-blocked),0) into v_units,v_available from public.variants where active;
 return jsonb_build_object('sales_today',v_sales,'sales_count',v_paid_count,'active_reservations',v_reserved,
   'low_stock',v_low,'units',v_units,'available',v_available);
end; $$;
revoke execute on function public.dashboard_stats() from public,anon;
grant execute on function public.dashboard_stats() to authenticated;

create function public.update_variant_settings(p_variant uuid,p_price numeric,p_min_stock integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_admin();
 if p_price is null or p_price<0 or p_price>99999999 or p_min_stock is null or p_min_stock<0 then
   raise exception 'Precio o mínimo inválidos'; end if;
 update public.variants set sale_price=p_price,min_stock=p_min_stock where id=p_variant;
 if not found then raise exception 'SKU inexistente'; end if;
 insert into public.audit_events(actor_id,event,entity_id,data)
 values((select auth.uid()),'update_variant_settings',p_variant::text,jsonb_build_object('price',p_price,'min_stock',p_min_stock));
end; $$;
revoke execute on function public.update_variant_settings(uuid,numeric,integer) from public,anon;
grant execute on function public.update_variant_settings(uuid,numeric,integer) to authenticated;
