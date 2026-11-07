import {PageTitle,Empty} from '@/components/ui';
import {ReportFilters} from '@/components/report-filters';
import {fetchPhase3Report,parsePeriod,type InventoryReport,type Overview} from '@/lib/phase3';
import {money} from '@/lib/types';
import {requireReportUser as requireUser} from '@/lib/phase3';
type Props={searchParams:Promise<{inicio?:string;fin?:string}>};
export default async function LegacyInventory({searchParams}:Props){
 const {role}=await requireUser();if(role!=='admin')return <><PageTitle title="Informe de inventario" description="Solo administradores."/><div className="alert warn">Acceso no autorizado.</div></>;
 let period;try{const p=await searchParams;period=parsePeriod(p.inicio,p.fin)}catch(e){return <div className="alert error">{e instanceof Error?e.message:'Fechas inválidas'}. <a href="/reportes/inventario">Ver últimos 30 días</a></div>}
 let all:InventoryReport[],o:Overview;
 try{[all,o]=await Promise.all([fetchPhase3Report('inventory',period) as Promise<InventoryReport[]>,fetchPhase3Report('overview',period) as Promise<Overview>])}catch(e){return <div className="alert error">{e instanceof Error?e.message:'Error al consultar el inventario'}</div>}
 return <><PageTitle title="Inventario y rotación" description="Disponibilidad actual y unidades vendidas durante el periodo seleccionado."/><ReportFilters period={period} active="/reportes/inventario" section="inventory"/>
 <div className="kpi-grid"><div className="card kpi"><span>Stock físico</span><strong>{o.physical}</strong></div><div className="card kpi"><span>Disponible para vender</span><strong>{o.available}</strong></div><div className="card kpi"><span>Stock bajo</span><strong>{o.low_stock}</strong><small>Variantes activas bajo su mínimo</small></div><div className="card kpi"><span>Inventario valorizado</span><strong>{money(o.inventory_value)}</strong><small>Stock físico × costo promedio</small></div></div>
 <section className="card"><h2>Rotación aproximada por SKU</h2><p className="report-note">Las unidades vendidas corresponden al periodo elegido; la disponibilidad y valorización corresponden al momento actual. No es rotación contable promedio histórica.</p>
 {all.length===0?<Empty text="Aún no hay variantes registradas."/>:<div className="table-wrap"><table><thead><tr><th>SKU</th><th>Producto</th><th>Variante</th><th>Físico</th><th>Reservado</th><th>Bloqueado</th><th>Disponible</th><th>Mínimo</th><th>Vendidas</th><th>Valor stock</th></tr></thead><tbody>{all.map(p=><tr key={p.sku}><td className="mono">{p.sku}</td><td>{p.product}{!p.active?' (Inactivo)':''}</td><td>{p.size} / {p.color}</td><td>{p.physical}</td><td>{p.reserved}</td><td>{p.blocked}</td><td><span className={p.low_stock?'negative':'positive'}>{p.available}</span></td><td>{p.min_stock}</td><td>{p.sold_units}</td><td>{money(p.inventory_value)}</td></tr>)}</tbody></table></div>}
 <p className="report-note">Se muestran hasta 500 SKU, priorizando los que tienen stock bajo. Los indicadores superiores incluyen todas las variantes.</p></section></>
}
