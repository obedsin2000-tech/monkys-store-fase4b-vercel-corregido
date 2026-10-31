import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Evita crear una redirección con un host manipulable cuando está definida la URL oficial. */
function redirectDestination(requestUrl:URL, status:'error'|'verificado') {
 const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
 const origin = configured ? new URL(configured).origin : requestUrl.origin;
 return new URL(`/ingresar?estado=${status}`, origin);
}

export async function GET(request:Request){
 const url=new URL(request.url);
 const code=url.searchParams.get('code');
 if(!code)return NextResponse.redirect(redirectDestination(url,'error'),{headers:{'Cache-Control':'no-store'}});
 const supabase=await createClient();
 const {error}=await supabase.auth.exchangeCodeForSession(code);
 return NextResponse.redirect(redirectDestination(url,error?'error':'verificado'),{headers:{'Cache-Control':'no-store'}});
}
