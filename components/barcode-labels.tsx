'use client';
import {useMemo,useState} from 'react';
import {BarcodeSVG} from '@/components/barcode-svg';
import {money,type Variant} from '@/lib/types';

export function BarcodeLabels({variants}:{variants:Variant[]}){
 const [filter,setFilter]=useState('');
 const [selected,setSelected]=useState<Record<string,number>>({});
 const [format,setFormat]=useState<'50x30'|'40x25'>('50x30');
 const found=useMemo(()=>variants.filter(v=>(`${v.barcode||''} ${v.sku} ${v.products?.name||''} ${v.size} ${v.color}`).toLocaleLowerCase().includes(filter.toLocaleLowerCase())).slice(0,150),[variants,filter]);
 const selectedRows=variants.filter(v=>(selected[v.id]||0)>0).flatMap(v=>Array.from({length:Math.min(100,selected[v.id]||0)},(_,n)=>({v,key:`${v.id}-${n}`})));
 const limit=300;
 function change(id:string,qty:number){setSelected(p=>({...p,[id]:Math.max(0,Math.min(100,Math.floor(qty)||0))}));}
 return <div className="barcode-section">
  <section className="card"><div className="section-title"><h2>Impresión de etiquetas</h2><span className="pill blue">Code 128 interno</span></div>
   <p className="muted small">Cada etiqueta identifica una variante y conserva su código aun cuando cambie el precio. Escoge cuántas unidades imprimir; no altera las existencias.</p>
   <div className="form-stack"><div className="grid two"><label>Buscar prenda o código<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Ej. casaca negra M"/></label><label>Tamaño de papel<select value={format} onChange={e=>setFormat(e.target.value as typeof format)}><option value="50x30">50 × 30 mm (recomendado)</option><option value="40x25">40 × 25 mm (prueba tu impresora)</option></select></label></div></div>
   <div className="table-wrap"><table><thead><tr><th>Prenda</th><th>SKU / Código interno</th><th>Precio</th><th>Etiquetas</th></tr></thead><tbody>{found.map(v=><tr key={v.id}><td><b>{v.products?.name}</b><br/><small>{v.color} / {v.size}</small></td><td className="mono">{v.sku}<br/><small>{v.barcode||'Sin código (instala 005)'}</small></td><td>{money(v.sale_price)}</td><td><input className="label-qty" type="number" min={0} max={100} value={selected[v.id]||0} onChange={e=>change(v.id,Number(e.target.value))} aria-label={`Cantidad de etiquetas para ${v.sku}`} disabled={!v.barcode}/></td></tr>)}</tbody></table></div>
   <div className="label-controls"><span>{selectedRows.length} etiquetas seleccionadas {selectedRows.length>limit?`(límite ${limit})`:''}</span><div className="action-row"><button type="button" className="btn outline" onClick={()=>setSelected({})}>Limpiar selección</button><button type="button" className="btn outline" onClick={()=>setSelected(p=>{const next={...p};for(const v of found)if(v.barcode)next[v.id]=Math.min(100,Math.max(0,v.on_hand));return next;})}>Usar stock físico (filtrados)</button><button type="button" className="btn primary" disabled={!selectedRows.length||selectedRows.length>limit} onClick={()=>window.print()}>Imprimir etiquetas</button></div></div>
  </section>
  <section className="print-label-sheet" aria-label="Hoja de etiquetas para imprimir" data-size={format}>
   {selectedRows.map(({v,key})=><div className="print-barcode-label" key={key}><b>MONKY'S STORE</b><span className="label-product">{v.products?.name||'Prenda'} · {v.color} / {v.size}</span><BarcodeSVG value={v.barcode||''} height={43}/><span className="label-meta">{v.barcode} · {money(v.sale_price)}</span></div>)}
  </section>
 </div>;
}
