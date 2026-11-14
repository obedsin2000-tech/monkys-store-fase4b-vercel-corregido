'use client';
import {useEffect,useRef,useState} from 'react';
import {createOrderAction,findSaleVariantAction,searchSaleVariantsAction} from '@/lib/actions';
import {money,available,type Variant,type Customer,type ActionResult} from '@/lib/types';
import {ResultMessage} from '@/components/ui';
import {moneyCents,saleTotals,type SaleCartLine as CartLine} from '@/lib/sale-totals';

type SearchResult = { term: string; variants: Variant[]; error?: string };

function remainingUnits(item: Variant, lines: CartLine[]) {
 const inCart = lines.find(line => line.variant_id === item.id)?.quantity ?? 0;
 return Math.max(0, available(item) - inCart);
}

export function SaleForm({variants,customers}:{variants:Variant[];customers:Customer[]}){
 const [catalog,setCatalog]=useState<Variant[]>(variants);
 const [lookup,setLookup]=useState<SearchResult|null>(null);
 const [pickerError,setPickerError]=useState<string|null>(null);
 const [scanCode,setScanCode]=useState(''); const [query,setQuery]=useState('');const [variant,setVariant]=useState('');const [quantity,setQuantity]=useState(1);
 const [cart,setCartState]=useState<CartLine[]>([]);const [buyer,setBuyer]=useState('');const [handle,setHandle]=useState('');const [customer,setCustomer]=useState('');
 const [channel,setChannel]=useState<'tiktok'|'whatsapp'|'directo'>('tiktok');const [mode,setMode]=useState<'reserve'|'paid'>('reserve');
 const [method,setMethod]=useState<'yape'|'plin'|'efectivo'|'transferencia'>('yape');const [minutes,setMinutes]=useState(45);
 const [working,setWorking]=useState(false);const [result,setResult]=useState<ActionResult|null>(null);
 const [showDiscounts,setShowDiscounts]=useState(false);
 const cartRef=useRef<CartLine[]>([]);const inFlight=useRef(false);const pendingScans=useRef(0);const [scanning,setScanning]=useState(0);
 function setCart(update:CartLine[]|((previous:CartLine[])=>CartLine[])){cartRef.current=typeof update==='function'?update(cartRef.current):update;setCartState(cartRef.current);}
 const key=useRef<string|null>(null);const scannerRef=useRef<HTMLInputElement>(null);const customerDetailsRef=useRef<HTMLDetailsElement>(null);
 const term = query.trim();
 useEffect(() => {
  if (term.length < 2) return;
  let current = true;
  const timer = setTimeout(async () => {
   try {
    const response = await searchSaleVariantsAction(term);
    if (!current) return;
    setLookup({ term, ...response });
    setCatalog(previous => {
     const byId = new Map(previous.map(item => [item.id, item]));
     for (const item of response.variants) byId.set(item.id, item);
     return [...byId.values()];
    });
   } catch {
    if (current) setLookup({ term, variants: [], error: 'No se pudo buscar. Revisa la conexión e intenta de nuevo.' });
   }
  }, 220);
  return () => {
   current = false;
   clearTimeout(timer);
  };
 }, [term]);
 const search = lookup?.term === term ? lookup : null;
 const searching = term.length >= 2 && !search;
 const matches = (search?.variants ?? [])
  .map(match => catalog.find(item => item.id === match.id) ?? match)
  .filter(item => item.active && available(item) > 0);
 const current=matches.find(v=>v.id===variant);
 const remaining = current ? remainingUnits(current, cart) : 0;
 const units = cart.reduce((sum, line) => sum + line.quantity, 0);
 const totals=saleTotals(cart,catalog);
 function resetPicker() {
  setLookup(null);
  setVariant('');
  setQuantity(1);
  setPickerError(null);
 }

 function changeQuery(value: string) {
  setQuery(value);
  if (value.trim() !== term) resetPicker();
 }

 function addUnits(item: Variant, amount: number) {
  const left = remainingUnits(item, cartRef.current);
  if (!item.active) return `${item.sku} ya no está activo en el catálogo.`;
  if (!Number.isInteger(amount) || amount < 1) return 'Ingresa una cantidad entera mayor que cero.';
  if (amount > left) {
   const inCart = cartRef.current.find(line => line.variant_id === item.id)?.quantity ?? 0;
   return `${item.sku}: quedan ${left} por añadir. Tienes ${inCart} en el pedido.`;
  }
  const previous = cartRef.current.find(line => line.variant_id === item.id);
  setCart(lines => previous
   ? lines.map(line => line.variant_id === item.id ? { ...line, quantity: line.quantity + amount } : line)
   : [...lines, { variant_id: item.id, quantity: amount }]);
  return null;
 }

 function updateDiscount(id:string,value:string){setCart(lines=>lines.map(line=>line.variant_id===id?{...line,unit_discount:value}:line));setResult(null);}
 async function scan(){
  if(inFlight.current)return;const text=scanCode.trim().toUpperCase();setScanCode('');if(!text)return;pendingScans.current+=1;setScanning(pendingScans.current);try{
  const found=await findSaleVariantAction(text);const v=found.variant;
  if(!v){setResult({ok:false,error:found.error||'Código no encontrado.'});scannerRef.current?.focus();return;}
  setCatalog(prev=>prev.some(x=>x.id===v.id)?prev.map(x=>x.id===v.id?v:x):[...prev,v]);
  const error = addUnits(v, 1);
  setResult(error ? { ok: false, error } : { ok: true, message: `Escaneado ${v.sku}: +1 al carrito.` });
  scannerRef.current?.focus();
  }catch{setResult({ok:false,error:'No se pudo consultar el código. Vuelve a escanear cuando recuperes la conexión.'});}
  finally{pendingScans.current-=1;setScanning(pendingScans.current);}
 }
 function add(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (inFlight.current || !current) return;
  const error = addUnits(current, quantity);
  setPickerError(error);
  if (!error) {
   setResult(null);
   setQuantity(1);
  }
 }
 async function submit(e:React.FormEvent){e.preventDefault();if(inFlight.current||cartRef.current.length===0)return;if(pendingScans.current>0){setResult({ok:false,error:'Espera a que terminen los escaneos antes de confirmar.'});return;}
  if(!totals.valid){setResult({ok:false,error:'Corrige los descuentos indicados antes de continuar.'});return;}
  if(mode==='reserve'&&!buyer.trim()&&!handle.trim()&&!customer){setResult({ok:false,error:'Para reservar, identifica al comprador por nombre o cliente frecuente. El usuario de TikTok es opcional.'});if(customerDetailsRef.current)customerDetailsRef.current.open=true;return;}
  if(mode==='paid'&&!confirm(`¿Ya comprobaste que recibiste ${money(totals.total)}? Esto descontará el stock físico.`))return;
  inFlight.current=true;setWorking(true);setResult(null);try{
  if(!key.current)key.current=crypto.randomUUID();
  const response=await createOrderAction({request_key:key.current,buyer,handle,customer_id:customer||null,channel,mode,method:mode==='paid'?method:null,minutes,lines:cart.map(line=>({variant_id:line.variant_id,quantity:line.quantity,unit_discount:Number(line.unit_discount||0),expected_unit_price:Number(catalog.find(v=>v.id===line.variant_id)?.sale_price)}))});
  setResult(response);
  if(response.ok){
   setCart([]);setShowDiscounts(false);setBuyer('');setHandle('');setCustomer('');
   setQuery('');
   resetPicker();
   if(customerDetailsRef.current)customerDetailsRef.current.open=false;
   key.current=null;
  }
  }catch{setResult({ok:false,error:'No se pudo confirmar la operación. Reintenta con los mismos datos para evitar duplicados.'});}
  finally{inFlight.current=false;setWorking(false);}
 }
 return <section className="card sale-form"><div className="section-title"><h2>Nueva venta / reserva</h2><span className="pill blue">Registro rápido</span></div>
  <fieldset disabled={working} className="form-section form-stack">
   <label>Canal de venta<select value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}><option value="tiktok">TikTok Live</option><option value="whatsapp">WhatsApp</option><option value="directo">Venta directa</option></select></label>
   <details ref={customerDetailsRef} className="sale-customer-details"><summary>Datos del comprador <span className="muted small">Opcionales en venta pagada</span></summary><p className="muted small">Para una reserva, selecciona un cliente o escribe un nombre. El usuario de TikTok es opcional.</p><label>Cliente frecuente<select value={customer} onChange={e=>setCustomer(e.target.value)}><option value="">Sin cliente registrado</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.tiktok_handle||''}</option>)}</select></label>
   <div className="grid two"><label>Nombre comprador<input value={buyer} onChange={e=>setBuyer(e.target.value)} placeholder="Opcional"/></label><label>Usuario TikTok<input value={handle} onChange={e=>setHandle(e.target.value)} placeholder="Opcional: @usuario"/></label></div></details>
   <label>Escáner de código de barras (lector USB)<input ref={scannerRef} autoFocus value={scanCode} onChange={e=>setScanCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void scan();}}} placeholder="Enfoca aquí y escanea" aria-label="Escanear código para agregar una unidad"/></label>
   <p className="muted small">Cada lectura suma 1 unidad al carrito y verifica el disponible. También puedes escribir un SKU manualmente. El escaneo todavía no confirma ninguna venta.</p>
   <form onSubmit={add} className="form-section" aria-label="Añadir prenda">
    <label>Buscar por SKU, código, talla, color o nombre
     <input type="search" value={query} onChange={e=>changeQuery(e.target.value)} placeholder="Ej. pantalón"/>
    </label>
    {searching && <p className="field-hint" role="status">Buscando en el catálogo…</p>}
    {search?.error && <p className="field-error" role="alert">{search.error}</p>}
    {search && !search.error && matches.length === 0 && <p className="field-hint" role="status">No se encontraron prendas disponibles con esa búsqueda.</p>}
    <div className="grid sale-pick">
     <label>Prenda disponible
      <select value={variant} disabled={matches.length===0} onChange={event=>{
       setVariant(event.target.value);
       setQuantity(1);
       setPickerError(null);
      }}>
       <option value="">Selecciona una variante</option>
       {matches.map(item=>{
        const left = remainingUnits(item, cart);
        return <option value={item.id} key={item.id} disabled={left===0}>
         {item.sku} · {item.products?.name} · {item.color}/{item.size} · {left} por añadir · {money(item.sale_price)}
        </option>;
       })}
      </select>
     </label>
     <label>Unidades
      <input type="number" value={quantity || ''} disabled={!current||remaining===0}
       onChange={event=>{setQuantity(Number(event.target.value));setPickerError(null);}}
       min="1" max={remaining || undefined} step="1" required aria-describedby={current?'venta-unidades-disponibles':undefined}/>
     </label>
     <button className="btn outline" type="submit" disabled={!current||remaining===0}>Añadir</button>
    </div>
    {current && <p id="venta-unidades-disponibles" className="field-hint" role="status">
     {remaining > 0 ? `Disponibles para añadir de ${current.sku}: ${remaining}.` : `Ya añadiste todas las unidades disponibles de ${current.sku}. Elige otra prenda.`}
    </p>}
    {pickerError && <p className="field-error" role="alert">{pickerError}</p>}
   </form>
   <form onSubmit={submit} className="form-section" aria-label="Confirmar pedido">
   <div className="cart-box"><div className="cart-head"><b>Prendas en pedido <small className="muted">· {units} {units===1?'unidad':'unidades'} · {cart.length} SKU</small></b><button type="button" className="link-btn" disabled={!cart.length} aria-expanded={showDiscounts} onClick={()=>{if(showDiscounts)setCart(lines=>lines.map(line=>({...line,unit_discount:''})));setShowDiscounts(!showDiscounts);setResult(null);}}>{showDiscounts?'Quitar descuentos':'Añadir descuentos'}</button></div>
   {showDiscounts&&<p id="descuentos-carrito" className="field-hint">Indica cuánto rebajar por cada unidad. Ejemplo: S/ 5 de descuento en 2 prendas rebaja S/ 10 del pedido. El precio del catálogo se conserva.</p>}
   {cart.length===0?<p className="muted small">Agrega al menos una prenda para reservar o vender.</p>:cart.map(l=>{const v=catalog.find(x=>x.id===l.variant_id);const price=moneyCents(v?.sale_price)||0;const reduction=totals.errors[l.variant_id]?0:moneyCents(l.unit_discount)||0;const error=totals.errors[l.variant_id];return <div className="cart-line" key={l.variant_id}><div><b>{v?.products?.name}</b><span>{v?.sku} · {v?.size}/{v?.color} · {l.quantity} und. · {money(price/100)} c/u</span>
   {showDiscounts&&<label className="line-discount" htmlFor={`descuento-${l.variant_id}`}>Descuento por unidad (S/)<input id={`descuento-${l.variant_id}`} name={`discount-${l.variant_id}`} type="number" inputMode="decimal" min="0" max={Math.max(0,(price-1)/100)} step="0.01" value={l.unit_discount||''} placeholder="0.00" onChange={e=>updateDiscount(l.variant_id,e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error?`error-descuento-${l.variant_id}`:undefined}/>{error&&<small id={`error-descuento-${l.variant_id}`} className="field-error">{error}</small>}</label>}</div>
   <div className="cart-line-price">{reduction>0&&<del>{money(price*l.quantity/100)}</del>}<strong>{money((price-reduction)*l.quantity/100)}</strong></div><button type="button" className="mini-danger" aria-label="Quitar prenda" onClick={()=>setCart(xs=>xs.filter(x=>x.variant_id!==l.variant_id))}>×</button></div>})}
   <div className="cart-summary" aria-live="polite" aria-atomic="true">{showDiscounts&&<><div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div><div className="discount-summary"><span>Descuento total</span><strong>− {money(totals.discount)}</strong></div></>}<div className="cart-total"><span>Total a {mode==='reserve'?'reservar':'cobrar'}</span><strong>{money(totals.total)}</strong></div></div></div>
    <div className="grid two"><label>Tipo de operación<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="reserve">Reservar (sin pago)</option><option value="paid">Venta pagada y verificada</option></select></label>{mode==='reserve'?<label>Duración de reserva (minutos)<input type="number" min="5" max="720" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label>:<label>Medio de pago verificado<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label>}</div>
    <p className="muted small">Las reservas apartan unidades disponibles; las ventas pagadas descuentan el stock y generan Kardex. No hay verificación automática de Yape/Plin.</p>
    <button type="submit" className="btn primary large" disabled={working||scanning>0||cart.length===0||!totals.valid}>{working?'Procesando...':mode==='reserve'?'Reservar prendas':'Confirmar venta pagada'}</button>
   </form>
  </fieldset><ResultMessage result={result}/>
 </section>;
}
