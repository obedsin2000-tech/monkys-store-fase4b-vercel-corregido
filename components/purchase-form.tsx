'use client';
import {useRef,useState} from 'react';
import {createSupplierAction,receivePurchaseAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import {money,type ActionResult,type Supplier,type Variant} from '@/lib/types';
type Line={variant_id:string;quantity:number;unit_cost:number};
export function PurchaseForm({variants,suppliers}:{variants:Variant[];suppliers:Supplier[]}){
 const [scan,setScan]=useState('');const [supplier,setSupplier]=useState('');const [reference,setReference]=useState('');
 const [variant,setVariant]=useState('');const [qty,setQty]=useState('1');const [cost,setCost]=useState('');
 const [lines,setLines]=useState<Line[]>([]);const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 const inFlight=useRef(false);const requestKey=useRef<string|null>(null);
 function scanVariant(){
  const code=scan.trim().toUpperCase();setScan('');
  const found=variants.find(x=>x.barcode===code||x.sku.toUpperCase()===code);
  if(!found){setResult({ok:false,error:'No se encontró un producto con ese código.'});return;}
  setVariant(found.id);setCost(String(found.avg_cost));setQty('1');
  setResult({ok:true,message:`Variante ${found.sku} seleccionada. Revisa la cantidad y el costo antes de recibir.`});
 }
 function add(){if(!variant||Number(qty)<=0||Number(cost)<0||!cost||lines.some(x=>x.variant_id===variant))return;
  setLines(v=>[...v,{variant_id:variant,quantity:Number(qty),unit_cost:Number(cost)}]);setVariant('');setQty('1');setCost('');}
 async function submit(e:React.FormEvent){e.preventDefault();if(inFlight.current||lines.length===0)return;inFlight.current=true;setBusy(true);
 if(!requestKey.current)requestKey.current=crypto.randomUUID();
 try{const r=await receivePurchaseAction({request_key:requestKey.current,supplier_id:supplier||null,reference,lines});setResult(r);if(r.ok){setLines([]);setReference('');requestKey.current=null;}}
 catch{setResult({ok:false,error:'No se pudo confirmar la recepción. Reintenta con los mismos datos; se conservará la clave para evitar duplicados.'});}
 finally{inFlight.current=false;setBusy(false);}}
 return <section className="card"><h2>Recepción de mercadería</h2><p className="muted small">La recepción genera automáticamente ingreso a Kardex, nuevo saldo y costo promedio ponderado.</p>
 <form onSubmit={submit} className="form-stack"><fieldset disabled={busy} className="form-stack" style={{border:0,padding:0,margin:0,minWidth:0}}><div className="grid two"><label>Proveedor (opcional)<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Sin proveedor indicado</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Referencia de compra<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Factura / nota / lote" maxLength={80}/></label></div>
 <label>Escanear código para seleccionar variante<input value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanVariant();}}} placeholder="Código MK... o SKU y Enter"/></label>
 <div className="grid four align-end"><label>SKU / variante<select value={variant} onChange={e=>{setVariant(e.target.value);const found=variants.find(x=>x.id===e.target.value);setCost(found?String(found.avg_cost):'');}}><option value="">Seleccionar SKU</option>{variants.map(v=><option key={v.id} value={v.id}>{v.sku} · {v.products?.name}</option>)}</select></label><label>Cantidad<input type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Costo unitario S/<input type="number" min="0" step="0.0001" value={cost} onChange={e=>setCost(e.target.value)}/></label><button className="btn outline" onClick={add} type="button">Añadir línea</button></div>
 {lines.length>0&&<div className="table-wrap"><table><thead><tr><th>SKU</th><th>Cant.</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead><tbody>{lines.map(l=><tr key={l.variant_id}><td>{variants.find(v=>v.id===l.variant_id)?.sku}</td><td>{l.quantity}</td><td>{money(l.unit_cost)}</td><td>{money(l.quantity*l.unit_cost)}</td><td><button type="button" className="link-btn" onClick={()=>setLines(lines.filter(x=>x.variant_id!==l.variant_id))}>Quitar</button></td></tr>)}</tbody></table></div>}
 <div className="form-footer"><b>Total: {money(lines.reduce((a,l)=>a+l.quantity*l.unit_cost,0))}</b><button disabled={busy||lines.length===0} className="btn primary">{busy?'Registrando...':'Confirmar recepción'}</button></div></fieldset></form><ResultMessage result={result}/>
 </section>;
}
export function SupplierForm(){const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);setBusy(true);const r=await createSupplierAction({name:fd.get('name'),phone:fd.get('phone')});setResult(r);setBusy(false);if(r.ok)form.reset();}
 return <section className="card"><h2>Nuevo proveedor</h2><form className="form-stack" onSubmit={submit}><div className="grid two"><label>Nombre<input name="name" required minLength={2}/></label><label>Teléfono<input name="phone" maxLength={30}/></label></div><button className="btn outline" disabled={busy}>{busy?'Guardando...':'Agregar proveedor'}</button></form><ResultMessage result={result}/></section>;
}
