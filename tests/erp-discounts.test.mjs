import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {database,session,catalog,order,adminId,operatorId,inactiveId} from './helpers/database.mjs';
import {load,deferred} from './helpers/components.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.confirm=()=>true;
const db=await database();after(()=>db.close());
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
async function discounted(variant,{quantity=1,discount=10,expected=100,key=crypto.randomUUID(),mode='paid',lines}={}){
 return (await scalar('SELECT public.create_order_with_discounts($1,$2,$3,NULL,$4,$5,$6,45,$7::jsonb) AS id',[
  key,'Comprador ficticio','','directo',mode,mode==='paid'?'efectivo':null,
  JSON.stringify(lines||[{variant_id:variant,quantity,unit_discount:discount,expected_unit_price:expected}])])).id;
}

test('Descuentos SQL: guarda precio acordado, cobro neto y catálogo original sin alterar cantidades',async()=>{
 const v=await catalog(db);const id=await discounted(v,{quantity:2,discount:12.35});
 assert.equal(Number((await scalar('SELECT total FROM public.orders WHERE id=$1',[id])).total),175.3);
 const line=await scalar('SELECT quantity,unit_price,catalog_unit_price,line_total FROM public.order_lines WHERE order_id=$1',[id]);
 assert.deepEqual([line.quantity,Number(line.unit_price),Number(line.catalog_unit_price),Number(line.line_total)],[2,87.65,100,175.3]);
 assert.equal(Number((await scalar('SELECT sum(amount) AS n FROM public.payments WHERE order_id=$1',[id])).n),175.3);
 assert.deepEqual(await scalar('SELECT on_hand,reserved,sale_price FROM public.variants WHERE id=$1',[v]),{on_hand:8,reserved:0,sale_price:'100.00'});
 assert.equal(Number((await scalar("SELECT data->>'discount_total' AS n FROM public.audit_events WHERE event='create_order' AND entity_id=$1",[id])).n),24.7);
});

test('Descuentos SQL: mezcla prendas con y sin descuento y reporta sus importes netos',async()=>{
 const a=await catalog(db),b=await catalog(db);
 const report=async section=>(await scalar('SELECT public.report_phase3(current_date-1,current_date+1,$1) AS r',[section])).r;
 const before=await report('overview');
 const id=await discounted(a,{lines:[{variant_id:a,quantity:2,unit_discount:5},{variant_id:b,quantity:1}]});
 assert.equal(Number((await scalar('SELECT total FROM public.orders WHERE id=$1',[id])).total),290);
 const after=await report('overview');assert.equal(Number(after.gross_sales)-Number(before.gross_sales),290);
 const products=await report('products');
 const sku=(await scalar('SELECT sku FROM public.variants WHERE id=$1',[a])).sku;
 assert.equal(Number(products.find(p=>p.sku===sku).gross),190);
});

test('Descuentos SQL: adelantos y confirmación usan el saldo rebajado de la reserva',async()=>{
 const v=await catalog(db);const id=await discounted(v,{quantity:2,mode:'reserve'});
 assert.deepEqual(await scalar('SELECT on_hand,reserved FROM public.variants WHERE id=$1',[v]),{on_hand:10,reserved:2});
 await db.query("SELECT public.record_payment($1,$2,50,'yape','Prueba')",[crypto.randomUUID(),id]);
 await assert.rejects(()=>db.query("SELECT public.record_payment($1,$2,131,'yape','Prueba')",[crypto.randomUUID(),id]));
 await db.query("SELECT public.record_payment($1,$2,130,'yape','Saldo')",[crypto.randomUUID(),id]);
 assert.deepEqual(await scalar('SELECT status,total FROM public.orders WHERE id=$1',[id]),{status:'confirmed',total:'180.00'});
 assert.deepEqual(await scalar('SELECT on_hand,reserved FROM public.variants WHERE id=$1',[v]),{on_hand:8,reserved:0});
});

