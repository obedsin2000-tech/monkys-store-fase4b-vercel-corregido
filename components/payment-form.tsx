'use client';
import {useState} from 'react';
import {paymentAction,cancelPaidReservationAction} from '@/lib/phase2-actions';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult} from '@/lib/types';
type Item={id:string;order_number:number;buyer:string;total:number;paid:number;payment_status:string};
export function PaymentForm({orders,canAdmin}:{orders:Item[];canAdmin:boolean}){
 const [selected,setSelected]=useState(orders[0]?.id||'');const [amount,setAmount]=useState('');const [method,setMethod]=useState('yape');const [reference,setReference]=useState('');const [busy,setBusy]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);const [key,setKey]=useState(()=>crypto.randomUUID());
 const [cancelReason,setCancelReason]=useState('');const [cancelMethod,setCancelMethod]=useState('yape');const [cancelKey,setCancelKey]=useState(()=>crypto.randomUUID());
 const order=orders.find(o=>o.id===selected);const due=Math.max(0,Number(order?.total||0)-Number(order?.paid||0));
 async function submit(e:React.FormEvent){e.preventDefault();if(!order)return;const n=Number(amount);if(n<=0||n>due){setResult({ok:false,error:'Monto fuera del saldo pendiente.'});return;}
 if(!confirm(`¿Ya verificaste que recibiste ${money(n)} por ${method}?`))return;
 setBusy(true);const res=await paymentAction({key,order:selected,amount:n,method,reference});setBusy(false);setResult(res);if(res.ok){setKey(crypto.randomUUID());setAmount('');setReference('');}}
 async function cancelDeposit(){if(!order)return;if(!confirm(`¿Ya devolviste realmente ${money(order.paid)} al comprador? Se cancelará el pedido.`))return;setBusy(true);const r=await cancelPaidReservationAction({key:cancelKey,order:selected,method:cancelMethod,reason:cancelReason});setResult(r);setBusy(false);if(r.ok)setCancelKey(crypto.randomUUID());}
 return <div className="form-stack"><form className="form-stack" onSubmit={submit}>
 <label>Pedido reservado<select value={selected} onChange={e=>{setSelected(e.target.value);setResult(null);setAmount('')}} required>{orders.map(o=><option key={o.id} value={o.id}>#{o.order_number} · {o.buyer} · saldo {money(Math.max(0,o.total-o.paid))}</option>)}</select></label>
 {order&&<div className="alert">Total: {money(order.total)} · Adelantado: {money(order.paid)} · <b>Falta: {money(due)}</b></div>}
 <div className="grid two"><label>Monto recibido (S/)<input type="number" min="0.01" max={due} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ej. 30.00" required/></label>
 <label>Medio de pago<select value={method} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label></div>
 <label>Número de operación (opcional)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={100}/></label>
 <div className="alert warn">Registra el pago solamente después de comprobarlo en tu aplicación bancaria o en efectivo. La web no verifica Yape ni Plin automáticamente.</div>
 <button type="submit" disabled={busy||!selected} className="btn primary">{busy?'Guardando…':'Registrar cobro verificado'}</button></form>
 {canAdmin&&order&&order.paid>0&&<section className="card" style={{marginBottom:0}}><h3>Cancelar reserva con adelanto</h3><p className="muted small">Solo después de devolver realmente el dinero; reembolso total obligatorio de {money(order.paid)}.</p><label>Motivo<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={5}/></label><label>Medio de devolución<select value={cancelMethod} onChange={e=>setCancelMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label><button className="btn outline" type="button" disabled={busy||cancelReason.trim().length<5} onClick={cancelDeposit}>Registrar reembolso total y cancelar</button></section>}
 <ResultMessage result={result}/></div>;
}
