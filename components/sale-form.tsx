'use client';
import {useEffect,useRef,useState} from 'react';
import {createOrderAction,findSaleVariantAction,searchSaleVariantsAction} from '@/lib/actions';
import {money,available,type Variant,type Customer,type ActionResult} from '@/lib/types';
import {ResultMessage} from '@/components/ui';
type CartLine={variant_id:string;quantity:number};
export function SaleForm({variants,customers}:{variants:Variant[];customers:Customer[]}){
 const [catalog,setCatalog]=useState<Variant[]>(variants);const [matches,setMatches]=useState<Variant[]>([]);const [searching,setSearching]=useState(false);
 const [scanCode,setScanCode]=useState(''); const [query,setQuery]=useState('');const [variant,setVariant]=useState('');const [quantity,setQuantity]=useState(1);
 const [cart,setCart]=useState<CartLine[]>([]);const [buyer,setBuyer]=useState('');const [handle,setHandle]=useState('');const [customer,setCustomer]=useState('');
 const [channel,setChannel]=useState<'tiktok'|'whatsapp'|'directo'>('tiktok');const [mode,setMode]=useState<'reserve'|'paid'>('reserve');
 const [method,setMethod]=useState<'yape'|'plin'|'efectivo'|'transferencia'>('yape');const [minutes,setMinutes]=useState(45);
 const [working,setWorking]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);
 const key=useRef<string|null>(null);const scannerRef=useRef<HTMLInputElement>(null);const customerDetailsRef=useRef<HTMLDetailsElement>(null);const searchSeq=useRef(0);
 useEffect(()=>{const term=query.trim();const seq=++searchSeq.current;if(term.length<2){setMatches([]);setSearching(false);return;}const timer=setTimeout(async()=>{setSearching(true);const r=await searchSaleVariantsAction(term);if(seq===searchSeq.current){setMatches(r.variants.filter(v=>available(v)>0));setCatalog(prev=>{const byId=new Map(prev.map(v=>[v.id,v]));for(const v of r.variants)byId.set(v.id,v);return [...byId.values()];});setSearching(false);if(r.error)setResult({ok:false,error:r.error});}},220);return()=>clearTimeout(timer);},[query]);
 const current=matches.find(v=>v.id===variant);
 const total=cart.reduce((sum,l)=>sum+(catalog.find(v=>v.id===l.variant_id)?.sale_price||0)*l.quantity,0);
 async function scan(){
  const text=scanCode.trim().toUpperCase();setScanCode('');if(!text)return;
  const found=await findSaleVariantAction(text);const v=found.variant;
  if(!v){setResult({ok:false,error:found.error||'Código no encontrado.'});scannerRef.current?.focus();return;}
  setCatalog(prev=>prev.some(x=>x.id===v.id)?prev.map(x=>x.id===v.id?v:x):[...prev,v]);
  const inCart=cart.find(l=>l.variant_id===v.id)?.quantity||0;
  if(!v.active||available(v)<=inCart){setResult({ok:false,error:`Stock agotado para ${v.sku} (disponible ${available(v)})`});scannerRef.current?.focus();return;}
  setCart(prev=>{const old=prev.find(l=>l.variant_id===v.id);return old?prev.map(l=>l.variant_id===v.id?{...l,quantity:l.quantity+1}:l):[...prev,{variant_id:v.id,quantity:1}];});
  setResult({ok:true,message:`Escaneado ${v.sku}: +1 al carrito.`});scannerRef.current?.focus();
 }
 function add(){if(!current||quantity<=0)return;const old=cart.find(l=>l.variant_id===variant);
  if((old?.quantity||0)+quantity>available(current)){setResult({ok:false,error:`Stock disponible: ${available(current)} unidades`});return;}
  setCart(xs=>old?xs.map(l=>l.variant_id===variant?{...l,quantity:l.quantity+quantity}:l):[...xs,{variant_id:variant,quantity}]);setResult(null);setVariant('');setQuantity(1);}
 async function submit(e:React.FormEvent){e.preventDefault();if(working||cart.length===0)return;
  if(mode==='reserve'&&!buyer.trim()&&!handle.trim()&&!customer){setResult({ok:false,error:'Para reservar, identifica al comprador por nombre o cliente frecuente. El usuario de TikTok es opcional.'});if(customerDetailsRef.current)customerDetailsRef.current.open=true;return;}
  if(mode==='paid'&&!confirm('¿Ya comprobaste que recibiste el pago? Esto descontará el stock físico.'))return;
  setWorking(true);setResult(null);
  if(!key.current)key.current=crypto.randomUUID();
  const response=await createOrderAction({request_key:key.current,buyer,handle,customer_id:customer||null,channel,mode,method:mode==='paid'?method:null,minutes,lines:cart});
  setResult(response);setWorking(false);
  if(response.ok){setCart([]);setBuyer('');setHandle('');setCustomer('');if(customerDetailsRef.current)customerDetailsRef.current.open=false;key.current=null;}
 }
 return <section className="card sale-form"><div className="section-title"><h2>Nueva venta / reserva</h2><span className="pill blue">Registro rápido</span></div>
  <form onSubmit={submit} className="form-stack">
   <label>Canal de venta<select value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}><option value="tiktok">TikTok Live</option><option value="whatsapp">WhatsApp</option><option value="directo">Venta directa</option></select></label>
   <details ref={customerDetailsRef} className="sale-customer-details"><summary>Datos del comprador <span className="muted small">Opcionales en venta pagada</span></summary><p className="muted small">Para una reserva, selecciona un cliente o escribe un nombre. El usuario de TikTok es opcional.</p><label>Cliente frecuente<select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Sin cliente registrado</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.tiktok_handle||''}</option>)}</select></label>
   <div className="grid two"><label>Nombre comprador<input value={buyer} onChange={e=>setBuyer(e.target.value)} placeholder="Opcional"/></label><label>Usuario TikTok<input value={handle} onChange={e=>setHandle(e.target.value)} placeholder="Opcional: @usuario"/></label></div></details>
   <label>Escáner de código de barras (lector USB)<input ref={scannerRef} autoFocus value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void scan();}}} placeholder="Enfoca aquí y escanea" aria-label="Escanear código para agregar una unidad"/></label>
   <p className="muted small">Cada lectura suma 1 unidad al carrito y verifica el disponible. También puedes escribir un SKU manualmente. El escaneo todavía no confirma ninguna venta.</p>
   <label>Buscar por SKU, código, talla, color o nombre<input value={query} onChange={e=>{setQuery(e.target.value);setVariant('');}} placeholder="Ej. pantalón negro L"/></label>
   {searching&&<p className="muted small">Buscando en el catálogo…</p>}
   {!searching&&query.trim().length>=2&&matches.length===0&&<p className="muted small">No se encontraron prendas disponibles con esa búsqueda.</p>}
   <div className="grid sale-pick"><label>Prenda disponible<select value={variant} onChange={e=>setVariant(e.target.value)}><option value="">Selecciona una variante</option>{matches.map(v=><option value={v.id} key={v.id}>{v.sku} · {v.products?.name} · {v.color}/{v.size} · {available(v)} uds · {money(v.sale_price)}</option>)}</select></label><label>Unidades<input type="number" value={quantity} onChange={e=>setQuantity(Number(e.target.value))} min="1" max={current?available(current):1000}/></label><button className="btn outline" type="button" onClick={add} disabled={!current}>Añadir</button></div>
   <div className="cart-box"><div className="cart-head"><b>Prendas en pedido</b><span>{cart.length} SKU</span></div>{cart.length===0?<p className="muted small">Agrega al menos una prenda para reservar o vender.</p>:cart.map(l=>{const v=catalog.find(x=>x.id===l.variant_id);return <div className="cart-line" key={l.variant_id}><div><b>{v?.products?.name}</b><span>{v?.sku} · {v?.size}/{v?.color} · {l.quantity} und.</span></div><strong>{money(l.quantity*(v?.sale_price||0))}</strong><button type="button" className="mini-danger" aria-label="Quitar prenda" onClick={()=>setCart(xs=>xs.filter(x=>x.variant_id!==l.variant_id))}>×</button></div>})}<div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div></div>
   <div className="grid two"><label>Tipo de operación<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="reserve">Reservar (sin pago)</option><option value="paid">Venta pagada y verificada</option></select></label>{mode==='reserve'?<label>Duración de reserva (minutos)<input type="number" min="5" max="720" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>:<label>Medio de pago verificado<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label>}</div>
   <p className="muted small">Las reservas apartan unidades disponibles; las ventas pagadas descuentan el stock y generan Kardex. No hay verificación automática de Yape/Plin.</p>
   <button type="submit" className="btn primary large" disabled={working||cart.length===0}>{working?'Procesando...':mode==='reserve'?'Reservar prendas':'Confirmar venta pagada'}</button>
  </form><ResultMessage result={result}/>
 </section>;
}
