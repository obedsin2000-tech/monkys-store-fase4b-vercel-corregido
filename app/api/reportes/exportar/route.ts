import ExcelJS from 'exceljs';
import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {fetchPhase3Report,parsePeriod,parseSection,type ReportSection} from '@/lib/phase3';
export const runtime='nodejs';

type CsvCell=string|number|boolean|null|undefined;
function quoteCell(x:CsvCell){
 // Protege las celdas de fórmulas maliciosas cuando se abre el CSV en Excel.
 let v=String(x??'');if(/^[\s\t]*[=+@\-]/.test(v)&&typeof x==='string')v=`'${v}`;
 return `"${v.replace(/"/g,'""')}"`;
}
function safeText(x:CsvCell){const val=String(x??'');return /^[\s\t]*[=+@\-]/.test(val)?`'${val}`:val;}
const fields:Record<ReportSection,{key:string;name:string}[]>={
 overview:[{key:'metric',name:'Indicador'},{key:'value',name:'Valor'}],
 daily:[{key:'day',name:'Fecha'},{key:'orders',name:'Pedidos'},{key:'gross_sales',name:'Ventas'},{key:'returns',name:'Devoluciones'},{key:'net_sales',name:'Ventas netas'},{key:'payments',name:'Cobros'}],
 channels:[{key:'channel',name:'Canal'},{key:'orders',name:'Pedidos'},{key:'gross_sales',name:'Ventas'},{key:'returned',name:'Devoluciones'},{key:'net_sales',name:'Neto'}],
 products:[{key:'sku',name:'SKU'},{key:'product',name:'Producto'},{key:'size',name:'Talla'},{key:'color',name:'Color'},{key:'units',name:'Vendidas'},{key:'units_returned',name:'Devueltas'},{key:'gross',name:'Ventas'},{key:'returned',name:'Valor devuelto'},{key:'profit',name:'Utilidad bruta estimada'},{key:'available',name:'Stock disponible actual'}],
 inventory:[{key:'sku',name:'SKU'},{key:'product',name:'Producto'},{key:'size',name:'Talla'},{key:'color',name:'Color'},{key:'physical',name:'Físico'},{key:'reserved',name:'Reservado'},{key:'blocked',name:'Bloqueado'},{key:'available',name:'Disponible'},{key:'min_stock',name:'Mínimo'},{key:'sold_units',name:'Vendidas periodo'},{key:'inventory_value',name:'Valorización'}],
 suppliers:[{key:'name',name:'Proveedor'},{key:'phone',name:'Teléfono'},{key:'deliveries',name:'Recepciones'},{key:'units',name:'Unidades'},{key:'total',name:'Total comprado'},{key:'last_purchase',name:'Última recepción'}]
};
export async function GET(request:NextRequest){
 try{
  const {role}=await requireUser();
  if(role!=='admin')return NextResponse.json({error:'Acceso no autorizado'},{status:403});
  const params=request.nextUrl.searchParams;
  const section=parseSection(params.get('seccion')||'products');
  const period=parsePeriod(params.get('inicio')||undefined,params.get('fin')||undefined);
  const format=params.get('formato');
  if(format!=='csv'&&format!=='xlsx')return NextResponse.json({error:'Formato inválido'},{status:400});
  const data=await fetchPhase3Report(section,period);
  const columns=fields[section];
  const records:Record<string,CsvCell>[]=(Array.isArray(data)?data:Object.entries(data).map(([metric,value])=>({metric,value}))) as unknown as Record<string,CsvCell>[];
  const filename=`monkys_${section}_${period.start}_${period.end}.${format}`;
  const headers={'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${filename}"`};
  if(format==='csv'){
   const body='\uFEFF'+[columns.map(c=>quoteCell(c.name)).join(';'),...records.map(row=>columns.map(c=>quoteCell(row[c.key])).join(';'))].join('\r\n');
   return new NextResponse(body,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8'}});
  }
  const wb=new ExcelJS.Workbook();wb.creator="Monky's Store ERP";
  const ws=wb.addWorksheet('Reporte',{views:[{state:'frozen',ySplit:1}]});
  ws.columns=columns.map(c=>({header:c.name,key:c.key,width:Math.max(16,Math.min(36,c.name.length+6))}));
  for(const row of records){const cleaned:Record<string,CsvCell>={};for(const col of columns){
    const value=row[col.key];cleaned[col.key]=typeof value==='string'?safeText(value):value;
   }ws.addRow(cleaned)}
  const header=ws.getRow(1);header.font={bold:true,color:{argb:'FFFAFAFA'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF18181B'}};
  ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,records.length+1),column:columns.length}};
  const content=await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(content as ArrayBuffer),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
 }catch(err){console.error('[report-export]',err instanceof Error?err.name:'unknown');return NextResponse.json({error:'No se pudo generar el archivo. Verifica tus permisos y vuelve a intentarlo.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
