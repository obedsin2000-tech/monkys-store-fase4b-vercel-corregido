import { requireUser } from '@/lib/auth';
import { PageTitle, Empty } from '@/components/ui';
import { AvailableStock, OperationCell, OperationLoadError, OperationPagination, OperationTable } from '@/components/operation-ui';
import { CatalogFilters, type CatalogCategory, type CatalogSelection } from '@/components/catalog-filters';
import { CatalogProductPhoto } from '@/components/catalog-product-photo';
import { CatalogVariantEditor } from '@/components/catalog-variant-editor';
import { ProductForm } from '@/components/product-form';
import { VariantSettings } from '@/components/variant-settings';
import { PRODUCT_PHOTO_MIGRATION } from '@/lib/product-photo';
import { money, available, type Variant, type Product } from '@/lib/types';

const pageSize = 50;
const filterBatchSize = 500;
const noCategory = 'sin-categoria';
const catalogColumns = [
  { label: 'Prenda / SKU' }, { label: 'Talla' }, { label: 'Color' },
  { label: 'Precio', numeric: true }, { label: 'Disponible', numeric: true },
  { label: 'Físico', numeric: true }, { label: 'Reservado', numeric: true },
];

type CatalogParams = Partial<Record<'q' | 'page' | keyof CatalogSelection, string | string[]>>;
type CategoryReference = Pick<Product, 'category_id' | 'categories'>;
type CatalogVariant = Variant & { products?: (CategoryReference & Pick<Product, 'brand'>) | null };
type FilterRow = Pick<Variant, 'size' | 'color'> & { products: CategoryReference | null };

