import {requireUser} from '@/lib/auth';
import {PrintLabels} from '@/components/print-labels';
export default async function Rotulos({searchParams}:{searchParams:Promise<{ids?:string}>}){
 const {supabase:s}=await requireUser();const {ids:raw=''}=await searchParams;
 const ids=[...new Set(raw.split(',').filter(x=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x)))].slice(0,30);
 if(!ids.length)return <p>Selecciona pedidos desde Envíos.</p>;
 const {data,error}=await s.from('shipments').select('order_id,recipient_name,phone,dni,province,department,district,carrier,agency_address,tracking_code,orders(order_number)').in('order_id',ids);
 if(error)return <p>No se pudieron cargar los rótulos: {error.message}</p>;
 return <PrintLabels items={(data||[]).map(s=>({...s,order_number:(s.orders as unknown as {order_number:number}|null)?.order_number||0}))}/>;
}
