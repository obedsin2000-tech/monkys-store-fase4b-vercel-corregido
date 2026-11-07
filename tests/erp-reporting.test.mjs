import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {database,session,catalog,order,adminId,operatorId,inactiveId} from './helpers/database.mjs';
import {load} from './helpers/components.mjs';
const db=await database();after(()=>db.close());
const row=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const report=async(tab,start='2024-01-01',end='2024-01-31',options={})=>(await row('SELECT public.report_analysis($1,$2,$3,$4::jsonb) r',[start,end,tab,JSON.stringify(options)])).r;
async function owner(fn){await db.exec('RESET ROLE');try{return await fn();}finally{await session(db,adminId);}}
async function dateOrder(id,confirmed,paid=confirmed){await owner(async()=>{await db.query('UPDATE public.orders SET created_at=$2,confirmed_at=$2 WHERE id=$1',[id,confirmed]);await db.query('UPDATE public.payments SET received_at=$2 WHERE order_id=$1',[id,paid]);});}
async function discounted(v,qty=1,discount=10,mode='paid',channel='directo'){
 return (await row("SELECT public.create_order_with_discounts($1,'Cliente ficticio','',NULL,$2,$3,$4,45,$5::jsonb) id",[crypto.randomUUID(),channel,mode,mode==='paid'?'efectivo':null,JSON.stringify([{variant_id:v,quantity:qty,unit_discount:discount}])])).id;
}
async function returned(id,condition,stamp){const line=await row('SELECT id FROM public.order_lines WHERE order_id=$1',[id]);const r=await row("SELECT public.process_return($1,$2,'Prueba',$3::jsonb,90,'efectivo') id",[crypto.randomUUID(),id,JSON.stringify([{order_line_id:line.id,quantity:1,condition}])]);await owner(async()=>{await db.query('UPDATE public.returns SET created_at=$2 WHERE id=$1',[r.id,stamp]);await db.query('UPDATE public.refunds SET refunded_at=$2 WHERE order_id=$1',[id,stamp]);});return r.id;}

test('Análisis: descuentos se cuentan una vez y todos los detalles concilian con tarjetas, canales y prendas',async()=>{
 const v=await catalog(db);const id=await discounted(v,2);await dateOrder(id,'2024-01-15T17:00:00Z');
 const b=await report('sales');assert.equal(b.current.gross_sales,180);assert.equal(b.current.discounts,20);assert.equal(b.current.net_sales,180);assert.equal(b.current.cogs_net,100);assert.equal(b.current.gross_profit_estimate,80);assert.equal(b.current.payments,180);assert.equal(b.current.cash_net,180);
 assert.equal(b.products.summary.gross,180);assert.equal(b.products.summary.discounts,20);assert.equal(b.channels.reduce((n,r)=>n+r.gross_sales,0),180);assert.equal(b.daily.reduce((n,r)=>n+r.gross_sales,0),180);
 const keys={sales:'gross_sales',orders:'confirmed_orders',returns:'return_value',net_sales:'net_sales',profit:'gross_profit_estimate',cogs:'cogs_net',discounts:'discounts',payments:'payments',refunds:'refunds_paid',expenses:'expenses',cash_net:'cash_net'};
 for(const [metric,key] of Object.entries(keys)){const d=(await report('detail',undefined,undefined,{metric,as_of:b.meta.as_of})).detail;assert.equal(d.total,b.current[key],metric);assert.equal(d.rows.reduce((n,r)=>n+r.value,0),d.filtered_total,metric);}
});

