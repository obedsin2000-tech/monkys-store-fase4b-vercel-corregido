'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import ExcelJS from 'exceljs';
import {requireUser} from '@/lib/auth';
import type {ActionResult,Variant} from '@/lib/types';
import {moneyCents} from '@/lib/sale-totals';

const text=(max=120)=>z.string().trim().min(2,'Ingresa al menos 2 caracteres').max(max);
const price=z.coerce.number().finite().min(0).max(999999999);
const nonneg=z.coerce.number().int().min(0).max(1000000);
const uuid=z.string().uuid();
const itemSchema=z.object({product_code:text(40),name:text(120),category:z.string().trim().max(80).default(''),brand:z.string().trim().max(80).default(''),sku:text(60),size:z.string().trim().max(30).default('Única'),color:z.string().trim().max(40).default('Único'),sale_price:price,cost:price,initial_stock:nonneg,min_stock:nonneg});
const variantSchema=itemSchema.omit({product_code:true,name:true,category:true,brand:true}).extend({product_id:uuid});
const rowsSchema=z.array(itemSchema.omit({brand:true})).min(1).max(500);
const purchaseSchema=z.object({request_key:uuid,supplier_id:uuid.nullable(),reference:z.string().trim().max(80),lines:z.array(z.object({variant_id:uuid,quantity:z.coerce.number().int().positive().max(100000),unit_cost:price})).min(1).max(100)});
const orderMoney=z.number().finite().min(0).max(999999999).refine(n=>moneyCents(n)!==null,'Usa importes con hasta dos decimales');
const orderSchema=z.object({request_key:uuid,buyer:z.string().trim().max(120),handle:z.string().trim().max(80),customer_id:uuid.nullable(),channel:z.enum(['tiktok','whatsapp','directo']),mode:z.enum(['reserve','paid']),method:z.enum(['efectivo','yape','plin','transferencia']).nullable(),minutes:z.number().int().min(5).max(720),lines:z.array(z.object({variant_id:uuid,quantity:z.number().int().min(1).max(1000),unit_discount:orderMoney.default(0),expected_unit_price:orderMoney.optional()})).min(1).max(50)});
function err(e:unknown):ActionResult{return {ok:false,error:e instanceof Error?e.message:'Error inesperado. Intenta nuevamente.'};}
function changed(){['/panel','/productos','/inventario','/compras','/ventas','/pedidos','/clientes'].forEach(p=>revalidatePath(p));}
async function ensureAdmin(){const auth=await requireUser();if(auth.role!=='admin')throw new Error('Esta operación requiere ser administrador');return auth.supabase;}

export async function searchSaleVariantsAction(term:string):Promise<{variants:Variant[];error?:string}>{
 try{
  const q=z.string().trim().min(2).max(80).parse(term).replace(/[,%()_*\\]/g,' ').trim();if(q.length<2)return {variants:[]};
  const {supabase:s}=await requireUser();const pattern=`%${q}%`;
  const [{data:matches,error},{data:products,error:productsError}]=await Promise.all([
   s.from('variants').select('*,products(name,product_code)').eq('active',true).or(`sku.ilike.${pattern},barcode.ilike.${pattern},size.ilike.${pattern},color.ilike.${pattern}`).order('sku').limit(50),
   s.from('products').select('id').eq('active',true).or(`name.ilike.${pattern},product_code.ilike.${pattern}`).limit(50)
  ]);
  if(error||productsError)throw new Error((error||productsError)!.message);let results=(matches||[]) as unknown as Variant[];
  const ids=(products||[]).map(p=>p.id);if(ids.length){const {data,error:productError}=await s.from('variants').select('*,products(name,product_code)').eq('active',true).in('product_id',ids).order('sku').limit(50);if(productError)throw new Error(productError.message);const byId=new Map(results.map(v=>[v.id,v]));for(const v of (data||[]) as unknown as Variant[])byId.set(v.id,v);results=[...byId.values()].slice(0,50);}
  return {variants:results};
 }catch(e){return {variants:[],error:e instanceof Error?e.message:'No se pudo buscar el catálogo.'};}
}
export async function findSaleVariantAction(rawCode:string):Promise<{variant?:Variant;error?:string}>{
 try{const code=z.string().trim().min(1).max(60).parse(rawCode).toUpperCase();const {supabase:s}=await requireUser();
  let {data,error}=await s.from('variants').select('*,products(name,product_code)').eq('barcode',code).maybeSingle();if(error)throw new Error(error.message);
  if(!data){const result=await s.from('variants').select('*,products(name,product_code)').eq('sku',code).maybeSingle();data=result.data;error=result.error;if(error)throw new Error(error.message);}
  if(!data)return {error:'Código no encontrado. Comprueba que sea una variante registrada.'};return {variant:data as unknown as Variant};
 }catch(e){return {error:e instanceof Error?e.message:'No se pudo consultar el código.'};}
}

