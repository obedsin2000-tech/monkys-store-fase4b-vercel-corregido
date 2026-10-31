import {requireUser} from '@/lib/auth';
import {PageTitle,Empty,Status} from '@/components/ui';
import {ShipmentManager,type ShippingItem} from '@/components/shipment-manager';
import {dateTime} from '@/lib/types';
import Link from 'next/link';
export default async function Envios(){const {supabase:s}=await requireUser();const [{data:orders,error},{data:ships}]=await Promise.all([
 s.from('orders').select('id,order_number,buyer_name,tiktok_handle,status').in('status',['confirmed','reserved']).order('created_at',{ascending:false}).limit(100),
 s.from('shipments').select('id,order_id,recipient_name,phone,dni,department,province,district,carrier,agency_address,tracking_code,status,updated_at').order('updated_at',{ascending:false}).limit(300)
 ]);
 const byOrder=new Map((ships||[]).map(s=>[s.order_id,s]));const items:ShippingItem[]=(orders||[]).map(o=>({id:o.id,order_number:o.order_number,buyer:o.buyer_name||o.tiktok_handle||'Cliente',order_status:o.status,shipping:byOrder.get(o.id)||null}));
 const printIds=(ships||[]).filter(s=>s.status==='preparing'||s.status==='pending').map(s=>s.order_id).slice(0,30).join(',');
 return <><PageTitle title="Envíos y rótulos" description="Prepara envíos a provincias; registra los datos de la agencia e imprime etiquetas."/>
 {error&&<div className="alert error">Error de lectura: {error.message}</div>}
 <section className="card"><div className="section-title"><h2>Datos del paquete</h2></div>{items.length?<ShipmentManager orders={items}/>:<Empty text="Primero crea un pedido en Ventas."/>}</section>
 <section className="card"><div className="section-title"><h2>Paquetes registrados</h2><div className="action-row">{printIds&&<Link className="btn outline" href={`/envios/rotulos?ids=${encodeURIComponent(printIds)}`} target="_blank">Rótulos pendientes (máx. 30)</Link>}<Link className="btn outline" href="/api/envios/exportar">Exportar CSV para Word</Link></div></div>
 <div className="table-wrap"><table><thead><tr><th>Destinatario</th><th>Provincia</th><th>Agencia</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>{(ships||[]).map(s=><tr key={s.id}><td>{s.recipient_name}</td><td>{s.province}</td><td>{s.carrier==='shalom'?'Shalom':'Otra'}</td><td><Status value={s.status}/></td><td>{dateTime(s.updated_at)}</td></tr>)}</tbody></table></div></section>
 <div className="alert warn">El sistema registra el envío y genera rótulos, pero no reserva envíos ni consulta estados automáticamente en Shalom. Los datos personales deben manejarse de forma restringida.</div>
 </>;
}
