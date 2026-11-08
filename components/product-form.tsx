'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { createProductAction, addVariantAction, importExcelAction } from '@/lib/actions';
import { saveProductPhotoAction } from '@/lib/product-photo-actions';
import { productPhotoFileError } from '@/lib/product-photo';
import { ReferencePhotoInput } from '@/components/reference-photo-input';
import { ResultMessage } from '@/components/ui';
import type { ActionResult, Product } from '@/lib/types';

const initial = {
  product_code: '', name: '', category: '', brand: '', sku: '', size: 'M', color: 'Negro',
  sale_price: '', cost: '', initial_stock: '0', min_stock: '2',
};
const modes = [
  ['new', 'Nuevo producto'],
  ['variant', 'Agregar talla/color'],
  ['import', 'Importar Excel'],
] as const;

export function ProductForm({ products, photosEnabled }: { products: Product[]; photosEnabled: boolean }) {
  const [mode, setMode] = useState<'new' | 'variant' | 'import'>('new');
  const [values, setValues] = useState(initial);
  const [productId, setProductId] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoFailure, setPhotoFailure] = useState<{ error: string; sku: string } | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const selectedPhoto = mode === 'new' && photosEnabled ? photo : null;
  const photoError = selectedPhoto ? productPhotoFileError(selectedPhoto) : null;

  function change(key: keyof typeof initial, value: string) {
    setValues(previous => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || photoError) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    setPhotoFailure(null);

    const data = {
      ...values,
      sale_price: Number(values.sale_price),
      cost: Number(values.cost || 0),
      initial_stock: Number(values.initial_stock),
      min_stock: Number(values.min_stock),
    };

    try {
      const created = mode === 'new'
        ? await createProductAction(data)
        : await addVariantAction({
          product_id: productId,
          sku: data.sku,
          size: data.size,
          color: data.color,
          sale_price: data.sale_price,
          cost: data.cost,
          initial_stock: data.initial_stock,
          min_stock: data.min_stock,
        });
      setResult(created);
      if (!created.ok) return;

      setValues(initial);
      if (selectedPhoto) {
        try {
          if (!created.id) throw new Error('No se recibió el identificador del producto.');
          const formData = new FormData();
          formData.set('foto', selectedPhoto);
          const saved = await saveProductPhotoAction(created.id, null, formData);
          if (saved.ok) {
            setResult({ ...created, message: 'Producto, variante y foto de referencia guardados.' });
          } else {
            setPhotoFailure({ error: saved.error, sku: data.sku });
          }
        } catch {
          setPhotoFailure({ error: 'No se pudo confirmar la carga de la foto.', sku: data.sku });
        } finally {
          setPhoto(null);
        }
      }
    } catch {
      setResult({ ok: false, error: 'No se pudo confirmar el registro. Revisa el SKU en el catálogo antes de volver a guardar.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const imported = await importExcelAction(new FormData(form));
      setResult(imported);
      if (imported.ok) form.reset();
    } catch {
      setResult({ ok: false, error: 'No se pudo confirmar la importación. Revisa el catálogo antes de repetirla.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-title"><h2>Registro de productos</h2><span className="muted small">Administrador</span></div>
      <div className="tabs" role="group" aria-label="Tipo de registro de producto">
        {modes.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            className={mode === key ? 'selected' : ''}
            disabled={busy}
            onClick={() => { setMode(key); setResult(null); setPhotoFailure(null); }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'import' ? (
        <form onSubmit={importFile} className="form-stack">
          <p className="muted small">Solo archivos .xlsx. Usa estos encabezados en orden.</p>
          <code className="code-hint">codigo_producto, nombre, categoria, sku, talla, color, costo, precio, stock_inicial, stock_minimo</code>
          <p className="muted small">Se permiten hasta 500 filas nuevas. La importación es atómica. Puedes añadir las fotos después desde el catálogo.</p>
          <label>Archivo Excel<input type="file" name="archivo" accept=".xlsx" required disabled={busy} /></label>
          <button className="btn primary" disabled={busy}>{busy ? 'Validando…' : 'Importar catálogo y stock'}</button>
        </form>
      ) : (
        <form onSubmit={submit} className="form-stack" aria-busy={busy}>
          <fieldset disabled={busy} className="form-section">
            <p className="required-note">* Campos obligatorios</p>
            {mode === 'new' ? (
              <div className="grid two">
                <label>Código de producto *<input required maxLength={40} value={values.product_code} onChange={e => change('product_code', e.target.value)} placeholder="CAS-001" /></label>
                <label>Nombre *<input required value={values.name} onChange={e => change('name', e.target.value)} placeholder="Casaca táctica" /></label>
                <label>Categoría<input value={values.category} onChange={e => change('category', e.target.value)} placeholder="Casacas" /></label>
                <label>Marca (opcional)<input value={values.brand} onChange={e => change('brand', e.target.value)} placeholder="Marca" /></label>
              </div>
            ) : (
              <label>
                Producto existente *
                <select required value={productId} onChange={e => setProductId(e.target.value)}>
                  <option value="">Seleccionar producto</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}
                </select>
              </label>
            )}
            <div className="grid three">
              <label>SKU único *<input required value={values.sku} onChange={e => change('sku', e.target.value)} placeholder="CAS-001-NG-M" /></label>
              <label>Talla *<input required value={values.size} onChange={e => change('size', e.target.value)} /></label>
              <label>Color *<input required value={values.color} onChange={e => change('color', e.target.value)} /></label>
            </div>
            <div className="grid four">
              <label>Precio de venta (S/) *<input required type="number" min="0" step="0.01" value={values.sale_price} onChange={e => change('sale_price', e.target.value)} /></label>
              <label>Costo inicial (S/) *<input required type="number" min="0" step="0.01" value={values.cost} onChange={e => change('cost', e.target.value)} /></label>
              <label>Stock inicial *<input required type="number" min="0" step="1" value={values.initial_stock} onChange={e => change('initial_stock', e.target.value)} /></label>
              <label>Stock mínimo *<input required type="number" min="0" step="1" value={values.min_stock} onChange={e => change('min_stock', e.target.value)} /></label>
            </div>
            {mode === 'new' && photosEnabled && <ReferencePhotoInput file={photo} onChange={setPhoto} optional disabled={busy} />}
            <p className="muted small">El stock inicial se registrará en Kardex. Para reponer mercadería, utiliza Compras.</p>
          </fieldset>
          <button disabled={busy || Boolean(photoError)} className="btn primary">
            {busy ? (result?.ok && selectedPhoto ? 'Subiendo foto…' : 'Guardando…') : mode === 'new' ? 'Crear producto' : 'Agregar variante'}
          </button>
        </form>
      )}
      <ResultMessage result={photoFailure ? null : result} />
      {photoFailure && (
        <div role="alert" className="alert warn product-photo-partial">
          <div>
            <strong>El producto se guardó. La foto quedó pendiente.</strong>
            <p>{photoFailure.error}</p>
            <Link className="small-link" href={`/productos?${new URLSearchParams({ q: photoFailure.sku })}`}>
              Buscar {photoFailure.sku} para gestionar su foto
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
