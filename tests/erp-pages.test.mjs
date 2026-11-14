import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {renderToStaticMarkup} from 'react-dom/server';
import {load,nodes} from './helpers/components.mjs';

// Usa el cliente Supabase real para comprobar la consulta HTTP generada.
// El transporte simula la API; no se conecta a una cuenta ni reemplaza pruebas de PostgREST.
function api({orders=[],shipments=[],customers=[],products=[],variants=[],dniError=false,dniRows}={}){
 const requests=[];
 const fetch=async (raw,options)=>{
  const url=new URL(raw);requests.push(url);const p=url.searchParams;let rows=[];
  if(url.pathname.endsWith('/rpc/admin_get_shipment_dni')){
   const {p_orders}=JSON.parse(options.body);
   const records=dniRows??shipments.map(s=>({order_id:s.order_id,dni:null}));
   return new Response(JSON.stringify(dniError?{message:'Fallo de lectura simulado'}:records.filter(record=>p_orders.includes(record.order_id))),{status:dniError?500:200,headers:{'Content-Type':'application/json'}});
  }
  if(url.pathname.endsWith('/rpc/expire_reservations'))return new Response('0',{headers:{'Content-Type':'application/json'}});
  if(url.pathname.endsWith('/customers'))rows=customers;
  if(url.pathname.endsWith('/products'))rows=p.get('or')?.includes('product_code.ilike')?products:[];
  if(url.pathname.endsWith('/variants')){
   rows=variants.filter(v=>v.active);
   if(p.has('size'))rows=rows.filter(v=>v.size===p.get('size').slice(3));
   if(p.has('color'))rows=rows.filter(v=>v.color===p.get('color').slice(3));
   if(p.get('products.category_id')==='is.null')rows=rows.filter(v=>v.products?.category_id===null);
   else if(p.has('products.category_id'))rows=rows.filter(v=>v.products?.category_id===p.get('products.category_id').slice(3));
   if(p.has('name_match.name')){
    const term=p.get('name_match.name').slice(7,-1).toLowerCase();
    rows=rows.filter(v=>[v.sku,v.barcode,v.size,v.color,v.products?.name].some(value=>value?.toLowerCase().includes(term)));
   }
  }
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

const labelOrder = '00000000-0000-4000-8000-000000000111';
const labelShipment = {
 order_id: labelOrder, recipient_name: 'Destinatario ficticio', phone: '900000000',
 province: 'Provincia de prueba', carrier: 'shalom', agency_address: 'Agencia de prueba',
 tracking_code: 'GUIA-PRUEBA', orders: { order_number: 42 },
};
const labelPage = (s, role) => load('app/(sistema)/envios/rotulos/page.tsx', {
 '@/lib/auth': { requireUser: async () => ({ supabase: s, role }) },
}).default;

test('Rótulos: la vista habitual del administrador incluye el DNI guardado y conserva la guía', async () => {
 const secondOrder = '00000000-0000-4000-8000-000000000112';
 const shipments = [labelShipment, { ...labelShipment, order_id: secondOrder, recipient_name: 'Segundo destinatario ficticio' }];
 const mock = api({ shipments, dniRows: [{ order_id: secondOrder, dni: null }, { order_id: labelOrder, dni: '00001234' }] });
 const tree = await labelPage(mock.s, 'admin')({ searchParams: Promise.resolve({ ids: [labelOrder, secondOrder].join(',') }) });
 const markup = renderToStaticMarkup(tree);
 const labels = markup.split('class="shipping-label"').slice(1);

 assert.equal(labels.length, 2);
 assert.match(labels[0], /Destinatario ficticio.*DNI:.*00001234.*GUIA-PRUEBA/);
 assert.doesNotMatch(labels[1], /DNI:|00001234/);
 assert.doesNotMatch(markup, /Pedido #42|Pedido sin referencia/);
 const selection = mock.requests.find(url => url.pathname.endsWith('/shipments')).searchParams.get('select');
 assert.doesNotMatch(selection, /dni|order_number|orders\(/);
 assert.equal(mock.requests.filter(url => url.pathname.endsWith('/rpc/admin_get_shipment_dni')).length, 1);
});

test('Rótulos: solo el administrador consulta DNI y puede elegir imprimir sin ese dato', async () => {
 for (const [role, dni] of [['operator', '1'], ['admin', '0']]) {
  const mock = api({ shipments: [labelShipment], dniRows: [{ order_id: labelOrder, dni: '00001234' }] });
  const tree = await labelPage(mock.s, role)({ searchParams: Promise.resolve({ ids: labelOrder, dni }) });
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /Destinatario ficticio/);
  assert.doesNotMatch(markup, /DNI:|00001234|Pedido #42/);
  assert.ok(mock.requests.every(url => !url.pathname.endsWith('/rpc/admin_get_shipment_dni')));
 }
});

test('Rótulos: una respuesta incompleta de DNI muestra un aviso en lugar de imprimir datos incompletos', async () => {
 const mock = api({ shipments: [labelShipment], dniRows: [] });
 const tree = await labelPage(mock.s, 'admin')({ searchParams: Promise.resolve({ ids: labelOrder }) });
 const markup = renderToStaticMarkup(tree);
 assert.match(markup, /No se pudieron cargar los DNI autorizados/);
 assert.doesNotMatch(markup, /shipping-label/);
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

test('Catálogo: combina nombre, categoría, talla y color antes de paginar',async()=>{
 const category='00000000-0000-4000-8000-000000000123';
 const lastCategory='00000000-0000-4000-8000-000000000124';
 const jacket={name:'Casaca táctica',category_id:category,categories:{name:'Casacas'}};
 const variant={sku:'SKU-TEST',size:'M',color:'AZUL',active:true,sale_price:89,on_hand:1,reserved:0,blocked:0,min_stock:1,products:jacket};
 const variants=[
  ...Array.from({length:51},(_,i)=>({...variant,id:`match-${i}`})),
  ...Array.from({length:450},(_,i)=>({...variant,id:`other-${i}`,color:'VERDE'})),
  {...variant,id:'last',size:'2XL',color:'CAQUI',products:{name:'Pantalón',category_id:lastCategory,categories:{name:'Pantalones'}}},
  {...variant,id:'archived',active:false,size:'Archivada'},
 ];
 const mock=api({variants});
 const Filters=()=>null;const ProductPhoto=()=>null;
 const Page=load('app/(sistema)/productos/page.tsx',{
  '@/lib/auth':{requireUser:async()=>({supabase:mock.s,role:'operator'})},
  '@/components/catalog-filters':{CatalogFilters:Filters},
  '@/components/catalog-product-photo':{CatalogProductPhoto:ProductPhoto},
 }).default;
 const selection={categoria:category,talla:'M',color:'AZUL'};
 const tree=await Page({searchParams:Promise.resolve({q:'casaca',...selection,page:'2'})});
 const queries=mock.requests.filter(u=>u.pathname.endsWith('/variants')).map(u=>u.searchParams);
 const result=queries.find(p=>p.get('limit')==='50');
 assert.match(result.get('select'),/products!inner\(name,category_id,categories\(name\),reference_photo_id\),name_match:products\(\)/);
 assert.match(result.get('or'),/sku\.ilike\."%casaca%".*,name_match\.not\.is\.null/);
 assert.equal(result.get('name_match.name'),'ilike.%casaca%');
 assert.equal(result.get('products.category_id'),`eq.${category}`);
 assert.equal(result.get('size'),'eq.M');
 assert.equal(result.get('color'),'eq.AZUL');
 assert.equal(result.get('offset'),'50');
 assert.deepEqual(queries.filter(p=>p.get('limit')==='500').map(p=>p.get('offset')),['0','500']);
 const photos=nodes(tree,n=>n.type===ProductPhoto);
 assert.equal(photos.length,1);
 assert.equal(photos[0].props.category,'Casacas');
 const filters=nodes(tree,n=>n.type===Filters)[0].props;
 assert.deepEqual(filters.initial,selection);
 assert.deepEqual(filters.categories.map(option=>option.label),['Casacas','Pantalones']);
 assert.ok(filters.combinations.some(row=>row.talla==='2XL'&&row.color==='CAQUI'));
 assert.ok(filters.combinations.every(row=>row.talla!=='Archivada'));
 const pagination=nodes(tree,n=>n.props?.label==='Páginas del catálogo')[0].props;
 assert.equal(pagination.pages,2);
 assert.deepEqual(Object.fromEntries(new URL(pagination.href(1),'https://example.invalid').searchParams),{q:'casaca',...selection,page:'1'});
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
