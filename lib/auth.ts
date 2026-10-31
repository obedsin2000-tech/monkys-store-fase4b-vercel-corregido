import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = await createClient();

  // Cuando no hay sesión, getClaims() puede devolver data: null.
  // Primero comprobamos el resultado para evitar un error al abrir la web.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    redirect('/ingresar');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,email,role,active')
    .eq('id', userId)
    .single();

  if (!profile?.active) {
    redirect('/ingresar?estado=pendiente');
  }

  return {
    supabase,
    userId,
    role: profile.role as 'admin' | 'operator',
    email: profile.email,
  };
}
