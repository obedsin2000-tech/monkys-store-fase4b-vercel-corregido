'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {LayoutDashboard,Boxes,History,PackagePlus,ShoppingCart,ClipboardList,UsersRound,Wallet,Truck,RotateCcw,CreditCard,LogOut,Menu,X,Store,ChartColumnIncreasing,ShieldCheck,DatabaseBackup,ScanBarcode,ClipboardCheck,ChevronRight} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
const nav=[
 {group:'Inicio',href:'/panel',label:'Panel de control',Icon:LayoutDashboard},
 {group:'Ventas',href:'/ventas',label:'Venta rápida',Icon:ShoppingCart},
 {group:'Ventas',href:'/pedidos',label:'Pedidos',Icon:ClipboardList},
 {group:'Inventario',href:'/productos',label:'Productos',Icon:Boxes},
 {group:'Inventario',href:'/etiquetas',label:'Etiquetas de prendas',Icon:ScanBarcode},
 {group:'Inventario',href:'/inventario/conteos',label:'Conteo con escáner',Icon:ClipboardCheck},
 {group:'Inventario',href:'/inventario',label:'Kardex e inventario',Icon:History},
 {group:'Inventario',href:'/compras',label:'Compras',Icon:PackagePlus},
 {group:'Despacho y caja',href:'/clientes',label:'Clientes',Icon:UsersRound},
 {group:'Despacho y caja',href:'/cobros',label:'Cobros y adelantos',Icon:CreditCard},
 {group:'Despacho y caja',href:'/envios',label:'Envíos y rótulos',Icon:Truck},
 {group:'Despacho y caja',href:'/devoluciones',label:'Devoluciones',Icon:RotateCcw},
 {group:'Despacho y caja',href:'/caja',label:'Caja y cortes',Icon:Wallet},
 {group:'Administración',href:'/reportes',label:'Reportes y análisis',Icon:ChartColumnIncreasing,adminOnly:true},
 {group:'Administración',href:'/equipo',label:'Usuarios y permisos',Icon:ShieldCheck,adminOnly:true},
 {group:'Administración',href:'/seguridad',label:'Seguridad y respaldos',Icon:DatabaseBackup,adminOnly:true}
];
export function Shell({children,email,role}:{children:React.ReactNode;email:string;role:'admin'|'operator'}){
 const pathname=usePathname();const router=useRouter();const [open,setOpen]=useState(false);
 const menuRef=useRef<HTMLElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const media=window.matchMedia('(max-width: 1024px)');const closeOnDesktop=()=>{if(!media.matches)setOpen(false);};media.addEventListener('change',closeOnDesktop);return()=>media.removeEventListener('change',closeOnDesktop);},[]);
 useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';menuRef.current?.querySelector<HTMLButtonElement>('.mob-close')?.focus();return()=>{document.body.style.overflow=previous;triggerRef.current?.focus();};},[open]);
 const visibleNav=nav.filter(item=>!('adminOnly' in item && item.adminOnly)||role==='admin');
 const groups=[...new Set(visibleNav.map(item=>item.group))];
 const activeItem=visibleNav.filter(item=>pathname===item.href||pathname.startsWith(`${item.href}/`)).sort((a,b)=>b.href.length-a.href.length)[0];
 const activeHref=activeItem?.href;
 useEffect(()=>{
  if(open||window.matchMedia('(min-width: 1025px)').matches){
   menuRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
 },[activeHref,open]);
 function menuKeys(event:React.KeyboardEvent<HTMLElement>){
  if(!open)return;if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
  if(event.key==='Tab'){
   const items=Array.from(menuRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')||[]).filter(item=>item.offsetParent!==null);
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
 }
 async function logout(){await createClient().auth.signOut();router.push('/ingresar');router.refresh();}
 return <div className="app-shell"><a href="#contenido-principal" className="skip-link">Saltar al contenido</a>
  <aside id="menu-principal" ref={menuRef} role={open?'dialog':undefined} aria-modal={open?true:undefined} aria-label="Menú principal" onKeyDown={menuKeys} className={`sidebar ${open?'sidebar-open':''}`}>
   <div className="sidebar-top"><Link href="/panel" className="brand" onClick={()=>setOpen(false)}><span className="brand-symbol">M</span><span><b>MONKY'S STORE</b><small>Gestión comercial</small></span></Link><button className="mob-close" aria-label="Cerrar menú" onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <nav aria-label="Navegación principal">{groups.map(group=><section className="nav-group" key={group}><div className="nav-label">{group}</div>{visibleNav.filter(item=>item.group===group).map(({href,label,Icon})=><Link href={href} key={href} onClick={()=>setOpen(false)} className={`nav-link ${activeHref===href?'active':''}`} aria-current={activeHref===href?'page':undefined}><Icon size={19} aria-hidden="true"/>{label}</Link>)}</section>)}</nav>
   <div className="sidebar-bottom"><span className="side-role"><Store size={16}/>{role==='admin'?'Administrador':'Operador'}</span><span className="side-email" title={email}>{email}</span><button className="signout" onClick={logout}><LogOut size={16}/> Cerrar sesión</button></div>
  </aside>
  {open&&<button className="mobile-overlay" aria-label="Cerrar menú" aria-hidden="true" tabIndex={-1} onClick={()=>setOpen(false)}/>}
  <div className="main-column" inert={open||undefined}><header className="topbar"><button ref={triggerRef} className="mob-menu" aria-label="Abrir menú" aria-controls="menu-principal" aria-expanded={open} onClick={()=>setOpen(true)}><Menu size={22} aria-hidden="true"/></button><span className="topbar-title">{activeItem&&<><span>{activeItem.group}</span><ChevronRight size={14} aria-hidden="true"/></>}<b>{activeItem?.label||'Gestión comercial'}</b></span><span className="topbar-user">{email}</span></header><main id="contenido-principal" tabIndex={-1} className="main-content">{children}</main></div>
 </div>;
}
