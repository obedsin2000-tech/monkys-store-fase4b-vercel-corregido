'use client';
import {useState} from 'react';
import {refundReturnAction} from '@/lib/phase2-actions';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult} from '@/lib/types';
type Pending={id:string;order_number:number;reason:string;pending:number};
export function PendingRefunds({returns}:{returns:Pending[]}){
 const [id,setId]=useState(returns[0]?.id||'');const item=returns.find(x=>x.id===id);const [amount,setAmount]=useState('');const [method,setMethod]=useState('yape');const [key,setKey]=useState(()=>crypto.randomUUID());const [busy,setBusy]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);
 async function submit(e:React.FormEvent){e.preventDefault();if(!item)return;const n=Number(amount);if(n<=0||n>item.pending){setResult({ok:false,error:'El importe excede lo pendiente'});return;}
 if(!confirm(`¿Confirmas que YA reembolsaste realmente ${money(n)} al cliente?`))return;
 setBusy(true);const r=await refundReturnAction({key,returnId:id,amount:n,method});setResult(r);setBusy(false);if(r.ok){setAmount('');setKey(crypto.randomUUID());}}
 if(!returns.length)return null;
 return <section className="card"><h2>Reembolsos pendientes</h2><p className="muted small">Solo registra una salida cuando hayas devuelto el dinero al cliente. Puedes reembolsar una parte y completar el resto luego.</p>
 <form className="form-stack" onSubmit={submit}><label>Devolución<select value={id} onChange={e=>{setId(e.target.value);setAmount('');setResult(null)}}>{returns.map(r=><option value={r.id} key={r.id}>Pedido #{r.order_number} · pendiente {money(r.pending)} · {r.reason}</option>)}</select></label>
 <div className="grid two"><label>Monto realmente reembolsado<input type="number" required min="0.01" step="0.01" max={item?.pending} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
 <label>Medio de reembolso<select value={method} onChange={e=>setMethod(e.target.value)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option></select></label></div>
 <button className="btn primary" disabled={busy}>Registrar reembolso realizado</button><ResultMessage result={result}/></form></section>;
}
