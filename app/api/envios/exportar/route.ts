import {requireUser} from '@/lib/auth';
function safeCell(value:unknown){const text=String(value??'');const safe=/^[\s]*[=+@\-\t\r]/.test(text)?`'${text}`:text;return `"${safe.replaceAll('"','""')}"`;}
export async function GET(){const {supabase:s}=await requireUser();const {data,error}=await s.from('shipments').select('order_id,recipient_name,phone,dni,department,province,district,carrier,agency_address,tracking_code,status,orders(order_number)').order('updated_at',{ascending:false}).limit(1000);
 if(error)return new Response('Error al exportar',{status:500});const heads=['Pedido','Destinatario','Teléfono','DNI','Departamento','Provincia','Distrito','Empresa','Agencia','Guía','Estado'];
 const lines=(data||[]).map(v=>[String((v.orders as unknown as {order_number:number}|null)?.order_number||''),v.recipient_name,v.phone,v.dni,v.department,v.province,v.district,v.carrier,v.agency_address,v.tracking_code,v.status].map(safeCell).join(';'));
 return new Response('\ufeff'+[heads.map(safeCell).join(';'),...lines].join('\r\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="rotulos_monkys.csv"','cache-control':'no-store'}});
}
