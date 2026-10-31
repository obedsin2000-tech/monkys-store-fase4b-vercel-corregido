-- MONKY'S STORE ERP — FASE 4B
-- Ejecutar una sola vez, SOLO DESPUÉS de 001, 002, 003 (corregida) y 004.
-- NO elimina, reinicia ni sobrescribe registros previos de inventario o ventas.
-- Crea identificadores Code 128 internos y conteos físicos revisables.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.variants') IS NULL OR
    to_regclass('public.stock_movements') IS NULL OR
    to_regprocedure('public.phase4a_security_report()') IS NULL THEN
   RAISE EXCEPTION 'Fase 4B requiere la Fase 4A completa. No se aplicaron cambios';
 END IF;
END;
$preflight$;

-- Identificador interno permanente, distinto del SKU y no reutilizable.
CREATE SEQUENCE IF NOT EXISTS public.monkys_barcode_seq AS bigint START WITH 1;
CREATE OR REPLACE FUNCTION public.next_internal_barcode()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $func$
 SELECT 'MK' || pg_catalog.lpad(pg_catalog.nextval('public.monkys_barcode_seq'::regclass)::text,10,'0')
$func$;
REVOKE ALL ON FUNCTION public.next_internal_barcode() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.variants ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.variants ALTER COLUMN barcode SET DEFAULT public.next_internal_barcode();
UPDATE public.variants SET barcode=public.next_internal_barcode() WHERE barcode IS NULL;
ALTER TABLE public.variants ALTER COLUMN barcode SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS variants_barcode_unique_idx ON public.variants(barcode);
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname='variants_barcode_format_chk' AND conrelid='public.variants'::regclass) THEN
    ALTER TABLE public.variants ADD CONSTRAINT variants_barcode_format_chk CHECK (barcode ~ '^MK[0-9]{10}$');
  END IF;
END;
$block$;

-- Revisión monotónica: impide aprobar conteos si hubo ventas, compras o reservas,
-- incluso si las cantidades volvieron al mismo valor antes de la aprobación.
ALTER TABLE public.variants ADD COLUMN IF NOT EXISTS stock_revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION public.track_variant_stock_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $func$
BEGIN
  IF OLD.on_hand IS DISTINCT FROM NEW.on_hand OR
     OLD.reserved IS DISTINCT FROM NEW.reserved OR
     OLD.blocked IS DISTINCT FROM NEW.blocked THEN
    NEW.stock_revision := OLD.stock_revision + 1;
  END IF;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER variant_revision_f4b BEFORE UPDATE ON public.variants
FOR EACH ROW EXECUTE FUNCTION public.track_variant_stock_revision();
REVOKE ALL ON FUNCTION public.track_variant_stock_revision() FROM PUBLIC,anon,authenticated;

-- Conteo físico sin editar inventario hasta aprobación del administrador.
CREATE TABLE IF NOT EXISTS public.inventory_counts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','cancelled')),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=300),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 approved_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 approved_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_counts_created_at_idx ON public.inventory_counts(created_at DESC);
CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE RESTRICT,
 variant_id uuid NOT NULL REFERENCES public.variants(id),
 baseline_on_hand integer NOT NULL CHECK (baseline_on_hand>=0),
 baseline_reserved integer NOT NULL CHECK (baseline_reserved>=0),
 baseline_blocked integer NOT NULL CHECK (baseline_blocked>=0),
 baseline_revision bigint NOT NULL,
 counted integer CHECK (counted>=0 AND counted<=1000000),
 updated_at timestamptz,
 UNIQUE(count_id,variant_id)
);
CREATE INDEX IF NOT EXISTS inventory_count_lines_variant_idx ON public.inventory_count_lines(variant_id);

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_counts, public.inventory_count_lines FROM anon, authenticated;
GRANT SELECT ON public.inventory_counts,public.inventory_count_lines TO authenticated;
CREATE POLICY count_read_active ON public.inventory_counts FOR SELECT TO authenticated
 USING (public.is_active() AND (created_by=(SELECT auth.uid()) OR public.is_admin()));
