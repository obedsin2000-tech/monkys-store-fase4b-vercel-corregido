import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/components.mjs';
const id='00000000-0000-4000-8000-000000000001';
function actions(file,role='admin'){
 const calls=[];const s={rpc:async(name,payload)=>{calls.push({name,payload});return {data:id,error:null}}};
 return {calls,...load(file,{'@/lib/auth':{requireUser:async()=>({supabase:s,role})},'next/cache':{revalidatePath(){}}})};
}
const sale={request_key:id,buyer:'',handle:'',customer_id:null,channel:'directo',mode:'paid',method:'efectivo',minutes:45,lines:[{variant_id:id,quantity:1}]};

test('Servidor: venta pagada sin comprador mantiene el comportamiento de venta rápida',async()=>{
 const a=actions('lib/actions.ts');assert.equal((await a.createOrderAction(sale)).ok,true);assert.equal(a.calls[0].payload.p_buyer,'Venta rápida sin identificar');assert.equal(a.calls[0].name,'create_order');
});

test('Servidor: reserva sin comprador, cantidades inválidas y líneas duplicadas se rechazan',async()=>{
 const a=actions('lib/actions.ts');
 for(const invalid of [{...sale,mode:'reserve',method:null},{...sale,lines:[]},{...sale,lines:[{variant_id:id,quantity:-1}]},{...sale,lines:[...sale.lines,...sale.lines]}])assert.equal((await a.createOrderAction(invalid)).ok,false);
 assert.equal(a.calls.length,0);
});

test('Servidor: recepción conserva la clave hasta la función transaccional',async()=>{
 const a=actions('lib/actions.ts');const input={request_key:id,supplier_id:null,reference:'Compra ficticia',lines:[{variant_id:id,quantity:2,unit_cost:50}]};
 assert.equal((await a.receivePurchaseAction(input)).ok,true);assert.equal(a.calls[0].name,'receive_purchase_once');assert.equal(a.calls[0].payload.p_key,id);
 assert.equal((await a.receivePurchaseAction({...input,request_key:null})).ok,false);assert.equal(a.calls.length,1);
});

test('Servidor: cobros negativos o con más de dos decimales no llegan a la base',async()=>{
 const a=actions('lib/phase2-actions.ts');for(const amount of [-1,0,1.001])assert.equal((await a.paymentAction({key:id,order:id,amount,method:'yape',reference:''})).ok,false);
 assert.equal(a.calls.length,0);assert.equal((await a.paymentAction({key:id,order:id,amount:0.01,method:'yape',reference:''})).ok,true);
});

test('Servidor: operador conserva la restricción de DNI y no puede reembolsar',async()=>{
 const a=actions('lib/phase2-actions.ts','operator');
 assert.equal((await a.shipmentAction({order:id,recipient_name:'Destinatario ficticio',phone:'900000000',dni:'00000000',department:'',province:'Provincia ficticia',district:'',carrier:'shalom',agency_address:'Agencia ficticia'})).ok,true);
 assert.equal(a.calls[0].payload.p_data.dni,'');
 assert.equal((await a.refundReturnAction({key:id,returnId:id,amount:10,method:'yape'})).ok,false);assert.equal(a.calls.length,1);
});

test('Servidor: solo el administrador puede enviar una corrección válida de variante', async () => {
 const input = {
  variant_id: id, sku: '  CAS-001  ', size: ' M ', color: ' Azul ',
  expected: { sku: 'CAS-010', size: 'S', color: 'Auzl' },
 };
 const operator = actions('lib/actions.ts', 'operator');
 assert.equal((await operator.updateVariantIdentityAction(input)).ok, false);
 assert.equal(operator.calls.length, 0);

 const admin = actions('lib/actions.ts');
 assert.equal((await admin.updateVariantIdentityAction({ ...input, color: '  ' })).ok, false);
 assert.equal((await admin.updateVariantIdentityAction(input)).ok, true);
 assert.deepEqual(admin.calls, [{
  name: 'update_variant_identity',
  payload: { p_variant: id, p_sku: 'CAS-001', p_size: 'M', p_color: 'Azul', p_expected: input.expected },
 }]);
});
