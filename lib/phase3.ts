import {requireUser} from '@/lib/auth';

export const reportSections = ['overview','daily','channels','products','inventory','suppliers'] as const;
export type ReportSection = typeof reportSections[number];
export type Period = {start:string;end:string};
export type Overview = {
 gross_sales:number;confirmed_orders:number;return_value:number;net_sales:number;
 cogs_net:number;gross_profit_estimate:number;payments:number;refunds_paid:number;
 expenses:number;cash_net:number;physical:number;reserved:number;available:number;
 inventory_value:number;low_stock:number;active_reservations:number;
};
export type DayReport = {day:string;gross_sales:number;returns:number;net_sales:number;orders:number;payments:number};
export type ChannelReport = {channel:string;gross_sales:number;returned:number;net_sales:number;orders:number};
export type ProductReport = {sku:string;product:string;size:string;color:string;units:number;gross:number;units_returned:number;returned:number;profit:number;available:number};
export type InventoryReport = {sku:string;product:string;size:string;color:string;active:boolean;physical:number;reserved:number;blocked:number;available:number;min_stock:number;sold_units:number;inventory_value:number;avg_cost:number;low_stock:boolean};
export type SupplierReport = {id:string;name:string;phone:string|null;deliveries:number;total:number;units:number;last_purchase:string|null};
export type ReportData = Overview | DayReport[] | ChannelReport[] | ProductReport[] | InventoryReport[] | SupplierReport[];

export function peruDate(date=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(date);
 const read=(part:string)=>parts.find(x=>x.type===part)?.value||'';
 return `${read('year')}-${read('month')}-${read('day')}`;
}
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function validDate(v:string){
 if(!datePattern.test(v))return false;
 const d=new Date(`${v}T12:00:00Z`);
 return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
}
export function parsePeriod(start?:string,end?:string):Period {
 const current=peruDate();
 const initial=new Date(`${current}T12:00:00Z`);initial.setUTCDate(initial.getUTCDate()-29);
 const fallback=initial.toISOString().slice(0,10);
 const a=start??fallback;const b=end??current;
 if(!validDate(a)||!validDate(b)||a>b)throw Error('Fechas incorrectas. Utiliza el formato AAAA-MM-DD.');
 const days=(new Date(`${b}T12:00:00Z`).getTime()-new Date(`${a}T12:00:00Z`).getTime())/86400000;
 if(days>365||b>current)throw Error('Selecciona hasta 366 días y no utilices fechas futuras.');
 return {start:a,end:b};
}
export function parseSection(s:string):ReportSection{
 if(!reportSections.includes(s as ReportSection))throw Error('Reporte desconocido');
 return s as ReportSection;
}
export async function fetchPhase3Report(section:ReportSection,period:Period):Promise<ReportData>{
 const {supabase,role}=await requireUser();
 if(role!=='admin')throw Error('Los reportes financieros requieren permisos de administrador.');
 const {data,error}=await supabase.rpc('report_phase3',{
  p_start:period.start,p_end:period.end,p_section:section
 });
 if(error)throw Error(`No se pudo cargar el reporte. ${error.message}. Verifica que ejecutaste 003_fase3.sql.`);
 return data as ReportData;
}
export function reportLink(path:string,period:Period){return `${path}?inicio=${period.start}&fin=${period.end}`;}
