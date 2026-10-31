'use client';
import {useState} from 'react';
import {createCustomerAction} from '@/lib/actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult} from '@/lib/types';
export function CustomerForm(){const [result,setResult]=useState<ActionResult|null>(null);const [busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);setBusy(true);const r=await createCustomerAction({name:fd.get('name'),tiktok_handle:fd.get('tiktok_handle'),phone:fd.get('phone')});setResult(r);setBusy(false);if(r.ok)form.reset();}
 return <section className="card"><h2>Registrar cliente</h2><form onSubmit={submit} className="form-stack"><div className="grid three"><label>Nombre<input name="name" required maxLength={120}/></label><label>Usuario TikTok<input name="tiktok_handle" maxLength={80} placeholder="@usuario"/></label><label>Teléfono<input name="phone" maxLength={30} placeholder="9XXXXXXXX"/></label></div><button className="btn primary" disabled={busy}>{busy?'Guardando...':'Guardar cliente'}</button></form><ResultMessage result={result}/></section>;
}
