import {requireUser} from '@/lib/auth';
import {PageTitle} from '@/components/ui';
import {InventoryCountManager} from '@/components/inventory-count-manager';
import type {Variant} from '@/lib/types';
export default async function CountPage({searchParams}:{searchParams:Promise<{id?:string}>}){
 const {supabase:s,role}=await requireUser();
 const params=await searchParams;
 const [{data:counts,error:countError},{data:variants,error:variantError}]=await Promise.all([
  s.from('inventory_counts').select('id,status,notes,created_at,created_by').order('created_at',{ascending:false}).limit(40),
  s.from('variants').select('*,products(name,product_code)').order('sku').limit(2500)
 ]);
 const sessions=counts||[];
 const choice=sessions.find(c=>c.id===params.id)||sessions.find(c=>c.status==='draft')||sessions[0]||null;
 const {data:lines,error:lineError}=choice?await s.from('inventory_count_lines').select('id,variant_id,counted,baseline_on_hand,baseline_reserved,baseline_blocked,baseline_revision').eq('count_id',choice.id).order('variant_id').limit(2500):{data:[],error:null};
 return <><PageTitle title="Conteo físico de inventario" description="Escanea prendas, compara cantidades y envía diferencias al administrador sin modificar el stock directamente."/>
 {countError||variantError||lineError?<div className="alert error">No se pudieron consultar los conteos. Verifica la migración 005_fase4b.sql. {countError?.message||variantError?.message||lineError?.message}</div>:
 <InventoryCountManager key={choice?.id||'new'} variants={(variants||[]) as Variant[]} counts={sessions} selectedCount={choice} lines={lines||[]} role={role}/>}</>;
}
