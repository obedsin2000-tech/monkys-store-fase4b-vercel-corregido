import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageTitle, Empty } from '@/components/ui';
import { CatalogProductPhoto } from '@/components/catalog-product-photo';
import { ProductForm } from '@/components/product-form';
import { VariantSettings } from '@/components/variant-settings';
import { PRODUCT_PHOTO_MIGRATION } from '@/lib/product-photo';
import { money, available, type Variant, type Product } from '@/lib/types';

const pageSize = 50;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { supabase: s, role } = await requireUser();
  const params = await searchParams;
  const q = (params.q || '').trim().replace(/[,%()_*\\]/g, ' ').slice(0, 80);
  const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);

  function listVariants(includePhoto: boolean) {
    const productFields = includePhoto ? 'name,product_code,reference_photo_id' : 'name,product_code';
    let query = s.from('variants').select(`*,products(${productFields})`, { count: 'exact' }).eq('active', true).order('sku');
    if (q) query = query.or(`sku.ilike.%${q}%,barcode.ilike.%${q}%,size.ilike.%${q}%,color.ilike.%${q}%`);
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
          <span className="muted small">{variantsError ? 'Consulta pendiente' : `${total} variante(s) · Página ${page} de ${pages}`}</span>
        </div>
        <form method="get" className="queue-filters search-only" role="search" aria-label="Buscar en el catálogo">
          <label>Buscar variante<input name="q" defaultValue={q} placeholder="SKU, código de barras, talla o color" maxLength={80} /></label>
          <input type="hidden" name="page" value="1" />
          <button className="btn primary">Buscar</button>
          <Link className="btn outline" href="/productos">Limpiar</Link>
        </form>
        {q && (
          <div className="filter-summary">
            <span>Filtro activo</span>
            <span className="filter-chip">Búsqueda: <strong>{q}</strong></span>
            <Link className="small-link" href="/productos">Quitar filtro</Link>
          </div>
        )}
        {admin && !photosEnabled && <p className="alert info">Aplica {PRODUCT_PHOTO_MIGRATION} en Supabase para habilitar las fotos de referencia.</p>}
        {variantsError ? (
          <div role="alert" className="alert error">No se pudo cargar el catálogo. Vuelve a buscar cuando recuperes la conexión.</div>
        ) : vs.length === 0 ? (
          <Empty
            title={q ? 'Sin coincidencias' : 'Tu catálogo está vacío'}
            text={q ? 'Prueba otro SKU, código, talla o color, o limpia la búsqueda.' : 'Registra tu primera prenda o importa el catálogo desde Excel.'}
          />
        ) : (
          <>
            <p className="catalog-table-scroll-hint small muted">Desliza la tabla para consultar precios y existencias.</p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Catálogo. Desplaza la tabla para ver todas las columnas">
              <table className="catalog-products-table">
                <caption className="sr-only">Productos, variantes, precios y existencias. El disponible descuenta reservas y unidades bloqueadas.</caption>
                <thead>
                  <tr>
                    <th scope="col">Prenda / SKU</th>
                    <th scope="col">Talla</th>
                    <th scope="col">Color</th>
                    <th scope="col" className="number">Precio</th>
                    <th scope="col" className="number">Físico</th>
                    <th scope="col" className="number">Reservado</th>
                    <th scope="col" className="number">Disponible</th>
                    <th scope="col">Código de barras</th>
                  </tr>
                </thead>
                <tbody>
                  {vs.map(v => {
                    const stock = available(v);
                    return (
                      <tr key={v.id}>
                        <td className="cell-product">
                          <CatalogProductPhoto
                            productId={v.product_id}
                            name={v.products?.name ?? 'Prenda'}
                            photoId={v.products?.reference_photo_id ?? null}
                            sku={v.sku}
                            canManage={admin && photosEnabled && Boolean(v.products)}
                          />
                        </td>
                        <td>{v.size}</td>
                        <td>{v.color}</td>
                        <td className="money">{money(v.sale_price)}</td>
                        <td className="number">{v.on_hand}</td>
                        <td className="number">{v.reserved}</td>
                        <td className="number">
                          <span className={`stock-number ${stock <= v.min_stock ? 'warning' : ''}`}>{stock}</span>
                          {stock <= v.min_stock && <span className="stock-caption">{stock === 0 ? 'Sin disponible' : 'Stock bajo'}</span>}
                        </td>
                        <td className="mono cell-meta">{v.barcode || 'Sin código'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        <nav className="queue-pagination" aria-label="Páginas del catálogo">
          <Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={`btn outline ${page <= 1 ? 'disabled-link' : ''}`} href={href(Math.max(1, page - 1))}>Anterior</Link>
          <span>Página {page} de {pages}</span>
          <Link aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={`btn outline ${page >= pages ? 'disabled-link' : ''}`} href={href(Math.min(pages, page + 1))}>Siguiente</Link>
        </nav>
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
