import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {OrderActions} from '@/components/order-actions';
import {WhatsAppLink} from '@/components/whatsapp-link';
import {money,dateTime,type Order} from '@/lib/types';
const pageSize=50;
export default async function Orders({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string}>}){const {supabase:s}=await requireUser();const {error:expirationError}=await s.rpc('expire_reservations');
 const params=await searchParams;const q=(params.q||'').trim().replace(/[,%()_*\\]/g,' ').slice(0,80);const status=['reserved','confirmed','cancelled','expired'].includes(params.status||'')?params.status!:'';const page=Math.max(1,Number.parseInt(params.page||'1',10)||1);
 let request=s.from('orders').select('id,order_number,buyer_name,tiktok_handle,channel,status,payment_status,payment_method,total,created_at,expires_at,customer_id,customers(name,phone),shipments(phone),delivered_shipments:shipments(status),order_lines(*,variants(sku,size,color,products(name)))',{count:'exact'});
 request=request.eq('delivered_shipments.status','delivered').is('delivered_shipments',null);
 let customerLookupError:Error|null=null;
 if(status)request=request.eq('status',status);
 if(q){
  const {data:customers,error}=await s.from('customers').select('id').or(`name.ilike.%${q}%,tiktok_handle.ilike.%${q}%,phone.ilike.%${q}%`).limit(1000);
  customerLookupError=error;
  const filters=[`buyer_name.ilike.%${q}%`,`tiktok_handle.ilike.%${q}%`];
  const number=q.replace(/^(pedido\s*)?#?\s*/i,'').trim();
  if(/^\d{1,15}$/.test(number))filters.push(`order_number.eq.${number}`);
  if(customers?.length)filters.push(`customer_id.in.(${customers.map(customer=>customer.id).join(',')})`);
  request=request.or(filters.join(','));
 }
 const {data,error,count}=await request.order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
 const orders=(data||[]) as unknown as Order[];
 const pages=Math.max(1,Math.ceil((count||0)/pageSize));const link=(p:number)=>`/pedidos?${new URLSearchParams({...(q?{q}:{}),...(status?{status}:{}),page:String(p)})}`;
 return <><PageTitle title="Pedidos y reservas" description="Identifica al comprador, revisa el pago y atiende lo pendiente."/>
 {(error||customerLookupError||expirationError)&&<div role="alert" className="alert error">No se pudo completar la búsqueda de pedidos. Actualiza la página y vuelve a intentar.</div>}
 <section className="card"><div className="section-title"><h2>Pedidos por atender</h2><span className="muted small">{error||customerLookupError?'Consulta pendiente':`${count||0} resultado(s) · Página ${page} de ${pages}`}</span></div>
 <form method="get" className="queue-filters" role="search" aria-label="Buscar pedidos"><label>Buscar comprador o pedido<input name="q" defaultValue={q} placeholder="Nombre, teléfono, TikTok o # de pedido" maxLength={80}/></label><label>Estado del pedido<select name="status" defaultValue={status}><option value="">Todos los estados</option><option value="reserved">Reservado</option><option value="confirmed">Confirmado / pagado</option><option value="cancelled">Cancelado</option><option value="expired">Vencido</option></select></label><input type="hidden" name="page" value="1"/><button className="btn primary">Buscar pedidos</button><Link className="btn outline" href="/pedidos">Limpiar</Link></form>
 {(q||status)&&<div className="filter-summary"><span>Filtros activos</span>{q&&<span className="filter-chip">Búsqueda: <strong>{q}</strong></span>}{status&&<Status value={status}/>}<Link className="small-link" href="/pedidos">Quitar filtros</Link></div>}
 {error||customerLookupError?null:!orders.length?<Empty title={q||status?'Sin coincidencias':'Sin pedidos por atender'} text={q||status?'Prueba otro nombre o número, cambia el estado o limpia los filtros.':'Los nuevos pedidos aparecerán aquí. Los entregados quedan fuera de esta lista.'}/>:<div className="orders-list">{orders.map(o=>{
 const discount=(o.order_lines||[]).reduce((sum,line)=>sum+Math.round(Math.max(0,Number(line.catalog_unit_price??line.unit_price)-Number(line.unit_price))*100)*line.quantity,0)/100;
 const shipmentPhone=Array.isArray(o.shipments)?o.shipments[0]?.phone:o.shipments?.phone;const phone=o.customers?.phone||shipmentPhone;
 return <article className="order-card" key={o.id} aria-label={`Pedido ${o.order_number}`}>
 <div className="order-top"><div><span className="order-reference">Pedido #{o.order_number}</span><p className="order-buyer">{o.buyer_name||o.customers?.name||o.tiktok_handle||'Cliente registrado'}</p><div className="order-date">{dateTime(o.created_at)} · <Status value={o.channel}/>{o.buyer_name&&o.tiktok_handle?` · ${o.tiktok_handle}`:''}</div></div>
 <div className="order-status"><div className="status-pair"><small>Pedido</small><Status value={o.status}/></div><div className="status-pair"><small>Pago</small><Status value={o.payment_status}/></div><strong className="order-total">{money(o.total)}</strong></div></div>
 <div className="order-lines">{o.order_lines?.map(l=><div key={l.id}><b>{l.quantity} ×</b> {l.variants?.products?.name||'Prenda'} <span className="muted">· {l.variants?.size} / {l.variants?.color} · <span className="mono">{l.variants?.sku}</span> · {money(l.unit_price)} c/u</span></div>)}</div>
 {discount>0&&<div className="order-discount"><span>Subtotal {money(Number(o.total)+discount)}</span><strong>Descuento aplicado − {money(discount)}</strong></div>}
 {o.status==='reserved'&&<div className="order-footer"><p className="muted small">{o.payment_status==='partial'?'Tiene un adelanto. Completa el saldo en Cobros para confirmar el pedido.':`Reserva vigente hasta ${o.expires_at?dateTime(o.expires_at):'—'}`}</p>{o.payment_status==='pending'?<OrderActions id={o.id} status={o.status}/>:<Link className="btn primary compact" href="/cobros">Registrar saldo pendiente</Link>}</div>}
 <div className="action-row order-links">{o.status==='confirmed'&&<WhatsAppLink phone={phone} label="Avisar pago por WhatsApp" message={`Hola ${o.buyer_name||'👋'}, te confirmamos el pago de tu pedido #${o.order_number} por ${money(o.total)}. Estamos preparando tu compra. Gracias por elegir Monky's Store.`}/>}<Link className="small-link" href="/cobros">Ver cobros</Link><Link className="small-link" href="/envios">Ver envío</Link>{o.status==='confirmed'&&<Link className="small-link" href="/devoluciones">Registrar devolución</Link>}</div>
 </article>})}</div>}
 <nav className="queue-pagination" aria-label="Páginas de pedidos"><Link aria-disabled={page<=1} tabIndex={page<=1?-1:undefined} className={`btn outline ${page<=1?'disabled-link':''}`} href={link(Math.max(1,page-1))}>Anterior</Link><span>Página {page} de {pages}</span><Link aria-disabled={page>=pages} tabIndex={page>=pages?-1:undefined} className={`btn outline ${page>=pages?'disabled-link':''}`} href={link(Math.min(pages,page+1))}>Siguiente</Link></nav></section></>;
}
