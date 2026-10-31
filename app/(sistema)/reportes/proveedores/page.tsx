import {PageTitle,Empty} from '@/components/ui';
import {ReportFilters} from '@/components/report-filters';
import {fetchPhase3Report,parsePeriod,type SupplierReport} from '@/lib/phase3';
import {money,dateTime} from '@/lib/types';
import {requireUser} from '@/lib/auth';
type Props={searchParams:Promise<{inicio?:string;fin?:string}>};
export default async function SupplierReports({searchParams}:Props){
 const {role}=await requireUser();if(role!=='admin')return <><PageTitle title="Reporte de proveedores" description="Solo administradores."/><div className="alert warn">Acceso no autorizado.</div></>;
 let period;try{const p=await searchParams;period=parsePeriod(p.inicio,p.fin)}catch(e){return <div className="alert error">{e instanceof Error?e.message:'Fechas inválidas'}. <a href="/reportes/proveedores">Ver últimos 30 días</a></div>}
 let rows:SupplierReport[];try{rows=await fetchPhase3Report('suppliers',period) as SupplierReport[]}catch(e){return <div className="alert error">{e instanceof Error?e.message:'No se pudo consultar los proveedores'}</div>}
 return <><PageTitle title="Análisis de proveedores" description="Comparación de compras recibidas en el periodo seleccionado."/><ReportFilters period={period} active="/reportes/proveedores" section="suppliers"/>
 <section className="card"><h2>Historial por proveedor</h2><p className="report-note">Los importes corresponden a compras recibidas, no necesariamente pagadas. Proveedores sin compras en el periodo también pueden aparecer.</p>
 {rows.length===0?<Empty text="Todavía no hay proveedores registrados."/>:<div className="table-wrap"><table><thead><tr><th>Proveedor</th><th>Teléfono</th><th>Recepciones</th><th>Unidades</th><th>Total comprado</th><th>Última recepción en el periodo</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.name}</b></td><td>{r.phone||'—'}</td><td>{r.deliveries}</td><td>{r.units}</td><td>{money(r.total)}</td><td>{r.last_purchase?dateTime(r.last_purchase):'Sin compras'}</td></tr>)}</tbody></table></div>}
 <p className="report-note">Se muestran hasta 200 proveedores. Puedes gestionar y registrar nuevos proveedores desde Compras.</p></section></>
}
