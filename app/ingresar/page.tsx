import {LoginForm} from '@/components/login-form';
export default async function LoginPage({searchParams}:{searchParams:Promise<{estado?:string}>}){
 const {estado}=await searchParams;
 return <main className="login-shell"><div className="login-card">
 <div className="brand brand-login"><span className="brand-symbol">M</span><span><b>MONKY'S STORE</b><small>Sistema de gestión comercial</small></span></div>
 <h1>Bienvenido</h1><p className="muted">Accede al inventario y a tus ventas desde un solo lugar.</p>
 {estado==='pendiente'&&<div className="alert warn">Tu cuenta está creada, pero un administrador debe activarla.</div>}
 {estado==='verificado'&&<div className="alert success">Correo confirmado. Inicia sesión; si tu cuenta aún no está activa, solicita su activación.</div>}
 {estado==='error'&&<div className="alert error">No se pudo confirmar el enlace. Solicita uno nuevo desde Supabase.</div>}
 <LoginForm/><p className="muted micro">Acceso seguro mediante Supabase Auth</p></div></main>;
}
