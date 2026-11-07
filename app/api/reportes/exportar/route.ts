import ExcelJS from 'exceljs';
import {NextRequest,NextResponse} from 'next/server';
import {requireReportUser} from '@/lib/phase3';
import {fetchAnalysis,parseReportRequest,ReportMigrationRequired} from '@/lib/report-analysis';
import {reportExportTable,reportCsv,safeReportText} from '@/lib/report-export';
import {legacyReportExport} from '@/lib/report-export-legacy';
import type {ReportTab} from '@/lib/reporting';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{
  const {role}=await requireReportUser();if(role!=='admin')return NextResponse.json({error:'Acceso no autorizado'},{status:403});
  const params=request.nextUrl.searchParams,section=params.get('seccion')||'products',format=params.get('formato');
  if(!['overview','daily','channels','products','inventory','suppliers','detail'].includes(section)||!['csv','xlsx'].includes(format||''))return NextResponse.json({error:'Formato o contenido inválido'},{status:400});
  const tab:ReportTab|'detail'=section==='detail'?'detail':section==='inventory'?'inventory':section==='suppliers'?'suppliers':'sales';
  const {period,options}=parseReportRequest(tab,Object.fromEntries(params));let b;
  try{b=await fetchAnalysis(tab,period,{...options,export:true});}catch(e){if(e instanceof ReportMigrationRequired&&section!=='detail'&&params.get('version')!=='2')return legacyReportExport(request);throw e;}
  const table=reportExportTable(b,section),filename=`monkys_${section}_${period.start}_${period.end}.${format}`;
  const headers={'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${filename}"`};
  if(format==='csv')return new NextResponse(reportCsv(table,b),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8'}});
  const wb=new ExcelJS.Workbook();wb.creator="Monky's Store ERP";const ws=wb.addWorksheet('Reporte');
  ws.addRow(["Monky's Store · "+section]);ws.addRow(['Período',period.start,period.end]);ws.addRow(['Moneda / zona horaria','PEN','America/Lima']);ws.addRow(['Generado',b.meta.generated_at]);ws.addRow(['Corte de operaciones',b.meta.as_of]);ws.addRow(['Filtros',safeReportText(JSON.stringify(options))]);
  for(const note of table.notes){const row=ws.addRow([note]);ws.mergeCells(row.number,1,row.number,table.columns.length+1);row.alignment={wrapText:true,vertical:'middle'};row.height=32;}ws.addRow([]);const headerRow=ws.addRow(['Tipo de fila',...table.columns.map(c=>c.name)]).number;
  for(const [index,col] of [{key:'tipo',name:'Tipo de fila'},...table.columns].entries()){ws.getColumn(index+1).width=Math.min(38,Math.max(16,col.name.length+2));if('number' in col&&col.number)ws.getColumn(index+1).numFmt='#,##0.00;[Red]-#,##0.00';}
  for(const row of table.rows)ws.addRow(['dato',...table.columns.map(col=>{const value=row[col.key];return typeof value==='string'?safeReportText(value):value??null;})]);
  if(table.total){const r=ws.addRow(['total',...table.columns.map(col=>table.total![col.key]??null)]);r.font={bold:true};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4B544'}};}
  const h=ws.getRow(headerRow);h.font={bold:true,color:{argb:'FFFAFAFA'}};h.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF18181B'}};ws.views=[{state:'frozen',ySplit:headerRow}];ws.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow+table.rows.length,column:table.columns.length+1}};ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  const content=await wb.xlsx.writeBuffer();return new NextResponse(new Uint8Array(content as ArrayBuffer),{headers:{...headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
 }catch(e){console.error('[report-export]',{type:e instanceof Error?e.name:'connection'});return NextResponse.json({error:e instanceof ReportMigrationRequired?e.message:e instanceof Error&&e.name==='ZodError'?'Revisa los filtros de la exportación.':e instanceof Error?e.message:'No se pudo generar el archivo.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
