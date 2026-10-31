'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/auth';
import type {ActionResult} from '@/lib/types';
const uuid=z.string().uuid();
const error=(e:unknown):ActionResult=>({ok:false,error:e instanceof Error?e.message:'Error desconocido'});
function refresh(){for(const p of ['/inventario','/inventario/conteos','/ventas','/productos','/etiquetas','/panel'])revalidatePath(p);}
export async function openCountAction(notes:string):Promise<ActionResult>{
 try{const d=z.string().trim().max(300).parse(notes);const {supabase:s}=await requireUser();const {data,error:e}=await s.rpc('open_inventory_count',{p_notes:d});if(e)throw new Error(e.message);refresh();return {ok:true,id:data,message:'Conteo iniciado. Escanea las prendas o escribe cantidades.'};}catch(e){return error(e);}
}
export async function updateCountAction(input:unknown):Promise<ActionResult>{
 try{const d=z.object({count_id:uuid,variant_id:uuid,counted:z.number().int().min(0).max(1000000)}).parse(input);const {supabase:s}=await requireUser();const {error:e}=await s.rpc('set_inventory_count_line',{p_count:d.count_id,p_variant:d.variant_id,p_counted:d.counted});if(e)throw new Error(e.message);refresh();return {ok:true,message:'Cantidad guardada correctamente.'};}catch(e){return error(e);}
}
export async function submitCountAction(id:string):Promise<ActionResult>{
 try{uuid.parse(id);const {supabase:s}=await requireUser();const {error:e}=await s.rpc('submit_inventory_count',{p_count:id});if(e)throw new Error(e.message);refresh();return {ok:true,message:'Conteo enviado a revisión. No modificó el Kardex.'};}catch(e){return error(e);}
}
export async function approveCountAction(id:string):Promise<ActionResult>{
 try{uuid.parse(id);const {supabase:s,role}=await requireUser();if(role!=='admin')throw new Error('Sólo el administrador puede aprobar ajustes');const {data,error:e}=await s.rpc('approve_inventory_count',{p_count:id});if(e)throw new Error(e.message);refresh();return {ok:true,count:data,message:`Conteo aprobado. Se ajustaron ${data} variantes con registro en Kardex.`};}catch(e){return error(e);}
}
export async function cancelCountAction(id:string):Promise<ActionResult>{
 try{uuid.parse(id);const {supabase:s}=await requireUser();const {error:e}=await s.rpc('cancel_inventory_count',{p_count:id});if(e)throw new Error(e.message);refresh();return {ok:true,message:'Conteo cancelado; no se modificó el inventario.'};}catch(e){return error(e);}
}
