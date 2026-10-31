import {PageTitle,Empty} from '@/components/ui';
import {ReportFilters} from '@/components/report-filters';
import {DailyBars} from '@/components/mini-bars';
import {fetchPhase3Report,parsePeriod,type Overview,type DayReport,type ChannelReport,type ProductReport} from '@/lib/phase3';
import {money} from '@/lib/types';
import {requireUser} from '@/lib/auth';

type Props={searchParams:Promise<{inicio?:string;fin?:string}>};
const channels:Record<string,string>={tiktok:'TikTok Live',whatsapp:'WhatsApp',directo:'Venta directa'};
export default async function Reports({searchParams}:Props){
 const {role}=await requireUser();
 if(role!=='admin')return <><PageTitle title="Reportes" description="Solo el administrador puede consultar información financiera."/><div className="alert warn">Tu cuenta no tiene permiso para ver los reportes.</div></>;
 let period;try{const q=await searchParams;period=parsePeriod(q.inicio,q.fin);}catch(e){return <div className="alert error">{e instanceof Error?e.message:'Periodo inválido'}. Regresa a <a href="/reportes">los últimos 30 días</a>.</div>}
 let ov:Overview;let daily:DayReport[],channelsRows:ChannelReport[],products:ProductReport[];
 try{[ov,daily,channelsRows,products]=await Promise.all([
 fetchPhase3Report('overview',period) as Promise<Overview>,fetchPhase3Report('daily',period) as Promise<DayReport[]>,
 fetchPhase3Report('channels',period) as Promise<ChannelReport[]>,fetchPhase3Report('products',period) as Promise<ProductReport[]>
 ]);}catch(e){return <><PageTitle title="Reportes" description="Ventas, rentabilidad y cobros"/><div className="alert error">{e instanceof Error?e.message:'No se pudo cargar el reporte'}</div></>}
 const pct=ov.net_sales!==0?100*ov.gross_profit_estimate/ov.net_sales:null;
 return <><PageTitle title="Reportes de ventas y rentabilidad" description="Información calculada en la base de datos. Los importes se expresan en soles (PEN)."/>
 <ReportFilters period={period} active="/reportes" section="products"/>
 <div className="kpi-grid"><div className="card kpi"><span>Ventas confirmadas</span><strong>{money(ov.gross_sales)}</strong><small>{ov.confirmed_orders} pedidos en el periodo</small></div>
 <div className="card kpi"><span>Ventas netas estimadas</span><strong>{money(ov.net_sales)}</strong><small>Ventas − valor de prendas devueltas</small></div>
 <div className="card kpi"><span>Utilidad bruta estimada</span><strong>{money(ov.gross_profit_estimate)}</strong><small>Margen: {pct===null?'—':`${pct.toFixed(1)}%`}</small></div>
 <div className="card kpi"><span>Dinero realmente cobrado</span><strong>{money(ov.payments)}</strong><small>Incluye adelantos, incluso de otros periodos</small></div></div>
 <div className="kpi-grid three-cards"><div className="card mini-kpi"><span>Valor devuelto en prendas</span><strong>{money(ov.return_value)}</strong></div><div className="card mini-kpi"><span>Reembolsos efectivamente pagados</span><strong>{money(ov.refunds_paid)}</strong></div><div className="card mini-kpi"><span>Gastos registrados</span><strong>{money(ov.expenses)}</strong></div></div>
 <section className="card"><h2>Ventas y cobros diarios</h2><p className="report-note">Las barras comparan ventas confirmadas con cobros efectivamente recibidos; no deben coincidir necesariamente.</p><DailyBars rows={daily}/></section>
 <div className="report-split"><section className="card"><h2>Ventas por canal</h2><div className="table-wrap"><table><thead><tr><th>Canal</th><th>Pedidos</th><th>Ventas</th><th>Devoluciones</th><th>Neto</th></tr></thead><tbody>{channelsRows.map(c=><tr key={c.channel}><td><b>{channels[c.channel]||c.channel}</b></td><td>{c.orders}</td><td>{money(c.gross_sales)}</td><td>{money(c.returned)}</td><td>{money(c.net_sales)}</td></tr>)}</tbody></table></div></section>
 <section className="card"><h2>Interpretación de los indicadores</h2><p className="report-note">La utilidad bruta es una <b>estimación operativa</b>: ventas confirmadas menos devoluciones valorizadas, menos costo histórico de prendas vendidas y más costo de prendas devueltas aptas para venta. No equivale a utilidad neta, utilidad tributaria ni saldo en caja.</p><p className="report-note">Una devolución de una venta antigua puede afectar este periodo. Los cobros y reembolsos se atribuyen a la fecha real del movimiento, no necesariamente a la fecha del pedido.</p></section></div>
 <section className="card"><h2>Prendas con mayores ventas (hasta 200 variantes)</h2>{products.length===0?<Empty text="Aún no hay ventas o devoluciones para este periodo."/>:<div className="table-wrap"><table><thead><tr><th>SKU</th><th>Producto</th><th>Talla / Color</th><th>Vendidas</th><th>Devueltas</th><th>Ventas</th><th>Utilidad bruta estimada</th></tr></thead><tbody>{products.map(p=><tr key={p.sku}><td className="mono">{p.sku}</td><td>{p.product}</td><td>{p.size} / {p.color}</td><td>{p.units}</td><td>{p.units_returned}</td><td>{money(p.gross)}</td><td>{money(p.profit)}</td></tr>)}</tbody></table></div>}</section>
 </>;
}
