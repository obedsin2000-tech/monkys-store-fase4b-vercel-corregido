import {money} from '@/lib/types';
export function DailyBars({rows}:{rows:{day:string;gross_sales:number;net_sales:number;payments:number}[]}){
 const last=rows.slice(-31);const max=Math.max(1,...last.map(x=>Math.max(0,x.gross_sales,x.payments)));
 return <div className="daily-chart" aria-label="Gráfico de ventas y cobros por día">
  <div className="daily-chart-bars">{last.map(row=><div className="daily-chart-col" key={row.day} title={`${row.day} · Ventas ${money(row.gross_sales)} · Cobros ${money(row.payments)}`}>
   <div className="daily-bars-pair"><span className="daily-bar-sales" style={{height:`${Math.max(row.gross_sales>0?2:0,Math.min(100,100*row.gross_sales/max))}%`}}/><span className="daily-bar-cash" style={{height:`${Math.max(row.payments>0?2:0,Math.min(100,100*row.payments/max))}%`}}/></div>
   <small>{row.day.slice(8)}</small></div>)}</div>
  <div className="report-legend"><span><i className="legend-sales"/>Ventas confirmadas</span><span><i className="legend-cash"/>Cobros recibidos</span></div>
 </div>;
}
