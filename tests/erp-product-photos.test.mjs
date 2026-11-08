import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { adminId, operatorId, inactiveId, database, session } from './helpers/database.mjs';
import { load } from './helpers/components.mjs';

const migration = await fs.readFile(new URL('../supabase/migrations/012_fotos_referencia.sql', import.meta.url), 'utf8');
const bucket = 'product-reference-photos';
const photoNames = (product, photo) => [
  `${product}/${photo}/miniatura.webp`,
  `${product}/${photo}/referencia.webp`,
];
const productData = {
  product_code: 'CAS-PRUEBA', name: 'Casaca de prueba', sku: 'CAS-PRUEBA-M',
  category: 'Casacas', size: 'M', color: 'Negro', sale_price: 120, cost: 60, initial_stock: 4, min_stock: 1,
};
async function createProduct(db, data = productData) {
  return (await db.query('SELECT public.create_catalog_item($1::jsonb) AS id', [JSON.stringify(data)])).rows[0].id;
}
async function storePhotos(db, names) {
  for (const name of names) {
    await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', [bucket, name]);
  }
}
async function setPhoto(db, product, expected, photo) {
  return (await db.query('SELECT public.set_product_reference_photo($1,$2,$3) AS ok', [product, expected, photo])).rows[0].ok;
}

test('Fotos SQL: productos anteriores y de Excel admiten una referencia común para sus variantes', async t => {
  const db = await database({ through: '011' });
  t.after(() => db.close());
  const id = await createProduct(db);
  const before = (await db.query('SELECT * FROM public.variants WHERE product_id=$1', [id])).rows;
  await db.exec('RESET ROLE');
  await db.exec(migration);
  await db.exec(migration);
  const storage = (await db.query('SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=$1', [bucket])).rows[0];
  assert.equal(storage.public, false);
  assert.equal(Number(storage.file_size_limit), 2 * 1024 * 1024);
  assert.deepEqual(storage.allowed_mime_types, ['image/webp']);
  await session(db, adminId);
  assert.deepEqual((await db.query('SELECT * FROM public.variants WHERE product_id=$1', [id])).rows, before);
  assert.equal((await db.query('SELECT reference_photo_id FROM public.products WHERE id=$1', [id])).rows[0].reference_photo_id, null);

  await db.query('SELECT public.import_catalog($1::jsonb)', [JSON.stringify([
    { ...productData, product_code: 'EXCEL-01', sku: 'EXCEL-M' },
    { ...productData, product_code: 'EXCEL-01', sku: 'EXCEL-L', size: 'L', color: 'Verde' },
  ])]);
  const imported = (await db.query("SELECT id,reference_photo_id FROM public.products WHERE product_code='EXCEL-01'")).rows[0];
  assert.equal(imported.reference_photo_id, null);
  const version = crypto.randomUUID();
  const names = photoNames(imported.id, version);
  await storePhotos(db, [names[0]]);
  await assert.rejects(setPhoto(db, imported.id, null, version), /foto y su miniatura/);
  await storePhotos(db, [names[1]]);
  assert.equal(await setPhoto(db, imported.id, null, version), true);
  assert.deepEqual((await db.query(
    'SELECT v.sku,v.color,p.reference_photo_id FROM public.variants v JOIN public.products p ON p.id=v.product_id WHERE p.id=$1 ORDER BY v.sku',
    [imported.id],
  )).rows, [
    { sku: 'EXCEL-L', color: 'Verde', reference_photo_id: version },
    { sku: 'EXCEL-M', color: 'Negro', reference_photo_id: version },
  ]);
});

test('Fotos SQL: catálogo privado, cambios administrativos y retiro por versión', async t => {
  const db = await database();
  t.after(() => db.close());
  const id = await createProduct(db);
  const first = crypto.randomUUID();
  const replacement = crypto.randomUUID();
  await storePhotos(db, photoNames(id, first));
  await storePhotos(db, photoNames(id, replacement));
  assert.equal(await setPhoto(db, id, null, first), true);

  const visible = async () => (await db.query('SELECT name FROM storage.objects ORDER BY name')).rows.map(row => row.name);
  await session(db, operatorId);
  assert.deepEqual(await visible(), photoNames(id, first));
  await assert.rejects(storePhotos(db, photoNames(id, crypto.randomUUID())), /row-level security/);
  await assert.rejects(setPhoto(db, id, first, null), /administrador/);
  assert.equal((await db.query('DELETE FROM storage.objects RETURNING name')).rows.length, 0);
  for (const [user, role] of [[inactiveId, 'authenticated'], [null, 'anon']]) {
    await session(db, user, role);
    assert.deepEqual(await visible(), []);
    await assert.rejects(setPhoto(db, id, first, null), /autorizado|permission denied/);
  }

  await session(db, adminId);
  await assert.rejects(db.query('UPDATE public.products SET reference_photo_id=NULL WHERE id=$1', [id]), /permission denied/);
  assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [photoNames(id, first)[0]])).rows.length, 0);
  assert.equal(await setPhoto(db, id, first, replacement), true);
  assert.equal(await setPhoto(db, id, first, null), false);
  assert.equal(await setPhoto(db, id, replacement, null), true);
  assert.equal((await db.query('DELETE FROM storage.objects RETURNING name')).rows.length, 4);
});

