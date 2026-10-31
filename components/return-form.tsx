'use client';
import {useState} from 'react';
import {returnAction} from '@/lib/phase2-actions';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult} from '@/lib/types';
export type ReturnOrder={id:string;number:number;buyer:string;lines:Array<{id:string;sku:string;name:string;quantity:number;already_returned:number;unit_price:number}>};
export function ReturnForm({orders}:{orders:ReturnOrder[]}){
 const [order,setOrder]=useState(orders[0]?.id||'');const [selected,setSelected]=useState('');const [quantity,setQuantity]=useState('1');const [condition,setCondition]=useState('sellable');const [reason,setReason]=useState('');const [refund,setRefund]=useState('0');const [method,setMethod]=useState('yape');const [key,setKey]=useState(()=>crypto.randomUUID());const [busy,setBusy]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);
 const current=orders.find(o=>o.id===order);const lines=current?.lines.filter(l=>l.quantity>l.already_returned)||[];const chosen=lines.find(l=>l.id===selected)||lines[0];const max=chosen?chosen.quantity-chosen.already_returned:0;
 async function submit(e:React.FormEvent){e.preventDefault();if(!chosen)return;const n=Number(quantity);if(!Number.isInteger(n)||n<1||n>max){setResult({ok:false,error:'La cantidad excede las prendas que quedan por devolver'});return;}
 if(!confirm(`¿Confirmas la recepción de ${n} prenda(s) y un reembolso REAL de ${money(Number(refund))}?`))return;
 setBusy(true);const res=await returnAction({key,order,reason,refund:Number(refund),method,lines:[{order_line_id:chosen.id,quantity:n,condition}]});setBusy(false);setResult(res);if(res.ok){setKey(crypto.randomUUID());setQuantity('1');setRefund('0');}}
 return <form className="form-stack" onSubmit={submit}>
 <label>Venta confirmada<select value={order} onChange={e=>{setOrder(e.target.value);setSelected('');setResult(null)}}>{orders.map(o=><option value={o.id} key={o.id}>#{o.number} · {o.buyer}</option>)}</select></label>
 {lines.length?<><label>Prenda a devolver<select value={chosen?.id||''} onChange={e=>setSelected(e.target.value)}>{lines.map(l=><option key={l.id} value={l.id}>{l.name} · {l.sku} · disponibles para devolver: {l.quantity-l.already_returned}</option>)}</select></label>
 <div className="grid two"><label>Cantidad<input type="number" min="1" max={max} step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></label>
 <label>Estado de la prenda<select value={condition} onChange={e=>setCondition(e.target.value)}><option value="sellable">Apta para vender</option><option value="damaged">Dañada (stock bloqueado)</option></select></label></div>
 <label>Motivo de la devolución<input required minLength={5} maxLength={400} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej. Cambio por talla incorrecta"/></label>
 <div className="grid two"><label>Reembolso entregado (S/)<input type="number" step="0.01" min="0" max={chosen?Number(chosen.unit_price)*Number(quantity):0} value={refund} onChange={e=>setRefund(e.target.value)} required/></label>
 <label>Medio de reembolso<select value={method} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label></div>
 <div className="alert warn">Si solo estás recibiendo la prenda y todavía no devolviste el dinero, deja el reembolso en S/ 0. Los cambios se manejan como devolución y nueva venta.</div>
 <button type="submit" className="btn primary" disabled={busy||!chosen}>{busy?'Guardando…':'Registrar devolución y movimiento'}</button></>:<div className="alert">Todas las unidades de este pedido ya fueron devueltas.</div>}
 <ResultMessage result={result}/></form>;
}
