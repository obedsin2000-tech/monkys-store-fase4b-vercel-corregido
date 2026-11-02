'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useState} from 'react';
import {LayoutDashboard,Boxes,History,PackagePlus,ShoppingCart,ClipboardList,UsersRound,Wallet,Truck,RotateCcw,CreditCard,LogOut,Menu,X,Store,ChartColumnIncreasing,ShieldCheck,DatabaseBackup,ScanBarcode,ClipboardCheck} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
const nav=[
 {group:'INICIO',href:'/panel',label:'Panel de control',Icon:LayoutDashboard},
 {group:'VENTAS',href:'/ventas',label:'Venta rápida',Icon:ShoppingCart},
 {group:'VENTAS',href:'/pedidos',label:'Pedidos',Icon:ClipboardList},
 {group:'INVENTARIO',href:'/productos',label:'Productos',Icon:Boxes},
 {group:'INVENTARIO',href:'/etiquetas',label:'Etiquetas de prendas',Icon:ScanBarcode},
 {group:'INVENTARIO',href:'/inventario/conteos',label:'Conteo con escáner',Icon:ClipboardCheck},
 {group:'INVENTARIO',href:'/inventario',label:'Kardex e inventario',Icon:History},
 {group:'INVENTARIO',href:'/compras',label:'Compras',Icon:PackagePlus},
 {group:'DESPACHO Y CAJA',href:'/clientes',label:'Clientes',Icon:UsersRound},
 {group:'DESPACHO Y CAJA',href:'/cobros',label:'Cobros y adelantos',Icon:CreditCard},
 {group:'DESPACHO Y CAJA',href:'/envios',label:'Envíos y rótulos',Icon:Truck},
 {group:'DESPACHO Y CAJA',href:'/devoluciones',label:'Devoluciones',Icon:RotateCcw},
 {group:'DESPACHO Y CAJA',href:'/caja',label:'Caja y cortes',Icon:Wallet},
 {group:'ADMINISTRACIÓN',href:'/reportes',label:'Reportes y análisis',Icon:ChartColumnIncreasing,adminOnly:true},
 {group:'ADMINISTRACIÓN',href:'/equipo',label:'Usuarios y permisos',Icon:ShieldCheck,adminOnly:true},
 {group:'ADMINISTRACIÓN',href:'/seguridad',label:'Seguridad y respaldos',Icon:DatabaseBackup,adminOnly:true}
];
export function Shell({children,email,role}:{children:React.ReactNode;email:string;role:'admin'|'operator'}){
 const pathname=usePathname();const router=useRouter();const [open,setOpen]=useState(false);
 const visibleNav=nav.filter(item=>!('adminOnly' in item && item.adminOnly)||role==='admin');
 const groups=[...new Set(visibleNav.map(item=>item.group))];
 const activeHref=[...visibleNav].filter(item=>pathname===item.href||pathname.startsWith(`${item.href}/`)).sort((a,b)=>b.href.length-a.href.length)[0]?.href;
 async function logout(){await createClient().auth.signOut();router.push('/ingresar');router.refresh();}
 return <div className="app-shell">
  <aside className={`sidebar ${open?'sidebar-open':''}`}>
   <div className="sidebar-top"><Link href="/panel" className="brand" onClick={()=>setOpen(false)}><span className="brand-symbol">M</span><span><b>MONKY'S STORE</b><small>ERP · Fase 4B</small></span></Link><button className="mob-close" aria-label="Cerrar menú" onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <nav>{groups.map(group=><section className="nav-group" key={group}><div className="nav-label">{group}</div>{visibleNav.filter(item=>item.group===group).map(({href,label,Icon})=><Link href={href} key={href} onClick={()=>setOpen(false)} className={`nav-link ${activeHref===href?'active':''}`} aria-current={activeHref===href?'page':undefined}><Icon size={19}/>{label}</Link>)}</section>)}</nav>
   <div className="sidebar-bottom"><span className="side-role"><Store size={16}/>{role==='admin'?'Administrador':'Operador'}</span><span className="side-email" title={email}>{email}</span><button className="signout" onClick={logout}><LogOut size={16}/> Cerrar sesión</button></div>
  </aside>
  {open&&<button className="mobile-overlay" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
  <div className="main-column"><header className="topbar"><button className="mob-menu" aria-label="Abrir menú" onClick={()=>setOpen(true)}><Menu size={22}/></button><span className="topbar-title">Gestión comercial</span><span className="topbar-user">{email}</span></header><main className="main-content">{children}</main></div>
 </div>;
}
