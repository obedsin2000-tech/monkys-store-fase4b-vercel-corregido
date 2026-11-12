-- Habilita la corrección de SKU, talla y color mediante una función de administrador.
-- Los datos del catálogo solo cambian cuando se guarda una edición desde la aplicación.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_variant_identity(
  p_variant uuid, p_sku text, p_size text, p_color text, p_expected jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_variant public.variants%ROWTYPE;
  v_sku text := upper(btrim(p_sku));
  v_size text := btrim(p_size);
  v_color text := btrim(p_color);
  v_before jsonb;
  v_after jsonb;
  v_constraint text;
BEGIN
  PERFORM public.require_admin();

  IF v_sku IS NULL OR char_length(v_sku) NOT BETWEEN 2 AND 60 OR v_sku ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'El SKU debe tener entre 2 y 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_size IS NULL OR char_length(v_size) NOT BETWEEN 1 AND 30 OR v_size ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Ingresa una talla de hasta 30 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF v_color IS NULL OR char_length(v_color) NOT BETWEEN 1 AND 40 OR v_color ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Ingresa un color de hasta 40 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_variant
  FROM public.variants
  WHERE id = p_variant AND active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La variante ya no está disponible en el catálogo.' USING ERRCODE = 'P0002';
  END IF;

  v_before := jsonb_build_object('sku', v_variant.sku, 'size', v_variant.size, 'color', v_variant.color);
  v_after := jsonb_build_object('sku', v_sku, 'size', v_size, 'color', v_color);
  IF v_before = v_after THEN
    RETURN;
  END IF;
  IF v_before IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'La variante cambió mientras la editabas. Cierra y recarga Productos antes de corregirla.' USING ERRCODE = 'PT409';
  END IF;
  -- El lector también admite SKU. Evita que un SKU nuevo coincida con una etiqueta de otra variante.
  IF v_sku <> v_variant.sku AND v_sku <> v_variant.barcode AND v_sku ~ '^MK[0-9]{10}$' THEN
    RAISE EXCEPTION 'Los códigos MK seguidos de 10 dígitos se usan para las etiquetas. Elige otro SKU.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.variants
  SET sku = v_sku, size = v_size, color = v_color
  WHERE id = p_variant;

  INSERT INTO public.audit_events(actor_id, event, entity_id, data)
  VALUES ((SELECT auth.uid()), 'update_variant_identity', p_variant::text,
    jsonb_build_object('before', v_before, 'after', v_after));
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint = 'variants_sku_key' THEN
    RAISE EXCEPTION 'Ese SKU ya está registrado en otra variante.' USING ERRCODE = '23505';
  ELSIF v_constraint = 'variants_product_id_size_color_key' THEN
    RAISE EXCEPTION 'Ya existe una variante de este producto con esa talla y color.' USING ERRCODE = '23505';
  END IF;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_variant_identity(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_variant_identity(uuid, text, text, text, jsonb) TO authenticated;

COMMIT;
