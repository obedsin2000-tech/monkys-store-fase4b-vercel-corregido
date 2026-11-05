'use client';
import {useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Variant,ActionResult} from '@/lib/types';
import {openCountAction,updateCountAction,submitCountAction,approveCountAction,cancelCountAction} from '@/lib/phase4b-actions';
import {ResultMessage} from '@/components/ui';

type Count={id:string;status:string;notes:string;created_at:string;created_by:string};
type CountLine={id:string;variant_id:string;counted:number|null;baseline_on_hand:number;baseline_reserved:number;baseline_blocked:number};
export function InventoryCountManager({variants,counts,selectedCount,lines,role}:{variants:Variant[];counts:Count[];selectedCount:Count|null;lines:CountLine[];role:string}){
 const router=useRouter();const [notes,setNotes]=useState('');const [query,setQuery]=useState('');const [scan,setScan]=useState('');const [busy,setBusy]=useState(false);
 const [counted,setCounted]=useState<Record<string,number|null>>(()=>Object.fromEntries(lines.map(l=>[l.variant_id,l.counted])));
 const [result,setResult]=useState<ActionResult|null>(null);
 const [pendingWrites,setPendingWrites]=useState(0);
 const pendingWritesRef=useRef(0);const failedIds=useRef(new Set<string>());const [failedWrites,setFailedWrites]=useState(0);
 const countedRef=useRef(counted);
 const saveQueue=useRef(new Map<string,Promise<void>>());
 const ref=useRef<HTMLInputElement>(null);
 const map=useMemo(()=>new Map(variants.map(v=>[v.id,v])),[variants]);
 const lineMap=useMemo(()=>new Map(lines.map(l=>[l.variant_id,l])),[lines]);
 const visible=lines.filter(l=>{const v=map.get(l.variant_id);return v&&(`${v.barcode||''} ${v.sku} ${v.products?.name||''} ${v.size} ${v.color}`).toLocaleLowerCase().includes(query.toLocaleLowerCase());}).slice(0,200);
 const saved=lines.filter(l=>counted[l.variant_id]!==null&&counted[l.variant_id]!==undefined).length;
 async function run(fn:()=>Promise<ActionResult>){setBusy(true);setResult(null);try{const r=await fn();setResult(r);if(r.ok)router.refresh();return r;}finally{setBusy(false);}}
 function setQty(id:string,value:number){
  if(busy||!selectedCount||selectedCount.status!=='draft'||!Number.isInteger(value)||value<0||value>1000000)return;
  countedRef.current={...countedRef.current,[id]:value};
  setCounted(countedRef.current);
  pendingWritesRef.current+=1;setPendingWrites(pendingWritesRef.current);
  // Un lector USB puede enviar varios códigos antes de recibir respuesta de red.
  // Las escrituras del mismo SKU se realizan EN ORDEN y siempre guardan cantidad absoluta.
  const prior=saveQueue.current.get(id)||Promise.resolve();
  const next=prior.catch(()=>{}).then(async()=>{
   try{const r=await updateCountAction({count_id:selectedCount.id,variant_id:id,counted:value});
    if(!r.ok){failedIds.current.add(id);setResult(r);}else{failedIds.current.delete(id);}
   }catch{failedIds.current.add(id);setResult({ok:false,error:'No se guardó la cantidad. Revisa la conexión y vuelve a confirmar el mismo valor.'});}
   setFailedWrites(failedIds.current.size);
  }).finally(()=>{pendingWritesRef.current-=1;setPendingWrites(pendingWritesRef.current);});
  saveQueue.current.set(id,next);
 }
 function submit(){if(!selectedCount||pendingWritesRef.current>0||failedIds.current.size>0)return;void run(()=>submitCountAction(selectedCount.id));}

 function scanCode(){const code=scan.trim().toUpperCase();setScan('');const v=variants.find(x=>x.barcode===code||x.sku.toUpperCase()===code);if(!v){setResult({ok:false,error:'Código no encontrado. Comprueba la etiqueta.'});ref.current?.focus();return;}if(!lineMap.has(v.id)){setResult({ok:false,error:'La variante no pertenece a esta sesión de conteo.'});return;}const n=(countedRef.current[v.id]??0)+1;setQty(v.id,n);ref.current?.focus();}
 return <div className="barcode-section">
  <section className="card"><h2>Sesiones de conteo físico</h2><p className="muted small">Contar no cambia el stock. El administrador deberá revisar y aprobar las diferencias.</p>
   <div className="form-stack"><label>Descripción del nuevo conteo<input placeholder="Ej. conteo semanal de almacén" value={notes} onChange={e=>setNotes(e.target.value)}/></label><button type="button" className="btn primary" disabled={busy} onClick={()=>void run(()=>openCountAction(notes)).then(r=>{if(r?.ok&&r.id)router.push(`/inventario/conteos?id=${encodeURIComponent(r.id)}`);})}>Iniciar conteo nuevo</button></div>
   {counts.length>0&&<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Estado</th><th>Acceso</th></tr></thead><tbody>{counts.map(c=><tr key={c.id}><td>{new Date(c.created_at).toLocaleDateString('es-PE')}</td><td>{c.notes||'Sin descripción'}</td><td>{({draft:'Borrador',submitted:'Pendiente aprobación',approved:'Aprobado',cancelled:'Cancelado'} as Record<string,string>)[c.status]||c.status}</td><td><a className="btn outline" href={`/inventario/conteos?id=${encodeURIComponent(c.id)}`}>Abrir</a></td></tr>)}</tbody></table></div>}
  </section>
  {selectedCount&&<section className="card"><div className="section-title"><h2>Conteo {selectedCount.status==='draft'?'en curso':selectedCount.status==='submitted'?'por aprobar':'finalizado'}</h2><span className="pill blue">{saved} / {lines.length} contadas</span></div>
    {selectedCount.status==='draft'&&<><div className="form-stack"><label>Escanea código de barra (el lector debe enviar Enter)<input ref={ref} autoFocus value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scanCode();}}} placeholder="MK0000000001 o SKU"/></label><div className="grid two"><label>Buscar variante para conteo manual<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="SKU, talla, color..."/></label><div><small className="muted">El primer escaneo registra 1 unidad; los siguientes la incrementan. También puedes escribir una cantidad directamente.</small></div></div></div></>}
    {pendingWrites>0&&<p className="muted small">Guardando {pendingWrites} lectura(s) de escáner... No cierres esta página.</p>}
    {failedWrites>0&&<div className="alert error">Hay {failedWrites} variante(s) sin guardar. Revisa la conexión y vuelve a confirmar su cantidad con Enter antes de enviar el conteo.</div>}
    <div className="table-wrap"><table><thead><tr><th>SKU / Prenda</th><th>Registrado al iniciar</th><th>Contado físicamente</th><th>Diferencia</th></tr></thead><tbody>{visible.map(l=>{const v=map.get(l.variant_id);if(!v)return null;const n=counted[l.variant_id];return <tr key={l.id}><td><b>{v.sku}</b><br/><small>{v.products?.name} · {v.color}/{v.size} · {v.barcode}</small></td><td>{l.baseline_on_hand}</td><td>{selectedCount.status==='draft'?<input type="number" className="count-qty" min={0} max={1000000} key={`${l.id}-${n??'none'}`} defaultValue={n??''} placeholder="Sin contar" onBlur={e=>{const raw=e.target.value.trim();if(raw!==''&&(Number(raw)!==n||failedIds.current.has(l.variant_id)))setQty(l.variant_id,Number(raw));}} onKeyDown={e=>{if(e.key==='Enter'){(e.target as HTMLInputElement).blur();}}} disabled={busy}/>:n??'—'}</td><td>{n===null||n===undefined?'—':n-l.baseline_on_hand}</td></tr>;})}</tbody></table></div>
    <div className="action-row count-actions">{selectedCount.status==='draft'&&<button className="btn primary" disabled={busy||pendingWrites>0||failedWrites>0||saved===0} onClick={submit}>Enviar a aprobación</button>}
     {selectedCount.status==='submitted'&&role==='admin'&&<button className="btn primary" disabled={busy||pendingWrites>0} onClick={()=>{if(confirm('¿Aprobar ajustes? Esto cambiará stock físico y creará movimientos de Kardex.'))void run(()=>approveCountAction(selectedCount.id));}}>Aprobar ajustes en Kardex</button>}
     {['draft','submitted'].includes(selectedCount.status)&&<button className="btn outline" disabled={busy||pendingWrites>0} onClick={()=>{if(confirm('¿Cancelar este conteo? No se modificará el stock.'))void run(()=>cancelCountAction(selectedCount.id));}}>Cancelar conteo</button>}
    </div>
    <p className="muted small">Si hubo ventas, compras o cambios de reservas desde que inició el conteo, la aprobación se rechazará para proteger el inventario. Un conteo incompleto solo ajusta las variantes que tienen cantidad registrada.</p>
  </section>}
  <ResultMessage result={result}/>
 </div>;
}