export async function createProductAction(input:unknown):Promise<ActionResult>{
 try{const data=itemSchema.parse(input);const s=await ensureAdmin();const {data:id,error}=await s.rpc('create_catalog_item',{p_data:data});if(error)throw new Error(error.message);changed();return {ok:true,message:'Producto y variante creados correctamente.',id};}catch(e){return err(e);}
}
export async function addVariantAction(input:unknown):Promise<ActionResult>{
 try{const data=variantSchema.parse(input);const s=await ensureAdmin();const {data:id,error}=await s.rpc('add_variant',{p_data:data});if(error)throw new Error(error.message);changed();return {ok:true,message:'Variante registrada.',id};}catch(e){return err(e);}
}
export async function adjustStockAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({variant_id:uuid,delta:z.coerce.number().int().min(-1000000).max(1000000).refine(n=>n!==0),reason:z.string().trim().min(5).max(300)}).parse(input);
 const s=await ensureAdmin();const {error}=await s.rpc('adjust_stock',{p_variant:d.variant_id,p_delta:d.delta,p_reason:d.reason});if(error)throw new Error(error.message);changed();return {ok:true,message:'Ajuste registrado en Kardex.'};}catch(e){return err(e);}
}
export async function receivePurchaseAction(input:unknown):Promise<ActionResult>{
 try{const d=purchaseSchema.parse(input);const skuSet=new Set(d.lines.map(x=>x.variant_id));if(skuSet.size!==d.lines.length)throw new Error('No agregues el mismo SKU dos veces');
 const s=await ensureAdmin();const {data:id,error}=await s.rpc('receive_purchase_once',{p_key:d.request_key,p_supplier:d.supplier_id,p_reference:d.reference,p_lines:d.lines});if(error)throw new Error(error.code==='PGRST202'?'Falta aplicar la migración 009 antes de registrar recepciones.':error.message);changed();return {ok:true,message:'Compra recibida: inventario y Kardex actualizados.',id};}catch(e){return err(e);}
}
export async function createOrderAction(input:unknown):Promise<ActionResult>{
 try{const d=orderSchema.parse(input);if(d.mode==='reserve'&&!d.buyer&&!d.handle&&!d.customer_id)throw new Error('Para reservar, identifica al comprador por nombre o cliente frecuente. El usuario de TikTok es opcional.');
 if(d.mode==='paid'&&!d.method)throw new Error('Selecciona un medio de pago previamente verificado');
 const set=new Set(d.lines.map(x=>x.variant_id));if(set.size!==d.lines.length)throw new Error('El carrito contiene SKUs duplicados');
 const discounted=d.lines.some(line=>line.unit_discount>0);
 const {supabase:s}=await requireUser();const {data:id,error}=await s.rpc(discounted?'create_order_with_discounts':'create_order',{p_key:d.request_key,p_buyer:d.buyer||(!d.handle&&!d.customer_id?'Venta rápida sin identificar':''),p_handle:d.handle,p_customer:d.customer_id,p_channel:d.channel,p_mode:d.mode,p_method:d.method,p_minutes:d.minutes,p_lines:d.lines});
 if(error)throw new Error(discounted&&error.code==='PGRST202'?'Para usar descuentos, aplica primero 010_descuentos_venta.sql en Supabase. No se registró la venta.':error.message);changed();return {ok:true,message:d.mode==='reserve'?'Pedido reservado correctamente.':'Venta confirmada y stock descontado.',id};
 }catch(e){return err(e);}
}
export async function confirmReservationAction(orderId:string,method:string):Promise<ActionResult>{
 try{uuid.parse(orderId);const m=z.enum(['efectivo','yape','plin','transferencia']).parse(method);const {supabase:s}=await requireUser();const {error}=await s.rpc('confirm_reservation',{p_order:orderId,p_method:m});if(error)throw new Error(error.message);changed();return {ok:true,message:'Pago verificado y venta confirmada.'};}catch(e){return err(e);}
}
export async function cancelReservationAction(orderId:string):Promise<ActionResult>{
 try{uuid.parse(orderId);const {supabase:s}=await requireUser();const {error}=await s.rpc('cancel_reservation',{p_order:orderId});if(error)throw new Error(error.message);changed();return {ok:true,message:'Reserva cancelada y unidades liberadas.'};}catch(e){return err(e);}
}
export async function createCustomerAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({name:text(120),tiktok_handle:z.string().trim().max(80),phone:z.string().trim().max(30)}).parse(input);const {supabase:s}=await requireUser();const {error}=await s.from('customers').insert({name:d.name,tiktok_handle:d.tiktok_handle||null,phone:d.phone||null});if(error)throw new Error(error.message);changed();return {ok:true,message:'Cliente registrado.'};}catch(e){return err(e);}
}
export async function createSupplierAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({name:text(120),phone:z.string().trim().max(30)}).parse(input);const s=await ensureAdmin();const {error}=await s.from('suppliers').insert({name:d.name,phone:d.phone||null});if(error)throw new Error(error.message);changed();return {ok:true,message:'Proveedor creado.'};}catch(e){return err(e);}
}