test('Descuentos SQL: una devolución no puede reembolsar el precio previo al descuento',async()=>{
 const v=await catalog(db);const id=await discounted(v,{quantity:2});const line=(await scalar('SELECT id FROM public.order_lines WHERE order_id=$1',[id])).id;
 const lines=JSON.stringify([{order_line_id:line,quantity:1,condition:'sellable'}]);
 await assert.rejects(()=>db.query("SELECT public.process_return($1,$2,'Prueba de devolución',$3::jsonb,100,'efectivo')",[crypto.randomUUID(),id,lines]),/Reembolso inválido/);
 await db.query("SELECT public.process_return($1,$2,'Prueba de devolución',$3::jsonb,90,'efectivo')",[crypto.randomUUID(),id,lines]);
 assert.deepEqual(await scalar('SELECT total_value,refund_amount FROM public.returns WHERE order_id=$1',[id]),{total_value:'90.00',refund_amount:'90.00'});
 assert.equal((await scalar('SELECT on_hand FROM public.variants WHERE id=$1',[v])).on_hand,9);
});

test('Descuentos SQL: importes decimales se conservan exactos por unidad',async()=>{
 const v=await catalog(db);await db.query('SELECT public.update_variant_settings($1,0.29,1)',[v]);
 const id=await discounted(v,{quantity:3,discount:0.2,expected:0.29});
 assert.equal((await scalar('SELECT total FROM public.orders WHERE id=$1',[id])).total,'0.27');
 assert.equal((await scalar('SELECT unit_price FROM public.order_lines WHERE order_id=$1',[id])).unit_price,'0.09');
});

test('Descuentos SQL: descuentos inválidos o precios obsoletos revierten toda la venta',async()=>{
 const v=await catalog(db);
 for(const discount of [-1,100,101,0.001,'NaN','Infinity']){
  const key=crypto.randomUUID();await assert.rejects(()=>discounted(v,{discount,key}),/Descuento inválido/);
  assert.equal(Number((await scalar('SELECT count(*) AS n FROM public.orders WHERE request_key=$1',[key])).n),0);
 }
 await assert.rejects(()=>discounted(v,{expected:99}),/precio.*cambió/);
 assert.deepEqual(await scalar('SELECT on_hand,reserved FROM public.variants WHERE id=$1',[v]),{on_hand:10,reserved:0});
});

test('Descuentos SQL: el reintento no duplica stock ni cobros y detecta otro descuento',async()=>{
 const v=await catalog(db);const key=crypto.randomUUID();const [a,b]=await Promise.all([discounted(v,{key}),discounted(v,{key})]);assert.equal(a,b);
 await assert.rejects(()=>discounted(v,{key,discount:9}),/clave pertenece/);
 assert.equal((await scalar('SELECT on_hand FROM public.variants WHERE id=$1',[v])).on_hand,9);
 assert.equal(Number((await scalar('SELECT count(*) AS n FROM public.payments WHERE order_id=$1',[a])).n),1);
});

test('Descuentos SQL: conserva permisos de usuario activo y bloquea anónimos e inactivos',async()=>{
 const v=await catalog(db);await session(db,operatorId);await discounted(v);
 await session(db,inactiveId);await assert.rejects(()=>discounted(v),/Acceso no autorizado/);
 await session(db,null,'anon');await assert.rejects(()=>discounted(v),/permission denied/);
 await session(db,adminId);
});

test('Descuentos SQL: migración repetible conserva datos y reintentos de pedidos anteriores',async()=>{
 const legacy=await database({through:'009'});
 try{
  const v=await catalog(legacy);const key=crypto.randomUUID();const id=await order(legacy,v,{key});
  const snapshot=async()=>({orders:(await legacy.query('SELECT * FROM public.orders ORDER BY id')).rows,
   lines:(await legacy.query('SELECT id,order_id,variant_id,quantity,unit_price,line_total,unit_cost FROM public.order_lines ORDER BY id')).rows,
   variants:(await legacy.query('SELECT * FROM public.variants ORDER BY id')).rows,
   payments:(await legacy.query('SELECT * FROM public.payments ORDER BY id')).rows});
  const before=await snapshot();await legacy.exec('RESET ROLE');
  const sql=await fs.readFile(new URL('../supabase/migrations/010_descuentos_venta.sql',import.meta.url),'utf8');
  await legacy.exec(sql);await legacy.exec(sql);await session(legacy,adminId);
  assert.deepEqual(await snapshot(),before);assert.equal(await order(legacy,v,{key}),id);
  assert.equal((await legacy.query('SELECT catalog_unit_price FROM public.order_lines WHERE order_id=$1',[id])).rows[0].catalog_unit_price,null);
 }finally{await legacy.close();}
});

