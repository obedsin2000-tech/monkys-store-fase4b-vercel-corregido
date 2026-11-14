'use client';
import Link from 'next/link';
import {Printer} from 'lucide-react';
import {PageTitle} from '@/components/ui';
import {missingRecipientFields} from '@/components/shipment-data-status';
type Label={order_id:string;recipient_name:string;phone:string;dni:string|null;province:string;department:string|null;district:string|null;carrier:string;agency_address:string;tracking_code:string|null};
export function PrintLabels({items}:{items:Label[]}){
 const incomplete=items.filter(item=>missingRecipientFields(item).length>0).length;
 const back=items.length===1?`/envios?${new URLSearchParams({pedido:items[0].order_id})}`:'/envios';
 return <><div className="no-print">
  <PageTitle title="Rótulos de envío" description={`${items.length} ${items.length===1?'rótulo':'rótulos'} en la vista previa. Elige «Guardar como PDF» desde la ventana de impresión.`}>
   <div className="action-row"><Link href={back} className="btn outline">Volver a Envíos</Link><button type="button" className="btn primary" onClick={()=>window.print()}><Printer size={17} aria-hidden="true"/> Imprimir o guardar PDF</button></div>
  </PageTitle>
  {incomplete>0&&<p className="alert warn">Revisa los datos del destinatario antes de imprimir. Hay {incomplete} {incomplete===1?'rótulo incompleto':'rótulos incompletos'}.</p>}
 </div>
 <div className="labels-grid">{items.map(s=><div className="shipping-label" key={s.order_id}><header><b>MONKY'S STORE</b></header><hr/>
 <small>DESTINATARIO</small><h2>{s.recipient_name}</h2>{s.dni&&<p><b>DNI:</b> {s.dni}</p>}<p><b>Teléfono:</b> {s.phone}</p>
 <p><b>Destino:</b> {[s.district,s.province,s.department].filter(Boolean).join(' · ')}</p><p><b>Agencia:</b> {s.carrier==='shalom'?'Shalom':'Otra agencia'}</p>
 <p><b>Dirección agencia:</b> {s.agency_address}</p>{s.tracking_code&&<p><b>Guía:</b> {s.tracking_code}</p>}
 </div>)}</div></>;
}
