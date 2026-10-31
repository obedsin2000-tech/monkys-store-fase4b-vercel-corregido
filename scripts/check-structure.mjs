import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const required=[
 'app/layout.tsx','app/ingresar/page.tsx',
 'app/(sistema)/panel/page.tsx','app/(sistema)/ventas/page.tsx',
 'app/(sistema)/pedidos/page.tsx','app/(sistema)/productos/page.tsx',
 'app/(sistema)/inventario/page.tsx','app/(sistema)/compras/page.tsx',
 'app/(sistema)/clientes/page.tsx','lib/actions.ts',
 'supabase/migrations/001_fase1.sql','README.md'
];
let failures=0;
for(const file of required){const full=path.join(root,file);if(!fs.existsSync(full)){console.error('FALTA:',file);failures++;}}
const sql=fs.readFileSync(path.join(root,'supabase/migrations/001_fase1.sql'),'utf8');
for(const fn of ['create_catalog_item','add_variant','import_catalog','adjust_stock','receive_purchase','expire_reservations','create_order','confirm_reservation','cancel_reservation','dashboard_stats','update_variant_settings']){
 if(!sql.includes(`function public.${fn}(`)){console.error('FALTA función:',fn);failures++;}
}
if(failures)process.exit(1);
console.log('OK: estructura de módulos y funciones SQL presentes.');
console.log('AVISO: esta revisión NO reemplaza npm run build ni las pruebas de integración con Supabase.');
