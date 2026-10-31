import {requireUser} from '@/lib/auth';
import {PageTitle,Status} from '@/components/ui';
import {CashForms} from '@/components/cash-forms';
import {money,dateTime} from '@/lib/types';
export default async function Caja(){const {supabase:s,role}=await requireUser();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [{data:summary,error},{data:payments},{data:expenses},{data:refunds},{data:closings}]=await Promise.all([
 s.rpc('cash_summary',{p_day:today}),s.from('payments').select('id,amount,method,received_at').order('received_at',{ascending:false}).limit(40),
 s.from('cash_expenses').select('id,concept,amount,method,occurred_at').order('occurred_at',{ascending:false}).limit(40),
 s.from('refunds').select('id,amount,method,refunded_at').order('refunded_at',{ascending:false}).limit(40),
 s.from('cash_closings').select('id,business_date,expected_cash,counted_cash,difference,closed_at').order('business_date',{ascending:false}).limit(15)
 ]);
 const m=(summary||{}) as Record<string,number>;
 const records=[...(payments||[]).map(x=>({id:x.id,kind:'Cobro',amount:Number(x.amount),method:x.method,date:x.received_at})),
 ...(refunds||[]).map(x=>({id:x.id,kind:'Reembolso',amount:-Number(x.amount),method:x.method,date:x.refunded_at})),
 ...(expenses||[]).map(x=>({id:x.id,kind:'Gasto',amount:-Number(x.amount),method:x.method,date:x.occurred_at}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,65);
 return <><PageTitle title="Caja y cortes" description={`Movimientos de caja correspondientes al ${today} (hora de Perú).`}/>
 {error&&<div className="alert error">No se pudieron consultar los movimientos: {error.message}. Verifica 002_fase2.sql.</div>}
 <div className="kpi-grid"><div className="card kpi"><span>Cobros del día</span><strong>{money(m.payments)}</strong></div><div className="card kpi"><span>Reembolsos</span><strong>{money(m.refunds)}</strong></div><div className="card kpi"><span>Gastos</span><strong>{money(m.expenses)}</strong></div><div className="card kpi"><span>Neto de movimientos</span><strong>{money(m.net)}</strong></div></div>
 <CashForms date={today} cashNet={Number(m.cash_net||0)} canAdmin={role==='admin'}/>
 <section className="card"><h2>Últimos movimientos</h2><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Medio</th></tr></thead><tbody>{records.map(x=><tr key={x.id}><td>{dateTime(x.date)}</td><td><Status value={x.kind}/></td><td className={x.amount<0?'negative':'positive'}>{money(x.amount)}</td><td>{x.method}</td></tr>)}</tbody></table></div></section>
 <section className="card"><h2>Historial de cortes</h2><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Efectivo esperado</th><th>Efectivo contado</th><th>Diferencia</th><th>Registrado</th></tr></thead><tbody>{(closings||[]).map(c=><tr key={c.id}><td>{c.business_date}</td><td>{money(c.expected_cash)}</td><td>{money(c.counted_cash)}</td><td>{money(c.difference)}</td><td>{dateTime(c.closed_at)}</td></tr>)}</tbody></table></div></section></>;
}
