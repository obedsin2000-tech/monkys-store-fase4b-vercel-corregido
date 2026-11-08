-- Fotos opcionales compartidas por todas las variantes del producto.
-- Ejecutar como propietario del proyecto en el editor SQL de Supabase.
BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reference_photo_id uuid;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-reference-photos', 'product-reference-photos', false, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_reference_photos_read ON storage.objects;
CREATE POLICY product_reference_photos_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'product-reference-photos'
  AND (
    (SELECT public.is_admin())
    OR ((SELECT public.is_active()) AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id::text = split_part(storage.objects.name, '/', 1)
        AND storage.objects.name IN (
          p.id::text || '/' || p.reference_photo_id::text || '/miniatura.webp',
          p.id::text || '/' || p.reference_photo_id::text || '/referencia.webp'
        )
    ))
  )
);

DROP POLICY IF EXISTS product_reference_photos_insert ON storage.objects;
CREATE POLICY product_reference_photos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-reference-photos'
  AND (SELECT public.is_admin())
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(miniatura|referencia)[.]webp$'
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id::text = split_part(storage.objects.name, '/', 1)
  )
);

-- Los archivos se crean con claves nuevas. La API de Storage puede retirar
-- versiones anteriores o incompletas una vez que el producto deja de usarlas.
DROP POLICY IF EXISTS product_reference_photos_delete ON storage.objects;
CREATE POLICY product_reference_photos_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-reference-photos'
  AND (SELECT public.is_admin())
  AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id::text = split_part(storage.objects.name, '/', 1)
      AND p.reference_photo_id::text = split_part(storage.objects.name, '/', 2)
  )
);

CREATE OR REPLACE FUNCTION public.set_product_reference_photo(
  p_product uuid, p_expected uuid, p_photo uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_current uuid;
  v_prefix text;
BEGIN
  PERFORM public.require_admin();

  SELECT reference_photo_id INTO v_current
  FROM public.products
  WHERE id = p_product
  FOR UPDATE;

  IF NOT FOUND OR v_current IS DISTINCT FROM p_expected THEN
    RETURN false;
  END IF;

  IF v_current IS NOT DISTINCT FROM p_photo THEN
    RETURN true;
  END IF;

  IF p_photo IS NOT NULL THEN
    v_prefix := p_product::text || '/' || p_photo::text || '/';
    IF (SELECT count(*) FROM storage.objects
        WHERE bucket_id = 'product-reference-photos'
          AND name IN (v_prefix || 'miniatura.webp', v_prefix || 'referencia.webp')) <> 2 THEN
      RAISE EXCEPTION 'La foto y su miniatura deben estar guardadas antes de asociarlas.';
    END IF;
  END IF;

  UPDATE public.products SET reference_photo_id = p_photo WHERE id = p_product;
  INSERT INTO public.audit_events (actor_id, event, entity_id, data)
  VALUES (
    (SELECT auth.uid()),
    'set_product_reference_photo',
    p_product::text,
    jsonb_build_object('previous_photo_id', v_current, 'photo_id', p_photo)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_reference_photo(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_reference_photo(uuid, uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