CREATE POLICY count_lines_read_active ON public.inventory_count_lines FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.inventory_counts c WHERE c.id=count_id AND public.is_active() AND (c.created_by=(SELECT auth.uid()) OR public.is_admin())));

-- Una sesión conserva una fotografía del saldo y reservas al momento de iniciarse.
CREATE FUNCTION public.open_inventory_count(p_notes text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE v_id uuid; v_n integer;
BEGIN
 PERFORM public.require_active();
 IF length(coalesce(p_notes,''))>300 THEN RAISE EXCEPTION 'Notas demasiado largas'; END IF;
 -- No abrir múltiples conteos activos del mismo usuario accidentalmente.
 IF EXISTS(SELECT 1 FROM public.inventory_counts WHERE created_by=(SELECT auth.uid()) AND status='draft') THEN
   RAISE EXCEPTION 'Ya tienes un conteo en borrador. Termínalo o cancélalo antes de crear otro';
 END IF;
 INSERT INTO public.inventory_counts(notes,created_by)
 VALUES (coalesce(p_notes,''),(SELECT auth.uid())) RETURNING id INTO v_id;
 INSERT INTO public.inventory_count_lines(count_id,variant_id,baseline_on_hand,baseline_reserved,baseline_blocked,baseline_revision)
 SELECT v_id,id,on_hand,reserved,blocked,stock_revision FROM public.variants WHERE active ORDER BY id;
 GET DIAGNOSTICS v_n = ROW_COUNT;
 IF v_n=0 THEN RAISE EXCEPTION 'No existen variantes activas para contar'; END IF;
 INSERT INTO public.audit_events(actor_id,event,entity_id,data)
 VALUES ((SELECT auth.uid()),'inventory_count_opened',v_id::text,pg_catalog.jsonb_build_object('variants',v_n));
 RETURN v_id;
END;
$func$;

-- Guardar una cantidad contada. Repetir petición no suma cantidades: asigna valor exacto.
CREATE FUNCTION public.set_inventory_count_line(p_count uuid,p_variant uuid,p_counted integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE c public.inventory_counts%rowtype;
BEGIN
 PERFORM public.require_active();
 IF p_counted IS NULL OR p_counted<0 OR p_counted>1000000 THEN RAISE EXCEPTION 'Cantidad contada inválida'; END IF;
 SELECT * INTO c FROM public.inventory_counts WHERE id=p_count FOR UPDATE;
 IF NOT FOUND OR c.status<>'draft' THEN RAISE EXCEPTION 'El conteo no está abierto'; END IF;
 IF c.created_by<>(SELECT auth.uid()) AND NOT public.is_admin() THEN RAISE EXCEPTION 'No puedes modificar un conteo ajeno'; END IF;
 UPDATE public.inventory_count_lines SET counted=p_counted,updated_at=now()
 WHERE count_id=p_count AND variant_id=p_variant;
 IF NOT FOUND THEN RAISE EXCEPTION 'La variante no forma parte de este conteo'; END IF;
END;
$func$;

CREATE FUNCTION public.submit_inventory_count(p_count uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE c public.inventory_counts%rowtype;
BEGIN
 PERFORM public.require_active();
 SELECT * INTO c FROM public.inventory_counts WHERE id=p_count FOR UPDATE;
 IF NOT FOUND OR c.status<>'draft' THEN RAISE EXCEPTION 'El conteo no está en borrador'; END IF;
 IF c.created_by<>(SELECT auth.uid()) AND NOT public.is_admin() THEN RAISE EXCEPTION 'Permiso insuficiente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_count_lines WHERE count_id=p_count AND counted IS NOT NULL) THEN
   RAISE EXCEPTION 'Cuenta al menos una variante antes de enviar a revisión';
 END IF;
 UPDATE public.inventory_counts SET status='submitted',submitted_at=now() WHERE id=p_count;
 INSERT INTO public.audit_events(actor_id,event,entity_id) VALUES((SELECT auth.uid()),'inventory_count_submitted',p_count::text);
END;
$func$;

-- Aprobación transaccional: sólo unidades contadas, bloqueo de filas, rechazo de datos obsoletos.
CREATE FUNCTION public.approve_inventory_count(p_count uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE c public.inventory_counts%rowtype; l record; v public.variants%rowtype; delta integer; changed integer:=0;
BEGIN
 PERFORM public.require_admin();
 SELECT * INTO c FROM public.inventory_counts WHERE id=p_count FOR UPDATE;
 IF NOT FOUND OR c.status<>'submitted' THEN RAISE EXCEPTION 'El conteo debe estar enviado a revisión'; END IF;
 FOR l IN SELECT * FROM public.inventory_count_lines WHERE count_id=p_count AND counted IS NOT NULL ORDER BY variant_id LOOP
   SELECT * INTO v FROM public.variants WHERE id=l.variant_id FOR UPDATE;
   IF NOT FOUND OR v.on_hand<>l.baseline_on_hand OR v.reserved<>l.baseline_reserved OR v.blocked<>l.baseline_blocked OR v.stock_revision<>l.baseline_revision OR NOT v.active THEN
     RAISE EXCEPTION 'El stock o las reservas de % cambiaron desde que empezó el conteo. Crea un conteo nuevo',l.variant_id;
   END IF;
   IF l.counted < v.reserved + v.blocked THEN
     RAISE EXCEPTION 'La cantidad contada de % es menor que las unidades reservadas o bloqueadas',v.sku;
   END IF;
   delta:=l.counted-v.on_hand;
   IF delta<>0 THEN
     UPDATE public.variants SET on_hand=l.counted WHERE id=l.variant_id;
     INSERT INTO public.stock_movements(variant_id,movement_type,quantity_delta,balance_after,unit_cost,reference_type,reference_id,notes,created_by)
     VALUES(l.variant_id,'adjustment',delta,l.counted,v.avg_cost,'inventory_count',p_count::text,
       'Ajuste aprobado tras conteo físico', (SELECT auth.uid()));
     changed:=changed+1;
   END IF;
 END LOOP;
 UPDATE public.inventory_counts SET status='approved',approved_at=now(),approved_by=(SELECT auth.uid()) WHERE id=p_count;
 INSERT INTO public.audit_events(actor_id,event,entity_id,data)
 VALUES((SELECT auth.uid()),'inventory_count_approved',p_count::text,pg_catalog.jsonb_build_object('adjusted_variants',changed));
 RETURN changed;
END;
$func$;

CREATE FUNCTION public.cancel_inventory_count(p_count uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE c public.inventory_counts%rowtype;
BEGIN
 PERFORM public.require_active();
 SELECT * INTO c FROM public.inventory_counts WHERE id=p_count FOR UPDATE;
 IF NOT FOUND OR c.status NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'No se puede cancelar ese conteo'; END IF;
 IF c.created_by<>(SELECT auth.uid()) AND NOT public.is_admin() THEN RAISE EXCEPTION 'Permiso insuficiente'; END IF;
 UPDATE public.inventory_counts SET status='cancelled' WHERE id=p_count;
 INSERT INTO public.audit_events(actor_id,event,entity_id) VALUES((SELECT auth.uid()),'inventory_count_cancelled',p_count::text);
END;
$func$;

REVOKE ALL ON FUNCTION public.open_inventory_count(text),public.set_inventory_count_line(uuid,uuid,integer),
 public.submit_inventory_count(uuid),public.approve_inventory_count(uuid),public.cancel_inventory_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_inventory_count(text),public.set_inventory_count_line(uuid,uuid,integer),
 public.submit_inventory_count(uuid),public.approve_inventory_count(uuid),public.cancel_inventory_count(uuid) TO authenticated;
COMMIT;