function param(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function categoryName(product?: CategoryReference | null) {
  if (product?.category_id === null) return 'Sin categoría';
  return product?.categories?.name;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<CatalogParams> }) {
  const { supabase: s, role } = await requireUser();
  const admin = role === 'admin';
  const params = await searchParams;
  const q = param(params.q).replace(/[\0*]/g, ' ').slice(0, 80).trim();
  const category = param(params.categoria);
  const selection: CatalogSelection = {
    categoria: category === noCategory || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(category) ? category.toLowerCase() : '',
    talla: param(params.talla),
    color: param(params.color),
  };
  const requestedPage = Number(param(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1_000_000 ? requestedPage : 1;

  function listVariants(includePhoto: boolean) {
    const productFields = 'name,category_id,categories(name)'
      + (includePhoto ? ',reference_photo_id' : '')
      + (admin ? ',product_code,brand' : '');
    const productJoin = selection.categoria ? 'products!inner' : 'products';
    const nameJoin = q ? ',name_match:products()' : '';
    let query = s.from('variants').select(`*,${productJoin}(${productFields})${nameJoin}`, { count: 'exact' }).eq('active', true).order('sku');
    if (selection.categoria === noCategory) query = query.is('products.category_id', null);
    else if (selection.categoria) query = query.eq('products.category_id', selection.categoria);
    if (selection.talla) query = query.eq('size', selection.talla);
    if (selection.color) query = query.eq('color', selection.color);
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      const operand = `"${pattern.replace(/["\\]/g, '\\$&')}"`;
      const variantSearch = ['sku', 'barcode', 'size', 'color'].map(column => `${column}.ilike.${operand}`);
      query = query.ilike('name_match.name', pattern).or([...variantSearch, 'name_match.not.is.null'].join(','));
    }
    return query.range((page - 1) * pageSize, page * pageSize - 1);
  }

  async function loadFilterOptions() {
    const categories = new Map<string, string>();
    const combinations = new Map<string, CatalogSelection>();
    let offset = 0;
    let total = 0;

    do {
      const { data, count, error } = await s.from('variants')
        .select('size,color,products(category_id,categories(name))', { count: offset === 0 ? 'exact' : undefined })
        .eq('active', true)
        .order('id')
        .range(offset, offset + filterBatchSize - 1);
      if (error) return { categories: [], combinations: [], error: true };

      const rows = (data ?? []) as unknown as FilterRow[];
      if (!rows.length) break;
      for (const { size: talla, color, products: product } of rows) {
        const label = categoryName(product);
        const categoria = label ? product?.category_id ?? noCategory : '';
        if (label) categories.set(categoria, label);
        combinations.set(JSON.stringify([categoria, talla, color]), { categoria, talla, color });
      }
      total = count ?? total;
      offset += rows.length;
    } while (offset < total);

    const options: CatalogCategory[] = Array.from(categories, ([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label, 'es-PE'));
    return { categories: options, combinations: Array.from(combinations.values()), error: false };
  }

  const [{ data: products, error: productsError }, photoList, options] = await Promise.all([
    s.from('products').select('id,product_code,name,brand,active,category_id,categories(name)').eq('active', true).order('name').limit(1000),
    listVariants(true),
    loadFilterOptions(),
  ]);
  const photosEnabled = !(
    ['42703', 'PGRST204'].includes(photoList.error?.code ?? '')
    && photoList.error?.message.includes('reference_photo_id')
  );
  const { data: variants, count, error: variantsError } = photosEnabled ? photoList : await listVariants(false);
  const ps = (products || []) as unknown as Product[];
  const vs = (variants || []) as unknown as CatalogVariant[];
  const total = count || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const activeParams = Object.entries({ q, ...selection }).filter(([, value]) => Boolean(value));
  const href = (p: number) => `/productos?${new URLSearchParams([...activeParams, ['page', String(p)]])}`;
  const categoryLabel = options.categories.find(option => option.value === selection.categoria)?.label;
  const activeFilters = [
    ['Búsqueda', q],
    ['Categoría', selection.categoria && (categoryLabel ?? (selection.categoria === noCategory ? 'Sin categoría' : 'Seleccionada'))],
    ['Talla', selection.talla],
    ['Color', selection.color],
  ].filter(([, value]) => Boolean(value));
  const filtered = activeFilters.length > 0;

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
        <CatalogFilters
          key={href(page)}
          q={q}
          initial={selection}
          categories={options.categories}
          combinations={options.combinations}
        />
        {options.error && <p className="alert error" role="alert">No se pudieron cargar las opciones de categoría, talla y color. Puedes buscar por nombre o SKU.</p>}
        {filtered && (
          <div className="filter-summary">
            <span>Filtros aplicados</span>
            {activeFilters.map(([label, value]) => <span key={label} className="filter-chip">{label} <strong>{value}</strong></span>)}
          </div>
        )}
        {admin && !photosEnabled && <p className="alert info">Aplica {PRODUCT_PHOTO_MIGRATION} en Supabase para habilitar las fotos de referencia.</p>}
        {variantsError ? (
          <OperationLoadError title="No se pudo cargar el catálogo" href={href(page)} />
        ) : vs.length === 0 ? (
          <Empty
            title={filtered ? 'Sin coincidencias' : 'Tu catálogo está vacío'}
            text={filtered ? 'Cambia la búsqueda o limpia los filtros para ver más prendas.' : admin ? 'Abre Registrar productos para añadir una prenda o importar desde Excel.' : 'Las prendas aparecerán aquí cuando se registren en el catálogo.'}
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
                    category={categoryName(v.products)}
                    canManage={admin && photosEnabled && Boolean(v.products)}
                  >
                    {admin && (
                      <CatalogVariantEditor
                        name={v.products?.name ?? 'Prenda'}
                        variant={{ id: v.id, sku: v.sku, size: v.size, color: v.color }}
                        product={v.products ? {
                          product_code: v.products.product_code,
                          name: v.products.name,
                          category: v.products.categories?.name ?? '',
                          brand: v.products.brand ?? '',
                        } : undefined}
                      />
                    )}
                  </CatalogProductPhoto>
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
