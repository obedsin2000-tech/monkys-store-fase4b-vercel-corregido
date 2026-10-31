'use client';
import {useState} from 'react';
import {adjustStockAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult,Variant} from '@/lib/types';
export function StockAdjust({variants}:{variants:Variant[]}){
 const [id,setId]=useState('');const [delta,setDelta]=useState('');const [reason,setReason]=useState('');const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(!confirm('¿Registrar ajuste de stock? Quedará registrado en Kardex.'))return;
  setBusy(true);const r=await adjustStockAction({variant_id:id,delta:Number(delta),reason});setResult(r);setBusy(false);if(r.ok){setDelta('');setReason('');}}
 return <section className="card"><h2>Ajuste manual de inventario</h2><p className="muted small">Solo para conteos físicos, pérdidas o correcciones justificadas; las compras se registran por separado.</p>
 <form className="form-stack" onSubmit={submit}><label>SKU<select value={id} onChange={e=>setId(e.target.value)} required><option value="">Elegir variante</option>{variants.map(v=><option value={v.id} key={v.id}>{v.sku} · {v.products?.name} · físico {v.on_hand}</option>)}</select></label><div className="grid two"><label>Variación de unidades (+ / -)<input type="number" required step="1" value={delta} onChange={e=>setDelta(e.target.value)} placeholder="-2"/></label><label>Motivo<input required minLength={5} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Diferencia en conteo físico"/></label></div><button className="btn primary" disabled={busy}>{busy?'Guardando...':'Aplicar ajuste'}</button></form><ResultMessage result={result}/></section>;
}