test('Análisis: devolución antigua se atribuye al recibirla y solo aptas para venta recuperan costo',async()=>{
 const v=await catalog(db);const a=await discounted(v),b=await discounted(v);await dateOrder(a,'2023-12-10T17:00:00Z');await dateOrder(b,'2023-12-11T17:00:00Z');await returned(a,'sellable','2024-02-10T17:00:00Z');await returned(b,'damaged','2024-02-11T17:00:00Z');
 const r=await report('sales','2024-02-01','2024-02-29');assert.deepEqual([r.current.gross_sales,r.current.return_value,r.current.net_sales,r.current.cogs_net,r.current.gross_profit_estimate,r.current.refunds_paid],[0,180,-180,-50,-130,180]);
 const d=(await report('detail','2024-02-01','2024-02-29',{metric:'profit'})).detail;assert.equal(d.filtered_total,-130);assert.deepEqual(d.rows.map(r=>r.recovered_cost).sort((a,b)=>a-b),[0,50]);
});

test('Análisis: adelanto y saldo se atribuyen al movimiento, venta y descuento a la confirmación',async()=>{
 const v=await catalog(db);const id=await discounted(v,1,10,'reserve','whatsapp');
 await db.query("SELECT public.record_payment($1,$2,30,'yape','Adelanto')",[crypto.randomUUID(),id]);const advance=(await row('SELECT id FROM public.payments WHERE order_id=$1',[id])).id;
 await db.query("SELECT public.record_payment($1,$2,60,'yape','Saldo')",[crypto.randomUUID(),id]);
 await owner(async()=>{await db.query("UPDATE public.orders SET created_at='2024-03-31T17:00Z',confirmed_at='2024-04-01T17:00Z' WHERE id=$1",[id]);await db.query("UPDATE public.payments SET received_at=CASE WHEN id=$2 THEN '2024-03-31T17:00Z'::timestamptz ELSE '2024-04-01T17:00Z'::timestamptz END WHERE order_id=$1",[id,advance]);});
 const march=await report('sales','2024-03-01','2024-03-31'),april=await report('sales','2024-04-01','2024-04-30');assert.deepEqual([march.current.gross_sales,march.current.payments,march.current.discounts],[0,30,0]);assert.deepEqual([april.current.gross_sales,april.current.payments,april.current.discounts],[90,60,10]);
 const ctx=(await report('detail','2024-04-01','2024-04-30',{metric:'sales',channel:'whatsapp',variant:v})).detail;assert.equal(ctx.total,90);
});

test('Análisis: límites de Lima incluyen ambos días, sin arrastrar un movimiento de medianoche',async()=>{
 const v=await catalog(db);const ids=await Promise.all([order(db,v),order(db,v),order(db,v),order(db,v)]);const times=['2024-05-01T04:59:59Z','2024-05-01T05:00:00Z','2024-06-01T04:59:59Z','2024-06-01T05:00:00Z'];for(let i=0;i<ids.length;i++)await dateOrder(ids[i],times[i]);
 const r=await report('sales','2024-05-01','2024-05-31');assert.equal(r.current.gross_sales,200);assert.equal(r.current.payments,200);assert.equal(r.daily.length,31);assert.equal(r.daily[0].gross_sales,100);assert.equal(r.daily.at(-1).gross_sales,100);
});

test('Análisis: rango vacío conserva días cero; límites, comparación parcial y filtro literal son verificables',async()=>{
 const r=await report('sales','2022-01-01','2022-12-31');assert.equal(r.daily.length,365);assert.equal(r.current.net_sales,0);assert.equal(r.previous.net_sales,0);assert.ok(r.daily.every(d=>d.payments===0&&d.gross_sales===0));
 await report('sales','2024-01-01','2024-12-31');await assert.rejects(()=>report('sales','2023-01-01','2024-01-02'),/366/);await assert.rejects(()=>report('sales','2099-01-01','2099-01-01'),/futuras/);
 const partial=await report('sales','2024-01-01','2024-01-31',{as_of:'2024-01-31T18:30:00Z'});assert.equal(partial.meta.partial_comparison,true);assert.equal(partial.meta.previous_start,'2023-12-01');assert.equal(partial.meta.previous_end,'2023-12-31');assert.equal(partial.meta.previous_cutoff,'2023-12-31T18:30:00+00:00');
 const d=(await report('detail','2024-01-01','2024-01-31',{metric:'sales',q:'%_'})).detail;assert.equal(d.count,0);assert.equal(d.total,180);assert.equal(d.filtered_total,0);
});

