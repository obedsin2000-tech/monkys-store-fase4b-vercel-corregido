'use client';
import {useRef,useState} from 'react';
import {confirmReservationAction,cancelReservationAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult} from '@/lib/types';
export function OrderActions({id,status}:{id:string;status:string}){
 const [method,setMethod]=useState('yape');const [result,setResult]=useState<ActionResult|null>(null);
 const [pending,setPending]=useState<'confirm'|'cancel'|null>(null);
 const inFlight=useRef(false);
 if(status!=='reserved')return null;
 async function run(which:'confirm'|'cancel'){
  if(inFlight.current||!confirm(which==='confirm'?'¿Verificaste el pago recibido? Se descontará el inventario.':'¿Cancelar y liberar las prendas reservadas?'))return;
  inFlight.current=true;setPending(which);setResult(null);
  try{setResult(which==='confirm'?await confirmReservationAction(id,method):await cancelReservationAction(id));}
  catch{setResult({ok:false,error:'No se pudo confirmar la operación. Recarga el pedido y comprueba su estado antes de reintentar.'});}
  finally{inFlight.current=false;setPending(null);}
 }
 return <div className="order-actions" aria-busy={pending!==null}><div className="action-row order-actions-row">
  <label>Medio de pago<select value={method} disabled={pending!==null} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label>
  <button type="button" className="btn primary compact" onClick={()=>run('confirm')} disabled={pending!==null}>{pending==='confirm'?'Confirmando…':'Confirmar pago'}</button>
  <button type="button" className="btn danger compact" onClick={()=>run('cancel')} disabled={pending!==null}>{pending==='cancel'?'Cancelando…':'Cancelar reserva'}</button>
 </div><ResultMessage result={result}/></div>;
}
