import {requireUser} from '@/lib/auth';
import {PrintLabels} from '@/components/print-labels';
export default async function Rotulos({searchParams}:{searchParams:Promise<{ids?:string;dni?:string}>}){
 const {supabase:s,role}=await requireUser();const params=await searchParams;const {ids:raw=''}=params;
 const includeDni=params.dni==='1'&&role==='admin';
 const ids=[...new Set(raw.split(',').filter(x=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x)))].slice(0,30);
 if(!ids.length)return <p>Selecciona pedidos desde Envíos.</p>;
 const selection=includeDni?s.from('shipments').select('order_id,recipient_name,phone,dni,province,department,district,carrier,agency_address,tracking_code,orders(order_number)').in('order_id',ids):s.from('shipments').select('order_id,recipient_name,phone,province,department,district,carrier,agency_address,tracking_code,orders(order_number)').in('order_id',ids);
 const {data,error}=await selection;
 if(error)return <p>No se pudieron cargar los rótulos: {error.message}</p>;
 return <PrintLabels items={(data||[]).map(s=>({...s,dni:includeDni?(s as typeof s & {dni?:string|null}).dni||null:null,order_number:(s.orders as unknown as {order_number:number}|null)?.order_number||0}))} includeDni={includeDni}/>;
}
