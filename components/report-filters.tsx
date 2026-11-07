'use client';
import {useState} from 'react';
import {Download} from 'lucide-react';
import {PrintReport} from '@/components/print-report';
import {limaDate,periodLabel,quickPeriods,reportHref,type Period,type ReportMeta,type ReportOptions} from '@/lib/reporting';
import type {ReportSection} from '@/lib/phase3';
const tabs=[{url:'/reportes',label:'Ventas y rentabilidad'},{url:'/reportes/inventario',label:'Inventario y rotación'},{url:'/reportes/proveedores',label:'Proveedores'}];
export function ReportFilters({period,active,section,options={},meta,modern=false}:{period:Period;active:string;section:ReportSection|'detail';options?:ReportOptions;meta?:ReportMeta;modern?:boolean}){
 const choices=section==='detail'?[['detail','Operaciones del indicador']]:active==='/reportes'?[['overview','Resumen de indicadores'],['daily','Ventas y cobros diarios'],['channels','Ventas por canal'],['products','Productos y variantes']]:[[section,section==='inventory'?'Inventario filtrado':'Proveedores filtrados']];
 const [dataset,setDataset]=useState<string>(modern&&active==='/reportes'?'overview':section);const selected=choices.some(([key])=>key===dataset)?dataset:choices[0][0];
 const query=new URLSearchParams(reportHref('',period,{...options,as_of:meta?.as_of||options.as_of}).slice(1));query.set('seccion',selected);if(modern)query.set('version','2');
 return <div className="card report-controls">
 <nav className="report-tabs" aria-label="Tipos de reporte">{tabs.map(t=><a key={t.url} href={reportHref(t.url,period)} aria-current={active===t.url?'page':undefined} className={active===t.url?'chosen':''}>{t.label}</a>)}</nav>
 <div className="report-presets" aria-label="Períodos rápidos">{quickPeriods().map(p=><a key={p.label} href={reportHref(active,p,{...options,as_of:undefined,page:1})} className={p.start===period.start&&p.end===period.end?'chosen':''}>{p.label}</a>)}</div>
 <form method="GET" action={active} className="report-filters-form" key={period.start+period.end+JSON.stringify(options)}>
 {Object.entries({q:options.q,foco:options.focus,orden:options.sort,canal_orden:options.channel_sort,metrica:section==='detail'?options.metric:undefined,canal:options.channel,variante:options.variant,proveedor:options.supplier}).map(([name,value])=>value?<input key={name} type="hidden" name={name} value={value}/>:null)}
 <label>Desde <input type="date" name="inicio" required max={limaDate()} defaultValue={period.start}/></label>
 <label>Hasta <input type="date" name="fin" required max={limaDate()} defaultValue={period.end}/></label>
 <button className="btn primary" type="submit">Aplicar período</button><a className="btn outline" href={active}>Limpiar filtros</a>
 </form>
 <p className="report-active"><strong>{periodLabel(period)}</strong> · Soles (PEN) · America/Lima · Ambos días incluidos, máximo 366 días.</p>
 <div className="report-toolbar"><div>{meta&&<a className="small-link" href={reportHref(active,period,{...options,as_of:undefined,page:1})}>Actualizar datos</a>}<span>Exportar {modern?'todos los registros filtrados':'reporte actual'}:</span></div><div>
 <label className="sr-only" htmlFor="report-dataset">Información a exportar</label><select id="report-dataset" value={selected} onChange={e=>setDataset(e.target.value as ReportSection)}>{choices.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
 <a className="btn outline" href={`/api/reportes/exportar?${query}&formato=xlsx`}><Download size={15}/> Excel</a><a className="btn outline" href={`/api/reportes/exportar?${query}&formato=csv`}>CSV</a><PrintReport/></div></div>
 </div>;
}
