import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {load,nodes} from './helpers/components.mjs';

// Usa el cliente Supabase real para comprobar la consulta HTTP generada.
// El transporte simula la API; no se conecta a una cuenta ni reemplaza pruebas de PostgREST.
function api({orders=[],shipments=[],customers=[],products=[],variants=[],dniError=false}={}){
 const requests=[];
 const fetch=async raw=>{
  const url=new URL(raw);requests.push(url);const p=url.searchParams;let rows=[];
  if(url.pathname.endsWith('/rpc/admin_get_shipment_dni')){
   return new Response(JSON.stringify(dniError?{message:'Fallo de lectura simulado'}:shipments.map(s=>({order_id:s.order_id,dni:null}))),{status:dniError?500:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.pathname.endsWith('/rpc/expire_reservations'))return new Response('0',{headers:{'Content-Type':'application/json'}});
  if(url.pathname.endsWith('/customers'))rows=customers;
  if(url.pathname.endsWith('/products'))rows=p.get('or')?.includes('product_code.ilike')?products:[];
  if(url.pathname.endsWith('/variants'))rows=p.has('product_id')?variants:[];
  if(url.pathname.endsWith('/orders')){
   rows=orders;
   if(p.get('id'))rows=rows.filter(o=>o.id===p.get('id').slice(3));
   if(p.get('status'))rows=rows.filter(o=>o.status===p.get('status').slice(3));
   if(p.get('sent')==='is.null')rows=rows.filter(o=>!shipments.some(s=>s.order_id===o.id&&['dispatched','delivered'].includes(s.status)));
   if(p.get('or')){
    const expression=p.get('or');
    rows=rows.filter(o=>expression.includes(`customer_id.in.(${o.customer_id})`)||expression.includes(`order_number.eq.${o.order_number}`)||[o.buyer_name,o.tiktok_handle].filter(Boolean).some(name=>expression.toLowerCase().includes(`%${name.toLowerCase()}%`)));
   }
  }
  if(url.pathname.endsWith('/shipments')){
   rows=shipments;
   if(p.has('order_id'))rows=rows.filter(s=>p.get('order_id').includes(s.order_id));
   if(p.has('status'))rows=rows.filter(s=>p.get('status').includes(s.status));
   if(p.get('orders.status'))rows=rows.filter(s=>orders.find(o=>o.id===s.order_id)?.status==='confirmed');
  }
  const total=rows.length;const offset=Number(p.get('offset')||0);const limit=Number(p.get('limit')||total);rows=rows.slice(offset,offset+limit);
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json','Content-Range':`${offset}-${offset+rows.length-1}/${total}`}});
 };
 return {s:createClient('https://example.supabase.co','test-key',{global:{fetch},auth:{persistSession:false}}),requests};
}
const base={order_number:1,buyer_name:'Comprador ficticio',tiktok_handle:null,status:'confirmed',customers:null,order_lines:[],total:100,payment_status:'paid',created_at:'2026-01-01T12:00:00Z'};
const Manager=()=>null;const Followup=()=>null;
const shippingMocks=s=>({'@/lib/auth':{requireUser:async()=>({supabase:s,role:'admin'})},'@/components/shipment-manager':{ShipmentManager:Manager},'@/components/shipment-followup':{ShipmentFollowup:Followup}});

test('Página: cola paginada excluye despachados/entregados antes de contar y no solicita DNI directo',async()=>{
 const orders=Array.from({length:65},(_,i)=>({...base,id:`order-${i}`,order_number:i+1}));
 const shipments=orders.slice(0,15).map((o,i)=>({id:`s-${i}`,order_id:o.id,status:i<10?'delivered':'dispatched',orders:{order_number:o.order_number}}));
 const mock=api({orders,shipments});const Page=load('app/(sistema)/envios/page.tsx',shippingMocks(mock.s)).default;
 const tree=await Page({searchParams:Promise.resolve({})});const editor=nodes(tree,n=>n.type===Manager)[0];
 assert.equal(editor.props.orders.length,50);assert.ok(editor.props.orders.every(o=>!shipments.some(s=>s.order_id===o.id)));
 const query=mock.requests.find(u=>u.pathname.endsWith('/orders'));assert.equal(query.searchParams.get('limit'),'50');assert.equal(query.searchParams.get('sent.status'),'in.(dispatched,delivered)');assert.equal(query.searchParams.get('sent'),'is.null');
 assert.match(query.searchParams.get('select'),/sent:shipments\(status\)/);
 assert.equal(mock.requests.filter(u=>u.pathname.endsWith('/orders')).length,1);
});

test('Página: fallo al cargar DNI conserva los datos al bloquear el editor administrativo',async()=>{
 const orders=[{...base,id:'order-a'}];const shipments=[{id:'s-a',order_id:'order-a',status:'pending',recipient_name:'Destinatario ficticio',orders:{order_number:1}}];
 const mock=api({orders,shipments,dniError:true});const Page=load('app/(sistema)/envios/page.tsx',shippingMocks(mock.s)).default;
 const tree=await Page({searchParams:Promise.resolve({})});assert.equal(nodes(tree,n=>n.type===Manager).length,0);
 assert.ok(nodes(tree,n=>n.props?.className==='alert error').some(n=>String(n.props.children).includes('DNI')));
});

test('Página: paquetes despachados conservan acciones de entrega y rótulo fuera de la cola',async()=>{
 const orders=[{...base,id:'order-a'}];const shipments=[{id:'s-a',order_id:'order-a',status:'dispatched',recipient_name:'Destinatario ficticio',orders:{order_number:1}}];
 const mock=api({orders,shipments});const Page=load('app/(sistema)/envios/page.tsx',shippingMocks(mock.s)).default;
 const tree=await Page({searchParams:Promise.resolve({})});assert.equal(nodes(tree,n=>n.type===Manager).length,0);
 assert.equal(nodes(tree,n=>n.type===Followup).length,1);assert.equal(nodes(tree,n=>n.type===Followup)[0].props.shipment.order_id,'order-a');
});

test('Página: el enlace desde Pedidos acota la cola y los paquetes al mismo pedido',async()=>{
 const id='00000000-0000-4000-8000-000000000101';
 const other='00000000-0000-4000-8000-000000000102';
 const orders=[{...base,id},{...base,id:other,order_number:2}];
 const shipments=[{id:'s-a',order_id:id,status:'preparing',orders:{order_number:1}},{id:'s-b',order_id:other,status:'pending',orders:{order_number:2}}];
 const mock=api({orders,shipments});const Page=load('app/(sistema)/envios/page.tsx',shippingMocks(mock.s)).default;
 const tree=await Page({searchParams:Promise.resolve({pedido:id})});
 assert.deepEqual(nodes(tree,n=>n.type===Manager)[0].props.orders.map(o=>o.id),[id]);
 assert.deepEqual(nodes(tree,n=>n.type===Followup).map(n=>n.props.shipment.order_id),[id]);
 assert.equal(mock.requests.find(u=>u.pathname.endsWith('/orders')).searchParams.get('id'),`eq.${id}`);
 assert.equal(mock.requests.filter(u=>u.pathname.endsWith('/shipments')&&u.searchParams.get('order_id')===`eq.${id}`).length,2);
});

test('Página: pedidos encuentran un cliente vinculado y el número de pedido',async()=>{
 for(const q of ['Cliente frecuente','#123']){
  const mock=api({customers:[{id:'customer-a'}],orders:[{...base,id:'order-a',buyer_name:null,customer_id:'customer-a',customers:{name:'Cliente frecuente',phone:null},order_number:123}]});
  const Page=load('app/(sistema)/pedidos/page.tsx',{'@/lib/auth':{requireUser:async()=>({supabase:mock.s})},'@/components/order-actions':{OrderActions:()=>null}}).default;
  const tree=await Page({searchParams:Promise.resolve({q})});assert.equal(nodes(tree,n=>n.props?.className==='order-card').length,1);
  const query=mock.requests.find(u=>u.pathname.endsWith('/orders'));
  assert.ok(!query.searchParams.get('or').includes('shipments.'));
  if(q==='#123')assert.match(query.searchParams.get('or'),/order_number.eq.123/);
 }
});

test('Página: actualizar la cola remonta el editor cuando sale el pedido seleccionado',async()=>{
 const keys=[];
 for(const orders of [[{...base,id:'order-a'},{...base,id:'order-b'}],[{...base,id:'order-b'}]]){
  const mock=api({orders});const Page=load('app/(sistema)/envios/page.tsx',shippingMocks(mock.s)).default;
  const tree=await Page({searchParams:Promise.resolve({})});keys.push(nodes(tree,n=>n.type===Manager)[0].key);
 }
 assert.notEqual(keys[0],keys[1]);
});

test('Catálogo: venta rápida encuentra variantes por el código del producto vinculado',async()=>{
 const mock=api({products:[{id:'product-a'}],variants:[{id:'variant-a',sku:'OTHER-SKU',product_id:'product-a',active:true,on_hand:2,reserved:0,blocked:0,products:{name:'Prenda de prueba',product_code:'CODE-TEST'}}]});
 const action=load('lib/actions.ts',{'@/lib/auth':{requireUser:async()=>({supabase:mock.s})},'next/cache':{revalidatePath(){}}}).searchSaleVariantsAction;
 const result=await action('CODE-TEST');assert.equal(result.error,undefined);assert.equal(result.variants[0]?.id,'variant-a');
});

test('Página: pedidos muestran el descuento guardado y no lo inventan en ventas anteriores',async()=>{
 for(const snapshot of [100,null,undefined]){
  const row={...base,id:'order-discount',total:180,order_lines:[{id:'line-test',quantity:2,unit_price:90,line_total:180,catalog_unit_price:snapshot}]};
  const mock=api({orders:[row]});
  const Page=load('app/(sistema)/pedidos/page.tsx',{'@/lib/auth':{requireUser:async()=>({supabase:mock.s})},'@/components/order-actions':{OrderActions:()=>null}}).default;
  const tree=await Page({searchParams:Promise.resolve({})});
  const discounts=nodes(tree,n=>n.props?.className==='order-discount');assert.equal(discounts.length,snapshot===100?1:0);
  if(snapshot===100)assert.ok(nodes(discounts[0],n=>n.type==='strong').some(n=>JSON.stringify(n.props.children).includes('20')));
  // El comodín funciona también cuando la base aún no tiene la columna de 010.
  assert.match(mock.requests.find(u=>u.pathname.endsWith('/orders')).searchParams.get('select'),/order_lines\(\*,variants\(/);
 }
});
