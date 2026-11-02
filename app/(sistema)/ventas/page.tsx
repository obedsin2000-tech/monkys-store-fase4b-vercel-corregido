import {requireUser} from '@/lib/auth';
import {PageTitle} from '@/components/ui';
import {SaleForm} from '@/components/sale-form';
import type {Customer,Variant} from '@/lib/types';
export default async function Sales(){const {supabase:s}=await requireUser();const {data:customers}=await s.from('customers').select('id,name,tiktok_handle,phone').order('name').limit(500);
 return <><PageTitle title="Venta rápida" description="Escanea una prenda o busca por SKU, código, talla, color o nombre."/>
 <SaleForm variants={[] as Variant[]} customers={(customers||[]) as Customer[]}/></>;
}
