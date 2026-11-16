'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {createClient} from '@/lib/supabase/client';

function signupError(error:{code?:string;message:string}){
 if(error.code==='over_email_send_rate_limit'||error.message.toLowerCase().trim()==='email rate limit exceeded'){
  return 'Se alcanzó el límite de correos de confirmación. Espera antes de reintentar o pide al administrador que revise tu cuenta en Supabase.';
 }
 if(error.code==='email_address_not_authorized'){
  return 'El servicio de correo del ERP no puede enviar la confirmación a esta dirección. Pide al administrador que revise tu cuenta.';
 }
 return error.message;
}

export function LoginForm(){
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [signup,setSignup]=useState(false);const [error,setError]=useState('');const [working,setWorking]=useState(false);
 const [feedbackTone,setFeedbackTone]=useState<'success'|'error'>('error');
 const router=useRouter();
 const pending=useRef(false);

 async function submit(e:React.FormEvent){
  e.preventDefault();
  if(pending.current)return;
  pending.current=true;
  setWorking(true);
  setError('');
  try{
   const s=createClient();
   if(signup){
    const {error}=await s.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback`}});
    setFeedbackTone(error?'error':'success');
    setError(error?signupError(error):'Cuenta solicitada. Confirma el correo si Supabase lo requiere y pide al administrador activarla.');
    return;
   }
   const {error}=await s.auth.signInWithPassword({email,password});
   if(error){setFeedbackTone('error');setError('No se pudo acceder. Revisa el correo y la contraseña.');return;}
   router.push('/panel');
   router.refresh();
  }catch{
   setFeedbackTone('error');
   setError('No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.');
  }finally{
   pending.current=false;
   setWorking(false);
  }
 }
 return <form onSubmit={submit} className="form-stack">
  <label>Correo electrónico<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/></label>
  <label>Contraseña<input type="password" required minLength={6} autoComplete={signup?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label>
  {error&&<div className={`alert ${feedbackTone}`} role={feedbackTone==='error'?'alert':'status'}>{error}</div>}
  <button className="btn primary" disabled={working}>{working?'Procesando...':signup?'Crear cuenta':'Ingresar'}</button>
  <button type="button" className="link-btn" disabled={working} onClick={()=>{setSignup(!signup);setError('');}}>{signup?'Ya tengo cuenta':'Solicitar cuenta inicial'}</button>
 </form>;
}
