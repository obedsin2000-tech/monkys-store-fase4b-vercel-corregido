export const dynamic = 'force-dynamic';
import {requireUser} from '@/lib/auth';
import {Shell} from '@/components/shell';
export default async function SystemLayout({children}:{children:React.ReactNode}){
 const {email,role}=await requireUser();
 return <Shell email={email} role={role}>{children}</Shell>;
}
