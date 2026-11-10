'use client';
import {useId,useRef,useState} from 'react';
import {paymentAction,cancelPaidReservationAction} from '@/lib/phase2-actions';
import {useFieldFeedback} from '@/components/form-feedback';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult} from '@/lib/types';
type Item={id:string;order_number:number;buyer:string;total:number;paid:number};
export function PaymentForm({orders,canAdmin,selectedOrderId}:{orders:Item[];canAdmin:boolean;selectedOrderId?:string}){
 const [selected,setSelected]=useState(()=>selectedOrderId?orders.find(order=>order.id===selectedOrderId)?.id||'':orders.length===1?orders[0].id:'');
 const [amount,setAmount]=useState('');const [method,setMethod]=useState('yape');const [reference,setReference]=useState('');const [busy,setBusy]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);const [key,setKey]=useState(()=>crypto.randomUUID());
 const [cancelReason,setCancelReason]=useState('');const [cancelMethod,setCancelMethod]=useState('yape');const [cancelKey,setCancelKey]=useState(()=>crypto.randomUUID());
 const inFlight=useRef(false);const feedback=useFieldFeedback();const amountHint=useId();
 const order=orders.find(o=>o.id===selected);const due=Math.max(0,Number(order?.total||0)-Number(order?.paid||0));
 async function submit(e:React.FormEvent){e.preventDefault();if(inFlight.current||!order)return;const n=Number(amount);if(n<=0||n>due){setResult({ok:false,error:'Monto fuera del saldo pendiente.'});return;}
 if(!confirm(`¿Ya verificaste que recibiste ${money(n)} por ${method}?`))return;
 inFlight.current=true;setBusy(true);try{const res=await paymentAction({key,order:selected,amount:n,method,reference});setResult(res);if(res.ok){setKey(crypto.randomUUID());setAmount('');setReference('');}}catch{setResult({ok:false,error:'No se pudo confirmar el cobro. Reintenta con los mismos datos para evitar duplicados.'});}finally{inFlight.current=false;setBusy(false);}}
 async function cancelDeposit(){if(inFlight.current||!order)return;if(!confirm(`¿Ya devolviste realmente ${money(order.paid)} al comprador? Se cancelará el pedido.`))return;inFlight.current=true;setBusy(true);try{const r=await cancelPaidReservationAction({key:cancelKey,order:selected,method:cancelMethod,reason:cancelReason});setResult(r);if(r.ok)setCancelKey(crypto.randomUUID());}catch{setResult({ok:false,error:'No se pudo confirmar la cancelación. Actualiza el pedido antes de reintentar.'});}finally{inFlight.current=false;setBusy(false);}}
 return <div className="form-stack"><form className="form-stack" onSubmit={submit} aria-busy={busy}>
 {(!selectedOrderId||orders.length!==1||!order)&&<div className="operation-picker">
  <label>Pedido reservado *<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);setResult(null);setAmount('');setReference('');setCancelReason('');feedback.reset();}} required>
   <option value="">Seleccionar pedido</option>
   {orders.map(o=><option key={o.id} value={o.id}>#{o.order_number} · {o.buyer} · saldo {money(Math.max(0,o.total-o.paid))}</option>)}
  </select></label>
  {!order&&<p className="field-hint">Elige una reserva para consultar el saldo y registrar el importe recibido.</p>}
 </div>}
 {order&&<>
  <dl className="payment-summary" aria-label={`Importes del pedido ${order.order_number}`}>
   <div><dt><span>Total del pedido</span></dt><dd><strong>{money(order.total)}</strong></dd></div>
   <div className="paid"><dt><span>Ya pagado</span></dt><dd><strong>{money(order.paid)}</strong></dd></div>
   <div className="due"><dt><span>Saldo pendiente</span></dt><dd><strong>{money(due)}</strong></dd></div>
  </dl>
  <fieldset disabled={busy} className="form-section operation-form-section">
   <legend>Datos del cobro</legend>
   <div className="grid two">
    <label>Monto recibido (S/) *<input {...feedback.props('amount','el monto recibido',amountHint)} type="number" inputMode="decimal" min="0.01" max={due} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ej. 30.00" required/>{feedback.message('amount')}<span id={amountHint} className="field-hint">Registra el importe que acabas de recibir, hasta {money(due)}.</span></label>
    <label>Medio de pago<select value={method} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label>
   </div>
   <label>Número de operación (opcional)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={100}/></label>
   <div className="form-footer">
    <span className="muted small">Comprueba el ingreso en tu aplicación bancaria o en efectivo.</span>
    <button type="submit" disabled={busy} className="btn primary">{busy?'Guardando…':'Registrar cobro verificado'}</button>
   </div>
  </fieldset>
 </>}
 </form>
 {canAdmin&&order&&order.paid>0&&<details className="disclosure"><summary>Cancelar reserva con adelanto <small>Requiere devolver todo el dinero recibido</small></summary><section className="danger-zone"><p className="muted small">Solo después de devolver realmente el dinero; reembolso total obligatorio de {money(order.paid)}.</p><label>Motivo<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={5}/></label><label>Medio de devolución<select value={cancelMethod} onChange={e=>setCancelMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label><button className="btn danger" type="button" disabled={busy||cancelReason.trim().length<5} onClick={cancelDeposit}>Registrar reembolso total y cancelar</button></section></details>}
 <ResultMessage result={result}/></div>;
}
