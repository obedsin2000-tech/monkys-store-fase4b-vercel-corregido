import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {ProductForm} from '@/components/product-form';
import {VariantSettings} from '@/components/variant-settings';
import {money,available,type Variant,type Product} from '@/lib/types';
const pageSize=50;
export default async function ProductsPage({searchParams}:{searchParams:Promise<{q?:string;page?:string}>}){const {supabase:s,role}=await requireUser();const params=await searchParams;const q=(params.q||'').trim().replace(/[,%()_*\\]/g,' ').slice(0,80);const page=Math.max(1,Number.parseInt(params.page||'1',10)||1);
 const [{data:products},{data:variants,count}]=await Promise.all([
 s.from('products').select('id,product_code,name,brand,active,category_id,categories(name)').order('name').limit(1000),
 (()=>{let query=s.from('variants').select('*,products(name,product_code)',{count:'exact'}).order('sku');if(q)query=query.or(`sku.ilike.%${q}%,barcode.ilike.%${q}%,size.ilike.%${q}%,color.ilike.%${q}%`);return query.range((page-1)*pageSize,page*pageSize-1);})()
 ]);
 const ps=(products||[]) as unknown as Product[],vs=(variants||[]) as unknown as Variant[];
 const total=count||0,pages=Math.max(1,Math.ceil(total/pageSize));const href=(p:number)=>`/productos?${new URLSearchParams({...(q?{q}:{}),page:String(p)})}`;
 return <><PageTitle title="Productos y variantes" description="Un SKU por talla y color; cantidades y precios independientes."/>
 {role==='admin'&&<><ProductForm products={ps}/><VariantSettings variants={vs}/></>}
 <section className="card"><form method="get" className="queue-filters"><label>Buscar variante<input name="q" defaultValue={q} placeholder="SKU, código de barras, talla o color" maxLength={80}/></label><input type="hidden" name="page" value="1"/><button className="btn primary">Buscar</button><Link className="btn outline" href="/productos">Limpiar</Link></form><div className="section-title"><h2>Catálogo</h2><span className="muted small">{total} variante(s) · Página {page} de {pages}</span></div>
 {vs.length===0?<Empty text="Aún no tienes prendas registradas. Crea tu primer producto o importa tu Excel."/>:<div className="table-wrap"><table><thead><tr><th>Producto</th><th>SKU</th><th>Código barras</th><th>Talla</th><th>Color</th><th>Precio</th><th>Físico</th><th>Reservado</th><th>Disponible</th></tr></thead><tbody>{vs.map(v=><tr key={v.id}><td><b>{v.products?.name}</b></td><td className="mono">{v.sku}</td><td className="mono">{v.barcode||'—'}</td><td>{v.size}</td><td>{v.color}</td><td>{money(v.sale_price)}</td><td>{v.on_hand}</td><td>{v.reserved}</td><td><span className={`stock-number ${available(v)<=v.min_stock?'warning':''}`}>{available(v)}</span></td></tr>)}</tbody></table></div>}
 <div className="queue-pagination"><Link aria-disabled={page<=1} className={`btn outline ${page<=1?'disabled-link':''}`} href={href(Math.max(1,page-1))}>Anterior</Link><span>{vs.length} mostradas</span><Link aria-disabled={page>=pages} className={`btn outline ${page>=pages?'disabled-link':''}`} href={href(Math.min(pages,page+1))}>Siguiente</Link></div></section></>;
}
