import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PageTitle, Empty, Status } from '@/components/ui';
import { OperationCell, OperationLoadError, OperationTable } from '@/components/operation-ui';
import { PaymentForm } from '@/components/payment-form';
import { dateTime, money } from '@/lib/types';

const paymentColumns = [
  { label: 'Pedido / comprador' }, { label: 'Fecha' },
  { label: 'Monto recibido', numeric: true }, { label: 'Medio' }, { label: 'N.º de operación' },
];

export default async function Cobros({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { supabase: s, role } = await requireUser();
  const { pedido } = await searchParams;
  const [{ data: orders, error }, { data: payments, error: paymentsError }] = await Promise.all([
    s.from('orders').select('id,order_number,buyer_name,tiktok_handle,total,payment_status,status,payments(amount)').eq('status', 'reserved').order('created_at', { ascending: false }).limit(100),
    s.from('payments').select('id,amount,method,reference,received_at,orders(order_number,buyer_name)').order('received_at', { ascending: false }).limit(35),
  ]);
  const items = (orders || []).map(o => ({
    id: o.id, order_number: o.order_number, buyer: o.buyer_name || o.tiktok_handle || 'Comprador',
    total: Number(o.total), paid: (o.payments || []).reduce((a: number, p: { amount: number }) => a + Number(p.amount), 0),
  }));
  const selected = items.find(item => item.id === pedido);
  const visibleItems = selected ? [selected] : items;
  const retryHref = pedido ? `/cobros?${new URLSearchParams({ pedido })}` : '/cobros';

  return (
    <>
      <PageTitle title="Cobros y adelantos" description="Consulta el saldo de una reserva y registra los pagos que ya recibiste.">
        <a className="btn outline" href="#historial-cobros">Ir al historial de cobros</a>
      </PageTitle>
      <section className="card" aria-labelledby="registro-cobro">
        <div className="section-title"><h2 id="registro-cobro">Registrar un cobro</h2><span className="muted small">Solo pagos comprobados</span></div>
        <p className="section-description">Al completar el saldo de una reserva, el pedido se confirma automáticamente.</p>
        {pedido && !error && (
          <div className="operation-context">
            <span>{selected ? <>Pedido seleccionado <strong>#{selected.order_number} · {selected.buyer}</strong></> : 'El pedido seleccionado ya no figura entre las reservas pendientes de esta lista.'}</span>
            <Link className="small-link" href="/cobros">Ver todas las reservas</Link>
          </div>
        )}
        {error ? <OperationLoadError title="No se pudieron cargar las reservas pendientes" href={retryHref} /> : visibleItems.length > 0 ? (
          <PaymentForm key={`${pedido || ''}:${visibleItems.map(item => item.id).join(':')}`} orders={visibleItems} canAdmin={role === 'admin'} selectedOrderId={pedido} />
        ) : <Empty title="Sin cobros pendientes" text="Las reservas con saldo pendiente aparecerán aquí." />}
      </section>
      <section className="card" aria-labelledby="historial-cobros">
        <div className="section-title"><h2 id="historial-cobros">Cobros registrados</h2><span className="muted small">Hasta 35 registros recientes</span></div>
        {paymentsError ? <OperationLoadError title="No se pudo cargar el historial de cobros" href={`${retryHref}#historial-cobros`} /> : !payments?.length ? (
          <Empty title="Sin cobros registrados" text="Los cobros verificados aparecerán aquí con su pedido, importe y medio de pago." />
        ) : (
          <OperationTable label="Historial reciente de cobros" columns={paymentColumns}>
            {payments.map(p => {
              const order = p.orders as unknown as { order_number: number; buyer_name: string | null } | null;
              return (
                <tr role="row" key={p.id}>
                  <OperationCell label="Pedido / comprador" heading>
                    <strong>{order?.order_number ? `Pedido #${order.order_number}` : 'Pedido sin referencia'}</strong>
                    {order?.buyer_name && <small className="cell-meta">{order.buyer_name}</small>}
                  </OperationCell>
                  <OperationCell label="Fecha" className="cell-meta">{dateTime(p.received_at)}</OperationCell>
                  <OperationCell label="Monto recibido" className="money">{money(p.amount)}</OperationCell>
                  <OperationCell label="Medio"><Status value={p.method} /></OperationCell>
                  <OperationCell label="N.º de operación" className="mono">{p.reference || 'Sin referencia'}</OperationCell>
                </tr>
              );
            })}
          </OperationTable>
        )}
      </section>
    </>
  );
}
