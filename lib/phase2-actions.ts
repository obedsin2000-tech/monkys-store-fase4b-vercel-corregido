'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {ActionResult} from '@/lib/types';
const id=z.string().uuid();
const amount=z.coerce.number().finite().positive().max(999999999);
const zeroAmount=z.coerce.number().finite().min(0).max(999999999);
const method=z.enum(['efectivo','yape','plin','transferencia']);
const err=(e:unknown):ActionResult=>({ok:false,error:e instanceof Error?e.message:'Error inesperado'});
const refresh=()=>['/pedidos','/panel','/inventario','/cobros','/caja','/envios','/devoluciones'].forEach(p=>revalidatePath(p));
async function admin(){const a=await requireUser();if(a.role!=='admin')throw new Error('Solo un administrador puede realizar esta operación');return a.supabase;}
function moneyDecimal(n:number){if(!Number.isFinite(n)||Math.round(n*100)!==n*100 && Math.abs(Math.round(n*100)-n*100)>0.00001)throw new Error('Usa máximo dos decimales');return n;}
export async function paymentAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({key:id,order:id,amount,method,reference:z.string().trim().max(100)}).parse(input);moneyDecimal(d.amount);
 const {supabase:s}=await requireUser();const {data,error}=await s.rpc('record_payment',{p_key:d.key,p_order:d.order,p_amount:d.amount,p_method:d.method,p_reference:d.reference});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Cobro registrado. Si completaste el saldo, el pedido quedó confirmado.'};}catch(e){return err(e);}
}
export async function shipmentAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({order:id,recipient_name:z.string().trim().min(2).max(120),phone:z.string().trim().min(6).max(30),dni:z.string().trim().max(15),department:z.string().trim().max(100),province:z.string().trim().min(2).max(100),district:z.string().trim().max(100),carrier:z.enum(['shalom','otro']),agency_address:z.string().trim().min(4).max(250)}).parse(input);
 const {supabase:s}=await requireUser();const {data,error}=await s.rpc('save_shipment',{p_order:d.order,p_data:d});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Datos de envío guardados.'};}catch(e){return err(e);}
}
export async function shipmentStatusAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({order:id,status:z.enum(['preparing','dispatched','delivered']),tracking:z.string().trim().max(120)}).parse(input);
 const {supabase:s}=await requireUser();const {error}=await s.rpc('set_shipment_status',{p_order:d.order,p_status:d.status,p_tracking:d.tracking});if(error)throw new Error(error.message);refresh();return {ok:true,message:'Estado de envío actualizado.'};}catch(e){return err(e);}
}
export async function returnAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({key:id,order:id,reason:z.string().trim().min(5).max(400),refund:zeroAmount,method,lines:z.array(z.object({order_line_id:id,quantity:z.coerce.number().int().min(1).max(10000),condition:z.enum(['sellable','damaged'])})).min(1).max(50)}).parse(input);
 moneyDecimal(d.refund);const s=await admin();const {data,error}=await s.rpc('process_return',{p_key:d.key,p_order:d.order,p_reason:d.reason,p_lines:d.lines,p_refund:d.refund,p_method:d.method});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Devolución registrada, Kardex actualizado y reembolso contabilizado si corresponde.'};}catch(e){return err(e);}
}
export async function expenseAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({key:id,concept:z.string().trim().min(4).max(150),amount,method,notes:z.string().trim().max(400)}).parse(input);moneyDecimal(d.amount);
 const s=await admin();const {data,error}=await s.rpc('record_expense',{p_key:d.key,p_concept:d.concept,p_amount:d.amount,p_method:d.method,p_notes:d.notes});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Gasto registrado en caja.'};}catch(e){return err(e);}
}
export async function closingAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({date:z.string().date(),opening:zeroAmount,counted:zeroAmount,notes:z.string().trim().max(400)}).parse(input);moneyDecimal(d.opening);moneyDecimal(d.counted);
 const s=await admin();const {data,error}=await s.rpc('close_cash',{p_day:d.date,p_opening:d.opening,p_counted:d.counted,p_notes:d.notes});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Corte de caja guardado como fotografía de los movimientos hasta este momento.'};}catch(e){return err(e);}
}
export async function cancelPaidReservationAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({key:id,order:id,method,reason:z.string().trim().min(5).max(400)}).parse(input);
 const s=await admin();const {data,error}=await s.rpc('cancel_paid_reservation',{p_key:d.key,p_order:d.order,p_method:d.method,p_reason:d.reason});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Adelanto devuelto y reserva cancelada. Stock liberado.'};}catch(e){return err(e);}
}
export async function refundReturnAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({key:id,returnId:id,amount,method}).parse(input);moneyDecimal(d.amount);
 const s=await admin();const {data,error}=await s.rpc('refund_return',{p_key:d.key,p_return:d.returnId,p_amount:d.amount,p_method:d.method});if(error)throw new Error(error.message);refresh();return {ok:true,id:data,message:'Reembolso realizado y registrado en caja.'};}catch(e){return err(e);}
}
