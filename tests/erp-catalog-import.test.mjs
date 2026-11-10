import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { adminId, database, session } from './helpers/database.mjs';
import { load } from './helpers/components.mjs';

test('Importación: guarda el código del producto, el SKU y el código de barras por separado', async () => {
  const db = await database();
  try {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Importar');
    sheet.addRow(['Codigo_producto', 'Nombre', 'Categoria', 'Sku', 'Talla', 'Color', 'Costo', 'Precio', 'Stock_inicial', 'Stock_minimo']);
    sheet.addRow(['CAS-01', 'Casaca de prueba', 'Casacas', 'CAS-01-M-NEG', 'M', 'Negro', 50, 80, 2, 1]);
    sheet.addRow(['CAS-01', 'Casaca de prueba', 'Casacas', 'CAS-01-L-NEG', 'L', 'Negro', 50, 80, 3, 1]);

    const supabase = {
      async rpc(name, { p_rows }) {
        assert.equal(name, 'import_catalog');
        const { rows } = await db.query('SELECT public.import_catalog($1::jsonb) AS count', [JSON.stringify(p_rows)]);
        return { data: rows[0].count, error: null };
      },
    };
    const { importExcelAction } = load('lib/actions.ts', {
      '@/lib/auth': { requireUser: async () => ({ supabase, role: 'admin' }) },
      'next/cache': { revalidatePath() {} },
    });
    const form = new FormData();
    form.set('archivo', new File([await book.xlsx.writeBuffer()], 'inventario.xlsx'));
    const result = await importExcelAction(form);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.count, 2);

    const { rows } = await db.query(`
      SELECT p.product_code, v.sku, v.barcode, v.on_hand
      FROM public.variants v JOIN public.products p ON p.id=v.product_id
      ORDER BY v.sku
    `);
    assert.deepEqual(rows.map(({ product_code, sku, on_hand }) => ({ product_code, sku, on_hand })), [
      { product_code: 'CAS-01', sku: 'CAS-01-L-NEG', on_hand: 3 },
      { product_code: 'CAS-01', sku: 'CAS-01-M-NEG', on_hand: 2 },
    ]);
    assert.ok(rows.every(row => /^MK[0-9]{10}$/.test(row.barcode)));
    assert.equal(new Set(rows.map(row => row.barcode)).size, 2);
  } finally {
    await db.close();
  }
});

test('Importación: revierte el archivo completo si una regla de la base sobrescribe un SKU', async () => {
  const db = await database();
  try {
    await db.exec(`
      RESET ROLE;
      CREATE FUNCTION public.test_rewrite_sku() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.sku = 'PRUEBA-02-M' THEN NEW.sku := NEW.barcode; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER test_rewrite_sku BEFORE INSERT ON public.variants
      FOR EACH ROW EXECUTE FUNCTION public.test_rewrite_sku();
    `);
    await session(db, adminId);
    const rows = [
      { product_code: 'PRUEBA-01', name: 'Casaca primera', sku: 'PRUEBA-01-M', sale_price: 80, initial_stock: 2 },
      { product_code: 'PRUEBA-02', name: 'Casaca segunda', sku: 'PRUEBA-02-M', sale_price: 90, initial_stock: 1 },
    ];
    await assert.rejects(
      db.query('SELECT public.import_catalog($1::jsonb)', [JSON.stringify(rows)]),
      /Fila 2: el SKU o el código de producto guardado difiere del Excel/,
    );
    const { rows: counts } = await db.query(`
      SELECT (SELECT count(*)::int FROM public.products) AS products,
             (SELECT count(*)::int FROM public.variants) AS variants,
             (SELECT count(*)::int FROM public.stock_movements) AS movements
    `);
    assert.deepEqual(counts, [{ products: 0, variants: 0, movements: 0 }]);
  } finally {
    await db.close();
  }
});
