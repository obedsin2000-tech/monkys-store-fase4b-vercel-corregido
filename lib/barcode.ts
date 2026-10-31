/** Code 128 interno: Subconjunto B y cambio a C para números.
 * Patrones del estándar Code 128. No son identificadores GS1. */
export const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
 ];

export function encodeCode128(value:string):number[] {
 if(!/^[ -~]{1,48}$/.test(value)) throw new Error('Código de barras inválido');
 const symbols:number[]=[104]; // START B
 let i=0;
 while(i<value.length){
  const remain=value.slice(i);
  // CODE C: a partir de cuatro dígitos consecutivos (pares).
  const numeric=remain.match(/^\d+/)?.[0]||'';
  if(numeric.length>=4){
   const n=numeric.length-(numeric.length%2);
   symbols.push(99);
   for(let k=0;k<n;k+=2) symbols.push(Number(numeric.slice(k,k+2)));
   i+=n;
   if(i<value.length)symbols.push(100); // volver a B
   continue;
  }
  symbols.push(value.charCodeAt(i)-32);
  i++;
 }
 let checksum=symbols[0];
 for(let j=1;j<symbols.length;j++)checksum+=symbols[j]*j;
 symbols.push(checksum%103,106);
 return symbols;
}
export function code128Bars(value:string):Array<{x:number;width:number}> {
 const symbols=encodeCode128(value);
 let x=10;
 const rects:Array<{x:number;width:number}>=[];
 for(const symbol of symbols){
  let isBar=true;
  for(const w of CODE128_PATTERNS[symbol]){
   const width=Number(w);
   if(isBar)rects.push({x,width});
   x+=width;isBar=!isBar;
  }
 }
 return rects;
}
export function barcodeUnits(value:string):number {
 return 20+encodeCode128(value).reduce((a,n)=>a+CODE128_PATTERNS[n].split('').reduce((b,w)=>b+Number(w),0),0);
}
