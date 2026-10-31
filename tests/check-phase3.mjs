import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname);
const files=[
 'supabase/migrations/001_fase1.sql','supabase/migrations/002_fase2.sql','supabase/migrations/003_fase3.sql',
 'lib/phase3.ts','lib/phase3-actions.ts',
 'components/report-filters.tsx','components/mini-bars.tsx','components/print-report.tsx','components/team-manager.tsx',
 'app/(sistema)/reportes/page.tsx','app/(sistema)/reportes/inventario/page.tsx',
 'app/(sistema)/reportes/proveedores/page.tsx','app/(sistema)/equipo/page.tsx',
 'app/api/reportes/exportar/route.ts','01_INSTALAR_FASE3.bat','02_INICIAR_MONKYS.bat'
];
let count=0;
for(const f of files){if(!fs.existsSync(path.join(root,f))){console.error('Falta:',f);count++;}}
const sql=fs.readFileSync(path.join(root,'supabase/migrations/003_fase3.sql'),'utf8');
for(const expected of ['report_phase3','manage_team_member','require_admin','pg_advisory_xact_lock','audit_events','report_phase3(date,date,text)']){
 if(!sql.includes(expected)){console.error('No encontrado SQL:',expected);count++;}
}
const nav=fs.readFileSync(path.join(root,'components/shell.tsx'),'utf8');
for(const url of ['/reportes','/equipo'])if(!nav.includes(url)){console.error('Falta ruta:',url);count++;}
console.log(`${files.length} archivos requeridos, 6 controles SQL y rutas revisados. Problemas: ${count}`);
process.exitCode=count?1:0;
