'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useFieldFeedback} from '@/components/form-feedback';
import {shipmentAction,shipmentStatusAction} from '@/lib/phase2-actions';
import {ResultMessage,Status} from '@/components/ui';
import {WhatsAppLink} from '@/components/whatsapp-link';
import type {ActionResult} from '@/lib/types';
export type ShippingItem={id:string;order_number:number;buyer:string;order_status:string;shipping?:{
recipient_name:string;phone:string;dni:string|null;department:string|null;province:string;district:string|null;carrier:string;agency_address:string;tracking_code:string|null;status:string}|null};
export function ShipmentManager({orders,canViewDni}:{orders:ShippingItem[];canViewDni:boolean}){
 const router=useRouter();
 const inFlight=useRef(false);const feedback=useFieldFeedback();
 const [id,setId]=useState(orders[0]?.id||'');const item=orders.find(o=>o.id===id);const [savedDraft,setSavedDraft]=useState<ShippingItem['shipping']>(null);const shipping=savedDraft||item?.shipping;
 const [form,setForm]=useState(()=>({recipient_name:orders[0]?.shipping?.recipient_name||orders[0]?.buyer||'',phone:orders[0]?.shipping?.phone||'',dni:canViewDni?orders[0]?.shipping?.dni||'':'',department:orders[0]?.shipping?.department||'',province:orders[0]?.shipping?.province||'',district:orders[0]?.shipping?.district||'',carrier:orders[0]?.shipping?.carrier||'shalom',agency_address:orders[0]?.shipping?.agency_address||''}));
 const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);const [tracking,setTracking]=useState(orders[0]?.shipping?.tracking_code||'');
 function select(value:string){if(inFlight.current)return;feedback.reset();const o=orders.find(x=>x.id===value);setId(value);setSavedDraft(null);setResult(null);const s=o?.shipping;setForm({recipient_name:s?.recipient_name||o?.buyer||'',phone:s?.phone||'',dni:canViewDni?s?.dni||'':'',department:s?.department||'',province:s?.province||'',district:s?.district||'',carrier:s?.carrier||'shalom',agency_address:s?.agency_address||''});setTracking(s?.tracking_code||'');}
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
 const edited=Boolean(shipping)&&Object.entries(current).some(([key,value])=>String(value||'')!==String(shipping?.[key as keyof NonNullable<ShippingItem['shipping']>]||''));
 return <div className="form-stack"><label>Selecciona un pedido pendiente<select disabled={busy} value={id} onChange={e=>select(e.target.value)}>{orders.map(o=><option value={o.id} key={o.id}>#{o.order_number} · {o.buyer} · {(o.id===id?shipping:o.shipping)?'Datos guardados':'Sin datos guardados'}</option>)}</select></label>
 <div className="shipment-heading"><div><strong>Pedido #{item?.order_number}</strong><p>{item?.buyer}</p></div><div className="shipping-indicators"><div><small>Datos del destinatario</small><span className={`pill ${edited?'amber':shipping?'green':'slate'}`}>{edited?'Cambios sin guardar':shipping?'Datos guardados':'Sin guardar'}</span></div><div><small>Estado del despacho</small>{shipping?<Status value={shipping.status}/>:<span className="pill slate">Sin envío registrado</span>}</div></div></div>
 <ol className="workflow-steps" aria-label="Pasos del envío"><li className={shipping&&!edited?'complete':'current'} aria-current={!shipping||edited?'step':undefined}><b aria-hidden="true">{shipping&&!edited?'✓':'1'}</b>Datos del envío</li><li className={shipping&&!edited?'current':''} aria-current={shipping&&!edited?'step':undefined}><b aria-hidden="true">2</b>Preparar y despachar</li></ol>
 <form className="form-stack" onSubmit={save} aria-busy={busy}><fieldset disabled={busy||shipping?.status==='dispatched'||shipping?.status==='delivered'} className="form-stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
 <p className="required-note">* Campos obligatorios. Guarda los datos antes de preparar el paquete.</p>
 <fieldset className="form-section"><legend>Destinatario</legend><div className={canViewDni?'grid recipient-fields':'grid two'}><label>Nombre del destinatario *<input {...feedback.props('recipient_name','el nombre del destinatario')} required minLength={2} maxLength={120} autoComplete="shipping name" value={current.recipient_name} onChange={e=>setForm({...current,recipient_name:e.target.value})}/>{feedback.message('recipient_name')}</label>
 <label>Teléfono *<input {...feedback.props('phone','el teléfono')} type="tel" inputMode="tel" autoComplete="shipping tel" required minLength={6} maxLength={30} value={current.phone} onChange={e=>setForm({...current,phone:e.target.value})}/>{feedback.message('phone')}</label>
 {canViewDni&&<label>DNI (opcional)<input {...feedback.props('dni','el DNI')} inputMode="numeric" maxLength={15} value={current.dni} onChange={e=>setForm({...current,dni:e.target.value})}/><span className="field-hint">Solo si lo requiere la agencia.</span>{feedback.message('dni')}</label>}</div></fieldset>
 <fieldset className="form-section"><legend>Destino y agencia de transporte</legend><div className="grid three"><label>Departamento<input {...feedback.props('department','el departamento')} maxLength={100} value={current.department} onChange={e=>setForm({...current,department:e.target.value})}/>{feedback.message('department')}</label>
 <label>Provincia *<input {...feedback.props('province','la provincia')} required minLength={2} maxLength={100} value={current.province} onChange={e=>setForm({...current,province:e.target.value})}/>{feedback.message('province')}</label>
 <label>Distrito<input {...feedback.props('district','el distrito')} maxLength={100} value={current.district} onChange={e=>setForm({...current,district:e.target.value})}/>{feedback.message('district')}</label></div>
 <div className="grid two"><label>Agencia<select value={current.carrier} onChange={e=>setForm({...current,carrier:e.target.value})}><option value="shalom">Shalom</option><option value="otro">Otra agencia</option></select></label>
 <label>Dirección de la agencia *<input {...feedback.props('agency_address','la dirección de la agencia')} required minLength={4} maxLength={250} value={current.agency_address} onChange={e=>setForm({...current,agency_address:e.target.value})} placeholder="Agencia y sede de destino"/>{feedback.message('agency_address')}</label></div></fieldset>
 <div className="form-footer"><span className="muted small">{edited?'Los cambios todavía no se han guardado.':shipping?'Puedes actualizar los datos antes del despacho.':'El guardado habilita el Paso 2.'}</span><button className="btn primary" type="submit" disabled={busy||shipping?.status==='delivered'||shipping?.status==='dispatched'}>{busy?'Guardando…':shipping?'Actualizar datos de envío':'Guardar datos y continuar'}</button></div></fieldset></form>
 <ResultMessage result={result}/>
 {shipping&&<section className="shipping-next" aria-labelledby="preparacion-titulo"><h3 id="preparacion-titulo">Paso 2 de 2 · Preparación y despacho</h3>{edited&&<p className="field-hint">Guarda los cambios del destinatario antes de continuar.</p>}<div className="grid two"><label>Código de guía / seguimiento<input disabled={busy||edited} value={tracking} onChange={e=>setTracking(e.target.value)} maxLength={120} placeholder="Opcional"/></label><div className="action-row">
 {shipping.status==='pending'&&<button type="button" disabled={busy||edited} className="btn outline" onClick={()=>changeStatus('preparing')}>Marcar en preparación</button>}
 {(shipping.status==='pending'||shipping.status==='preparing')&&<button type="button" disabled={busy||edited||item?.order_status!=='confirmed'} className="btn primary" onClick={()=>changeStatus('dispatched')}>Marcar despachado</button>}
 {shipping.status==='dispatched'&&<button type="button" disabled={busy} className="btn primary" onClick={()=>changeStatus('delivered')}>Marcar entregado</button>}
 </div></div>{item?.order_status!=='confirmed'&&<p className="field-hint">Confirma el pago del pedido antes de marcarlo como despachado.</p>}
 <div className="action-row">{shipping.status==='dispatched'&&<WhatsAppLink phone={shipping.phone} label="Avisar despacho por WhatsApp" message={`Hola ${shipping.recipient_name}, tu pedido #${item?.order_number} de Monky's Store ya fue entregado a ${shipping.carrier==='shalom'?'Shalom':'la agencia de transporte'} en ${shipping.agency_address}, ${shipping.province}. ${tracking.trim()||shipping.tracking_code?`Tu número de guía es ${tracking.trim()||shipping.tracking_code}. `:''}Gracias por tu compra.`}/>}<a className="small-link" href={`/envios/rotulos?ids=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Ver rótulo · Imprimir / guardar PDF</a></div></section>}
 </div>;
}
