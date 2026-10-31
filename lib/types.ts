export type Variant = {
 id: string; sku: string; barcode?: string; size: string; color: string;
 sale_price: number; avg_cost: number; on_hand: number; reserved: number;
 blocked: number; min_stock: number; active: boolean; product_id: string;
 products?: {name: string; product_code: string} | null;
};
export type Product = {
 id: string; product_code: string; name: string; brand?: string | null;
 category_id: string | null; active: boolean;
 categories?: {name: string} | null;
 variants?: Variant[];
};
export type Customer = {id:string; name:string; tiktok_handle:string|null; phone:string|null};
export type Supplier = {id:string; name:string; phone:string|null};
export type Order = {
 id:string; order_number:number; buyer_name:string|null; tiktok_handle:string|null;
 channel:string; status:string; payment_status:string; payment_method:string|null;
 total:number; created_at:string; expires_at:string|null; customer_id:string|null;
 order_lines?: Array<{id:string; quantity:number;unit_price:number;line_total:number; variants?:{sku:string;size:string;color:string; products?:{name:string}|null}|null}>;
};
export type Purchase = { id:string; reference:string|null;total:number;received_at:string; suppliers?:{name:string}|null; };
export type StockMovement = {id:number;created_at:string;movement_type:string;quantity_delta:number;balance_after:number;notes:string|null; variants?:{sku:string;products?:{name:string}|null}|null};
export type ActionResult = {ok:true; message:string; id?:string; count?:number} | {ok:false;error:string};
export const money=(v:number|string|null|undefined)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(v||0));
export const dateTime=(v:string)=>new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(v));
export const available=(v:Variant)=>v.on_hand-v.reserved-v.blocked;
