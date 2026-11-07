'use client';
import {useTransition,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
export function ReportWorkspace({children}:{children:ReactNode}){
 const router=useRouter();const [pending,startTransition]=useTransition();
 function navigate(href:string){const url=new URL(href,window.location.origin);if(url.origin!==window.location.origin||!/^\/reportes(?:\/|$)/.test(url.pathname))return false;startTransition(()=>{if(url.href===window.location.href)router.refresh();else router.push(url.pathname+url.search,{scroll:false});});return true;}
 return <div className="report-workspace" aria-busy={pending} onClickCapture={event=>{if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const a=(event.target as Element).closest<HTMLAnchorElement>('a[href]');if(a&&!a.download&&a.target!=='_blank'&&navigate(a.href))event.preventDefault();}} onSubmitCapture={event=>{const form=event.target as HTMLFormElement;if(form.method.toLowerCase()!=='get')return;const url=new URL(form.action||window.location.href);url.search=new URLSearchParams(new FormData(form) as unknown as Record<string,string>).toString();if(navigate(url.href))event.preventDefault();}}>
 <div className="analysis-loading" role="status" aria-live="polite">{pending&&<><strong>Actualizando el análisis…</strong><p>Se están aplicando los filtros. Las cifras anteriores se ocultan hasta completar la consulta.</p></>}</div>{children}</div>;
}
