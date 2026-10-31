'use client';
import {useState} from 'react';
import {createProductAction,addVariantAction,importExcelAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult,Product} from '@/lib/types';

const initial={product_code:'',name:'',category:'',brand:'',sku:'',size:'M',color:'Negro',sale_price:'',cost:'',initial_stock:'0',min_stock:'2'};
export function ProductForm({products}:{products:Product[]}){
 const [mode,setMode]=useState<'new'|'variant'|'import'>('new');const [values,setValues]=useState(initial);
 const [productId,setProductId]=useState('');const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 function change(k:keyof typeof initial,v:string){setValues(x=>({...x,[k]:v}));}
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setResult(null);
  const v={...values,sale_price:Number(values.sale_price),cost:Number(values.cost||0),initial_stock:Number(values.initial_stock),min_stock:Number(values.min_stock)};
  const r=mode==='new'?await createProductAction(v):await addVariantAction({product_id:productId,sku:v.sku,size:v.size,color:v.color,sale_price:v.sale_price,cost:v.cost,initial_stock:v.initial_stock,min_stock:v.min_stock});
  setResult(r);setBusy(false);if(r.ok){setValues(initial);}
 }
 async function importFile(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setResult(null);const fd=new FormData(e.currentTarget);const res=await importExcelAction(fd);setResult(res);setBusy(false);if(res.ok)(e.target as HTMLFormElement).reset();}
 return <section className="card"><div className="section-title"><h2>Registro de productos</h2><span className="muted small">Administrador</span></div>
  <div className="tabs"><button type="button" className={mode==='new'?'selected':''} onClick={()=>{setMode('new');setResult(null);}}>Nuevo producto</button><button type="button" className={mode==='variant'?'selected':''} onClick={()=>{setMode('variant');setResult(null);}}>Agregar talla/color</button><button type="button" className={mode==='import'?'selected':''} onClick={()=>{setMode('import');setResult(null);}}>Importar Excel</button></div>
  {mode==='import'?<form onSubmit={importFile} className="form-stack"><p className="muted small">Solo archivos .xlsx. Encabezados exactos, en este orden:</p><code className="code-hint">codigo_producto, nombre, categoria, sku, talla, color, costo, precio, stock_inicial, stock_minimo</code><p className="muted small">Se permiten hasta 500 filas nuevas. La importación es atómica: si alguna falla, no se guarda ninguna.</p><label>Archivo Excel<input type="file" name="archivo" accept=".xlsx" required /></label><button className="btn primary" disabled={busy}>{busy?'Validando...':'Importar catálogo y stock'}</button></form>
  :<form onSubmit={submit} className="form-stack">
   {mode==='new'?<div className="grid two"><label>Código de producto<input required maxLength={40} value={values.product_code} onChange={e=>change('product_code',e.target.value)} placeholder="CAS-001"/></label><label>Nombre<input required value={values.name} onChange={e=>change('name',e.target.value)} placeholder="Casaca táctica"/></label><label>Categoría<input value={values.category} onChange={e=>change('category',e.target.value)} placeholder="Casacas"/></label><label>Marca (opcional)<input value={values.brand} onChange={e=>change('brand',e.target.value)} placeholder="Marca"/></label></div>
   :<label>Producto existente<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Seleccionar producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.product_code} · {p.name}</option>)}</select></label>}
   <div className="grid three"><label>SKU único<input required value={values.sku} onChange={e=>change('sku',e.target.value)} placeholder="CAS-001-NG-M"/></label><label>Talla<input required value={values.size} onChange={e=>change('size',e.target.value)}/></label><label>Color<input required value={values.color} onChange={e=>change('color',e.target.value)}/></label></div>
   <div className="grid four"><label>Precio S/<input required type="number" min="0" step="0.01" value={values.sale_price} onChange={e=>change('sale_price',e.target.value)}/></label><label>Costo inicial S/<input required type="number" min="0" step="0.01" value={values.cost} onChange={e=>change('cost',e.target.value)}/></label><label>Stock inicial<input required type="number" min="0" step="1" value={values.initial_stock} onChange={e=>change('initial_stock',e.target.value)}/></label><label>Stock mínimo<input required type="number" min="0" step="1" value={values.min_stock} onChange={e=>change('min_stock',e.target.value)}/></label></div>
   <p className="muted small">El stock inicial se registrará en Kardex. No vuelvas a usar esta operación para reponer mercadería: utiliza Compras.</p><button disabled={busy} className="btn primary">{busy?'Guardando...':mode==='new'?'Crear producto':'Agregar variante'}</button>
  </form>}
  <ResultMessage result={result}/>
 </section>;
}