const { prepareProductPhoto } = load('lib/product-photo-image.ts');
const image = () => sharp({ create: { width: 340, height: 680, channels: 3, background: '#f4b544' } });
test('Fotos servidor: JPG, PNG y WebP generan miniatura proporcional y ampliación', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const input = await image().toFormat(format).toBuffer();
    const processed = await prepareProductPhoto(new File([input], `casaca.${format}`, { type: `image/${format}` }));
    const thumbnail = await sharp(processed.thumbnail).metadata();
    const full = await sharp(processed.full).metadata();
    assert.deepEqual([thumbnail.format, thumbnail.width, thumbnail.height], ['webp', 72, 144]);
    assert.deepEqual([full.format, full.width, full.height], ['webp', 340, 680]);
  }
  await assert.rejects(prepareProductPhoto(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' })), /supera los 2 MB/);
  await assert.rejects(prepareProductPhoto(new File([await image().gif().toBuffer()], 'falsa.jpg', { type: 'image/jpeg' })), /contenido/);
  await assert.rejects(prepareProductPhoto(new File([Uint8Array.of(0xff, 0xd8, 0xff, 0)], 'falsa.jpg', { type: 'image/jpeg' })), /leer la imagen/);
});

test('Fotos servidor: falla al subir una versión, conserva la anterior y permite reintentar', async () => {
  const id = crypto.randomUUID();
  const previous = crypto.randomUUID();
  let current = previous;
  let interrupted = true;
  const files = new Set(photoNames(id, previous));
  const requests = [];
  const supabase = {
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { reference_photo_id: current }, error: null }) }) }) };
    },
    storage: {
      from(name) {
        assert.equal(name, bucket);
        return {
          async upload(path, body, options) {
            assert.ok(body.byteLength > 0);
            assert.equal(options.upsert, false);
            if (interrupted && path.endsWith('/referencia.webp')) return { error: { message: 'interrumpido' } };
            files.add(path);
            return { error: null };
          },
          async remove(paths) {
            for (const path of paths) files.delete(path);
            return { error: null };
          },
        };
      },
    },
    async rpc(name, args) {
      assert.equal(name, 'set_product_reference_photo');
      requests.push(args);
      assert.equal(args.p_expected, current);
      if (args.p_photo) assert.ok(photoNames(id, args.p_photo).every(path => files.has(path)));
      current = args.p_photo;
      return { data: true, error: null };
    },
  };
  const actions = load('lib/product-photo-actions.ts', {
    '@/lib/auth': { requireUser: async () => ({ supabase, role: 'admin' }) },
    'next/cache': { revalidatePath() {} },
  });
  const form = new FormData();
  form.set('foto', new File([await image().png().toBuffer()], 'casaca.png', { type: 'image/png' }));
  assert.equal((await actions.saveProductPhotoAction(id, previous, form)).ok, false);
  assert.equal(requests.length, 0);
  assert.deepEqual([...files], photoNames(id, previous));

  interrupted = false;
  assert.equal((await actions.saveProductPhotoAction(id, previous, form)).ok, true);
  assert.notEqual(current, previous);
  assert.deepEqual([...files], photoNames(id, current));
  assert.equal((await actions.removeProductPhotoAction(id, current)).ok, true);
  assert.equal(current, null);
  assert.equal(files.size, 0);
});

test('Fotos servidor: una respuesta interrumpida conserva los archivos de la referencia que se confirmó', async () => {
  const id = crypto.randomUUID();
  let current = null;
  const deleted = [];
  const supabase = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { reference_photo_id: current }, error: null }) }) }) }),
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      remove: async paths => { deleted.push(...paths); return { error: null }; },
    }) },
    rpc: async (name, args) => {
      current = args.p_photo;
      throw new Error('Conexión interrumpida tras guardar');
    },
  };
  const actions = load('lib/product-photo-actions.ts', {
    '@/lib/auth': { requireUser: async () => ({ supabase, role: 'admin' }) },
    'next/cache': { revalidatePath() {} },
  });
  const form = new FormData();
  form.set('foto', new File([await image().png().toBuffer()], 'casaca.png', { type: 'image/png' }));
  assert.equal((await actions.saveProductPhotoAction(id, null, form)).ok, true);
  assert.ok(current);
  assert.deepEqual(deleted, []);
});
