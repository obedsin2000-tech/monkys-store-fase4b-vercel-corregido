import type {ReactNode} from 'react';
import {CheckCircle2, AlertTriangle} from 'lucide-react';
export function PageTitle({title,description,children}:{title:string;description:string;children?:ReactNode}){
 return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
export function Empty({text='Sin registros todavía.'}:{text?:string}){return <div className="empty">{text}</div>;}
export function ResultMessage({result}:{result:{ok:boolean;message?:string;error?:string}|null}){
 if(!result)return null;return <div role="status" className={`alert ${result.ok?'success':'error'}`}>{result.ok?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>} {result.ok?result.message:result.error}</div>;
}
export function Status({value}:{value:string}){
 const dict:Record<string,string>={reserved:'Reservado',confirmed:'Confirmado',cancelled:'Cancelado',expired:'Vencido',pending:'Pendiente',partial:'Adelanto',paid:'Pagado',partial_refund:'Reembolso parcial',refunded:'Reembolsado',preparing:'Preparando',dispatched:'Despachado',delivered:'Entregado'};
 const color=value==='confirmed'||value==='paid'||value==='delivered'?'green':value==='reserved'||value==='partial'||value==='preparing'?'amber':value==='cancelled'||value==='expired'?'red':'slate';
 return <span className={`pill ${color}`}>{dict[value]||value}</span>;
}
