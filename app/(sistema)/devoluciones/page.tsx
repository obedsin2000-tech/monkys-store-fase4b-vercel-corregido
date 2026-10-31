import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {ReturnForm,type ReturnOrder} from '@/components/return-form';
import {PendingRefunds} from '@/components/pending-refunds';
import {dateTime,money} from '@/lib/types';
export default async function Devoluciones(){const {supabase:s,role}=await requireUser();const [{data:orders,error},{data:returns}]=await Promise.all([
 s.from('orders').select('id,order_number,buyer_name,tiktok_handle,order_lines(id,quantity,unit_price,variants(sku,products(name)),return_lines(quantity))').eq('status','confirmed').order('created_at',{ascending:false}).limit(100),
 s.from('returns').select('id,created_at,total_value,refund_amount,reason,orders(order_number)').order('created_at',{ascending:false}).limit(40)
 ]);
 const items:ReturnOrder[]=(orders||[]).map(o=>({id:o.id,number:o.order_number,buyer:o.buyer_name||o.tiktok_handle||'Cliente',lines:(o.order_lines||[]).map(l=>({id:l.id,sku:(l.variants as unknown as {sku:string}|null)?.sku||'',name:(l.variants as unknown as {products:{name:string}}|null)?.products?.name||'Prenda',quantity:l.quantity,already_returned:(l.return_lines||[]).reduce((n:number,r:{quantity:number})=>n+r.quantity,0),unit_price:Number(l.unit_price)}))}));
 return <><PageTitle title="Devoluciones y cambios" description="Recepciona prendas y registra reembolsos sin perder trazabilidad en el Kardex."/>
 {error&&<div className="alert error">Error: {error.message}</div>}
 {role==='admin'?<section className="card"><h2>Nueva devolución</h2>{items.length?<ReturnForm orders={items}/>:<Empty text="Primero registra una venta confirmada."/>}</section>:<div className="alert warn">Solo el administrador puede autorizar devoluciones.</div>}
 {role==='admin'&&<PendingRefunds returns={(returns||[]).filter(r=>Number(r.total_value)>Number(r.refund_amount)).map(r=>({id:r.id,order_number:(r.orders as unknown as {order_number:number}|null)?.order_number||0,reason:r.reason,pending:Number(r.total_value)-Number(r.refund_amount)}))}/>}
 <section className="card"><h2>Historial de devoluciones</h2><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Valor devuelto</th><th>Dinero reembolsado</th><th>Motivo</th></tr></thead><tbody>{(returns||[]).map(r=><tr key={r.id}><td>{dateTime(r.created_at)}</td><td>#{(r.orders as unknown as {order_number:number}|null)?.order_number}</td><td>{money(r.total_value)}</td><td>{money(r.refund_amount)}</td><td>{r.reason}</td></tr>)}</tbody></table></div></section></>;
}
