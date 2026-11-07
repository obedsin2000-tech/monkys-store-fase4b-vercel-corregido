'use client';
import {useId,useRef,useState} from 'react';
import {money} from '@/lib/types';
import {groupReportSeries,periodLabel,reportHref,type SeriesRow} from '@/lib/reporting';
export function AnalysisChart({rows,asOf,details=true}:{rows:SeriesRow[];asOf?:string;details?:boolean}){
 const {mode,buckets}=groupReportSeries(rows);const [selected,setSelected]=useState(0);const refs=useRef<(SVGGElement|null)[]>([]);const id=useId();
 if(!buckets.length)return <p className="alert warn">La serie no está disponible. No se interpreta como días sin actividad.</p>;
 const index=Math.min(selected,buckets.length-1),b=buckets[index];const max=Math.max(1,...buckets.flatMap(r=>[r.sales,r.payments]));const magnitude=10**Math.floor(Math.log10(max));const upper=Math.ceil(max/magnitude)*magnitude;const width=960,left=86,right=18,top=16,bottom=260,step=(width-left-right)/buckets.length;const bar=Math.min(18,step*.32);const y=(n:number)=>bottom-(bottom-top)*n/upper;
 function choose(i:number,focus=false){const next=Math.max(0,Math.min(buckets.length-1,i));setSelected(next);if(focus)refs.current[next]?.focus();}
 return <div className="analysis-chart">
 <div className="report-legend"><span><i className="legend-sales"/>Ventas confirmadas</span><span><i className="legend-cash"/>Cobros recibidos</span><span>{mode==='day'?'Agrupación diaria':mode==='week'?'Intervalos de hasta 7 días':'Agrupación mensual'}</span></div>
 <p id={`${id}-help`} className="report-note chart-help">Toca una barra o usa Tab y las flechas para consultar importes exactos. La base del gráfico es cero.</p>
 <div className="chart-scroll"><svg viewBox={`0 0 ${width} 314`} className="report-chart-svg" role="group" aria-label="Ventas confirmadas y cobros recibidos en soles" aria-describedby={`${id}-help`}>
 {[0,1,2,3,4].map(i=>{const v=upper*i/4;return <g key={i}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} className="chart-grid"/><text x={left-12} y={y(v)+4} textAnchor="end" className="chart-axis">{money(v)}</text></g>})}
 {buckets.map((r,i)=>{const x=left+step*(i+.5);return <g key={r.start} ref={el=>{refs.current[i]=el;}} tabIndex={i===index?0:-1} role="button" aria-label={`${periodLabel(r)}. Ventas ${money(r.sales)}. Cobros ${money(r.payments)}. Seleccionar intervalo`} aria-pressed={i===index} onFocus={()=>choose(i)} onMouseEnter={()=>choose(i)} onClick={()=>choose(i)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key)){e.preventDefault();choose(e.key==='Home'?0:e.key==='End'?buckets.length-1:e.key==='ArrowLeft'?i-1:e.key==='ArrowRight'?i+1:i,true);}}}>
 <rect x={x-step*.48} y={top} width={step*.96} height={bottom-top} rx="3" className={i===index?'chart-hit selected':'chart-hit'}/>
 <rect x={x-bar-1} y={y(r.sales)} width={bar} height={bottom-y(r.sales)} className="chart-sales"/>
 <rect x={x+1} y={y(r.payments)} width={bar} height={bottom-y(r.payments)} className="chart-payments"/>
 {(i===0||i===buckets.length-1||i%Math.ceil(buckets.length/8)===0)&&<text x={x} y={bottom+22} textAnchor="middle" className="chart-axis">{r.label}</text>}</g>})}
 </svg></div>
 <div className="chart-selection" aria-live="polite"><strong>{periodLabel(b)}</strong><span>Ventas <b>{money(b.sales)}</b></span><span>Cobros <b>{money(b.payments)}</b></span>{b.sales===0&&b.payments===0&&<span>Sin ventas confirmadas ni cobros en este intervalo.</span>}
 {details&&<div className="action-row"><a className="small-link" href={reportHref('/reportes/detalle',b,{metric:'sales',as_of:asOf})}>Ver ventas del intervalo →</a><a className="small-link" href={reportHref('/reportes/detalle',b,{metric:'payments',as_of:asOf})}>Ver cobros del intervalo →</a></div>}</div>
 <details className="report-table-alternative"><summary>Consultar todos los valores del gráfico</summary><div className="table-wrap"><table><caption className="sr-only">Importes por intervalo, en soles</caption><thead><tr><th>Intervalo</th><th className="number">Ventas</th><th className="number">Cobros</th></tr></thead><tbody>{buckets.map(r=><tr key={r.start}><th scope="row">{periodLabel(r)}</th><td className="number">{money(r.sales)}</td><td className="number">{money(r.payments)}</td></tr>)}</tbody></table></div></details>
 </div>;
}
