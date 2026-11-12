import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database,session,catalog,order,adminId,operatorId,inactiveId} from './helpers/database.mjs';

const db=await database();
after(()=>db.close());
const scalar=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
const stock=async id=>scalar('SELECT on_hand,reserved,blocked FROM public.variants WHERE id=$1',[id]);

test('SQL: rechaza ventas sin líneas, modo, método o vencimiento válido sin alterar stock',async()=>{
 const v=await catalog(db);const before=await stock(v);
 for(const invalid of [{lines:null},{lines:'null'},{lines:'[]'},{mode:null},{method:null},{mode:'reserve',minutes:null}]){
  await assert.rejects(()=>order(db,v,invalid),undefined,JSON.stringify(invalid));
  assert.deepEqual(await stock(v),before);
 }
});

test('SQL: compra vacía y devolución vacía no crean cabeceras sin detalle',async()=>{
 const v=await catalog(db);const id=await order(db,v);
 const before=await scalar('SELECT (SELECT count(*) FROM public.purchases) AS purchases,(SELECT count(*) FROM public.returns) AS returns');
 await assert.rejects(()=>db.query('SELECT public.receive_purchase(NULL,$1,NULL)',['Compra ficticia']));
 await assert.rejects(()=>db.query('SELECT public.process_return($1,$2,$3,NULL,0,NULL)',[crypto.randomUUID(),id,'Motivo ficticio']));
 assert.deepEqual(await scalar('SELECT (SELECT count(*) FROM public.purchases) AS purchases,(SELECT count(*) FROM public.returns) AS returns'),before);
});

test('SQL: confirmar reserva sin método no registra efectivo ni cambia el stock',async()=>{
 const v=await catalog(db);const id=await order(db,v,{mode:'reserve',method:null});const before=await stock(v);
 await assert.rejects(()=>db.query('SELECT public.confirm_reservation($1,NULL)',[id]));
 assert.deepEqual(await stock(v),before);
 assert.equal(Number((await scalar('SELECT count(*) AS n FROM public.payments WHERE order_id=$1',[id])).n),0);
});

test('SQL: una recepción repetida con la misma clave aumenta el stock una sola vez',async()=>{
 const v=await catalog(db);const key=crypto.randomUUID();const lines=JSON.stringify([{variant_id:v,quantity:3,unit_cost:60}]);
 const receive=()=>scalar('SELECT public.receive_purchase_once($1,NULL,$2,$3::jsonb) AS id',[key,'Recepción ficticia',lines]);
 const a=await receive();const b=await receive();assert.equal(a.id,b.id);assert.equal((await stock(v)).on_hand,13);
 await assert.rejects(()=>db.query('SELECT public.receive_purchase_once($1,NULL,$2,$3::jsonb)',[key,'Otra referencia',lines]));
 assert.equal((await stock(v)).on_hand,13);
});

