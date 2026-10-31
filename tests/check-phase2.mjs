import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const required=[
 'supabase/migrations/001_fase1.sql','supabase/migrations/002_fase2.sql',
 'lib/phase2-actions.ts','components/payment-form.tsx','components/shipment-manager.tsx',
 'components/return-form.tsx','components/pending-refunds.tsx','components/cash-forms.tsx',
 'app/(sistema)/cobros/page.tsx','app/(sistema)/envios/page.tsx',
 'app/(sistema)/envios/rotulos/page.tsx','app/api/envios/exportar/route.ts',
 'app/(sistema)/devoluciones/page.tsx','app/(sistema)/caja/page.tsx',
 '01_INSTALAR_FASE2.bat','02_INICIAR_MONKYS.bat'
];
let failed=0;
for(const file of required){if(!fs.existsSync(path.join(root,file))){console.log('FALTA:',file);failed++;}}
const sql=fs.readFileSync(path.join(root,'supabase/migrations/002_fase2.sql'),'utf8');
for(const word of ['record_payment','cancel_paid_reservation','save_shipment','set_shipment_status','process_return','refund_return','record_expense','cash_summary','close_cash','enable row level security','return_lines']){
 if(!sql.includes(word)){console.log('SQL FALTA:',word);failed++;}
}
const source=fs.readFileSync(path.join(root,'components/shell.tsx'),'utf8');
for(const menu of ['/cobros','/envios','/devoluciones','/caja']){
 if(!source.includes(menu)){console.log('MENÚ FALTA:',menu);failed++;}
}
console.log(`${required.length} archivos y controles estáticos revisados. Problemas: ${failed}`);
if(failed)process.exit(1);
