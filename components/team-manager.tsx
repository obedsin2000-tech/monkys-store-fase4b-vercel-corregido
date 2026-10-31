'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {changeTeamMember} from '@/lib/phase3-actions';
import {ResultMessage} from '@/components/ui';
import type {ActionResult} from '@/lib/types';
type Member={id:string;email:string;role:string;active:boolean;created_at:string};
function MemberRow({member,self}:{member:Member;self:boolean}){
 const router=useRouter();
 const [role,setRole]=useState<'admin'|'operator'>(member.role==='admin'?'admin':'operator');
 const [active,setActive]=useState(member.active);
 const [saving,setSaving]=useState(false);
 const [result,setResult]=useState<ActionResult|null>(null);
 async function update(){setSaving(true);setResult(null);const answer=await changeTeamMember({id:member.id,role,active});setResult(answer);setSaving(false);if(answer.ok)router.refresh();}
 return <tr><td><b>{member.email}</b>{self?' · Tú':''}</td><td><select aria-label={`Rol de ${member.email}`} value={role} disabled={self||saving} onChange={e=>setRole(e.target.value as 'admin'|'operator')}><option value="operator">Operador</option><option value="admin">Administrador</option></select></td>
 <td><label className="team-check"><input type="checkbox" checked={active} disabled={self||saving} onChange={e=>setActive(e.target.checked)}/> {active?'Activo':'Inactivo'}</label></td>
 <td><button type="button" className="btn outline compact" disabled={self||saving||(role===member.role&&active===member.active)} onClick={update}>{saving?'Guardando...':'Guardar'}</button>{result&&<ResultMessage result={result}/>}</td></tr>;
}
export function TeamManager({users,selfId}:{users:Member[];selfId:string}){
 return <section className="card"><h2>Miembros registrados</h2>
 <p className="report-note">Las cuentas nuevas se crean desde la pantalla de registro y permanecen inactivas hasta su aprobación. No compartas contraseñas.</p>
 <div className="table-wrap"><table><thead><tr><th>Correo</th><th>Rol</th><th>Acceso</th><th>Acciones</th></tr></thead><tbody>{users.map(u=><MemberRow key={u.id} member={u} self={u.id===selfId}/>)}</tbody></table></div>
 </section>;
}
