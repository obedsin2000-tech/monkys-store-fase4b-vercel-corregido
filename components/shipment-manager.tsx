'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {shipmentAction,shipmentStatusAction} from '@/lib/phase2-actions';
import {ResultMessage,Status} from '@/components/ui';
import {WhatsAppLink} from '@/components/whatsapp-link';
import type {ActionResult} from '@/lib/types';
export type ShippingItem={id:string;order_number:number;buyer:string;order_status:string;shipping?:{
recipient_name:string;phone:string;dni:string|null;department:string|null;province:string;district:string|null;carrier:string;agency_address:string;tracking_code:string|null;status:string}|null};
export function ShipmentManager({orders,canViewDni}:{orders:ShippingItem[];canViewDni:boolean}){
 const router=useRouter();
 const inFlight=useRef(false);
 const [id,setId]=useState(orders[0]?.id||'');const item=orders.find(o=>o.id===id);const [savedDraft,setSavedDraft]=useState<ShippingItem['shipping']>(null);const shipping=savedDraft||item?.shipping;
 const [form,setForm]=useState(()=>({recipient_name:orders[0]?.shipping?.recipient_name||orders[0]?.buyer||'',phone:orders[0]?.shipping?.phone||'',dni:canViewDni?orders[0]?.shipping?.dni||'':'',department:orders[0]?.shipping?.department||'',province:orders[0]?.shipping?.province||'',district:orders[0]?.shipping?.district||'',carrier:orders[0]?.shipping?.carrier||'shalom',agency_address:orders[0]?.shipping?.agency_address||''}));
 const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);const [tracking,setTracking]=useState(orders[0]?.shipping?.tracking_code||'');
 function select(value:string){if(inFlight.current)return;const o=orders.find(x=>x.id===value);setId(value);setSavedDraft(null);setResult(null);const s=o?.shipping;setForm({recipient_name:s?.recipient_name||o?.buyer||'',phone:s?.phone||'',dni:canViewDni?s?.dni||'':'',department:s?.department||'',province:s?.province||'',district:s?.district||'',carrier:s?.carrier||'shalom',agency_address:s?.agency_address||''});setTracking(s?.tracking_code||'');}
 // El primer pedido se rellena al montar sin usar efectos para sobrescribir datos editados.
 const current=form;
 async function save(e:React.FormEvent){e.preventDefault();if(inFlight.current||!item)return;inFlight.current=true;setBusy(true);
 try{const r=await shipmentAction({...current,order:id});setResult(r);if(r.ok){setSavedDraft({recipient_name:current.recipient_name,phone:current.phone,dni:canViewDni?current.dni||null:null,department:current.department||null,province:current.province,district:current.district||null,carrier:current.carrier,agency_address:current.agency_address,tracking_code:shipping?.tracking_code||null,status:shipping?.status||'pending'});router.refresh();}}
 catch{setResult({ok:false,error:'No se pudo confirmar el guardado. Revisa la conexión y vuelve a intentar.'});}
 finally{inFlight.current=false;setBusy(false);}}
 async function changeStatus(status:'preparing'|'dispatched'|'delivered'){
 if(inFlight.current||!item)return;
 if(status==='dispatched'&&!confirm('¿Confirmas que el paquete fue entregado a la agencia de transporte?'))return;
 inFlight.current=true;setBusy(true);try{const r=await shipmentStatusAction({order:id,status,tracking});setResult(r);if(r.ok&&shipping){setSavedDraft({...shipping,status,tracking_code:status==='dispatched'?(tracking.trim()||null):shipping.tracking_code});router.refresh();}}
 catch{setResult({ok:false,error:'No se pudo confirmar el cambio. Actualiza el estado antes de reintentar.'});}
 finally{inFlight.current=false;setBusy(false);}
 }
 return <div className="form-stack"><label>Pedido pendiente de despacho<select disabled={busy} value={id} onChange={e=>select(e.target.value)}>{orders.map(o=><option value={o.id} key={o.id}>#{o.order_number} · {o.buyer} · {(o.id===id?shipping:o.shipping)?'✓ Datos guardados':'○ Faltan datos'}</option>)}</select></label>
 {shipping?<div className="alert success"><strong>Datos de envío guardados.</strong> Revisa el destinatario y la dirección antes de despachar. · <Status value={shipping.status}/>{shipping.tracking_code?` · Guía: ${shipping.tracking_code}`:''}</div>:<div className="alert warn">Faltan datos de envío. Completa y guarda este paso antes de preparar el paquete.</div>}
 <p className="muted small">Paso 1 de 2 · {shipping?'Revisa o actualiza los datos guardados.':'Registra destinatario, teléfono y agencia.'} El Paso 2 se habilita al guardar.</p><form className="form-stack" onSubmit={save}><fieldset disabled={busy||shipping?.status==='dispatched'||shipping?.status==='delivered'} className="form-stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
 <div className="grid two"><label>Destinatario *<input required maxLength={120} value={current.recipient_name} onChange={e=>setForm({...current,recipient_name:e.target.value})}/></label>
 <label>Teléfono *<input required maxLength={30} value={current.phone} onChange={e=>setForm({...current,phone:e.target.value})}/></label></div>
 <div className={canViewDni?'grid three':'grid two'}>{canViewDni&&<label>DNI (solo si lo requiere la agencia)<input maxLength={15} value={current.dni} onChange={e=>setForm({...current,dni:e.target.value})}/></label>}
 <label>Departamento<input maxLength={100} value={current.department} onChange={e=>setForm({...current,department:e.target.value})}/></label>
 <label>Provincia *<input required maxLength={100} value={current.province} onChange={e=>setForm({...current,province:e.target.value})}/></label></div>
 <div className="grid two"><label>Distrito<input maxLength={100} value={current.district} onChange={e=>setForm({...current,district:e.target.value})}/></label>
 <label>Agencia<select value={current.carrier} onChange={e=>setForm({...current,carrier:e.target.value})}><option value="shalom">Shalom</option><option value="otro">Otra agencia</option></select></label></div>
 <label>Dirección de la agencia *<input required maxLength={250} value={current.agency_address} onChange={e=>setForm({...current,agency_address:e.target.value})} placeholder="Ej. Shalom, sede centro"/></label>
 <button className="btn primary" type="submit" disabled={busy||shipping?.status==='delivered'||shipping?.status==='dispatched'}>{busy?'Guardando…':shipping?'Actualizar datos de envío':'Guardar datos y continuar'}</button></fieldset></form>
 {shipping&&<div className="card" style={{marginBottom:0}}><h3>Paso 2 de 2 · Preparación y despacho</h3><div className="grid two"><label>Código de guía / seguimiento<input disabled={busy} value={tracking} onChange={e=>setTracking(e.target.value)} maxLength={120} placeholder="Opcional"/></label><div className="action-row" style={{alignItems:'end'}}>
 {shipping?.status==='pending'&&<button type="button" disabled={busy} className="btn outline" onClick={()=>changeStatus('preparing')}>Marcar en preparación</button>}
 {(shipping?.status==='pending'||shipping?.status==='preparing')&&<button type="button" disabled={busy||item?.order_status!=='confirmed'} className="btn primary" onClick={()=>changeStatus('dispatched')}>Marcar despachado</button>}
 {shipping?.status==='dispatched'&&<button type="button" disabled={busy} className="btn primary" onClick={()=>changeStatus('delivered')}>Marcar entregado</button>}
 </div></div>{shipping&&item?.order_status!=='confirmed'&&<p className="muted small">Confirma el pago del pedido antes de marcarlo como despachado.</p>}
 <div className="action-row" style={{marginTop:12}}>{shipping?.status==='dispatched'&&<WhatsAppLink phone={shipping.phone} label="Avisar despacho por WhatsApp" message={`Hola ${shipping.recipient_name}, tu pedido #${item?.order_number} de Monky's Store ya fue entregado a ${shipping.carrier==='shalom'?'Shalom':'la agencia de transporte'} en ${shipping.agency_address}, ${shipping.province}. ${tracking.trim()||shipping.tracking_code?`Tu número de guía es ${tracking.trim()||shipping.tracking_code}. `:''}Gracias por tu compra.`}/>}<a className="small-link" href={`/envios/rotulos?ids=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Abrir rótulo e imprimir / Guardar como PDF</a></div></div>}
 <ResultMessage result={result}/></div>;
}
