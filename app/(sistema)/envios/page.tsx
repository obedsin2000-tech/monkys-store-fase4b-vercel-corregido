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

 return <><PageTitle title="Envíos y rótulos" description="Completa los datos de cada paquete y continúa con su preparación y despacho."/>
 <section className="card" aria-labelledby="cola-titulo"><div className="section-title"><h2 id="cola-titulo">Cola de pedidos para despacho</h2><span className="muted small">{ordersError||customerLookupError?'Consulta pendiente':`${count||0} pendientes · Página ${page} de ${queuePages}`}</span></div>
 <p className="section-description">Solo pedidos pagados que aún no se despacharon. Los datos guardados se identifican en cada pedido.</p>
 <form method="get" className="queue-filters search-only" role="search" aria-label="Buscar pedidos por despachar"><label>Buscar comprador o pedido<input name="q" defaultValue={q} placeholder="Nombre, teléfono, TikTok o # de pedido" maxLength={80}/></label><input type="hidden" name="page" value="1"/><input type="hidden" name="sq" value={sq}/><input type="hidden" name="sestado" value={shipmentStatus}/><input type="hidden" name="spage" value={shipmentPage}/><button className="btn primary">Buscar pedidos</button><Link className="btn outline" href={clearQueueHref}>Limpiar</Link></form>
 {q&&<div className="filter-summary"><span>Filtro activo</span><span className="filter-chip">Búsqueda: <strong>{q}</strong></span><Link className="small-link" href={clearQueueHref}>Quitar filtro</Link></div>}
 {(ordersError||orderShipmentResult.error||customerLookupError)?<div role="alert" className="alert error">No se cargó la cola de pedidos. Recupera la conexión y vuelve a buscar antes de preparar un paquete.</div>:dniLoadFailed?<div role="alert" className="alert error">No se pudieron cargar los datos protegidos del envío. Actualiza la página antes de editar para conservar el DNI guardado.</div>:items.length?<ShipmentManager key={items.map(item=>item.id).join(':')} orders={items} canViewDni={role==='admin'}/>:<Empty title={q?'Sin coincidencias':'Sin pedidos por despachar'} text={q?'Prueba otro nombre o número, o limpia la búsqueda.':'Los pedidos confirmados aparecerán aquí mientras estén pendientes de despacho.'}/>}
 <nav className="queue-pagination" aria-label="Páginas de la cola de despacho"><Link aria-disabled={page<=1} tabIndex={page<=1?-1:undefined} className={`btn outline ${page<=1?'disabled-link':''}`} href={queueHref(Math.max(1,page-1))}>Anterior</Link><span>Página {page} de {queuePages}</span><Link aria-disabled={page>=queuePages} tabIndex={page>=queuePages?-1:undefined} className={`btn outline ${page>=queuePages?'disabled-link':''}`} href={queueHref(Math.min(queuePages,page+1))}>Siguiente</Link></nav></section>
 <section className="card" aria-labelledby="paquetes-titulo"><div className="section-title"><h2 id="paquetes-titulo">Paquetes registrados</h2>{printIds&&<Link className="btn outline" href={`/envios/rotulos?ids=${encodeURIComponent(printIds)}`} target="_blank">Imprimir rótulos pendientes</Link>}</div>
 <p className="section-description">Consulta datos guardados, seguimiento y acciones de los paquetes registrados.</p>
 <form method="get" className="queue-filters" role="search" aria-label="Buscar paquetes registrados"><label>Buscar paquete<input name="sq" defaultValue={sq} placeholder="Destinatario, provincia o guía" maxLength={80}/></label><label>Estado del despacho<select name="sestado" defaultValue={shipmentStatus}><option value="">Todos los estados</option><option value="pending">Pendiente</option><option value="preparing">En preparación</option><option value="dispatched">Despachado</option><option value="delivered">Entregado</option></select></label>
 <input type="hidden" name="spage" value="1"/><input type="hidden" name="q" value={q}/><input type="hidden" name="page" value={page}/><button className="btn primary">Buscar paquetes</button><Link className="btn outline" href={clearShipmentsHref}>Limpiar</Link></form>
 {(sq||shipmentStatus)&&<div className="filter-summary"><span>Filtros activos</span>{sq&&<span className="filter-chip">Búsqueda: <strong>{sq}</strong></span>}{shipmentStatus&&<Status value={shipmentStatus}/>}<Link className="small-link" href={clearShipmentsHref}>Quitar filtros</Link></div>}
 <div className="section-title"><span className="muted small">{shipmentsError?'Consulta pendiente':`${shipmentCount||0} paquete(s) · Página ${shipmentPage} de ${shipmentPages}`}</span></div>
 {shipmentsError?<div role="alert" className="alert error">No se pudieron cargar los paquetes registrados. Recupera la conexión y vuelve a buscar.</div>:!ships?.length?<Empty title={sq||shipmentStatus?'Sin coincidencias':'Sin paquetes registrados'} text={sq||shipmentStatus?'Cambia la búsqueda o el estado, o limpia los filtros.':'Guarda los datos de un envío desde la cola para que aparezca aquí.'}/>:<div className="table-wrap" tabIndex={0} role="region" aria-label="Paquetes registrados y seguimiento"><table><caption className="sr-only">Cada fila corresponde al envío guardado de un pedido. Datos del destinatario y estado del despacho se muestran por separado.</caption><thead><tr><th scope="col">Pedido</th><th scope="col">Destinatario</th><th scope="col">Destino</th><th scope="col">Datos</th><th scope="col">Despacho</th><th scope="col">Actualización</th><th scope="col">Acciones</th></tr></thead><tbody>{ships.map(item=><tr key={item.id}><td><b>#{(item.orders as unknown as {order_number:number}|null)?.order_number||'—'}</b></td><td className="cell-product"><strong>{item.recipient_name}</strong><small>{item.phone}</small></td><td className="cell-product"><strong>{item.province}</strong><small>{item.carrier==='shalom'?'Shalom':'Otra agencia'}{item.tracking_code?` · ${item.tracking_code}`:''}</small></td><td><span className="pill green">Guardados</span></td><td><Status value={item.status}/></td><td className="cell-meta">{dateTime(item.updated_at)}</td><td className="shipment-actions"><ShipmentFollowup shipment={{...item,order_number:(item.orders as unknown as {order_number:number}|null)?.order_number||0}}/></td></tr>)}</tbody></table></div>}
 <nav className="queue-pagination" aria-label="Páginas de paquetes registrados"><Link aria-disabled={shipmentPage<=1} tabIndex={shipmentPage<=1?-1:undefined} className={`btn outline ${shipmentPage<=1?'disabled-link':''}`} href={shipmentHref(Math.max(1,shipmentPage-1))}>Anterior</Link><span>Página {shipmentPage} de {shipmentPages}</span><Link aria-disabled={shipmentPage>=shipmentPages} tabIndex={shipmentPage>=shipmentPages?-1:undefined} className={`btn outline ${shipmentPage>=shipmentPages?'disabled-link':''}`} href={shipmentHref(Math.min(shipmentPages,shipmentPage+1))}>Siguiente</Link></nav>
 {pendingPrintError&&<div role="alert" className="alert error">No se pudo consultar la lista de rótulos pendientes. Recarga la página antes de imprimir el lote.</div>}
 <details className="disclosure export-options"><summary>Exportación y opciones de rótulos <small>CSV para Word y rótulos con DNI autorizado</small></summary><div className="action-row" style={{padding:16}}><Link className="btn outline" href="/api/envios/exportar">Descargar CSV sin DNI</Link>{role==='admin'&&<><Link className="btn outline" href="/api/envios/exportar?dni=1">CSV con DNI (admin)</Link>{printIds&&<Link className="btn outline" href={`/envios/rotulos?ids=${encodeURIComponent(printIds)}&dni=1`} target="_blank">Rótulos con DNI (admin)</Link>}</>}</div></details></section>
 <p className="muted small">El seguimiento se actualiza manualmente. Marca “Despachado” al entregar el paquete a la agencia y “Entregado” cuando lo reciba el destinatario.</p>
 </>;
}
