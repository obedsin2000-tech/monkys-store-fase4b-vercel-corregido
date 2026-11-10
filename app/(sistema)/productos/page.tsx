import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageTitle, Empty } from '@/components/ui';
import { AvailableStock, OperationCell, OperationLoadError, OperationPagination, OperationTable } from '@/components/operation-ui';
import { CatalogProductPhoto } from '@/components/catalog-product-photo';
import { ProductForm } from '@/components/product-form';
import { VariantSettings } from '@/components/variant-settings';
import { PRODUCT_PHOTO_MIGRATION } from '@/lib/product-photo';
import { money, available, type Variant, type Product } from '@/lib/types';

const pageSize = 50;
const catalogColumns = [
  { label: 'Prenda / SKU' }, { label: 'Talla' }, { label: 'Color' },
  { label: 'Precio', numeric: true }, { label: 'Disponible', numeric: true },
  { label: 'Físico', numeric: true }, { label: 'Reservado', numeric: true },
];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { supabase: s, role } = await requireUser();
  const params = await searchParams;
  const q = (params.q || '').trim().replace(/[,%()_*\\]/g, ' ').slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);

  function listVariants(includePhoto: boolean) {
    const productFields = includePhoto ? 'name,reference_photo_id' : 'name';
    let query = s.from('variants').select(`*,products(${productFields})`, { count: 'exact' }).eq('active', true).order('sku');
    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`sku.ilike.${pattern},barcode.ilike.${pattern},size.ilike.${pattern},color.ilike.${pattern}`);
    }
    return query.range((page - 1) * pageSize, page * pageSize - 1);
  }

  const [{ data: products, error: productsError }, photoList] = await Promise.all([
    s.from('products').select('id,product_code,name,brand,active,category_id,categories(name)').eq('active', true).order('name').limit(1000),
    listVariants(true),
  ]);
  const photosEnabled = !(
    ['42703', 'PGRST204'].includes(photoList.error?.code ?? '')
    && photoList.error?.message.includes('reference_photo_id')
  );
  const { data: variants, count, error: variantsError } = photosEnabled ? photoList : await listVariants(false);
  const ps = (products || []) as unknown as Product[];
  const vs = (variants || []) as unknown as Variant[];
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/productos?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const admin = role === 'admin';

  return (
    <>
      <PageTitle title="Productos y variantes" description="Consulta precios y disponibilidad por talla y color." />
      {admin && (
        <details className="disclosure">
          <summary>Registrar productos <small>Nuevo producto, talla/color o importación de Excel</small></summary>
          <ProductForm products={ps} photosEnabled={photosEnabled} />
        </details>
      )}
      <section className="card" aria-labelledby="catalogo-titulo">
        <div className="section-title">
          <h2 id="catalogo-titulo">Catálogo de prendas</h2>
          <span className="muted small">{variantsError ? 'Consulta interrumpida' : `${total} ${total === 1 ? 'variante' : 'variantes'}`}</span>
        </div>
        <form method="get" className="queue-filters search-only" role="search" aria-label="Buscar en el catálogo">
          <label>Buscar variante<input name="q" defaultValue={q} placeholder="SKU, talla o color" maxLength={80} /></label>
          <input type="hidden" name="page" value="1" />
          <button className="btn primary">Buscar</button>
          <Link className="btn outline" href="/productos">Limpiar</Link>
        </form>
        {q && (
          <div className="filter-summary">
            <span>Filtro activo</span>
            <span className="filter-chip">Búsqueda: <strong>{q}</strong></span>
          </div>
        )}
        {admin && !photosEnabled && <p className="alert info">Aplica {PRODUCT_PHOTO_MIGRATION} en Supabase para habilitar las fotos de referencia.</p>}
        {variantsError ? (
          <OperationLoadError title="No se pudo cargar el catálogo" href={href(page)} />
        ) : vs.length === 0 ? (
          <Empty
            title={q ? 'Sin coincidencias' : 'Tu catálogo está vacío'}
            text={q ? 'Prueba otro SKU, talla o color, o limpia la búsqueda.' : admin ? 'Abre Registrar productos para añadir una prenda o importar desde Excel.' : 'Las prendas aparecerán aquí cuando se registren en el catálogo.'}
          />
        ) : (
          <OperationTable label="Catálogo de prendas" columns={catalogColumns} className="catalog-products-table">
            {vs.map(v => (
              <tr role="row" key={v.id}>
                <OperationCell label="Prenda / SKU" heading className="cell-product">
                  <CatalogProductPhoto
                    productId={v.product_id}
                    name={v.products?.name ?? 'Prenda'}
                    photoId={v.products?.reference_photo_id ?? null}
                    sku={v.sku}
                    canManage={admin && photosEnabled && Boolean(v.products)}
                  />
                </OperationCell>
                <OperationCell label="Talla">{v.size}</OperationCell>
                <OperationCell label="Color">{v.color}</OperationCell>
                <OperationCell label="Precio" className="money">{money(v.sale_price)}</OperationCell>
                <OperationCell label="Disponible" className="number"><AvailableStock value={available(v)} minimum={v.min_stock} /></OperationCell>
                <OperationCell label="Físico" className="number">{v.on_hand}</OperationCell>
                <OperationCell label="Reservado" className="number">{v.reserved}</OperationCell>
              </tr>
            ))}
          </OperationTable>
        )}
        {!variantsError && <OperationPagination page={page} pages={pages} href={href} label="Páginas del catálogo" />}
      </section>
      {productsError && <div role="alert" className="alert error">No se cargó la lista de productos para el registro. Recarga la página antes de agregar una variante.</div>}
      {admin && (
        <details className="disclosure">
          <summary>Actualizar precio o stock mínimo <small>Editar una variante del catálogo mostrado</small></summary>
          <VariantSettings variants={vs} />
        </details>
      )}
    </>
  );
}
