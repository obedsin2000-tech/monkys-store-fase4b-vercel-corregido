import Link from 'next/link';
import {ShoppingCart,Boxes,Clock3,AlertTriangle,PackagePlus,ArrowRight,TrendingUp} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {PageTitle,Status,Empty} from '@/components/ui';
import {money,dateTime,type Order} from '@/lib/types';
import {peruDate,type Overview} from '@/lib/phase3';
export default async function Panel(){
 const {supabase:s,role}=await requireUser();await s.rpc('expire_reservations');
 const [{data:metrics,error:statsErr},{data:orders}]=await Promise.all([
  s.rpc('dashboard_stats'),
  s.from('orders').select('id,order_number,buyer_name,tiktok_handle,channel,status,payment_status,total,created_at,expires_at,customer_id,payment_method').order('created_at',{ascending:false}).limit(6)
 ]);
 const end=peruDate();const first=new Date(`${end}T12:00:00Z`);first.setUTCDate(first.getUTCDate()-29);
 const start=first.toISOString().slice(0,10);
 const leadership=role==='admin'?await s.rpc('report_phase3',{p_start:start,p_end:end,p_section:'overview'}):null;
 const boss=(leadership?.data||null) as Overview|null;
 const m=(metrics||{}) as {sales_today?:number;sales_count?:number;active_reservations?:number;low_stock?:number;units?:number;available?:number};
 const cards=[{label:'Ventas de hoy',value:money(m.sales_today),hint:`${m.sales_count||0} operaciones confirmadas`,Icon:TrendingUp,tone:'green'},
 {label:'Unidades disponibles',value:String(m.available??0),hint:`${m.units||0} unidades físicas`,Icon:Boxes,tone:'blue'},
 {label:'Reservas activas',value:String(m.active_reservations??0),hint:'Pedidos pendientes de pago',Icon:Clock3,tone:'orange'},
 {label:'Variantes con stock bajo',value:String(m.low_stock??0),hint:'Stock menor o igual al mínimo',Icon:AlertTriangle,tone:'red'}];
 return <><PageTitle title="Panel de control" description="Resumen de operaciones de Monky’s Store"/>
 {statsErr&&<div className="alert error">No se pudieron cargar los indicadores: {statsErr.message}</div>}
 <div className="kpi-grid">{cards.map(({label,value,hint,Icon,tone})=><div className="kpi card" key={label}><div className="kpi-top"><span>{label}</span><span className={`icon-pad ${tone}`}><Icon size={19}/></span></div><strong>{value}</strong><small>{hint}</small></div>)}</div>
 {role==='admin'&&<section className="card"><div className="section-title"><h2>Resumen gerencial · últimos 30 días</h2><Link className="small-link" href="/reportes">Análisis completo <ArrowRight size={15}/></Link></div>
 {leadership?.error?<div className="alert warn">Para activar los reportes de Fase 3, ejecuta 003_fase3.sql en Supabase.</div>:<div className="grid three"><div className="mini-kpi"><span>Cobros recibidos</span><strong>{money(boss?.payments)}</strong></div><div className="mini-kpi"><span>Utilidad bruta estimada</span><strong>{money(boss?.gross_profit_estimate)}</strong></div><div className="mini-kpi"><span>Inventario valorizado</span><strong>{money(boss?.inventory_value)}</strong></div></div>}
 </section>}
 <div className="card quick-actions"><h2>Accesos rápidos</h2><div className="quick-grid"><Link href="/ventas" className="quick-link"><ShoppingCart size={22}/><span>Nueva venta</span><ArrowRight size={16}/></Link><Link href="/productos" className="quick-link"><Boxes size={22}/><span>Productos</span><ArrowRight size={16}/></Link><Link href="/compras" className="quick-link"><PackagePlus size={22}/><span>Recibir mercadería</span><ArrowRight size={16}/></Link>{role==='admin'&&<Link href="/reportes" className="quick-link"><TrendingUp size={22}/><span>Reportes</span><ArrowRight size={16}/></Link>}</div></div>
 <section className="card"><div className="section-title"><h2>Operaciones recientes</h2><Link className="small-link" href="/pedidos">Ver pedidos <ArrowRight size={15}/></Link></div>
 {!orders?.length?<Empty text="Aún no hay operaciones. Comienza registrando tus productos."/>:<div className="table-wrap"><table><thead><tr><th>Número</th><th>Comprador</th><th>Canal</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead><tbody>{(orders as Order[]).map(o=><tr key={o.id}><td><b>#{o.order_number}</b></td><td>{o.buyer_name||o.tiktok_handle||'Cliente registrado'}</td><td>{o.channel}</td><td><Status value={o.status}/></td><td>{money(o.total)}</td><td>{dateTime(o.created_at)}</td></tr>)}</tbody></table></div>}
 </section></>;
}
