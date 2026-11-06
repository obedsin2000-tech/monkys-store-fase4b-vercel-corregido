'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {shipmentStatusAction} from '@/lib/phase2-actions';
import {WhatsAppLink} from '@/components/whatsapp-link';
import {ResultMessage} from '@/components/ui';
import type {ActionResult} from '@/lib/types';
type Package={order_id:string;recipient_name:string;phone:string;carrier:string;agency_address:string;province:string;tracking_code:string|null;status:string;order_number:number};

export function ShipmentFollowup({shipment}:{shipment:Package}){
 const router=useRouter();const inFlight=useRef(false);const [busy,setBusy]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);
 async function deliver(){
  if(inFlight.current||!confirm('¿Confirmas que el destinatario recibió el paquete?'))return;
  inFlight.current=true;setBusy(true);
  try{const r=await shipmentStatusAction({order:shipment.order_id,status:'delivered',tracking:shipment.tracking_code||''});setResult(r);if(r.ok)router.refresh();}
  catch{setResult({ok:false,error:'No se pudo confirmar la entrega. Actualiza el estado y vuelve a intentar.'});}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <div><div className="action-row">
  {shipment.status==='dispatched'&&<><button type="button" className="btn outline compact" disabled={busy} onClick={deliver}>{busy?'Guardando…':'Marcar entregado'}</button><WhatsAppLink phone={shipment.phone} label="Avisar despacho" message={`Hola ${shipment.recipient_name}, tu pedido #${shipment.order_number} de Monky's Store ya fue entregado a ${shipment.carrier==='shalom'?'Shalom':'la agencia de transporte'} en ${shipment.agency_address}, ${shipment.province}. ${shipment.tracking_code?`Tu número de guía es ${shipment.tracking_code}. `:''}Gracias por tu compra.`}/></>}
  <a className="small-link" href={`/envios/rotulos?ids=${encodeURIComponent(shipment.order_id)}`} target="_blank" rel="noreferrer">Ver rótulo</a>
 </div><ResultMessage result={result}/></div>;
}