// El XLSX se valida en servidor. Todo el archivo se importa dentro de una sola transacción RPC.
export async function importExcelAction(formData:FormData):Promise<ActionResult>{
 try{
  const s=await ensureAdmin();const file=formData.get('archivo');
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Selecciona un Excel .xlsx');
  if(file.size>2*1024*1024)throw new Error('Máximo 2 MB por archivo');
  const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  const sheet=book.worksheets[0];if(!sheet)throw new Error('El Excel está vacío');
  const headers=['codigo_producto','nombre','categoria','sku','talla','color','costo','precio','stock_inicial','stock_minimo'];
  const found=headers.map((_,i)=>String(sheet.getRow(1).getCell(i+1).text||'').trim().toLowerCase());
  if(found.some((v,i)=>v!==headers[i]))throw new Error(`Los encabezados deben ser: ${headers.join(', ')}`);
  const records:unknown[]=[];
  for(let i=2;i<=sheet.rowCount;i++){
   const row=sheet.getRow(i);const raw=headers.map((_,j)=>row.getCell(j+1).value);
   if(raw.every(v=>v===null||v===undefined||String(v).trim()===''))continue;
   const cell=(index:number)=>String(row.getCell(index).text||'').trim();
   records.push({product_code:cell(1),name:cell(2),category:cell(3),sku:cell(4),size:cell(5)||'Única',color:cell(6)||'Único',cost:Number(cell(7)),sale_price:Number(cell(8)),initial_stock:Number(cell(9)),min_stock:cell(10)?Number(cell(10)):2});
  }
  const rows=rowsSchema.parse(records);
  const skus=rows.map(r=>r.sku.toUpperCase());if(new Set(skus).size!==skus.length)throw new Error('El Excel contiene SKUs duplicados');
  const {data:count,error}=await s.rpc('import_catalog',{p_rows:rows});if(error)throw new Error(error.message);
  changed();return {ok:true,message:`Se importaron ${count} variantes con su stock inicial.`,count};
 }catch(e){return err(e);}
}

export async function updateVariantSettingsAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({variant_id:uuid,sale_price:price,min_stock:nonneg}).parse(input);
  const s=await ensureAdmin();const {error}=await s.rpc('update_variant_settings',{p_variant:d.variant_id,p_price:d.sale_price,p_min_stock:d.min_stock});
  if(error)throw new Error(error.message);changed();return {ok:true,message:'Precio y stock mínimo actualizados.'};}catch(e){return err(e);}
}

const productIdentitySchema = z.object({
 product_code: z.string().trim().min(2, 'Ingresa un código de producto de al menos 2 caracteres.').max(40, 'El código de producto admite hasta 40 caracteres.'),
 name: z.string().trim().min(2, 'Ingresa un nombre de al menos 2 caracteres.').max(120, 'El nombre admite hasta 120 caracteres.'),
 category: z.string().trim().max(80, 'La categoría admite hasta 80 caracteres.').refine(value => !value || value.length >= 2, 'Ingresa una categoría de al menos 2 caracteres.'),
 brand: z.string().trim().max(80, 'La marca admite hasta 80 caracteres.'),
});

const variantIdentitySchema = z.object({
 variant_id: uuid,
 sku: z.string().trim().min(2, 'Ingresa un SKU de al menos 2 caracteres.').max(60, 'El SKU admite hasta 60 caracteres.'),
 size: z.string().trim().min(1, 'Ingresa la talla.').max(30, 'La talla admite hasta 30 caracteres.'),
 color: z.string().trim().min(1, 'Ingresa el color.').max(40, 'El color admite hasta 40 caracteres.'),
 expected: z.object({ sku: z.string(), size: z.string(), color: z.string() }),
 product: z.object({
  values: productIdentitySchema,
  expected: z.object({ product_code: z.string(), name: z.string(), category: z.string(), brand: z.string() }),
 }).optional(),
});

export async function updateVariantIdentityAction(input: unknown): Promise<ActionResult> {
 const parsed = variantIdentitySchema.safeParse(input);
 if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

 const d = parsed.data;
 const { supabase: s, role } = await requireUser();
 if (role !== 'admin') return { ok: false, error: 'La edición de variantes requiere una sesión de administrador activa.' };

 const args = {
  p_variant: d.variant_id,
  p_sku: d.sku,
  p_size: d.size,
  p_color: d.color,
  p_expected: d.expected,
 };
 const { error } = d.product
  ? await s.rpc('update_catalog_variant', { ...args, p_product: d.product.values, p_expected_product: d.product.expected })
  : await s.rpc('update_variant_identity', args);
 if (error?.code === 'PGRST202') {
  const migration = d.product ? '015_editar_datos_producto.sql' : '014_editar_variantes.sql';
  return { ok: false, error: 'Aplica ' + migration + ' en Supabase para habilitar la edición.' };
 }
 if (error?.code === '42501') {
  return { ok: false, error: 'La edición de variantes requiere una sesión de administrador activa.' };
 }
 if (error && ['22023', '23505', 'P0002', 'PT409'].includes(error.code)) {
  return { ok: false, error: error.message };
 }
 if (error) return { ok: false, error: 'No se pudo confirmar el cambio. Intenta nuevamente.' };
 return { ok: true, message: d.product ? 'Cambios guardados.' : 'Variante actualizada.' };
}
