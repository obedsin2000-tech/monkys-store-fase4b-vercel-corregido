// Comprueba nombres y formato, sin imprimir valores ni contraseñas.
const expected=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SITE_URL'];
let fail=0;
for(const key of expected){
 const value=process.env[key]?.trim();
 if(!value){console.log('FALTA: '+key);fail++;continue;}
 if(key.endsWith('_URL')){
  try{const url=new URL(value);
   if((key==='NEXT_PUBLIC_SITE_URL'&&url.protocol!=='https:')||
      (key==='NEXT_PUBLIC_SUPABASE_URL'&&url.protocol!=='https:')||
      url.username||url.password||url.search||url.hash){throw new Error('url');}
   if(key==='NEXT_PUBLIC_SITE_URL'&&url.pathname!=='/')throw new Error('ruta');
   console.log('OK: '+key+' (formato URL válido)');
  }catch{console.log('ERROR: '+key+' (URL inválida)');fail++;}
 }else if(value.length<20||/TU_CLAVE|TU_ID|EJEMPLO/i.test(value)){
  console.log('ERROR: '+key+' (incompleta o ejemplo)');fail++;
 }else console.log('OK: '+key+' (definida; no se muestra)');
}
if(fail)process.exitCode=1;
console.log('NOTA: esto no verifica conectividad ni permisos de la base de datos.');
