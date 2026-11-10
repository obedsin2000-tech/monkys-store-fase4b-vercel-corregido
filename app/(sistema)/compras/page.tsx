import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {PurchaseForm,SupplierForm} from '@/components/purchase-form';
import {money,dateTime,type Variant,type Supplier,type Purchase} from '@/lib/types';
export default async function Purchases(){const {supabase:s,role}=await requireUser();
 const [{data:variants},{data:suppliers},{data:purchases}]=await Promise.all([
 s.from('variants').select('*,products(name,product_code)').eq('active',true).order('sku').limit(1000),
 s.from('suppliers').select('id,name,phone').order('name'),
 s.from('purchases').select('id,reference,total,received_at,suppliers(name)').order('received_at',{ascending:false}).limit(50)
 ]);
 return <><PageTitle title="Compras y recepciones" description="Cada recepción actualiza automáticamente las existencias y el costo promedio."/>
 {role==='admin'?<><PurchaseForm variants={(variants||[]) as unknown as Variant[]} suppliers={(suppliers||[]) as Supplier[]}/><SupplierForm/></>:<div className="alert warn">Solo el administrador puede registrar compras y proveedores.</div>}
 <section className="card"><h2>Últimas 50 compras</h2>{!purchases?.length?<Empty text="Todavía no se ha recibido mercadería mediante compras."/>:<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Referencia</th><th>Total</th></tr></thead><tbody>{(purchases as unknown as Purchase[]).map(p=><tr key={p.id}><td>{dateTime(p.received_at)}</td><td>{p.suppliers?.name||'—'}</td><td>{p.reference||'—'}</td><td>{money(p.total)}</td></tr>)}</tbody></table></div>}</section></>;
}
