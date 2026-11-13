-- Permite editar los datos compartidos del producto y la variante en una sola operación.
-- Requiere 014_editar_variantes.sql. La instalación no modifica el catálogo.
BEGIN;

DO $prerequisites$
BEGIN
  IF to_regprocedure('public.update_variant_identity(uuid,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Aplica primero 014_editar_variantes.sql.';
  END IF;
END;
$prerequisites$;

CREATE OR REPLACE FUNCTION public.update_catalog_variant(
  p_variant uuid, p_sku text, p_size text, p_color text, p_expected jsonb,
  p_product jsonb, p_expected_product jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_category_id uuid;
  v_category_before text;
  v_code text := upper(btrim(p_product->>'product_code'));
  v_name text := btrim(p_product->>'name');
  v_category text := coalesce(btrim(p_product->>'category'), '');
  v_brand text := coalesce(btrim(p_product->>'brand'), '');
  v_before jsonb;
  v_after jsonb;
  v_constraint text;
BEGIN
  PERFORM public.require_admin();

  IF v_code IS NULL OR char_length(v_code) NOT BETWEEN 2 AND 40 OR v_code ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'El código de producto debe tener entre 2 y 40 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 120 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_category <> '' AND (char_length(v_category) NOT BETWEEN 2 AND 80 OR v_category ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'La categoría debe tener entre 2 y 80 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_brand) > 80 OR v_brand ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Ingresa una marca de hasta 80 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_product
  FROM public.variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant AND v.active
  FOR NO KEY UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La variante ya no está disponible en el catálogo.' USING ERRCODE = 'P0002';
  END IF;

  v_category_id := v_product.category_id;
  SELECT name INTO v_category_before FROM public.categories WHERE id = v_category_id;
  v_before := jsonb_build_object(
    'product_code', v_product.product_code, 'name', v_product.name,
    'category', coalesce(v_category_before, ''), 'brand', coalesce(v_product.brand, '')
  );
  v_after := jsonb_build_object('product_code', v_code, 'name', v_name, 'category', v_category, 'brand', v_brand);
  IF v_before <> v_after AND v_before IS DISTINCT FROM p_expected_product THEN
    RAISE EXCEPTION 'Los datos del producto cambiaron mientras los editabas. Cierra y recarga Productos.' USING ERRCODE = 'PT409';
  END IF;

  PERFORM public.update_variant_identity(p_variant, p_sku, p_size, p_color, p_expected);
  IF v_before = v_after THEN
    RETURN;
  END IF;

  IF v_category <> (v_before->>'category') THEN
    v_category_id := NULL;
    IF v_category <> '' THEN
      SELECT id INTO v_category_id FROM public.categories WHERE name = v_category;
      IF NOT FOUND THEN
        INSERT INTO public.categories(name) VALUES (v_category)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_category_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.products
  SET product_code = v_code, name = v_name, category_id = v_category_id, brand = nullif(v_brand, '')
  WHERE id = v_product.id;

  INSERT INTO public.audit_events(actor_id, event, entity_id, data)
  VALUES ((SELECT auth.uid()), 'update_catalog_product', v_product.id::text,
    jsonb_build_object('before', v_before, 'after', v_after));
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'products_product_code_key' THEN
    RAISE EXCEPTION 'Ese código de producto ya está registrado en otra prenda.' USING ERRCODE = '23505';
  END IF;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_catalog_variant(uuid, text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_variant(uuid, text, text, text, jsonb, jsonb, jsonb) TO authenticated;

COMMIT;
