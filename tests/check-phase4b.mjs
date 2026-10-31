import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const required=['lib/barcode.ts','components/barcode-svg.tsx','components/barcode-labels.tsx',
 'components/inventory-count-manager.tsx','lib/phase4b-actions.ts',
 'app/(sistema)/etiquetas/page.tsx','app/(sistema)/inventario/conteos/page.tsx',
 'supabase/migrations/005_fase4b.sql','tests/PRUEBAS_FASE4B.md'];
for(const f of required){if(!fs.existsSync(path.join(root,f)))throw Error('Falta '+f);}
const sql=fs.readFileSync(path.join(root,'supabase/migrations/005_fase4b.sql'),'utf8');
for(const name of ['open_inventory_count','set_inventory_count_line','submit_inventory_count','approve_inventory_count','cancel_inventory_count'])
 if(!sql.includes(`FUNCTION public.${name}(`))throw Error('Falta RPC '+name);
const {encodeCode128,barcodeUnits,code128Bars}=await import('../lib/barcode.ts');
for(const v of ['MK0000000001','MK0000009999','AB-1234','ZXQ']){
 const encoded=encodeCode128(v);const bars=code128Bars(v);const width=barcodeUnits(v);
 if(encoded[0]!==104||encoded.at(-1)!==106||bars.length===0||Math.max(...bars.map(x=>x.x+x.width))>=width)throw Error('Barcode inválido '+v);
 let checksum=encoded[0];for(let i=1;i<encoded.length-2;i++)checksum+=encoded[i]*i;
 if(checksum%103!==encoded.at(-2))throw Error('Checksum inválido '+v);
}
if(encodeCode128('MK0000000001').length!==11)throw Error('Cambio a conjunto C no activado');
console.log('OK: estructura, símbolos Code 128 B/C y dígitos de control.');
console.log('ADVERTENCIA: estas pruebas no verifican impresión física ni conexión a Supabase.');
