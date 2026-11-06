import {LoaderCircle} from 'lucide-react';
export default function Loading(){return <section role="status" aria-live="polite" aria-label="Cargando la pantalla">
 <p className="loading-announcement"><LoaderCircle size={16} aria-hidden="true"/>Cargando información…</p>
 <div aria-hidden="true"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-description"/>
 <div className="card"><div className="skeleton skeleton-block"/>{[1,2,3,4].map(n=><div key={n} className="skeleton skeleton-line"/>)}</div></div>
 </section>;}