test('Análisis: mismo corte concilia páginas y exportaciones, sin truncamiento oculto',async()=>{
 const v=await catalog(db,20);for(let i=0;i<6;i++){const id=await order(db,v);await dateOrder(id,`2024-06-${String(i+1).padStart(2,'0')}T17:00:00Z`);}
 const opts={metric:'sales',variant:v,size:2,as_of:'2024-06-04T18:00:00Z'};const b=(await report('detail','2024-06-01','2024-06-04',opts)).detail;assert.equal(b.total,400);assert.equal(b.rows.length,2);assert.equal(b.pages,2);assert.equal(b.page_total,200);
 const next=(await report('detail','2024-06-01','2024-06-04',{...opts,page:2})).detail;assert.equal(new Set([...b.rows,...next.rows].map(r=>r.id)).size,4);
 const exp=(await report('detail','2024-06-01','2024-06-04',{...opts,page:99,export:true})).detail;assert.equal(exp.rows.length,4);assert.equal(exp.page_total,400);
});

test('Análisis: inventario actual concilia filtros y detalle; no presenta cobertura inventada',async()=>{
 const v=await catalog(db,1);const all=await report('inventory','2022-01-01','2022-01-31');assert.equal(all.capabilities.historical_stock,false);const sku=(await row('SELECT sku FROM public.variants WHERE id=$1',[v])).sku;
 const f=await report('inventory','2022-01-01','2022-01-31',{q:sku,focus:'no_sales'});assert.equal(f.stock.count,1);assert.equal(f.current.available,1);assert.equal(f.current.no_sales,1);assert.equal(f.current.low_stock,1);
 for(const metric of ['physical','available','inventory_value','low_stock','no_sales']){const d=(await report('detail','2022-01-01','2022-01-31',{q:sku,focus:'no_sales',metric})).detail;assert.equal(d.filtered_total,f.current[metric],metric);assert.equal(d.scope,'current');}
});

test('Análisis: permisos administrativos y auxiliares bloqueados; no acepta asignaciones inexistentes',async()=>{
 for(const who of [operatorId,inactiveId]){await session(db,who);await assert.rejects(()=>report('sales'),/administrador|autorizado/i);}
 await session(db,null,'anon');await assert.rejects(()=>report('sales'),/permission denied/);await session(db,adminId);await assert.rejects(()=>db.query("SELECT * FROM public._report_entries('2024-01-01','2024-01-31',now())"),/permission denied/);
 await assert.rejects(()=>report('detail',undefined,undefined,{metric:'payments',variant:crypto.randomUUID()}),/variante/);await assert.rejects(()=>report('detail',undefined,undefined,{metric:'cash_net',channel:'tiktok'}),/canal/);
});

