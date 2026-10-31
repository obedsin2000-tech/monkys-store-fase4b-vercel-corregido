import {requireUser} from '@/lib/auth';
import {PageTitle} from '@/components/ui';
import {SaleForm} from '@/components/sale-form';
import type {Customer,Variant} from '@/lib/types';
export default async function Sales(){const {supabase:s}=await requireUser();await s.rpc('expire_reservations');
 const [{data:variants},{data:customers}]=await Promise.all([
 s.from('variants').select('*,products(name,product_code)').eq('active',true).order('sku').limit(1000),
 s.from('customers').select('id,name,tiktok_handle,phone').order('name').limit(1000)
 ]);
 return <><PageTitle title="Venta rápida" description="Registra ventas pagadas o aparta prendas mientras transmites en TikTok Live."/>
 <SaleForm variants={(variants||[]) as unknown as Variant[]} customers={(customers||[]) as Customer[]}/></>;
}
