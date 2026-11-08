import sharp from 'sharp';
import { PRODUCT_PHOTO_MAX_BYTES, productPhotoFileError } from '@/lib/product-photo';

const MAX_INPUT_PIXELS = 24_000_000;

export async function prepareProductPhoto(file: File) {
  const error = productPhotoFileError(file);
  if (error) throw new Error(error);

  const bytes = Buffer.from(await file.arrayBuffer());
  const jpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('El contenido del archivo debe ser una imagen JPG, PNG o WebP.');

  const source = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });
  let format: string;
  try {
    ({ format } = await source.metadata());
  } catch {
    throw new Error('No se pudo leer la imagen. Usa un JPG, PNG o WebP válido de hasta 24 megapíxeles.');
  }

  if (!['jpeg', 'png', 'webp'].includes(format)) {
    throw new Error('El contenido del archivo debe ser una imagen JPG, PNG o WebP.');
  }

  try {
    const thumbnail = await source.clone().autoOrient()
      .resize({ width: 144, height: 144, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
    const full = await source.autoOrient()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 }).toBuffer();

    if (full.byteLength <= PRODUCT_PHOTO_MAX_BYTES) return { thumbnail, full };
  } catch {
    throw new Error('No se pudo preparar la imagen. Selecciona otro archivo JPG, PNG o WebP.');
  }

  throw new Error('La imagen optimizada supera los 2 MB. Usa una foto de menor resolución.');
}
