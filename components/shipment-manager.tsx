'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {shipmentAction,shipmentStatusAction} from '@/lib/phase2-actions';
import {ResultMessage,Status} from '@/components/ui';
import {WhatsAppLink} from '@/components/whatsapp-link';
import type {ActionResult} from '@/lib/types';
export type ShippingItem={id:string;order_number:number;buyer:string;order_status:string;shipping?:{
recipient_name:string;phone:string;dni:string|null;department:string|null;province:string;district:string|null;carrier:string;agency_address:string;tracking_code:string|null;status:string}|null};
export function ShipmentManager({orders,canViewDni}:{orders:ShippingItem[];canViewDni:boolean}){
 const router=useRouter();
 const [id,setId]=useState(orders[0]?.id||'');const item=orders.find(o=>o.id===id);const [savedDraft,setSavedDraft]=useState<ShippingItem['shipping']>(null);const shipping=savedDraft||item?.shipping;
 const [form,setForm]=useState(()=>({recipient_name:orders[0]?.shipping?.recipient_name||orders[0]?.buyer||'',phone:orders[0]?.shipping?.phone||'',dni:canViewDni?orders[0]?.shipping?.dni||'':'',department:orders[0]?.shipping?.department||'',province:orders[0]?.shipping?.province||'',district:orders[0]?.shipping?.district||'',carrier:orders[0]?.shipping?.carrier||'shalom',agency_address:orders[0]?.shipping?.agency_address||''}));
 const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);const [tracking,setTracking]=useState(orders[0]?.shipping?.tracking_code||'');
 function select(value:string){const o=orders.find(x=>x.id===value);setId(value);setSavedDraft(null);setResult(null);const s=o?.shipping;setForm({recipient_name:s?.recipient_name||o?.buyer||'',phone:s?.phone||'',dni:canViewDni?s?.dni||'':'',department:s?.department||'',province:s?.province||'',district:s?.district||'',carrier:s?.carrier||'shalom',agency_address:s?.agency_address||''});setTracking(s?.tracking_code||'');}
 // El primer pedido se rellena al montar sin usar efectos para sobrescribir datos editados.
 const current=form;
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);const r=await shipmentAction({...current,order:id});setResult(r);setBusy(false);if(r.ok){setSavedDraft({recipient_name:current.recipient_name,phone:current.phone,dni:canViewDni?current.dni||null:null,department:current.department||null,province:current.province,district:current.district||null,carrier:current.carrier,agency_address:current.agency_address,tracking_code:shipping?.tracking_code||null,status:shipping?.status||'pending'});router.refresh();}}
 async function changeStatus(status:'preparing'|'dispatched'|'delivered'){
 if(status==='dispatched'&&!confirm('¿Confirmas que el paquete fue entregado a la agencia de transporte?'))return;
 setBusy(true);const r=await shipmentStatusAction({order:id,status,tracking});setResult(r);setBusy(false);if(r.ok&&shipping){setSavedDraft({...shipping,status,tracking_code:status==='dispatched'?(tracking.trim()||null):shipping.tracking_code});router.refresh();}
 }
 return <div className="form-stack"><label>Pedido<select value={id} onChange={e=>select(e.target.value)}>{orders.map(o=><option value={o.id} key={o.id}>#{o.order_number} · {o.buyer} · {o.order_status}</option>)}</select></label>
 {shipping&&<div className="alert">Datos de envío guardados · <Status value={shipping.status}/>{shipping.tracking_code?` · Guía: ${shipping.tracking_code}`:''}</div>}
 <p className="muted small">Paso 1 de 2 · Registra el destinatario, teléfono y datos de la agencia. Al guardar se habilitarán las acciones del Paso 2.</p><form className="form-stack" onSubmit={save}>
 <div className="grid two"><label>Destinatario *<input required maxLength={120} value={current.recipient_name} onChange={e=>setForm({...current,recipient_name:e.target.value})}/></label>
 <label>Teléfono *<input required maxLength={30} value={current.phone} onChange={e=>setForm({...current,phone:e.target.value})}/></label></div>
 <div className={canViewDni?'grid three':'grid two'}>{canViewDni&&<label>DNI (solo si lo requiere la agencia)<input maxLength={15} value={current.dni} onChange={e=>setForm({...current,dni:e.target.value})}/></label>}
 <label>Departamento<input maxLength={100} value={current.department} onChange={e=>setForm({...current,department:e.target.value})}/></label>
 <label>Provincia *<input required maxLength={100} value={current.province} onChange={e=>setForm({...current,province:e.target.value})}/></label></div>
 <div className="grid two"><label>Distrito<input maxLength={100} value={current.district} onChange={e=>setForm({...current,district:e.target.value})}/></label>
 <label>Agencia<select value={current.carrier} onChange={e=>setForm({...current,carrier:e.target.value})}><option value="shalom">Shalom</option><option value="otro">Otra agencia</option></select></label></div>
 <label>Dirección de la agencia *<input required maxLength={250} value={current.agency_address} onChange={e=>setForm({...current,agency_address:e.target.value})} placeholder="Ej. Shalom, sede centro"/></label>
 <button className="btn primary" type="submit" disabled={busy||shipping?.status==='delivered'||shipping?.status==='dispatched'}>{busy?'Guardando…':shipping?'Actualizar datos de envío':'Guardar datos y continuar'}</button></form>
 <div className="card" style={{marginBottom:0}}><h3>Paso 2 de 2 · Preparación y despacho</h3>{!shipping&&<p className="muted small">Guarda primero los datos del Paso 1. Luego podrás preparar el paquete, marcarlo como despachado y abrir el mensaje de WhatsApp.</p>}<div className="grid two"><label>Código de guía / seguimiento<input disabled={!shipping||busy} value={tracking} onChange={e=>setTracking(e.target.value)} maxLength={120} placeholder="Opcional"/></label><div className="action-row" style={{alignItems:'end'}}>
 {shipping?.status==='pending'&&<button type="button" disabled={busy} className="btn outline" onClick={()=>changeStatus('preparing')}>Marcar en preparación</button>}
 {(shipping?.status==='pending'||shipping?.status==='preparing')&&<button type="button" disabled={busy||item?.order_status!=='confirmed'} className="btn primary" onClick={()=>changeStatus('dispatched')}>Marcar despachado</button>}
 {shipping?.status==='dispatched'&&<button type="button" disabled={busy} className="btn primary" onClick={()=>changeStatus('delivered')}>Marcar entregado</button>}
 </div></div>{shipping&&item?.order_status!=='confirmed'&&<p className="muted small">Confirma el pago del pedido antes de marcarlo como despachado.</p>}
 <div className="action-row" style={{marginTop:12}}>{shipping?.status==='dispatched'&&<WhatsAppLink phone={shipping.phone} label="Avisar despacho por WhatsApp" message={`Hola ${shipping.recipient_name}, tu pedido #${item?.order_number} de Monky's Store ya fue entregado a ${shipping.carrier==='shalom'?'Shalom':'la agencia de transporte'} en ${shipping.agency_address}, ${shipping.province}. ${tracking.trim()||shipping.tracking_code?`Tu número de guía es ${tracking.trim()||shipping.tracking_code}. `:''}Gracias por tu compra.`}/>}<a className="small-link" href={`/envios/rotulos?ids=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Abrir rótulo e imprimir / Guardar como PDF</a></div></div>
 <ResultMessage result={result}/></div>;
}
