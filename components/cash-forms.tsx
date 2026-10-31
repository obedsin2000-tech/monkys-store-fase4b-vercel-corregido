'use client';
import {useState} from 'react';
import {expenseAction,closingAction} from '@/lib/phase2-actions';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult} from '@/lib/types';
const methods=<><option value="efectivo">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option></>;
export function CashForms({date,cashNet,canAdmin}:{date:string;cashNet:number;canAdmin:boolean}){
 const [expense,setExpense]=useState({concept:'',amount:'',method:'efectivo',notes:''});const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);const [key,setKey]=useState(()=>crypto.randomUUID());
 const [cut,setCut]=useState({date,opening:'0',counted:'0',notes:''});const [closeResult,setCloseResult]=useState<ActionResult|null>(null);
 async function expenseSubmit(e:React.FormEvent){e.preventDefault();if(!confirm(`¿Registraste realmente el gasto de S/ ${expense.amount}?`))return;setBusy(true);const r=await expenseAction({...expense,key,amount:Number(expense.amount)});setResult(r);setBusy(false);if(r.ok){setKey(crypto.randomUUID());setExpense({concept:'',amount:'',method:'efectivo',notes:''})}}
 async function cutSubmit(e:React.FormEvent){e.preventDefault();if(!confirm('¿Guardar un corte de caja? Será una instantánea y no bloqueará operaciones posteriores.'))return;setBusy(true);const r=await closingAction({...cut,opening:Number(cut.opening),counted:Number(cut.counted)});setCloseResult(r);setBusy(false);}
 if(!canAdmin)return <div className="alert">Solo el administrador puede registrar gastos y cortes de caja.</div>;
 return <div className="grid two">
 <section className="card"><h2>Registrar gasto</h2><form className="form-stack" onSubmit={expenseSubmit}>
 <label>Concepto<input required minLength={4} value={expense.concept} onChange={e=>setExpense({...expense,concept:e.target.value})} placeholder="Ej. Bolsas para pedidos"/></label>
 <div className="grid two"><label>Importe (S/)<input required type="number" min="0.01" step="0.01" value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})}/></label>
 <label>Medio<select value={expense.method} onChange={e=>setExpense({...expense,method:e.target.value})}>{methods}</select></label></div>
 <label>Observación<input value={expense.notes} onChange={e=>setExpense({...expense,notes:e.target.value})}/></label>
 <button className="btn primary" disabled={busy}>Guardar gasto</button><ResultMessage result={result}/></form></section>
 <section className="card"><h2>Corte de caja (instantánea)</h2><form className="form-stack" onSubmit={cutSubmit}>
 <label>Fecha de corte<input required type="date" value={cut.date} onChange={e=>setCut({...cut,date:e.target.value})}/></label>
 <div className="grid two"><label>Efectivo inicial (S/)<input required min="0" step="0.01" type="number" value={cut.opening} onChange={e=>setCut({...cut,opening:e.target.value})}/></label>
 <label>Efectivo contado (S/)<input required min="0" step="0.01" type="number" value={cut.counted} onChange={e=>setCut({...cut,counted:e.target.value})}/></label></div>
 {cut.date===date&&<div className="alert">Efectivo esperado según el libro + fondo inicial: <b>{money(Number(cut.opening||0)+Number(cashNet))}</b></div>}
 <label>Notas<input value={cut.notes} onChange={e=>setCut({...cut,notes:e.target.value})}/></label>
 <div className="alert warn">El corte registra una foto del día hasta ese instante. No bloquea cobros posteriores ni reabre cortes existentes.</div>
 <button className="btn primary" disabled={busy}>Guardar corte</button><ResultMessage result={closeResult}/></form></section>
 </div>;
}