test('Análisis: migración repetible no cambia pedidos, líneas, pagos ni inventario',async()=>{
 const snapshot=async()=>{const result={};for(const table of ['orders','order_lines','payments','returns','refunds','variants'])result[table]=(await db.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;return result;};const before=await snapshot();await owner(async()=>{const sql=await fs.readFile(new URL('../supabase/migrations/011_reportes_analisis.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);});assert.deepEqual(await snapshot(),before);
});

test('Visualización: agrupa todo el rango sin perder centavos, respeta meses y comparación con cero',()=>{
 const r=load('lib/reporting.ts');const rows=Array.from({length:366},(_,i)=>({day:r.shiftDate('2024-01-01',i),gross_sales:.29,payments:.09,returns:0,net_sales:.29,orders:1}));const g=r.groupReportSeries(rows);assert.equal(g.mode,'month');assert.equal(g.buckets.length,12);assert.equal(Math.round(g.buckets.reduce((s,b)=>s+b.sales,0)*100),366*29);assert.match(g.buckets[0].label,/2024/);assert.equal(r.groupReportSeries(rows.slice(0,40)).mode,'week');assert.equal(r.groupReportSeries(rows.slice(0,31)).mode,'day');assert.equal(r.reportComparison(50,0).percent,null);assert.match(r.reportComparison(50,0).reason,/cero/);assert.equal(r.grossMargin(10,0),null);assert.equal(r.grossMargin(-10,-50),null);assert.deepEqual(r.previousPeriod({start:'2024-03-01',end:'2024-03-31'}),{start:'2024-01-30',end:'2024-02-29'});assert.equal(r.limaDate(new Date('2024-01-01T04:59:59Z')),'2023-12-31');
});

test('Exportaciones: totales de pantalla, metadatos y defensa ante fórmulas',async()=>{
 const e=load('lib/report-export.ts');const b=await report('sales');const products=e.reportExportTable(b,'products');assert.equal(products.total.gross,b.current.gross_sales);assert.equal(products.total.discounts,b.current.discounts);const csv=e.reportCsv(products,b);assert.match(csv,/America\/Lima/);assert.match(csv,/"total"/);assert.match(csv,/"2024-01-01"/);assert.equal(e.quoteReportCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(e.quoteReportCell(-10),'"-10"');
 const d=await report('detail',undefined,undefined,{metric:'profit',export:true});assert.equal(e.reportExportTable(d,'detail').total.value,b.current.gross_profit_estimate);
});

test('Análisis: gastos y cancelaciones con devolución de adelanto no alteran la utilidad bruta',async()=>{
 const v=await catalog(db);const id=await discounted(v,1,10,'reserve');await db.query("SELECT public.record_payment($1,$2,30,'yape','Adelanto')",[crypto.randomUUID(),id]);await db.query("SELECT public.cancel_paid_reservation($1,$2,'yape','Cancelación ficticia')",[crypto.randomUUID(),id]);
 const expense=(await row("SELECT public.record_expense($1,'Gasto de prueba',7,'efectivo','Prueba') id",[crypto.randomUUID()])).id;
 await owner(async()=>{await db.query("UPDATE public.orders SET created_at='2024-07-01T17:00Z' WHERE id=$1",[id]);await db.query("UPDATE public.payments SET received_at='2024-07-01T17:00Z' WHERE order_id=$1",[id]);await db.query("UPDATE public.refunds SET refunded_at='2024-07-02T17:00Z' WHERE order_id=$1",[id]);await db.query("UPDATE public.cash_expenses SET occurred_at='2024-07-02T18:00Z' WHERE id=$1",[expense]);});
 const b=await report('sales','2024-07-01','2024-07-31');assert.deepEqual([b.current.gross_sales,b.current.discounts,b.current.gross_profit_estimate,b.current.payments,b.current.refunds_paid,b.current.expenses,b.current.cash_net],[0,0,0,30,30,7,-7]);assert.equal((await report('detail','2024-07-01','2024-07-31',{metric:'cash_net'})).detail.total,-7);
});

test('Análisis: compras incluyen proveedor sin asignar, preservan costo histórico y concilian detalle filtrado',async()=>{
 const v=await catalog(db);const sale=await discounted(v);await dateOrder(sale,'2024-08-01T17:00Z');
 const supplier=await owner(async()=>(await row("INSERT INTO public.suppliers(name) VALUES('Proveedor ficticio Agosto') RETURNING id")).id);
 for(const vendor of [supplier,null]){const p=(await row('SELECT public.receive_purchase($1,$2,$3::jsonb) id',[vendor,'Recepción prueba',JSON.stringify([{variant_id:v,quantity:3,unit_cost:70}])])).id;await owner(()=>db.query("UPDATE public.purchases SET received_at='2024-08-05T17:00Z' WHERE id=$1",[p]));}
 const b=await report('suppliers','2024-08-01','2024-08-31');assert.equal(b.current.purchases,420);assert.equal(b.current.units,6);assert.equal(b.suppliers.rows.find(s=>s.supplier_key==='unassigned').total,210);assert.equal(b.capabilities.supplier_balances,false);
 const filtered=await report('suppliers','2024-08-01','2024-08-31',{q:'Agosto'});assert.equal(filtered.current.purchases,210);const d=await report('detail','2024-08-01','2024-08-31',{metric:'purchases',q:'Agosto'});assert.equal(d.detail.filtered_total,210);assert.equal((await report('detail','2024-08-01','2024-08-31',{metric:'purchases',supplier:'unassigned'})).detail.total,210);
 const sales=await report('sales','2024-08-01','2024-08-31');assert.equal(sales.current.cogs_net,50);assert.equal(sales.current.gross_profit_estimate,40);
});

test('Servidor: distingue falta de migración, fallo y respuesta incompleta, sin publicar ceros',async()=>{
 const period={start:'2024-01-01',end:'2024-01-31'};
 for(const [response,expected] of [[{error:{code:'PGRST202'}},/011_reportes/],[{error:{code:'08006'}},/conexión/],[{data:{version:2,tab:'sales',meta:{as_of:'x',generated_at:'x',start:period.start,end:period.end}}},/Faltan indicadores/]]){
  const m=load('lib/report-analysis.ts',{'@/lib/phase3':{requireReportUser:async()=>({role:'admin',supabase:{rpc:async()=>response}}),parsePeriod:(start,end)=>({start,end})}});await assert.rejects(()=>m.fetchAnalysis('sales',period),expected);
 }
 const m=load('lib/report-analysis.ts',{'@/lib/phase3':{requireReportUser:async()=>({role:'operator'}),parsePeriod:(start,end)=>({start,end})}});await assert.rejects(()=>m.fetchAnalysis('sales',period),/administrador/);
});

test('Análisis: líneas antiguas sin precio original no inventan un descuento histórico',async()=>{
 const v=await catalog(db);const id=await discounted(v);await dateOrder(id,'2024-09-10T17:00Z');await owner(()=>db.query('UPDATE public.order_lines SET catalog_unit_price=NULL WHERE order_id=$1',[id]));const b=await report('sales','2024-09-01','2024-09-30');assert.equal(b.current.gross_sales,90);assert.equal(b.current.discounts,0);assert.equal(b.current.unknown_discount_lines,1);assert.equal(b.current.gross_profit_estimate,40);
});

test('Exportación: rechaza más de 10000 filas en lugar de entregar un archivo incompleto',async()=>{
 await owner(()=>db.query("INSERT INTO public.cash_expenses(request_key,concept,amount,method,occurred_at,created_by) SELECT gen_random_uuid(),'Volumen ficticio',1,'efectivo','2021-01-15T17:00Z',$1 FROM generate_series(1,10001)",[adminId]));
 await assert.rejects(()=>report('detail','2021-01-01','2021-01-31',{metric:'expenses',export:true}),/10000.*incompleta/);
});

test('Análisis: devolución y reembolso diferidos se registran en períodos distintos',async()=>{
 const v=await catalog(db);const id=await discounted(v);await dateOrder(id,'2024-09-29T17:00Z');await returned(id,'sellable','2024-10-31T18:00Z');await owner(()=>db.query("UPDATE public.refunds SET refunded_at='2024-11-01T05:00Z' WHERE order_id=$1",[id]));const oct=await report('sales','2024-10-01','2024-10-31'),nov=await report('sales','2024-11-01','2024-11-30');assert.deepEqual([oct.current.return_value,oct.current.refunds_paid,oct.current.gross_profit_estimate],[90,0,-40]);assert.deepEqual([nov.current.return_value,nov.current.refunds_paid,nov.current.cash_net],[0,90,-90]);
});
