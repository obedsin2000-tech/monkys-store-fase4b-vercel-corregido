'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';
export function LoginForm(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [signup,setSignup]=useState(false);const [error,setError]=useState('');const [working,setWorking]=useState(false);
 const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setWorking(true);setError('');
  const s=createClient();
  if(signup){const {error}=await s.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});setWorking(false);
   setError(error ? error.message:'Cuenta solicitada. Confirma el correo si Supabase lo requiere y pide al administrador activarla.');return;}
  const {error}=await s.auth.signInWithPassword({email,password});setWorking(false);
  if(error){setError('No se pudo acceder. Revisa el correo y la contraseña.');return;}
  router.push('/panel');router.refresh();
 }
 return <form onSubmit={submit} className="form-stack">
  <label>Correo electrónico<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/></label>
  <label>Contraseña<input type="password" required minLength={6} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label>
  {error&&<div className="alert">{error}</div>}
  <button className="btn primary" disabled={working}>{working?'Procesando...':signup?'Crear cuenta':'Ingresar'}</button>
  <button type="button" className="link-btn" onClick={()=>{setSignup(!signup);setError('');}}>{signup?'Ya tengo cuenta':'Solicitar cuenta inicial'}</button>
 </form>;
}
