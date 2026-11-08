export const PRODUCT_PHOTO_BUCKET = 'product-reference-photos';
export const PRODUCT_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
export const PRODUCT_PHOTO_HINT = 'JPG, PNG o WebP. Máximo 2 MB.';
export const PRODUCT_PHOTO_MIGRATION = '012_fotos_referencia.sql';

export type ProductPhotoView = 'miniatura' | 'ampliada';

export function productPhotoFileError(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (file.size === 0) return 'El archivo está vacío. Selecciona otra imagen.';
  if (file.size > PRODUCT_PHOTO_MAX_BYTES) return 'La imagen supera los 2 MB. Selecciona un archivo más pequeño.';
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    && !((!file.type || file.type === 'application/octet-stream') && /\.(jpe?g|png|webp)$/i.test(file.name))
  ) {
    return 'Selecciona una imagen JPG, PNG o WebP.';
  }
  return null;
}

export function productPhotoPath(productId: string, photoId: string, view: ProductPhotoView) {
  return `${productId}/${photoId}/${view === 'miniatura' ? 'miniatura' : 'referencia'}.webp`;
}

export function productPhotoUrl(productId: string, photoId: string, view: ProductPhotoView) {
  return `/api/productos/foto?${new URLSearchParams({ producto: productId, version: photoId, vista: view })}`;
}
