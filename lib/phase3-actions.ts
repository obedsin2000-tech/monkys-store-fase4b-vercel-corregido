'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {ActionResult} from '@/lib/types';
const schema=z.object({id:z.string().uuid(),role:z.enum(['admin','operator']),active:z.boolean()});
export async function changeTeamMember(input:unknown):Promise<ActionResult>{
 try{
  const payload=schema.parse(input);
  const {supabase,role}=await requireUser();
  if(role!=='admin')throw new Error('Solo un administrador puede administrar usuarios.');
  const {error}=await supabase.rpc('manage_team_member',{
   p_user:payload.id,p_role:payload.role,p_active:payload.active
  });
  if(error)throw new Error(error.message);
  revalidatePath('/equipo');
  return {ok:true,message:'Permisos guardados y auditados correctamente.'};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo cambiar el usuario'};}
}
