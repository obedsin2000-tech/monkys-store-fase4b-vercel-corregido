import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {CustomerForm} from '@/components/customer-form';
import type {Customer} from '@/lib/types';
export default async function Customers(){const {supabase:s}=await requireUser();const {data}=await s.from('customers').select('id,name,tiktok_handle,phone').order('name').limit(1000);
 const customers=(data||[]) as Customer[];
 return <><PageTitle title="Clientes" description="Registro mínimo y reutilizable; los datos de envío se completarán en la Fase 2."/>
 <CustomerForm/><section className="card"><h2>Clientes registrados ({customers.length})</h2>{customers.length===0?<Empty/>:<div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Usuario TikTok</th><th>Teléfono</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.tiktok_handle||'—'}</td><td>{c.phone||'—'}</td></tr>)}</tbody></table></div>}</section></>;
}
