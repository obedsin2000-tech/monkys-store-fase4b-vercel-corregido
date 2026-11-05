import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {ShipmentManager,type ShippingItem} from '@/components/shipment-manager';
import {ShipmentFollowup} from '@/components/shipment-followup';
import {dateTime} from '@/lib/types';
import Link from 'next/link';

const queuePageSize=50;
const shipmentPageSize=30;
const shipmentStatuses=['pending','preparing','dispatched','delivered'];

export default async function Envios({searchParams}:{searchParams:Promise<{q?:string;page?:string;sq?:string;sestado?:string;spage?:string}>}){
 const {supabase:s,role}=await requireUser();
 const params=await searchParams;
 const q=(params.q||'').trim().replace(/[,%()_*\\]/g,' ').slice(0,80);
 const page=Math.max(1,Number.parseInt(params.page||'1',10)||1);
 const sq=(params.sq||'').trim().replace(/[,%()_*\\]/g,' ').slice(0,80);
 const shipmentStatus=shipmentStatuses.includes(params.sestado||'')?params.sestado!:'';
 const shipmentPage=Math.max(1,Number.parseInt(params.spage||'1',10)||1);

 let customerLookupError:null|Error=null;
 let matchingCustomerIds:string[]=[];
 if(q){
  const {data:matchedCustomers,error}=await s.from('customers').select('id').or(`name.ilike.%${q}%,tiktok_handle.ilike.%${q}%,phone.ilike.%${q}%`).limit(100);
  customerLookupError=error;
  matchingCustomerIds=(matchedCustomers||[]).map(customer=>customer.id);
 }
 const searchFilters=q?[`buyer_name.ilike.%${q}%`,`tiktok_handle.ilike.%${q}%`]:[];
 if(q){
  const numericSearch=q.replace(/^(pedido\s*)?#?\s*/i,'').trim();
  if(/^\d{1,15}$/.test(numericSearch))searchFilters.push(`order_number.eq.${numericSearch}`);
  if(matchingCustomerIds.length)searchFilters.push(`customer_id.in.(${matchingCustomerIds.join(',')})`);
 }
 // Filtra en PostgreSQL antes de contar y paginar. Solo se solicita la columna
 // status de shipments: la lectura directa del DNI sigue bloqueada por 008.
 let orderQuery=s.from('orders').select('id,order_number,buyer_name,tiktok_handle,status,customers(name),sent:shipments(status)',{count:'exact'}).eq('status','confirmed').in('sent.status',['dispatched','delivered']).is('sent',null);
 if(searchFilters.length)orderQuery=orderQuery.or(searchFilters.join(','));
 const {data:orderRows,error:ordersError,count}=await orderQuery.order('created_at',{ascending:false}).order('id').range((page-1)*queuePageSize,page*queuePageSize-1);
 const orders=orderRows||[];
 const orderIds=orders.map(order=>order.id);
 const orderShipmentResult=orderIds.length
  ? await s.from('shipments').select('id,order_id,recipient_name,phone,department,province,district,carrier,agency_address,tracking_code,status,updated_at').in('order_id',orderIds)
  : {data:[],error:null};

 let shipmentQuery=s.from('shipments').select('id,order_id,recipient_name,phone,department,province,district,carrier,agency_address,tracking_code,status,updated_at,orders(order_number)',{count:'exact'});
 if(shipmentStatus)shipmentQuery=shipmentQuery.eq('status',shipmentStatus);
 if(sq)shipmentQuery=shipmentQuery.or(`recipient_name.ilike.%${sq}%,province.ilike.%${sq}%,tracking_code.ilike.%${sq}%`);
 const [{data:ships,error:shipmentsError,count:shipmentCount},{data:pendingPrints,error:pendingPrintError}]=await Promise.all([
  shipmentQuery.order('updated_at',{ascending:false}).range((shipmentPage-1)*shipmentPageSize,shipmentPage*shipmentPageSize-1),
  s.from('shipments').select('order_id,orders!inner(status)').eq('orders.status','confirmed').in('status',['preparing','pending']).order('updated_at',{ascending:false}).limit(30)
 ]);

 let dniLoadFailed=false;
 let orderShipmentRows=(orderShipmentResult.data||[]).map(item=>({...item,dni:null as string|null}));
 if(role==='admin'&&orderShipmentRows.length){
  const {data:dniRows,error:dniError}=await s.rpc('admin_get_shipment_dni',{p_orders:orderShipmentRows.map(item=>item.order_id)});
  const dniByOrder=new Map<string,string|null>((dniRows||[]).map((row:{order_id:string;dni:string|null})=>[row.order_id,row.dni] as const));
  dniLoadFailed=Boolean(dniError)||orderShipmentRows.some(item=>!dniByOrder.has(item.order_id));
  orderShipmentRows=orderShipmentRows.map(item=>({...item,dni:dniByOrder.get(item.order_id)||null}));
 }
 const shipmentByOrder=new Map(orderShipmentRows.map(item=>[item.order_id,item]));
 const items:ShippingItem[]=(orders||[]).map(o=>{
  const linkedCustomerName=Array.isArray(o.customers)?o.customers[0]?.name:(o.customers as unknown as {name:string}|null)?.name;
  return {id:o.id,order_number:o.order_number,buyer:o.buyer_name||linkedCustomerName||o.tiktok_handle||'Cliente',order_status:o.status,shipping:shipmentByOrder.get(o.id)||null};
 });
 const printIds=(pendingPrints||[]).map(item=>item.order_id).join(',');
 const queuePages=Math.max(1,Math.ceil((count||0)/queuePageSize));
 const shipmentPages=Math.max(1,Math.ceil((shipmentCount||0)/shipmentPageSize));
 const queueHref=(p:number)=>`/envios?${new URLSearchParams({...(q?{q}:{}),page:String(p),...(sq?{sq}:{}),...(shipmentStatus?{sestado:shipmentStatus}:{}),spage:String(shipmentPage)})}`;
 const shipmentHref=(p:number)=>`/envios?${new URLSearchParams({...(q?{q}:{}),page:String(page),...(sq?{sq}:{}),...(shipmentStatus?{sestado:shipmentStatus}:{}),spage:String(p)})}`;
 const clearQueueHref=`/envios?${new URLSearchParams({...(sq?{sq}:{}),...(shipmentStatus?{sestado:shipmentStatus}:{}),spage:String(shipmentPage)})}`;
 const clearShipmentsHref=`/envios?${new URLSearchParams({...(q?{q}:{}),page:String(page)})}`;

 return <><PageTitle title="Envíos y rótulos" description="Prepara los paquetes pagados y lleva un control claro de cada despacho."/>
 {(ordersError||shipmentsError||orderShipmentResult.error||customerLookupError||pendingPrintError)&&<div className="alert error">No se pudieron cargar todos los datos de envíos. Actualiza la página y vuelve a intentar.</div>}
 <section className="card"><div className="section-title"><h2>Cola de pedidos para despacho</h2><span className="muted small">{count||0} resultados · Página {page} de {queuePages}</span></div>
 <p className="muted small">Solo pedidos pagados que aún no se despacharon. Los datos guardados se identifican en el selector.</p>
 <form method="get" className="queue-filters"><label>Buscar comprador o pedido<input name="q" defaultValue={q} placeholder="Nombre, teléfono, TikTok o # de pedido" maxLength={80}/></label>
 <input type="hidden" name="page" value="1"/><input type="hidden" name="sq" value={sq}/><input type="hidden" name="sestado" value={shipmentStatus}/><input type="hidden" name="spage" value={shipmentPage}/><button className="btn primary">Filtrar</button><Link className="btn outline" href={clearQueueHref}>Limpiar</Link></form>
 {(ordersError||orderShipmentResult.error||customerLookupError)?<div className="alert error">No se cargó la cola completa. Reintenta antes de preparar un paquete.</div>:dniLoadFailed?<div className="alert error">No se pudieron cargar los datos protegidos del envío. Actualiza la página antes de editar para conservar el DNI guardado.</div>:items.length?<ShipmentManager key={items.map(item=>item.id).join(':')} orders={items} canViewDni={role==='admin'}/>:<Empty text="No se encontraron pedidos para esos filtros."/>}
 <div className="queue-pagination"><Link aria-disabled={page<=1} className={`btn outline ${page<=1?'disabled-link':''}`} href={queueHref(Math.max(1,page-1))}>Anterior</Link><span>Página {page} / {queuePages}</span><Link aria-disabled={page>=queuePages} className={`btn outline ${page>=queuePages?'disabled-link':''}`} href={queueHref(Math.min(queuePages,page+1))}>Siguiente</Link></div></section>

 <section className="card"><div className="section-title"><h2>Paquetes registrados</h2><div className="action-row">{printIds&&<><Link className="btn outline" href={`/envios/rotulos?ids=${encodeURIComponent(printIds)}`} target="_blank">Rótulos pendientes (sin DNI)</Link>{role==='admin'&&<Link className="btn outline" href={`/envios/rotulos?ids=${encodeURIComponent(printIds)}&dni=1`} target="_blank">Rótulos con DNI (admin)</Link>}</>}<Link className="btn outline" href="/api/envios/exportar">CSV para Word (sin DNI)</Link>{role==='admin'&&<Link className="btn outline" href="/api/envios/exportar?dni=1">CSV con DNI (admin)</Link>}</div></div>
 <form method="get" className="queue-filters"><label>Buscar paquete<input name="sq" defaultValue={sq} placeholder="Destinatario, provincia o guía" maxLength={80}/></label><label>Estado del envío<select name="sestado" defaultValue={shipmentStatus}><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="preparing">En preparación</option><option value="dispatched">Despachado</option><option value="delivered">Entregado</option></select></label>
 <input type="hidden" name="spage" value="1"/><input type="hidden" name="q" value={q}/><input type="hidden" name="page" value={page}/><button className="btn primary">Buscar paquetes</button><Link className="btn outline" href={clearShipmentsHref}>Limpiar</Link></form>
 <div className="section-title"><span className="muted small">{shipmentCount||0} paquete(s) · Página {shipmentPage} de {shipmentPages}</span></div>
 {!ships?.length?<Empty text="No se encontraron paquetes con esos filtros."/>:<div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Destinatario</th><th>Provincia</th><th>Agencia</th><th>Estado</th><th>Actualizado</th><th>Acciones</th></tr></thead><tbody>{ships.map(item=><tr key={item.id}><td>#{(item.orders as unknown as {order_number:number}|null)?.order_number||'—'}</td><td>{item.recipient_name}</td><td>{item.province}</td><td>{item.carrier==='shalom'?'Shalom':'Otra'}</td><td><Status value={item.status}/></td><td>{dateTime(item.updated_at)}</td><td><ShipmentFollowup shipment={{...item,order_number:(item.orders as unknown as {order_number:number}|null)?.order_number||0}}/></td></tr>)}</tbody></table></div>}
 <div className="queue-pagination"><Link aria-disabled={shipmentPage<=1} className={`btn outline ${shipmentPage<=1?'disabled-link':''}`} href={shipmentHref(Math.max(1,shipmentPage-1))}>Anterior</Link><span>Página {shipmentPage} / {shipmentPages}</span><Link aria-disabled={shipmentPage>=shipmentPages} className={`btn outline ${shipmentPage>=shipmentPages?'disabled-link':''}`} href={shipmentHref(Math.min(shipmentPages,shipmentPage+1))}>Siguiente</Link></div></section>
 <div className="alert warn">El sistema registra el envío y genera rótulos, pero no reserva envíos ni consulta estados automáticamente en Shalom. Los datos personales deben manejarse de forma restringida.</div>
 </>;
}
