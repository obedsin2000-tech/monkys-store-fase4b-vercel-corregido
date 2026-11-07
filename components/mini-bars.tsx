import {AnalysisChart} from '@/components/analysis-chart';
export function DailyBars({rows}:{rows:{day:string;gross_sales:number;net_sales:number;payments:number;returns?:number;orders?:number}[]}){
 return <AnalysisChart rows={rows.map(r=>({...r,returns:r.returns??0,orders:r.orders??0}))} details={false}/>;
}
