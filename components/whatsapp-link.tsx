'use client';

function whatsappUrl(phone:string|null|undefined,message:string){
 const digits=(phone||'').replace(/\D/g,'');
 if(!digits)return null;
 const international=digits.length===9?`51${digits}`:digits;
 if(international.length<10||international.length>15)return null;
 return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export function WhatsAppLink({phone,message,label='Preparar WhatsApp'}:{phone:string|null|undefined;message:string;label?:string}){
 const href=whatsappUrl(phone,message);
 if(!href)return null;
 return <a className="btn outline compact" href={href} target="_blank" rel="noreferrer">{label}</a>;
}
