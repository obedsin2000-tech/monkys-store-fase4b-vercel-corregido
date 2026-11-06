'use client';
import {useState} from 'react';
import {confirmReservationAction,cancelReservationAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult} from '@/lib/types';
export function OrderActions({id,status}:{id:string;status:string}){
 const [method,setMethod]=useState('yape');const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 if(status!=='reserved')return null;
 async function run(which:'confirm'|'cancel'){
  if(!confirm(which==='confirm'?'¿Verificaste el pago recibido? Se descontará el inventario.':'¿Cancelar y liberar las prendas reservadas?'))return;
  setBusy(true);const res=which==='confirm'?await confirmReservationAction(id,method):await cancelReservationAction(id);setBusy(false);setResult(res);
 }
 return <div className="order-actions"><div className="action-row"><select aria-label="Medio de pago" value={method} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select><button className="btn primary compact" onClick={()=>run('confirm')} disabled={busy}>Confirmar pago</button><button className="btn danger compact" onClick={()=>run('cancel')} disabled={busy}>Cancelar reserva</button></div><ResultMessage result={result}/></div>;
}
