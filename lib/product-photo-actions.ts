'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prepareProductPhoto } from '@/lib/product-photo-image';
import { PRODUCT_PHOTO_BUCKET, PRODUCT_PHOTO_MIGRATION, productPhotoPath } from '@/lib/product-photo';
import type { ActionResult } from '@/lib/types';

const ids = z.object({ productId: z.uuid(), expectedId: z.uuid().nullable() });
const conflictMessage = 'La foto cambió en otra sesión. Revisa la foto actual y vuelve a guardar.';
const setupMessage = `Aplica ${PRODUCT_PHOTO_MIGRATION} en Supabase para habilitar las fotos.`;

type PhotoChange = { kind: 'save'; formData: FormData } | { kind: 'remove' };

async function changeReferencePhoto(productId: string, expectedId: string | null, change: PhotoChange): Promise<ActionResult> {
  const parsed = ids.safeParse({ productId, expectedId });
  if (!parsed.success) return { ok: false, error: 'El producto o su referencia de foto no son válidos.' };

  const { supabase, role } = await requireUser();
  if (role !== 'admin') return { ok: false, error: 'La gestión de fotos requiere permisos de administrador.' };

  const readReference = () => supabase.from('products').select('reference_photo_id').eq('id', productId).maybeSingle();
  const { data: current, error: readError } = await readReference();
  if (readError) {
    return {
      ok: false,
      error: ['42703', 'PGRST204'].includes(readError.code) ? setupMessage : 'No se pudo consultar la foto actual. Intenta nuevamente.',
    };
  }
  if (!current) return { ok: false, error: 'No se encontró el producto.' };
  if (current.reference_photo_id !== expectedId) {
    revalidatePath('/productos');
    return { ok: false, error: conflictMessage };
  }

  const bucket = supabase.storage.from(PRODUCT_PHOTO_BUCKET);
  const paths = (id: string) => [
    productPhotoPath(productId, id, 'miniatura'),
    productPhotoPath(productId, id, 'ampliada'),
  ];

  async function discard(id: string) {
    try {
      const { error } = await bucket.remove(paths(id));
      return !error;
    } catch {
      return false;
    }
  }

  let nextId: string | null = null;
  if (change.kind === 'save') {
    const file = change.formData instanceof FormData ? change.formData.get('foto') : null;
    if (!(file instanceof File)) return { ok: false, error: 'Selecciona una foto de referencia.' };

    let images: Awaited<ReturnType<typeof prepareProductPhoto>>;
    try {
      images = await prepareProductPhoto(file);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'No se pudo preparar la foto.' };
    }

    nextId = randomUUID();
    const [thumbnailPath, fullPath] = paths(nextId);
    try {
      const options = { contentType: 'image/webp', cacheControl: '0', upsert: false };
      const thumbnail = await bucket.upload(thumbnailPath, images.thumbnail, options);
      if (thumbnail.error) throw thumbnail.error;
      const full = await bucket.upload(fullPath, images.full, options);
      if (full.error) throw full.error;
    } catch {
      await discard(nextId);
      return { ok: false, error: 'No se pudo subir la foto. Intenta nuevamente.' };
    }
  }

  try {
    const { data: saved, error } = await supabase.rpc('set_product_reference_photo', {
      p_product: productId,
      p_expected: expectedId,
      p_photo: nextId,
    });
    if (error?.code === 'PGRST202') {
      if (nextId) await discard(nextId);
      return { ok: false, error: setupMessage };
    }
    if (error) throw error;
    if (!saved) {
      if (nextId) await discard(nextId);
      revalidatePath('/productos');
      return { ok: false, error: conflictMessage };
    }
  } catch {
    // Una respuesta interrumpida puede llegar después de que la referencia cambió.
    // Mientras el resultado sea incierto, los archivos preparados quedan disponibles.
    const { data: actual } = await readReference();
    if (!actual || actual.reference_photo_id !== nextId) {
      revalidatePath('/productos');
      return { ok: false, error: 'No se pudo confirmar el cambio. Revisa la foto actual antes de reintentar.' };
    }
  }

  const cleaned = !expectedId || await discard(expectedId);
  revalidatePath('/productos');
  const message = change.kind === 'save' ? 'Foto de referencia guardada.' : 'Foto de referencia retirada.';
  return {
    ok: true,
    message: cleaned ? message : `${message} Quedó pendiente limpiar los archivos anteriores en Storage.`,
  };
}

export async function saveProductPhotoAction(productId: string, expectedId: string | null, formData: FormData) {
  return changeReferencePhoto(productId, expectedId, { kind: 'save', formData });
}

export async function removeProductPhotoAction(productId: string, expectedId: string) {
  return changeReferencePhoto(productId, expectedId, { kind: 'remove' });
}
