import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {PaymentForm} from '@/components/payment-form';
import {dateTime,money} from '@/lib/types';
export default async function Cobros(){const {supabase:s,role}=await requireUser();
 const [{data:orders,error},{data:payments}]=await Promise.all([
 s.from('orders').select('id,order_number,buyer_name,tiktok_handle,total,payment_status,status,payments(amount)').eq('status','reserved').order('created_at',{ascending:false}).limit(100),
 s.from('payments').select('id,amount,method,reference,received_at,orders(order_number,buyer_name)').order('received_at',{ascending:false}).limit(35)
 ]);
 const items=(orders||[]).map(o=>({id:o.id,order_number:o.order_number,buyer:o.buyer_name||o.tiktok_handle||'Comprador',total:Number(o.total),paid:(o.payments||[]).reduce((a:number,p:{amount:number})=>a+Number(p.amount),0),payment_status:o.payment_status}));
 return <><PageTitle title="Cobros y adelantos" description="Registra pagos parciales de pedidos reservados; al completar el total se confirma automáticamente la venta."/>
 {error&&<div className="alert error">Error: {error.message}. ¿Ejecutaste 002_fase2.sql?</div>}
 <section className="card"><h2>Registrar un cobro</h2>{items.length?<PaymentForm key={items.map(item=>item.id).join(':')} orders={items} canAdmin={role==='admin'}/>:<Empty text="No hay pedidos reservados pendientes de cobro."/>}</section>
 <section className="card"><h2>Últimos cobros registrados</h2><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Monto</th><th>Medio</th><th>Referencia</th></tr></thead><tbody>{(payments||[]).map(p=><tr key={p.id}><td>{dateTime(p.received_at)}</td><td>#{(p.orders as unknown as {order_number:number}|null)?.order_number||'—'}</td><td>{money(p.amount)}</td><td><Status value={p.method}/></td><td>{p.reference||'—'}</td></tr>)}</tbody></table></div></section></>;
}
