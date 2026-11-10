-- Conserva el código de producto y el SKU del Excel como campos independientes.
-- Sustituye el importador en su sitio y comprueba la escritura dentro de la transacción.
BEGIN;

create or replace function public.import_catalog(p_rows jsonb) returns integer
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
  -- Comprueba los campos persistidos antes de registrar el stock inicial.
  if not exists (
   select 1
   from public.variants v join public.products p on p.id=v.product_id
   where v.id=v_variant and p.id=v_product and v.sku=v_sku and p.product_code=v_code
  ) then
   raise exception 'Fila %: el SKU o el código de producto guardado difiere del Excel. Se canceló la importación.',v_count+1;
  end if;
  if v_qty>0 then
   insert into public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,created_by,notes)
    values(v_variant,'initial',v_qty,v_qty,v_cost,'import',v_sku,(select auth.uid()),'Importación de catálogo');
  end if;
  v_count:=v_count+1;
 end loop;
 insert into public.audit_events(actor_id,event,data) values((select auth.uid()),'import_catalog',jsonb_build_object('rows',v_count));
 return v_count;
end; $$;

REVOKE ALL ON FUNCTION public.import_catalog(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_catalog(jsonb) TO authenticated;

COMMIT;
