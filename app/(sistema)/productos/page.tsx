import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {ProductForm} from '@/components/product-form';
import {VariantSettings} from '@/components/variant-settings';
import {money,available,type Variant,type Product} from '@/lib/types';
export default async function ProductsPage(){const {supabase:s,role}=await requireUser();await s.rpc('expire_reservations');
 const [{data:products},{data:variants}]=await Promise.all([
 s.from('products').select('id,product_code,name,brand,active,category_id,categories(name)').order('name').limit(1000),
 s.from('variants').select('*,products(name,product_code)').order('sku').limit(1000)
 ]);
 const ps=(products||[]) as unknown as Product[],vs=(variants||[]) as unknown as Variant[];
 return <><PageTitle title="Productos y variantes" description="Un SKU por talla y color; cantidades y precios independientes."/>
 {role==='admin'&&<><ProductForm products={ps}/><VariantSettings variants={vs}/></>}
 <section className="card"><div className="section-title"><h2>Catálogo</h2><span className="muted small">{ps.length} productos · {vs.length} variantes</span></div>
 {vs.length===0?<Empty text="Aún no tienes prendas registradas. Crea tu primer producto o importa tu Excel."/>:<div className="table-wrap"><table><thead><tr><th>Producto</th><th>SKU</th><th>Código barras</th><th>Talla</th><th>Color</th><th>Precio</th><th>Físico</th><th>Reservado</th><th>Disponible</th></tr></thead><tbody>{vs.map(v=><tr key={v.id}><td><b>{v.products?.name}</b></td><td className="mono">{v.sku}</td><td className="mono">{v.barcode||'—'}</td><td>{v.size}</td><td>{v.color}</td><td>{money(v.sale_price)}</td><td>{v.on_hand}</td><td>{v.reserved}</td><td><span className={`stock-number ${available(v)<=v.min_stock?'warning':''}`}>{available(v)}</span></td></tr>)}</tbody></table></div>}
 </section></>;
}
