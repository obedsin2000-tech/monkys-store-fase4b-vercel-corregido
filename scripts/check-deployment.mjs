import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const exists=p=>fs.existsSync(path.join(root,p));
const checks=[
 ['Aplicación Next.js',exists('app/layout.tsx')&&exists('package.json')],
 ['Inicio de sesión',exists('app/ingresar/page.tsx')&&exists('app/auth/callback/route.ts')],
 ['Protección de sesión',exists('proxy.ts')&&exists('lib/auth.ts')],
 ['Ventas e inventario',exists('app/(sistema)/ventas/page.tsx')&&exists('app/(sistema)/inventario/page.tsx')],
 ['Códigos de barras',exists('components/barcode-svg.tsx')&&exists('supabase/migrations/005_fase4b.sql')],
 ['Configuración sin secretos',exists('.env.example')&&exists('.gitignore')],
 ['Next config',exists('next.config.ts')],
];
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
checks.push(['Comando de compilación',pkg.scripts?.build==='next build']);
checks.push(['Dependencias fundamentales',!!pkg.dependencies?.next&&!!pkg.dependencies?.['@supabase/ssr']]);
const ignored=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
checks.push(['Ignorar archivos .env',ignored.includes('.env.*')]);
const secrets=[];
for (const name of ['.env.local','.env.production','.env','.env.production.local']){
 if(exists(name))secrets.push(name);
}
checks.push(['Reglas para excluir credenciales',ignored.includes('.env.*')&&ignored.includes('!.env.example')]);
for(const [name,good] of checks)console.log(`${good?'OK':'ERROR'}: ${name}`);
if(secrets.length)console.warn('AVISO: Hay archivos privados locales. No deben figurar en los cambios que subas a GitHub: '+secrets.join(', '));
console.log('NOTA: revisión estática. No equivale a npm run build, ni a validación de Supabase.');
if(checks.some(([,good])=>!good))process.exitCode=1;
