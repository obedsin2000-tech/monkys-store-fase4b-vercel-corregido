import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {PrintLabels} from '@/components/print-labels';
import {PageTitle,Empty} from '@/components/ui';
import {OperationLoadError} from '@/components/operation-ui';
export default async function Rotulos({searchParams}:{searchParams:Promise<{ids?:string;dni?:string}>}){
 const {supabase:s,role}=await requireUser();const params=await searchParams;const {ids:raw=''}=params;
 const includeDni=params.dni==='1'&&role==='admin';
 const ids=[...new Set(raw.split(',').filter(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)))].slice(0,30);
 const retryHref=`/envios/rotulos?${new URLSearchParams({ids:ids.join(','),...(includeDni?{dni:'1'}:{})})}`;
 const back=<Link className="btn outline" href="/envios">Volver a Envíos</Link>;
 if(!ids.length)return <><PageTitle title="Rótulos de envío" description="Revisa la etiqueta del paquete antes de imprimir."/><section className="card"><Empty title="Selecciona un paquete" text="Abre el rótulo del pedido desde Envíos o imprime los rótulos pendientes.">{back}</Empty></section></>;
 const selection=s.from('shipments').select('order_id,recipient_name,phone,province,department,district,carrier,agency_address,tracking_code,orders(order_number)').in('order_id',ids);
 const {data,error}=await selection;
 if(error)return <><PageTitle title="Rótulos de envío" description="Vista previa de los paquetes seleccionados.">{back}</PageTitle><OperationLoadError title="No se pudieron cargar los rótulos" href={retryHref}/></>;
 if(!data?.length)return <><PageTitle title="Rótulos de envío" description="Vista previa de los paquetes seleccionados."/><section className="card"><Empty title="Sin rótulos para esta selección" text="El paquete debe tener datos de envío guardados para que aparezca aquí.">{back}</Empty></section></>;
 let dniByOrder=new Map<string,string|null>();if(includeDni){const {data:dniRows,error:dniError}=await s.rpc('admin_get_shipment_dni',{p_orders:ids});if(dniError)return <><PageTitle title="Rótulos de envío" description="Vista previa con datos autorizados.">{back}</PageTitle><OperationLoadError title="No se pudieron cargar los DNI autorizados" href={retryHref}/></>;dniByOrder=new Map<string,string|null>((dniRows||[]).map((row:{order_id:string;dni:string|null})=>[row.order_id,row.dni] as const));}
 return <PrintLabels items={(data||[]).map(s=>({...s,dni:includeDni?dniByOrder.get(s.order_id)||null:null,order_number:(s.orders as unknown as {order_number:number}|null)?.order_number||0}))} includeDni={includeDni}/>;
}
