'use client';
import {useState} from 'react';
import {updateVariantSettingsAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {Variant,ActionResult} from '@/lib/types';
export function VariantSettings({variants}:{variants:Variant[]}){
 const [id,setId]=useState('');const [price,setPrice]=useState('');const [minimum,setMinimum]=useState('');
 const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 function select(v:string){setId(v);const x=variants.find(y=>y.id===v);setPrice(x?String(x.sale_price):'');setMinimum(x?String(x.min_stock):'');}
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);const r=await updateVariantSettingsAction({variant_id:id,sale_price:Number(price),min_stock:Number(minimum)});setResult(r);setBusy(false);}
 return <section className="card"><h2>Actualizar precio o stock mínimo</h2><form onSubmit={submit} className="form-stack"><div className="grid four align-end"><label>SKU<select value={id} onChange={e=>select(e.target.value)} required><option value="">Seleccionar SKU</option>{variants.map(v=><option key={v.id} value={v.id}>{v.sku} · {v.products?.name}</option>)}</select></label><label>Nuevo precio S/<input value={price} type="number" min="0" step="0.01" required onChange={e=>setPrice(e.target.value)}/></label><label>Stock mínimo<input value={minimum} type="number" min="0" step="1" required onChange={e=>setMinimum(e.target.value)}/></label><button type="submit" className="btn outline" disabled={busy||!id}>Guardar cambios</button></div></form><ResultMessage result={result}/></section>;
}
