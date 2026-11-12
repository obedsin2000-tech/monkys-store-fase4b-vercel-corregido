'use client';

import Link from 'next/link';
import { useState } from 'react';

export type CatalogSelection = { categoria: string; talla: string; color: string };
export type CatalogCategory = { value: string; label: string };

const collator = new Intl.Collator('es-PE', { numeric: true, sensitivity: 'base' });
const clothingSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', '6XL'];
const sizeOrder = new Map(clothingSizes.map((size, index) => [size, index]));

function compareSizes(a: string, b: string) {
  const rank = (size: string) => sizeOrder.get(size.trim().toUpperCase()) ?? clothingSizes.length;
  return rank(a) - rank(b) || collator.compare(a, b);
}

export function CatalogFilters({ q, initial, categories, combinations }: {
  q: string;
  initial: CatalogSelection;
  categories: CatalogCategory[];
  combinations: CatalogSelection[];
}) {
  const [selection, setSelection] = useState(initial);
  const matchingCategory = combinations.filter(row => !selection.categoria || row.categoria === selection.categoria);
  const sizes = new Set(matchingCategory.filter(row => !selection.color || row.color === selection.color).map(row => row.talla));
  const colors = new Set(matchingCategory.filter(row => !selection.talla || row.talla === selection.talla).map(row => row.color));
  if (selection.talla) sizes.add(selection.talla);
  if (selection.color) colors.add(selection.color);

  function selectCategory(categoria: string) {
    const rows = combinations.filter(row => !categoria || row.categoria === categoria);
    const talla = rows.some(row => row.talla === selection.talla) ? selection.talla : '';
    const color = rows.some(row => (!talla || row.talla === talla) && row.color === selection.color) ? selection.color : '';
    setSelection({ categoria, talla, color });
  }

  return (
    <form action="/productos" method="get" className="queue-filters catalog-filters" role="search" aria-label="Buscar en el catálogo">
      <label className="catalog-filter-search">
        Buscar prenda
        <input type="search" name="q" defaultValue={q} placeholder="Nombre o SKU" maxLength={80} />
      </label>
      <label className="catalog-filter-category">
        Categoría
        <select name="categoria" value={selection.categoria} onChange={event => selectCategory(event.target.value)}>
          <option value="">Todas las categorías</option>
          {selection.categoria && !categories.some(category => category.value === selection.categoria) && (
            <option value={selection.categoria}>Categoría seleccionada</option>
          )}
          {categories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
        </select>
      </label>
      <label>
        Talla
        <select name="talla" value={selection.talla} onChange={event => setSelection({ ...selection, talla: event.target.value })}>
          <option value="">Todas</option>
          {[...sizes].filter(Boolean).sort(compareSizes).map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <label>
        Color
        <select name="color" value={selection.color} onChange={event => setSelection({ ...selection, color: event.target.value })}>
          <option value="">Todos</option>
          {[...colors].filter(Boolean).sort(collator.compare).map(color => <option key={color} value={color}>{color}</option>)}
        </select>
      </label>
      <button type="submit" className="btn primary">Buscar</button>
      <Link className="btn outline" href="/productos">Limpiar</Link>
    </form>
  );
}
