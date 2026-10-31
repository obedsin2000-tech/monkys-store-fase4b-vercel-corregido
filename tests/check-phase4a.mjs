import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(process.cwd());
const required=[
 'supabase/migrations/004_fase4a.sql',
 'app/(sistema)/seguridad/page.tsx',
 'scripts/backup-db.ps1','scripts/verify-db.ps1','scripts/preflight.ps1',
 '00_COMPROBAR_EQUIPO.bat','01_INSTALAR_FASE4A.bat',
 '02_INICIAR_MONKYS.bat','04_CREAR_RESPALDO.bat','05_VERIFICAR_RESPALDO.bat',
 'README.md','tests/PRUEBAS_FASE4A.md'
];
let problems=[];
for(const rel of required)if(!fs.existsSync(path.join(root,rel)))problems.push(`No existe: ${rel}`);
const sql=fs.readFileSync(path.join(root,'supabase/migrations/004_fase4a.sql'),'utf8');
for(const piece of ['BEGIN;','COMMIT;','public.require_admin()','public.phase4a_security_report','REVOKE EXECUTE','RETURNS jsonb']){
 if(!sql.includes(piece))problems.push(`Migración sin: ${piece}`);
}
if(/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\.(?:variants|orders|payments))\b/i.test(sql))problems.push('Migración contiene operación destructiva o cambio de saldos');
let files=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 if(entry.name==='node_modules'||entry.name==='.next')continue;
 const f=path.join(dir,entry.name);if(entry.isDirectory())visit(f);else if(/\.(tsx?|jsx?)$/.test(entry.name)&&!entry.name.endsWith('.d.ts'))files.push(f);
}}
for(const dir of ['app','components','lib'])visit(path.join(root,dir));
for(const file of files){const source=fs.readFileSync(file,'utf8');const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX},fileName:file,reportDiagnostics:true});
 for(const d of result.diagnostics||[]){const msg=ts.flattenDiagnosticMessageText(d.messageText,' ');if(d.category===ts.DiagnosticCategory.Error)problems.push(`${path.relative(root,file)}: ${msg}`);}
 if(!result.outputText)problems.push(`TS sin salida: ${file}`);
}
console.log(`Fase 4A: ${required.length} archivos requeridos; ${files.length} archivos TS/TSX revisados sintácticamente.`);
console.log('Nota: esta prueba NO compila Next.js ni ejecuta PostgreSQL ni prueba respaldos reales.');
if(problems.length){console.error(problems.join('\n'));process.exit(1)}
console.log('OK: estructura, controles estáticos y sintaxis TypeScript.');
