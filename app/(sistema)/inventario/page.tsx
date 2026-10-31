import {requireUser} from '@/lib/auth';
import Link from 'next/link';
import {PageTitle,Empty} from '@/components/ui';
import {StockAdjust} from '@/components/stock-adjust';
import {money,dateTime,available,type Variant,type StockMovement} from '@/lib/types';
export default async function Inventory(){const {supabase:s,role}=await requireUser();await s.rpc('expire_reservations');
 const [{data:variants},{data:movements}]=await Promise.all([
 s.from('variants').select('*,products(name,product_code)').order('sku').limit(1000),
 s.from('stock_movements').select('id,created_at,movement_type,quantity_delta,balance_after,notes,variants(sku,products(name))').order('created_at',{ascending:false}).limit(100)
 ]);
 const vs=(variants||[]) as unknown as Variant[],movs=(movements||[]) as unknown as StockMovement[];
 const worth=vs.reduce((a,v)=>a+v.on_hand*v.avg_cost,0);
 return <><PageTitle title="Kardex e inventario" description="Movimientos físicos, reservas y trazabilidad por SKU."/>
 <div className="action-row" style={{marginBottom:16}}><Link className="btn outline" href="/inventario/conteos">Abrir conteo físico por escáner</Link><Link className="btn outline" href="/etiquetas">Imprimir códigos de barras</Link></div><div className="kpi-grid three-cards"><div className="card mini-kpi"><span>Unidades físicas</span><strong>{vs.reduce((a,v)=>a+v.on_hand,0)}</strong></div><div className="card mini-kpi"><span>Reservadas</span><strong>{vs.reduce((a,v)=>a+v.reserved,0)}</strong></div><div className="card mini-kpi"><span>Inventario valorizado</span><strong>{money(worth)}</strong></div></div>
 {role==='admin'&&<StockAdjust variants={vs}/>}
 <section className="card"><h2>Disponibilidad por SKU</h2><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Prenda</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Min.</th></tr></thead><tbody>{vs.map(v=><tr key={v.id}><td className="mono">{v.sku}</td><td>{v.products?.name} · {v.color}/{v.size}</td><td>{v.on_hand}</td><td>{v.reserved}</td><td><span className={`stock-number ${available(v)<=v.min_stock?'warning':''}`}>{available(v)}</span></td><td>{v.min_stock}</td></tr>)}</tbody></table></div>{vs.length===0&&<Empty/>}</section>
 <section className="card"><h2>Últimos 100 movimientos de Kardex</h2><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>SKU</th><th>Movimiento</th><th>Unidades</th><th>Saldo</th><th>Motivo</th></tr></thead><tbody>{movs.map(m=><tr key={m.id}><td>{dateTime(m.created_at)}</td><td className="mono">{m.variants?.sku}</td><td>{({initial:'Inicial',purchase:'Compra',sale:'Venta',adjustment:'Ajuste'} as Record<string,string>)[m.movement_type]||m.movement_type}</td><td className={m.quantity_delta>0?'positive':'negative'}>{m.quantity_delta>0?'+':''}{m.quantity_delta}</td><td>{m.balance_after}</td><td>{m.notes||'—'}</td></tr>)}</tbody></table></div>{movs.length===0&&<Empty/>}</section>
 </>;
}
