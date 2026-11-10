import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {OperationLoadError,OperationPagination} from '@/components/operation-ui';
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
 {expirationError&&<div role="alert" className="alert error">No se pudo actualizar el vencimiento de las reservas. Recarga la página antes de confirmar un pedido.</div>}
 <section className="card"><div className="section-title"><h2>Pedidos por atender</h2><span className="muted small">{error||customerLookupError?'Consulta interrumpida':`${count||0} ${count===1?'pedido':'pedidos'}`}</span></div>
 <form method="get" className="queue-filters" role="search" aria-label="Buscar pedidos"><label>Buscar comprador o pedido<input name="q" defaultValue={q} placeholder="Nombre, teléfono, TikTok o # de pedido" maxLength={80}/></label><label>Estado del pedido<select name="status" defaultValue={status}><option value="">Todos los estados</option><option value="reserved">Reservado</option><option value="confirmed">Confirmado / pagado</option><option value="cancelled">Cancelado</option><option value="expired">Vencido</option></select></label><input type="hidden" name="page" value="1"/><button className="btn primary">Buscar pedidos</button><Link className="btn outline" href="/pedidos">Limpiar</Link></form>
 {(q||status)&&<div className="filter-summary"><span>Filtros activos</span>{q&&<span className="filter-chip">Búsqueda <strong>{q}</strong></span>}{status&&<Status value={status}/>}</div>}
 {error||customerLookupError?<OperationLoadError title="No se pudo cargar la búsqueda de pedidos" href={link(page)}/>:!orders.length?<Empty title={q||status?'Sin coincidencias':'Sin pedidos por atender'} text={q||status?'Prueba otro nombre o número, cambia el estado o limpia los filtros.':'Los pedidos pendientes de atención aparecerán aquí.'}/>:<div className="orders-list">{orders.map(o=>{
 const discount=(o.order_lines||[]).reduce((sum,line)=>sum+Math.round(Math.max(0,Number(line.catalog_unit_price??line.unit_price)-Number(line.unit_price))*100)*line.quantity,0)/100;
 const shipmentPhone=Array.isArray(o.shipments)?o.shipments[0]?.phone:o.shipments?.phone;const phone=o.customers?.phone||shipmentPhone;
 const orderLink=new URLSearchParams({pedido:o.id});
 const paymentHref=o.status==='reserved'?`/cobros?${orderLink}`:'/cobros';
 const lines=o.order_lines||[];
 return <article className="order-card" key={o.id} aria-label={`Pedido ${o.order_number}`}>
 <div className="order-top">
  <div>
   <span className="order-reference">Pedido #{o.order_number}</span>
   <h3 className="order-buyer">{o.buyer_name||o.customers?.name||o.tiktok_handle||'Cliente registrado'}</h3>
   <div className="order-date"><time dateTime={o.created_at}>{dateTime(o.created_at)}</time><Status value={o.channel}/>{o.buyer_name&&o.tiktok_handle&&<span>{o.tiktok_handle}</span>}</div>
  </div>
  <div className="order-status">
   <div className="status-pair"><small>Pedido</small><Status value={o.status}/></div>
   <div className="status-pair"><small>Pago</small><Status value={o.payment_status}/></div>
   <div className="order-total-block"><small>Total</small><strong className="order-total">{money(o.total)}</strong></div>
  </div>
 </div>
 {lines.length>0&&<details className="order-detail">
  <summary>Ver prendas <span className="muted">({lines.length})</span></summary>
  <ul className="order-lines">{lines.map(l=><li key={l.id}>
   <b>{l.quantity} × {l.variants?.products?.name||'Prenda'}</b>
   <span className="order-line-info">{l.variants?.size} / {l.variants?.color} · <span className="mono">{l.variants?.sku}</span> · {money(l.unit_price)} c/u</span>
  </li>)}</ul>
  {discount>0&&<div className="order-discount"><span>Subtotal {money(Number(o.total)+discount)}</span><strong>Descuento aplicado − {money(discount)}</strong></div>}
 </details>}
 {o.status==='reserved'&&<div className="order-footer">
  <p className="muted small">{o.payment_status==='partial'?'Completa el saldo para confirmar la reserva.':`Reserva vigente hasta ${o.expires_at?dateTime(o.expires_at):'—'}`}</p>
  {o.payment_status==='pending'?<OrderActions id={o.id} status={o.status}/>:<Link className="btn primary compact" href={paymentHref}>Registrar saldo pendiente</Link>}
 </div>}
 <div className="action-row order-links">
  {o.status==='confirmed'&&<Link className="btn primary compact" href={`/envios?${orderLink}`}>Ver envío</Link>}
  <div className="action-row">
   {o.status==='confirmed'&&<WhatsAppLink phone={phone} label="Avisar pago por WhatsApp" message={`Hola ${o.buyer_name||'👋'}, te confirmamos el pago de tu pedido #${o.order_number} por ${money(o.total)}. Estamos preparando tu compra. Gracias por elegir Monky's Store.`}/>}
   <Link className="small-link" href={paymentHref}>{o.status==='reserved'?'Ver cobros del pedido':'Historial de cobros'}</Link>
   {o.status==='confirmed'&&<Link className="small-link" href="/devoluciones">Registrar devolución</Link>}
  </div>
 </div>
 </article>})}</div>}
 {!error&&!customerLookupError&&<OperationPagination page={page} pages={pages} href={link} label="Páginas de pedidos"/>}</section></>;
}
