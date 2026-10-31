import Link from 'next/link';
import {Download} from 'lucide-react';
import {PrintReport} from '@/components/print-report';
import type {Period,ReportSection} from '@/lib/phase3';
import {reportLink} from '@/lib/phase3';

const tabs=[{url:'/reportes',label:'Ventas y rentabilidad'},{url:'/reportes/inventario',label:'Inventario y rotación'},{url:'/reportes/proveedores',label:'Proveedores'}];
export function ReportFilters({period,active,section}:{period:Period;active:string;section:ReportSection}){
 const query=new URLSearchParams({seccion:section,inicio:period.start,fin:period.end});
 const xlsx=`/api/reportes/exportar?${query.toString()}&formato=xlsx`;
 const csv=`/api/reportes/exportar?${query.toString()}&formato=csv`;
 return <div className="card report-controls">
 <div className="report-tabs">{tabs.map(t=><Link key={t.url} href={reportLink(t.url,period)} className={active===t.url?'chosen':''}>{t.label}</Link>)}</div>
 <form method="GET" className="report-filters-form">
  <label>Desde <input type="date" name="inicio" required defaultValue={period.start}/></label>
  <label>Hasta <input type="date" name="fin" required defaultValue={period.end}/></label>
  <button className="btn primary" type="submit">Aplicar periodo</button>
 </form>
 <div className="report-toolbar"><span>Fechas de Perú (America/Lima). Hasta 366 días.</span><div><a className="btn outline" href={xlsx}><Download size={15}/> Descargar Excel</a><a className="btn outline" href={csv}><Download size={15}/> CSV</a><PrintReport/></div></div>
 </div>;
}
