export type SaleCartLine={variant_id:string;quantity:number;unit_discount?:string};

// Calcula la vista previa en céntimos. El precio definitivo se valida en PostgreSQL.
export function moneyCents(value:string|number|undefined):number|null{
 const text=String(value??'').trim()||'0';
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
 const [whole,decimal='']=text.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 return Number.isSafeInteger(cents)?cents:null;
}

export function saleTotals(lines:SaleCartLine[],catalog:Array<{id:string;sale_price:number}>){
 let subtotal=0,discount=0;const errors:Record<string,string>={};
 for(const line of lines){
  const item=catalog.find(v=>v.id===line.variant_id);const price=item?moneyCents(item.sale_price):null;
  const amount=moneyCents(line.unit_discount);
  if(price===null){errors[line.variant_id]='Vuelve a buscar la prenda para consultar su precio.';continue;}
  if(amount===null)errors[line.variant_id]='Usa un descuento de cero o más, con hasta dos decimales.';
  else if(amount>0&&amount>=price)errors[line.variant_id]='El descuento debe ser menor que el precio de la unidad.';
  subtotal+=price*line.quantity;
  if(!errors[line.variant_id])discount+=(amount||0)*line.quantity;
 }
 return {subtotal:subtotal/100,discount:discount/100,total:(subtotal-discount)/100,errors,valid:Object.keys(errors).length===0};
}
