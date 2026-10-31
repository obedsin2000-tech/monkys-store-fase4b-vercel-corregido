import {requireUser} from '@/lib/auth';
import {PageTitle,Empty} from '@/components/ui';
import {TeamManager} from '@/components/team-manager';
export default async function TeamPage(){
 const {supabase,role,userId}=await requireUser();
 if(role!=='admin')return <><PageTitle title="Usuarios y permisos" description="Este módulo requiere permisos de administrador."/><div className="alert warn">No tienes acceso a la administración de usuarios.</div></>;
 const {data,error}=await supabase.from('profiles').select('id,email,role,active,created_at').order('created_at',{ascending:false}).limit(150);
 return <><PageTitle title="Usuarios y permisos" description="Autoriza trabajadores y controla qué roles pueden gestionar la tienda."/>
 {error?<div className="alert error">{error.message}</div>:(data?.length?<TeamManager users={data} selfId={userId}/>:<Empty text="Todavía no hay usuarios."/>)}
 <section className="card"><h2>¿Cómo agregar a un trabajador?</h2><p className="report-note">1. Pídele que se registre desde <b>/ingresar</b> usando su propio correo y contraseña. 2. Vuelve a esta pantalla y recarga. 3. Activa su cuenta como <b>Operador</b>. 4. Para desactivar el acceso, desmarca «Activo» y guarda. No se crean usuarios desde esta pantalla, y no se muestra ninguna contraseña.</p>
 <p className="report-note"><b>Administrador:</b> compras, ajustes de inventario, reportes financieros, devoluciones, caja y permisos. <b>Operador:</b> ventas, pedidos y registros permitidos por las reglas de la aplicación. La autorización real se verifica también en la base de datos.</p></section></>;
}
