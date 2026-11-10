import Link from 'next/link';
import { ClipboardCheck, ScanBarcode } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { PageTitle, Empty } from '@/components/ui';
import { AvailableStock, OperationCell, OperationLoadError, OperationTable } from '@/components/operation-ui';
import { StockAdjust } from '@/components/stock-adjust';
import { money, dateTime, available, type Variant, type StockMovement } from '@/lib/types';

const availabilityColumns = [
  { label: 'Prenda / SKU' }, { label: 'Talla / color' }, { label: 'Precio', numeric: true },
  { label: 'Disponible', numeric: true }, { label: 'Físico', numeric: true },
  { label: 'Reservado', numeric: true }, { label: 'Mínimo', numeric: true },
];
const movementColumns = [
  { label: 'Prenda / SKU' }, { label: 'Fecha' }, { label: 'Movimiento' },
  { label: 'Unidades', numeric: true }, { label: 'Saldo físico', numeric: true }, { label: 'Motivo' },
];
const movementNames: Record<string, string> = {
  initial: 'Stock inicial', purchase: 'Recepción', sale: 'Venta', adjustment: 'Ajuste', return: 'Devolución',
};

export default async function Inventory() {
  const { supabase: s, role } = await requireUser();
  const { error: expirationError } = await s.rpc('expire_reservations');
  const [{ data: variants, error: variantsError }, { data: movements, error: movementsError }] = await Promise.all([
    s.from('variants').select('*,products(name,product_code)').order('sku').limit(1000),
    s.from('stock_movements').select('id,created_at,movement_type,quantity_delta,balance_after,notes,variants(sku,products(name))').order('created_at', { ascending: false }).limit(100),
  ]);
  const vs = (variants || []) as unknown as Variant[];
  const movs = (movements || []) as unknown as StockMovement[];
  const listed = vs.filter(v => v.active || v.on_hand > 0);
  const worth = vs.reduce((a, v) => a + v.on_hand * v.avg_cost, 0);

  return (
    <>
      <PageTitle title="Kardex e inventario" description="Revisa existencias por SKU y consulta el historial de entradas y salidas.">
        <div className="action-row">
          <Link className="btn primary" href="/inventario/conteos"><ClipboardCheck size={17} aria-hidden="true" /> Iniciar conteo físico</Link>
          <Link className="btn outline" href="/etiquetas"><ScanBarcode size={17} aria-hidden="true" /> Imprimir etiquetas</Link>
        </div>
      </PageTitle>
      {expirationError && <div role="alert" className="alert error">No se pudo actualizar el vencimiento de las reservas. Recarga los datos antes de continuar.</div>}
      {variantsError ? <OperationLoadError title="No se pudo cargar el inventario" href="/inventario" /> : (
        <>
          <div className="kpi-grid three-cards">
            <div className="card mini-kpi"><span>Unidades físicas</span><strong>{vs.reduce((a, v) => a + v.on_hand, 0)}</strong><small className="muted">Existencias registradas</small></div>
            <div className="card mini-kpi"><span>Unidades reservadas</span><strong>{vs.reduce((a, v) => a + v.reserved, 0)}</strong><small className="muted">Apartadas para pedidos</small></div>
            <div className="card mini-kpi"><span>Inventario valorizado</span><strong>{money(worth)}</strong><small className="muted">Valor al costo registrado</small></div>
          </div>
          <section className="card" aria-labelledby="disponibilidad-titulo">
            <div className="section-title">
              <h2 id="disponibilidad-titulo">Disponibilidad por variante</h2>
              <div className="action-row"><span className="muted small">{listed.length} SKU</span><a className="small-link" href="#movimientos-kardex">Ir a movimientos</a></div>
            </div>
            <p className="section-description">El disponible descuenta las unidades reservadas y bloqueadas.</p>
            {listed.length === 0 ? <Empty title="Sin prendas en inventario" text="Las prendas aparecerán cuando se registre el stock inicial o se reciba mercadería." /> : (
              <OperationTable label="Disponibilidad por variante" columns={availabilityColumns}>
                {listed.map(v => (
                  <tr role="row" key={v.id}>
                    <OperationCell label="Prenda / SKU" heading className="cell-product"><strong>{v.products?.name || 'Prenda'}</strong><small className="mono">{v.sku}</small></OperationCell>
                    <OperationCell label="Talla / color">{v.size} · {v.color}</OperationCell>
                    <OperationCell label="Precio" className="money">{money(v.sale_price)}</OperationCell>
                    <OperationCell label="Disponible" className="number"><AvailableStock value={available(v)} minimum={v.min_stock} /></OperationCell>
                    <OperationCell label="Físico" className="number">{v.on_hand}</OperationCell>
                    <OperationCell label="Reservado" className="number">{v.reserved}</OperationCell>
                    <OperationCell label="Mínimo" className="number">{v.min_stock}</OperationCell>
                  </tr>
                ))}
              </OperationTable>
            )}
          </section>
        </>
      )}
      {role === 'admin' && !variantsError && listed.length > 0 && (
        <details className="disclosure"><summary>Ajuste manual de inventario <small>Correcciones justificadas con registro en Kardex</small></summary><StockAdjust variants={listed} /></details>
      )}
      <section className="card" aria-labelledby="movimientos-kardex">
        <div className="section-title"><h2 id="movimientos-kardex">Movimientos de Kardex</h2><span className="muted small">Hasta 100 registros recientes</span></div>
        {movementsError ? <OperationLoadError title="No se pudieron cargar los movimientos" href="/inventario#movimientos-kardex" /> : movs.length === 0 ? (
          <Empty title="Sin movimientos registrados" text="Las recepciones, ventas y ajustes aparecerán aquí." />
        ) : (
          <OperationTable label="Movimientos recientes de Kardex" columns={movementColumns}>
            {movs.map(m => (
              <tr role="row" key={m.id}>
                <OperationCell label="Prenda / SKU" heading className="cell-product"><strong>{m.variants?.products?.name || 'Prenda'}</strong><small className="mono">{m.variants?.sku}</small></OperationCell>
                <OperationCell label="Fecha" className="cell-meta">{dateTime(m.created_at)}</OperationCell>
                <OperationCell label="Movimiento">{movementNames[m.movement_type] || m.movement_type}</OperationCell>
                <OperationCell label="Unidades" className={`number ${m.quantity_delta > 0 ? 'positive' : 'negative'}`}>{m.quantity_delta > 0 ? '+' : ''}{m.quantity_delta}</OperationCell>
                <OperationCell label="Saldo físico" className="number">{m.balance_after}</OperationCell>
                <OperationCell label="Motivo" wide>{m.notes || 'Sin observación'}</OperationCell>
              </tr>
            ))}
          </OperationTable>
        )}
      </section>
    </>
  );
}
