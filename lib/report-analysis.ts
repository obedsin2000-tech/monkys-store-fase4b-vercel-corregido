import {cache} from 'react';
import {z} from 'zod';
import {requireReportUser,parsePeriod} from '@/lib/phase3';
import {reportMetrics,type AnalysisBundle,type Period,type ReportOptions,type ReportTab} from '@/lib/reporting';
export type ReportQuery=Record<string,string|string[]|undefined>;
export class ReportMigrationRequired extends Error{constructor(){super('Aplica 011_reportes_analisis.sql en Supabase para activar los nuevos análisis y detalles.');}}
export class ReportAccessDenied extends Error{constructor(){super('Los reportes financieros requieren permisos de administrador.');}}
export function parseReportRequest(tab:ReportTab|'detail',query:ReportQuery){
 const one=(name:string)=>{const value=query[name];return Array.isArray(value)?value[0]:value;};
 const period=parsePeriod(one('inicio'),one('fin'));
 const sorts=tab==='sales'?['sales','units','profit','discounts','returns']:tab==='inventory'?['low_stock','units','value','sku']:tab==='suppliers'?['purchases','deliveries','units','name']:['newest','oldest','amount_desc','amount_asc'];
 const schema=z.object({q:z.string().trim().max(80).default(''),focus:z.enum(['all','low_stock','no_sales']).default('all'),
  channel_sort:z.enum(['gross_sales','orders','returned','net_sales','profit','discounts']).default('gross_sales'),sort:z.string().refine(v=>sorts.includes(v),'Orden de consulta inválido').optional(),page:z.coerce.number().int().min(1).max(100000).default(1),
  as_of:z.string().datetime({offset:true}).optional(),metric:z.enum(reportMetrics).default('sales'),
  channel:z.enum(['tiktok','whatsapp','directo']).optional(),variant:z.string().uuid().optional(),
  supplier:z.union([z.string().uuid(),z.literal('unassigned')]).optional()});
 const options=schema.parse({q:one('q'),focus:one('foco'),sort:one('orden'),channel_sort:one('canal_orden'),page:one('pagina'),as_of:one('corte'),metric:one('metrica'),channel:one('canal'),variant:one('variante'),supplier:one('proveedor')});
 if(tab!=='detail'&&(options.channel||options.variant||options.supplier))throw Error('Utiliza los filtros de operación desde el detalle del indicador.');
 return {period,options:options as ReportOptions};
}
function validateBundle(value:unknown,tab:string):asserts value is AnalysisBundle{
 const b=value as AnalysisBundle;
 if(!b||b.version!==2||b.tab!==tab||!b.meta?.as_of||!b.meta.generated_at||!b.meta.start||!b.meta.end)throw Error('El reporte no devolvió información completa. Actualiza la página.');
 const required=tab==='sales'?['gross_sales','confirmed_orders','return_value','net_sales','cogs_net','gross_profit_estimate','payments','refunds_paid','expenses','cash_net','discounts','unknown_discount_lines']:tab==='inventory'?['physical','reserved','blocked','available','sold_units','inventory_value','low_stock','no_sales']:tab==='suppliers'?['purchases','deliveries','units']:[];
 if(required.some(key=>!Number.isFinite(b.current?.[key])))throw Error('Faltan indicadores en la consulta; no se mostrarán como cero.');
 const page=tab==='sales'?b.products:tab==='inventory'?b.stock:tab==='suppliers'?b.suppliers:b.detail;
 if(!page||!Array.isArray(page.rows)||!Number.isFinite(page.count))throw Error('No se pudo comprobar la lista del reporte.');
 if(tab==='sales'&&(!Array.isArray(b.daily)||b.daily.length!==b.meta.days||!Array.isArray(b.channels)||!b.previous||required.some(key=>!Number.isFinite(b.previous?.[key]))))throw Error('Faltan series o comparaciones del reporte.');
}
const loadAnalysis=cache(async(tab:ReportTab|'detail',start:string,end:string,serializedOptions:string)=>{
 const {supabase,role}=await requireReportUser();if(role!=='admin')throw new ReportAccessDenied();
 const {data,error}=await supabase.rpc('report_analysis',{p_start:start,p_end:end,p_tab:tab,p_options:JSON.parse(serializedOptions)});
 if(error){if(error.code==='PGRST202')throw new ReportMigrationRequired();console.error('[report_analysis]',{code:error.code||'connection'});throw Error(error.code==='P0001'?error.message:'No se pudo cargar el análisis. Revisa la conexión y vuelve a intentar.');}
 validateBundle(data,tab);return data;
});
export function fetchAnalysis(tab:ReportTab|'detail',period:Period,options:ReportOptions={}){return loadAnalysis(tab,period.start,period.end,JSON.stringify(options));}
