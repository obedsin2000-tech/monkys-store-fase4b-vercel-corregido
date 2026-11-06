'use client';
type Label={order_id:string;order_number:number;recipient_name:string;phone:string;dni:string|null;province:string;department:string|null;district:string|null;carrier:string;agency_address:string;tracking_code:string|null};
export function PrintLabels({items,includeDni=false}:{items:Label[];includeDni?:boolean}){return <><div className="no-print" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:18}}><div><h1>Rótulos de envío</h1><p>Para obtener PDF, elige «Guardar como PDF» en la impresión del navegador.</p></div><button className="btn primary" onClick={()=>window.print()}>Imprimir / Guardar PDF</button></div>
 <div className="labels-grid">{items.map(s=><div className="shipping-label" key={s.order_id}><header><b>MONKY'S STORE</b><strong>Pedido #{s.order_number}</strong></header><hr/>
 <small>DESTINATARIO</small><h2>{s.recipient_name}</h2><p><b>Teléfono:</b> {s.phone}</p>{includeDni&&s.dni&&<p><b>DNI:</b> {s.dni}</p>}
 <p><b>Destino:</b> {[s.district,s.province,s.department].filter(Boolean).join(' · ')}</p><p><b>Agencia:</b> {s.carrier==='shalom'?'Shalom':'Otra agencia'}</p>
 <p><b>Dirección agencia:</b> {s.agency_address}</p>{s.tracking_code&&<p><b>Guía:</b> {s.tracking_code}</p>}
 </div>)}</div></>;
}
