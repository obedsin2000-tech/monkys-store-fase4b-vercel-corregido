import {requireUser} from '@/lib/auth';
function safeCell(value:unknown){const text=String(value??'');const safe=/^[\s]*[=+@\-\t\r]/.test(text)?`'${text}`:text;return `"${safe.replaceAll('"','""')}"`;}
type ExportRow={order_id:string;recipient_name:string;phone:string;dni?:string|null;department:string|null;province:string;district:string|null;carrier:string;agency_address:string;tracking_code:string|null;status:string;orders:{order_number:number}|null};
export async function GET(request:Request){const {supabase:s,role}=await requireUser();const includeDni=new URL(request.url).searchParams.get('dni')==='1';
 if(includeDni&&role!=='admin')return new Response('Acceso denegado',{status:403});
 const selection=s.from('shipments').select('order_id,recipient_name,phone,department,province,district,carrier,agency_address,tracking_code,status,orders(order_number)').order('updated_at',{ascending:false}).limit(1000);
 const {data,error}=await selection;
 if(error)return new Response('Error al exportar',{status:500});const rows=(data||[]) as unknown as ExportRow[];const heads=['Pedido','Destinatario','Teléfono','DNI','Departamento','Provincia','Distrito','Empresa','Agencia','Guía','Estado'];
 if(includeDni){const ids=rows.map(v=>v.order_id);const {data:dniRows,error:dniError}=await s.rpc('admin_get_shipment_dni',{p_orders:ids});if(dniError)return new Response('No se pudo exportar el DNI autorizado. Verifica que la migración 007 esté aplicada.',{status:503});const dniByOrder=new Map<string,string|null>((dniRows||[]).map((row:{order_id:string;dni:string|null})=>[row.order_id,row.dni] as const));for(const row of rows)row.dni=dniByOrder.get(row.order_id)||null;}
 const columns=includeDni?heads:heads.filter(h=>h!=='DNI');
 const lines=rows.map(v=>{const row=[String(v.orders?.order_number||''),v.recipient_name,v.phone,...(includeDni?[v.dni]:[]),v.department,v.province,v.district,v.carrier,v.agency_address,v.tracking_code,v.status];return row.map(safeCell).join(';');});
 return new Response('\ufeff'+[columns.map(safeCell).join(';'),...lines].join('\r\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="rotulos_monkys${includeDni?'_con_dni':''}.csv"`,'cache-control':'no-store','x-content-type-options':'nosniff'}});
}
