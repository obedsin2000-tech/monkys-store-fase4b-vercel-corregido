import {requireUser} from '@/lib/auth';
import {PrintLabels} from '@/components/print-labels';
export default async function Rotulos({searchParams}:{searchParams:Promise<{ids?:string;dni?:string}>}){
 const {supabase:s,role}=await requireUser();const params=await searchParams;const {ids:raw=''}=params;
 const includeDni=params.dni==='1'&&role==='admin';
 const ids=[...new Set(raw.split(',').filter(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))].slice(0,30);
 if(!ids.length)return <p>Selecciona pedidos desde Envíos.</p>;
 const selection=s.from('shipments').select('order_id,recipient_name,phone,province,department,district,carrier,agency_address,tracking_code,orders(order_number)').in('order_id',ids);
 const {data,error}=await selection;
 if(error)return <p>No se pudieron cargar los rótulos: {error.message}</p>;
 let dniByOrder=new Map<string,string|null>();if(includeDni){const {data:dniRows,error:dniError}=await s.rpc('admin_get_shipment_dni',{p_orders:ids});if(dniError)return <p>No se pudieron cargar los DNI autorizados. Verifica que la migración 007 esté aplicada.</p>;dniByOrder=new Map<string,string|null>((dniRows||[]).map((row:{order_id:string;dni:string|null})=>[row.order_id,row.dni] as const));}
 return <PrintLabels items={(data||[]).map(s=>({...s,dni:includeDni?dniByOrder.get(s.order_id)||null:null,order_number:(s.orders as unknown as {order_number:number}|null)?.order_number||0}))} includeDni={includeDni}/>;
}
