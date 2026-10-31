import {requireUser} from '@/lib/auth';
import {PageTitle} from '@/components/ui';
import {BarcodeLabels} from '@/components/barcode-labels';
import type {Variant} from '@/lib/types';
export default async function LabelsPage(){
 const {supabase:s}=await requireUser();
 const {data,error}=await s.from('variants').select('*,products(name,product_code)').order('sku').limit(2500);
 return <><PageTitle title="Etiquetas y códigos de barras" description="Imprime etiquetas únicas de cada talla y color. No cambia tu inventario."/>
 {error?<div className="alert error">No se pudieron cargar los códigos. Comprueba que ejecutaste 005_fase4b.sql. {error.message}</div>:
 <BarcodeLabels variants={(data||[]) as Variant[]}/>}</>;
}