test('Descuentos servidor: valida decimales y nunca reintenta una venta rebajada sin descuento',async()=>{
 const id='00000000-0000-4000-8000-000000000001';const calls=[];
 const input={request_key:id,buyer:'',handle:'',customer_id:null,channel:'directo',mode:'paid',method:'efectivo',minutes:45,lines:[{variant_id:id,quantity:1,unit_discount:5,expected_unit_price:100}]};
 const a=load('lib/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/auth':{requireUser:async()=>({role:'admin',supabase:{rpc:async(name,payload)=>{calls.push({name,payload});return {error:{code:'PGRST202',message:'Not installed'}};}}})}});
 const r=await a.createOrderAction(input);assert.equal(r.ok,false);assert.match(r.error,/010_descuentos_venta/);assert.equal(calls.length,1);assert.equal(calls[0].name,'create_order_with_discounts');
 for(const value of [-1,0.001,Infinity])assert.equal((await a.createOrderAction({...input,lines:[{...input.lines[0],unit_discount:value}]})).ok,false);
 assert.equal(calls.length,1);
});

test('Descuentos vista previa: usa céntimos y descuenta por cada unidad',()=>{
 const {saleTotals,moneyCents}=load('lib/sale-totals.ts');
 const result=saleTotals([{variant_id:'a',quantity:3,unit_discount:'0.20'}],[{id:'a',sale_price:0.29}]);
 assert.deepEqual([result.subtotal,result.discount,result.total,result.valid],[0.87,0.6,0.27,true]);
 for(const value of ['-1','0.001','Infinity',NaN])assert.equal(moneyCents(value),null);
});

test('Descuentos UI: conserva datos y clave al fallar; guarda una vez y limpia después del éxito',async()=>{
 const request=deferred(),payloads=[];let attempt=0;const v={id:'v1',sku:'TEST',sale_price:100,on_hand:10,reserved:0,blocked:0,active:true,products:{name:'Prenda de prueba'}};
 const {SaleForm}=load('components/sale-form.tsx',{'@/lib/actions':{findSaleVariantAction:async()=>({variant:v}),createOrderAction:input=>{payloads.push(input);return ++attempt===1?request.promise:Promise.resolve({ok:true,message:'Guardado'});}}});
 let view;await act(async()=>{view=create(React.createElement(SaleForm,{variants:[],customers:[]}));});
 const scanner=()=>view.root.findByProps({'aria-label':'Escanear código para agregar una unidad'});
 for(let n=0;n<2;n++){await act(async()=>scanner().props.onChange({target:{value:'TEST'}}));await act(async()=>scanner().props.onKeyDown({key:'Enter',preventDefault(){}}));}
 await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='Añadir descuentos').props.onClick());
 const discount=()=>view.root.findByProps({name:'discount-v1'});
 await act(async()=>discount().props.onChange({target:{value:'12.35'}}));
 await act(async()=>view.root.findByProps({value:'reserve'}).props.onChange({target:{value:'paid'}}));
 const event={preventDefault(){}};
 await act(async()=>{void view.root.findByType('form').props.onSubmit(event);void view.root.findByType('form').props.onSubmit(event);});
 assert.equal(payloads.length,1);assert.equal(payloads[0].lines[0].unit_discount,12.35);assert.equal(payloads[0].lines[0].quantity,2);assert.equal(payloads[0].lines[0].expected_unit_price,100);
 await act(async()=>request.resolve({ok:false,error:'Fallo simulado'}));assert.equal(discount().props.value,'12.35');
 await act(async()=>view.root.findByType('form').props.onSubmit(event));assert.equal(payloads[1].request_key,payloads[0].request_key);assert.equal(view.root.findAllByProps({name:'discount-v1'}).length,0);
 await act(async()=>view.unmount());
});
