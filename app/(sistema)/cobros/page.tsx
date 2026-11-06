import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {PaymentForm} from '@/components/payment-form';
import {dateTime,money} from '@/lib/types';
export default async function Cobros(){const {supabase:s,role}=await requireUser();
 const [{data:orders,error},{data:payments,error:paymentsError}]=await Promise.all([
  s.from('orders').select('id,order_number,buyer_name,tiktok_handle,total,payment_status,status,payments(amount)').eq('status','reserved').order('created_at',{ascending:false}).limit(100),
  s.from('payments').select('id,amount,method,reference,received_at,orders(order_number,buyer_name)').order('received_at',{ascending:false}).limit(35)
 ]);
 const items=(orders||[]).map(o=>({id:o.id,order_number:o.order_number,buyer:o.buyer_name||o.tiktok_handle||'Comprador',total:Number(o.total),paid:(o.payments||[]).reduce((a:number,p:{amount:number})=>a+Number(p.amount),0),payment_status:o.payment_status}));
 return <><PageTitle title="Cobros y adelantos" description="Registra lo recibido y distingue el importe pagado del saldo pendiente."/>
 <section className="card"><div className="section-title"><h2>Registrar un cobro</h2><span className="muted small">Solo pagos comprobados</span></div><p className="section-description">Al completar el saldo de una reserva, el pedido se confirma automáticamente.</p>
 {error?<div role="alert" className="alert error">No se pudieron cargar las reservas pendientes de cobro. Recupera la conexión y recarga la página.</div>:items.length?<PaymentForm key={items.map(item=>item.id).join(':')} orders={items} canAdmin={role==='admin'}/>:<Empty title="Sin cobros pendientes" text="No hay reservas pendientes de pago en la lista consultada."/>}</section>
 <section className="card"><div className="section-title"><h2>Cobros registrados</h2><span className="muted small">Últimos 35 registros</span></div>
 {paymentsError?<div role="alert" className="alert error">No se pudo cargar el historial de cobros. Recarga la página cuando recuperes la conexión.</div>:!payments?.length?<Empty title="Sin cobros registrados" text="Los cobros verificados aparecerán aquí con su pedido, importe y medio de pago."/>:<div className="table-wrap" tabIndex={0} role="region" aria-label="Historial reciente de cobros"><table><caption className="sr-only">Cobros recibidos por pedido y medio de pago.</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Pedido</th><th scope="col" className="number">Monto recibido</th><th scope="col">Medio</th><th scope="col">N.º de operación</th></tr></thead><tbody>{payments.map(p=><tr key={p.id}><td className="cell-meta">{dateTime(p.received_at)}</td><td><b>#{(p.orders as unknown as {order_number:number}|null)?.order_number||'—'}</b></td><td className="money">{money(p.amount)}</td><td><Status value={p.method}/></td><td className="mono">{p.reference||'Sin referencia'}</td></tr>)}</tbody></table></div>}</section></>;
}
