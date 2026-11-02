import {requireUser} from '@/lib/auth';
import {PageTitle} from '@/components/ui';
import {ShieldCheck,LockKeyhole,DatabaseBackup,Activity,AlertTriangle,CheckCircle2} from 'lucide-react';

type TableCheck={name:string;exists:boolean;rls:boolean;anon_can_read:boolean};
type SecurityReport={
 generated_at:string;phase:string;tables:TableCheck[];
 anon_security_definer_count:number;active_admins:number;
 registered_profiles:number;audit_events_30d:number;
 direct_writes:{variants:boolean;orders:boolean;profiles:boolean;inventory_counts?:boolean;inventory_count_lines?:boolean};
 backup_status:string;
};
function Check({ok,title,detail}:{ok:boolean;title:string;detail:string}){
 return <div className={`security-check ${ok?'security-check-ok':'security-check-bad'}`}>
   {ok?<CheckCircle2 size={19}/>:<AlertTriangle size={19}/>}
   <div><strong>{title}</strong><small>{detail}</small></div>
  </div>;
}
export default async function SecurityPage(){
 const {supabase,role}=await requireUser();
 if(role!=='admin')return <><PageTitle title="Seguridad y respaldos" description="Acceso exclusivo para administradores."/><div className="alert warn">No tienes permiso para ver esta sección.</div></>;
 const {data,error}=await supabase.rpc('phase4a_security_report');
 const report=(!error&&data ? data as SecurityReport : null);
 const {data:recent,error:auditError}=await supabase.from('audit_events')
  .select('id,event,created_at,actor_id').order('created_at',{ascending:false}).limit(15);
 const checks=report?.tables??[];
 const healthy=checks.filter(x=>x.exists&&x.rls&&!x.anon_can_read).length;
 return <>
  <PageTitle title="Seguridad y respaldos" description="Diagnóstico de accesos, auditoría y recomendaciones de respaldo. Solo administradores."/>
  <div className="card security-banner"><ShieldCheck size={27}/><div>
    <h2>Centro de seguridad · Fase 4B</h2>
    <p>Este panel consulta la configuración real de Supabase. No crea ni restaura respaldos desde el navegador.</p>
  </div></div>
  {error&&<div className="alert warn">No se pudo ejecutar el diagnóstico: {error.message}. Verifica las migraciones 004_fase4a.sql, 005_fase4b.sql y 006_fase4b_security_report.sql.</div>}
  {report&&<>
    <div className="kpi-grid three-cards">
      <div className="card mini-kpi"><span>Tablas protegidas</span><strong>{healthy}/{checks.length}</strong><small>RLS activo y sin lectura anónima</small></div>
      <div className="card mini-kpi"><span>Administradores activos</span><strong>{report.active_admins}</strong><small>{report.registered_profiles} cuentas registradas</small></div>
      <div className="card mini-kpi"><span>Actividad auditada (30 días)</span><strong>{report.audit_events_30d}</strong><small>Eventos registrados en la base de datos</small></div>
    </div>
    <section className="card"><div className="section-title"><h2><LockKeyhole size={18}/> Comprobaciones de permisos</h2></div>
      <div className="security-grid">
       <Check ok={healthy===checks.length&&checks.length===21} title="Protección de tablas"
         detail={`${healthy} de ${checks.length} tablas con RLS y sin lectura anónima`}/>
       <Check ok={report.anon_security_definer_count===0} title="Funciones de privilegio elevado"
         detail={`${report.anon_security_definer_count} funciones accesibles para el rol anónimo`}/>
       <Check ok={!Object.values(report.direct_writes).some(Boolean)} title="Escritura directa bloqueada"
         detail="Perfiles, pedidos y existencias solo deben modificarse por operaciones autorizadas"/>
       <Check ok={report.active_admins>=1} title="Administrador disponible"
         detail="Debe existir al menos una cuenta administrativa activa"/>
      </div>
      {checks.some(x=>!x.exists||!x.rls||x.anon_can_read)&&<div className="alert warn">Revisa las tablas que no cumplan los controles. No modifiques permisos manualmente sin un respaldo.</div>}
    </section>
    <section className="card"><h2>Comprobación por tabla</h2><div className="table-wrap"><table>
     <thead><tr><th>Tabla</th><th>Existe</th><th>RLS</th><th>Lectura anónima</th></tr></thead>
     <tbody>{checks.map(t=><tr key={t.name}><td className="mono">{t.name}</td><td>{t.exists?'Sí':'NO'}</td><td>{t.rls?'Activo':'Revisar'}</td><td>{t.anon_can_read?'REVISAR':'Bloqueada'}</td></tr>)}</tbody>
    </table></div></section>
  </>}
  <section className="card"><div className="section-title"><h2><DatabaseBackup size={18}/> Respaldo de datos</h2></div>
   <p className="report-note"><strong>Estado: no verificado desde la web.</strong> Supabase Free no proporciona respaldos diarios automáticos administrados. Ejecuta <code>04_CREAR_RESPALDO.bat</code> en Windows y comprueba el archivo con <code>05_VERIFICAR_RESPALDO.bat</code>. El respaldo contiene datos personales: guárdalo de forma cifrada y con acceso restringido.</p>
   <div className="alert warn"><AlertTriangle size={18}/> Verificar un archivo con pg_restore --list NO equivale a probar una restauración. La prueba de restauración se hace únicamente en una base de pruebas separada.</div>
  </section>
  <section className="card"><div className="section-title"><h2><Activity size={18}/> Auditoría reciente</h2></div>
    {auditError?<div className="alert error">{auditError.message}</div>:!recent?.length?<p className="report-note">No hay eventos recientes registrados.</p>:
    <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Usuario (ID)</th></tr></thead><tbody>
    {recent.map(ev=><tr key={ev.id}><td>{new Date(ev.created_at).toLocaleString('es-PE',{timeZone:'America/Lima'})}</td><td>{ev.event}</td><td><span className="mono">{ev.actor_id??'Sistema'}</span></td></tr>)}
    </tbody></table></div>}
  </section>
 </>;
}