test('SQL: una recepción con una línea inválida revierte cabecera, stock y Kardex completos',async()=>{
 const v=await catalog(db);const before=await stock(v);const key=crypto.randomUUID();
 const rows=JSON.stringify([{variant_id:v,quantity:2,unit_cost:50},{variant_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',quantity:1,unit_cost:50}]);
 await assert.rejects(()=>db.query('SELECT public.receive_purchase_once($1,NULL,$2,$3::jsonb)',[key,'Prueba de reversión',rows]));
 assert.deepEqual(await stock(v),before);
 assert.equal(Number((await scalar('SELECT count(*) AS n FROM public.purchases WHERE request_key=$1',[key])).n),0);
 assert.equal(Number((await scalar("SELECT count(*) AS n FROM public.stock_movements WHERE variant_id=$1 AND movement_type='purchase'",[v])).n),0);
});

test('SQL: reserva, adelanto, saldo y reintento conservan pagos y Kardex',async()=>{
 const v=await catalog(db);const id=await order(db,v,{mode:'reserve',method:null});assert.deepEqual(await stock(v),{on_hand:10,reserved:1,blocked:0});
 const key=crypto.randomUUID();const pay=()=>scalar('SELECT public.record_payment($1,$2,30,$3,$4) AS id',[key,id,'yape','Prueba']);
 assert.equal((await pay()).id,(await pay()).id);
 await assert.rejects(()=>db.query('SELECT public.record_payment($1,$2,20,$3,$4)',[key,id,'yape','Prueba']),/clave/);
 assert.equal((await stock(v)).on_hand,10);
 await db.query('SELECT public.record_payment($1,$2,70,$3,$4)',[crypto.randomUUID(),id,'efectivo','Saldo ficticio']);
 assert.deepEqual(await stock(v),{on_hand:9,reserved:0,blocked:0});
 const state=await scalar('SELECT status,payment_status,total FROM public.orders WHERE id=$1',[id]);assert.equal(state.status,'confirmed');assert.equal(state.payment_status,'paid');
 assert.equal(Number((await scalar('SELECT sum(amount) AS total FROM public.payments WHERE order_id=$1',[id])).total),100);
});

test('SQL: venta repetida y falta de stock no duplican pedidos ni movimientos',async()=>{
 const v=await catalog(db,1);const key=crypto.randomUUID();const a=await order(db,v,{key});const b=await order(db,v,{key});assert.equal(a,b);
 await assert.rejects(()=>order(db,v),/Stock insuficiente/);assert.equal((await stock(v)).on_hand,0);
 assert.equal(Number((await scalar("SELECT count(*) AS n FROM public.stock_movements WHERE variant_id=$1 AND movement_type='sale'",[v])).n),1);
});

test('SQL: reutilizar una clave con otro carrito o tipo de venta se rechaza',async()=>{
 const v=await catalog(db);const key=crypto.randomUUID();await order(db,v,{key});
 await assert.rejects(()=>order(db,v,{key,lines:JSON.stringify([{variant_id:v,quantity:2}])}),/clave|Identificador/i);
 await assert.rejects(()=>order(db,v,{key,mode:'reserve',method:null}),/clave|Identificador/i);
 assert.equal((await stock(v)).on_hand,9);
});

test('SQL: devolución dañada bloquea stock y no permite devolver más de lo vendido',async()=>{
 const v=await catalog(db);const id=await order(db,v);const line=(await scalar('SELECT id FROM public.order_lines WHERE order_id=$1',[id])).id;
 const lines=JSON.stringify([{order_line_id:line,quantity:1,condition:'damaged'}]);
 await db.query('SELECT public.process_return($1,$2,$3,$4::jsonb,40,$5)',[crypto.randomUUID(),id,'Prenda defectuosa',lines,'yape']);
 assert.deepEqual(await stock(v),{on_hand:10,reserved:0,blocked:1});
 await assert.rejects(()=>db.query('SELECT public.process_return($1,$2,$3,$4::jsonb,0,NULL)',[crypto.randomUUID(),id,'Prueba repetida',lines]),/supera la cantidad/);
});

test('SQL: permisos, DNI, despacho y entrega respetan las restricciones existentes',async()=>{
 const report=(await scalar('SELECT public.phase4a_security_report() AS report')).report;
 assert.equal(report.tables.length,21);assert.ok(report.tables.every(table=>table.rls&&!table.anon_can_read));assert.equal(report.anon_security_definer_count,0);
 const v=await catalog(db);const id=await order(db,v);const data={recipient_name:'Destinatario ficticio',phone:'900000000',dni:'00000000',province:'Provincia prueba',agency_address:'Agencia ficticia',carrier:'shalom'};
 await db.query('SELECT public.save_shipment($1,$2::jsonb)',[id,JSON.stringify(data)]);
 await session(db,operatorId);
 await assert.rejects(()=>db.query('SELECT dni FROM public.shipments'),/permission denied/);
 await assert.rejects(()=>db.query('SELECT * FROM public.admin_get_shipment_dni($1::uuid[])',[[id]]),/administrador/);
 await db.query('SELECT public.save_shipment($1,$2::jsonb)',[id,JSON.stringify({...data,dni:''})]);
 await session(db,adminId);assert.equal((await scalar('SELECT dni FROM public.admin_get_shipment_dni($1::uuid[])',[[id]])).dni,'00000000');
 await db.query("SELECT public.set_shipment_status($1,'dispatched','TEST-TRACK')",[id]);
 await assert.rejects(()=>db.query('SELECT public.save_shipment($1,$2::jsonb)',[id,JSON.stringify(data)]),/despachado/);
 await db.query("SELECT public.set_shipment_status($1,'delivered','TEST-TRACK')",[id]);
 await db.query("SELECT public.set_shipment_status($1,'delivered','TEST-TRACK')",[id]);
 assert.equal((await scalar('SELECT status FROM public.shipments WHERE order_id=$1',[id])).status,'delivered');
 await session(db,inactiveId);await assert.rejects(()=>order(db,v),/Acceso no autorizado/);
 await session(db,null,'anon');await assert.rejects(()=>db.query('SELECT public.require_active()'),/permission denied/);
 await session(db,adminId);
});

test('SQL: migración 009 conserva pedidos, pagos, stock y DNI de una base con datos',async()=>{
 const legacy=await database({through:'008'});
 try{
  const v=await catalog(legacy);const id=await order(legacy,v);
  await legacy.query('SELECT public.save_shipment($1,$2::jsonb)',[id,JSON.stringify({recipient_name:'Destinatario ficticio',phone:'900000000',dni:'00000000',province:'Provincia ficticia',agency_address:'Agencia ficticia'})]);
  const snapshot=async()=>({
   orders:(await legacy.query('SELECT id,total,status,payment_status FROM public.orders ORDER BY id')).rows,
   payments:(await legacy.query('SELECT id,order_id,amount,method FROM public.payments ORDER BY id')).rows,
   variants:(await legacy.query('SELECT id,on_hand,reserved,blocked,avg_cost FROM public.variants ORDER BY id')).rows,
   dni:(await legacy.query('SELECT * FROM public.admin_get_shipment_dni($1::uuid[])',[[id]])).rows
  });
  const before=await snapshot();await legacy.exec('RESET ROLE');
  const sql=await fs.readFile(new URL('../supabase/migrations/009_integridad_operativa.sql',import.meta.url),'utf8');
  await legacy.exec(sql);await legacy.exec(sql);await session(legacy,adminId);
  assert.deepEqual(await snapshot(),before);
 }finally{await legacy.close();}
});

test('SQL: conteo obsoleto no puede cambiar inventario después de una venta',async()=>{
 const v=await catalog(db);const count=(await scalar("SELECT public.open_inventory_count('Conteo ficticio') AS id")).id;
 await db.query('SELECT public.set_inventory_count_line($1,$2,8)',[count,v]);await db.query('SELECT public.submit_inventory_count($1)',[count]);
 await order(db,v);await assert.rejects(()=>db.query('SELECT public.approve_inventory_count($1)',[count]),/cambiaron/);
 assert.equal((await stock(v)).on_hand,9);
});

test('SQL: corregir una variante conserva pedidos, existencias y etiqueta, y audita una sola vez', async () => {
 const v = await catalog(db);
 await order(db, v);
 await order(db, v, { mode: 'reserve', method: null });
 const readVariant = () => scalar('SELECT * FROM public.variants WHERE id=$1', [v]);
 const readLinks = async () => ({
  lines: (await db.query('SELECT * FROM public.order_lines WHERE variant_id=$1 ORDER BY id', [v])).rows,
  movements: (await db.query('SELECT * FROM public.stock_movements WHERE variant_id=$1 ORDER BY id', [v])).rows,
 });
 const before = await readVariant();
 const links = await readLinks();
 const expected = { sku: before.sku, size: before.size, color: before.color };
 const correct = () => db.query('SELECT public.update_variant_identity($1,$2,$3,$4,$5::jsonb)',
  [v, ' cas-prueba-azul-m ', ' M ', ' Azul ', JSON.stringify(expected)]);

 await correct();
 await correct();
 const edited = { sku: 'CAS-PRUEBA-AZUL-M', size: 'M', color: 'Azul' };
 assert.deepEqual(await readVariant(), { ...before, ...edited });
 assert.deepEqual(await readLinks(), links);
 const audit = await db.query("SELECT actor_id,data FROM public.audit_events WHERE event='update_variant_identity' AND entity_id=$1", [v]);
 assert.deepEqual(audit.rows, [{ actor_id: adminId, data: { before: expected, after: edited } }]);

 await assert.rejects(
  () => db.query('SELECT public.update_variant_identity($1,$2,$3,$4,$5::jsonb)',
   [v, edited.sku, 'XL', 'Negro', JSON.stringify(expected)]),
  { code: 'PT409' },
 );
 assert.deepEqual(await readVariant(), { ...before, ...edited });
});

test('SQL: edición de variantes bloquea duplicados y llamadas sin permisos', async () => {
 const v = await catalog(db);
 const before = await scalar('SELECT * FROM public.variants WHERE id=$1', [v]);
 const expected = { sku: before.sku, size: before.size, color: before.color };
 const { id: other } = await scalar('SELECT public.add_variant($1::jsonb) AS id', [JSON.stringify({
  product_id: before.product_id, sku: before.sku + '-L', size: 'L', color: 'Negro', sale_price: 100,
 })]);
 const sibling = await scalar('SELECT sku,barcode FROM public.variants WHERE id=$1', [other]);
 const edit = ({ sku = expected.sku, size = expected.size, color = expected.color } = {}) =>
  db.query('SELECT public.update_variant_identity($1,$2,$3,$4,$5::jsonb)', [v, sku, size, color, JSON.stringify(expected)]);

 await assert.rejects(() => edit({ sku: sibling.sku.toLowerCase() }), /SKU ya está registrado/);
 await assert.rejects(() => edit({ size: 'L', color: 'Negro' }), /esa talla y color/);
 await assert.rejects(() => edit({ sku: sibling.barcode }), /etiquetas/);
 await assert.rejects(() => edit({ color: '   ' }), { code: '22023' });
 try {
  for (const actor of [operatorId, inactiveId]) {
   await session(db, actor);
   await assert.rejects(() => edit({ size: 'S' }), { code: '42501' });
  }
  await session(db, null, 'anon');
  await assert.rejects(() => edit({ size: 'S' }), { code: '42501' });
 } finally {
  await session(db, adminId);
 }
 await assert.rejects(() => db.query('UPDATE public.variants SET size=$2 WHERE id=$1', [v, 'S']), { code: '42501' });
 assert.deepEqual(await scalar('SELECT * FROM public.variants WHERE id=$1', [v]), before);
});
