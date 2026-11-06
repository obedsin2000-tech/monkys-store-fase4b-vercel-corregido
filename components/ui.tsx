import type {ReactNode} from 'react';
import {CheckCircle2,AlertTriangle,Inbox} from 'lucide-react';
export function PageTitle({title,description,children}:{title:string;description:string;children?:ReactNode}){
 return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
export function Empty({text='Sin registros todavía.',title='Sin registros',children}:{text?:string;title?:string;children?:ReactNode}){return <div className="empty"><Inbox size={27} strokeWidth={1.5} aria-hidden="true"/><strong>{title}</strong><p>{text}</p>{children}</div>;}
export function ResultMessage({result}:{result:{ok:boolean;message?:string;error?:string}|null}){
 if(!result)return null;return <div role={result.ok?'status':'alert'} aria-live={result.ok?'polite':'assertive'} aria-atomic="true" className={`alert feedback-message ${result.ok?'success':'error'}`}>{result.ok?<CheckCircle2 size={18} aria-hidden="true"/>:<AlertTriangle size={18} aria-hidden="true"/>}<span><strong>{result.ok?'Operación completada':'Revisa antes de continuar'}</strong><br/>{result.ok?result.message:result.error}</span></div>;
}
export function Status({value}:{value:string}){
 const dict:Record<string,string>={reserved:'Reservado',confirmed:'Confirmado',cancelled:'Cancelado',expired:'Vencido',pending:'Pendiente',partial:'Con adelanto',paid:'Pagado',partial_refund:'Reembolso parcial',refunded:'Reembolsado',preparing:'En preparación',dispatched:'Despachado',delivered:'Entregado',tiktok:'TikTok Live',whatsapp:'WhatsApp',directo:'Venta directa',yape:'Yape',plin:'Plin',efectivo:'Efectivo',transferencia:'Transferencia'};
 const color=value==='confirmed'||value==='paid'||value==='delivered'?'green':value==='reserved'||value==='partial'||value==='preparing'||value==='pending'?'amber':value==='cancelled'||value==='expired'?'red':value==='dispatched'?'blue':'slate';
 return <span className={`pill ${color}`}>{dict[value]||value}</span>;
}
