import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { PRODUCT_PHOTO_BUCKET, productPhotoPath } from '@/lib/product-photo';

const query = z.object({
  producto: z.uuid(),
  version: z.uuid(),
  vista: z.enum(['miniatura', 'ampliada']),
});
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request) {
  const params = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return new Response(null, { status: 404, headers });

  const { producto, version, vista } = params.data;
  const supabase = await createClient();
  const { data: file, error } = await supabase.storage.from(PRODUCT_PHOTO_BUCKET)
    .download(productPhotoPath(producto, version, vista));

  if (error || !file) return new Response(null, { status: 404, headers });
  return new Response(file, { headers: { ...headers, 'Content-Type': 'image/webp' } });
}
