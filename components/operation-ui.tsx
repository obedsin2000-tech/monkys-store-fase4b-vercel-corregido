import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

type Column = { label: string; numeric?: boolean };

export function OperationTable({ label, columns, children, className = '' }: {
  label: string; columns: Column[]; children: ReactNode; className?: string;
}) {
  return (
    <div className="table-wrap operation-table-wrap" role="region" aria-label={label} tabIndex={0}>
      <table className={`operation-table ${className}`} role="table">
        <thead role="rowgroup">
          <tr role="row">
            {columns.map(({ label, numeric }) => (
              <th scope="col" role="columnheader" className={numeric ? 'number' : undefined} key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}

export function OperationCell({ label, children, heading = false, wide = false, className = '' }: {
  label: string; children: ReactNode; heading?: boolean; wide?: boolean; className?: string;
}) {
  const content = <><span aria-hidden="true" className="operation-cell-label">{label}</span>{children}</>;
  const classes = `operation-cell${heading ? ' operation-cell-heading' : ''}${wide ? ' operation-cell-wide' : ''} ${className}`;
  return heading
    ? <th scope="row" role="rowheader" className={classes}>{content}</th>
    : <td role="cell" className={classes}>{content}</td>;
}

export function AvailableStock({ value, minimum }: { value: number; minimum: number }) {
  return (
    <span className="available-stock">
      <span className={`stock-number${value <= minimum ? ' warning' : ''}`}>{value}</span>
      {value <= minimum && <span className="stock-caption">{value === 0 ? 'Sin stock libre' : 'Stock bajo'}</span>}
    </span>
  );
}

export function OperationPagination({ page, pages, href, label }: {
  page: number; pages: number; href: (page: number) => string; label: string;
}) {
  if (page === 1 && pages <= 1) return null;
  const previous = <><ChevronLeft size={16} aria-hidden="true" /> Anterior</>;
  const next = <>Siguiente <ChevronRight size={16} aria-hidden="true" /></>;
  return (
    <nav className="queue-pagination" aria-label={label}>
      {page > 1
        ? <Link className="btn outline compact" href={href(Math.min(pages, page - 1))}>{previous}</Link>
        : <button className="btn outline compact" disabled>{previous}</button>}
      <span>Página <b>{page}</b> de {pages}</span>
      {page < pages
        ? <Link className="btn outline compact" href={href(page + 1)}>{next}</Link>
        : <button className="btn outline compact" disabled>{next}</button>}
    </nav>
  );
}

export function OperationLoadError({ title, href, children }: {
  title: string; href: string; children?: ReactNode;
}) {
  return (
    <div className="alert error operation-load-error">
      <div role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <div><strong>{title}</strong><p>{children || 'Comprueba la conexión y vuelve a cargar esta consulta.'}</p></div>
      </div>
      <a className="btn outline compact" href={href}><RotateCw size={15} aria-hidden="true" /> Reintentar</a>
    </div>
  );
}
