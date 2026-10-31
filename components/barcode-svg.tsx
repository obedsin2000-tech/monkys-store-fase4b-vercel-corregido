import {barcodeUnits,code128Bars} from '@/lib/barcode';

/** SVG Code 128 B/C, generado localmente; sin conexión a servicios externos. */
export function BarcodeSVG({value,height=45}:{value:string;height?:number}){
 const width=barcodeUnits(value);
 return <svg role="img" aria-label={`Código de barras ${value}`} width="100%" height={height} viewBox={`0 0 ${width} 58`} preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
  <rect width={width} height="58" fill="white"/>
  {code128Bars(value).map((bar,i)=><rect key={i} x={bar.x} y="2" width={bar.width} height="49" fill="black"/>)}
 </svg>;
}
