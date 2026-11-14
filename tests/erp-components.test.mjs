import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {load,deferred} from './helpers/components.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.confirm=()=>true;
const event={preventDefault(){}};
const variant={id:'v1',sku:'TEST',barcode:'MK0000000001',on_hand:10,reserved:0,blocked:0,avg_cost:50,sale_price:100,products:{name:'Prenda ficticia'}};

test('UI: un conteo no guardado bloquea el envío y permite reintentar la misma cantidad',async()=>{
 let fail=true;
 const {InventoryCountManager}=load('components/inventory-count-manager.tsx',{'@/lib/phase4b-actions':{
  updateCountAction:async()=>fail?{ok:false,error:'Conexión de prueba interrumpida'}:{ok:true},submitCountAction:async()=>({ok:true})
 }});
 let view;await act(async()=>{view=create(React.createElement(InventoryCountManager,{variants:[variant],counts:[],selectedCount:{id:'c1',status:'draft'},lines:[{id:'l1',variant_id:'v1',counted:null,baseline_on_hand:10}],role:'operator'}));});
 const input=()=>view.root.findAllByType('input').find(x=>x.props.className==='count-qty');
 await act(async()=>input().props.onBlur({target:{value:'7'}}));
 const submit=()=>view.root.findAllByType('button').find(x=>x.props.children==='Enviar a aprobación');
 assert.equal(submit().props.disabled,true);
 fail=false;await act(async()=>input().props.onBlur({target:{value:'7'}}));
 assert.equal(submit().props.disabled,false);await act(async()=>view.unmount());
});

test('UI: guardar envío bloquea cambio de pedido y repetición de la solicitud',async()=>{
 const request=deferred();let calls=0;
 const {ShipmentManager}=load('components/shipment-manager.tsx',{'@/lib/phase2-actions':{shipmentAction:()=>{calls++;return request.promise;}}});
 let view;await act(async()=>{view=create(React.createElement(ShipmentManager,{orders:[{id:'a',order_number:1,buyer:'Cliente A',order_status:'confirmed'},{id:'b',order_number:2,buyer:'Cliente B',order_status:'confirmed'}],canViewDni:false}));});
 assert.equal(view.root.findAllByType('form').length,0);
 await act(async()=>view.root.findByType('select').props.onChange({target:{value:'a'}}));
 await act(async()=>{const form=view.root.findByType('form');void form.props.onSubmit(event);void form.props.onSubmit(event);});
 try{assert.equal(calls,1);assert.equal(view.root.findAllByType('select')[0].props.disabled,true);}
 finally{await act(async()=>request.resolve({ok:true}));await act(async()=>view.unmount());}
});

test('UI: un error de transporte libera el formulario de envío para reintentar',async()=>{
 const {ShipmentManager}=load('components/shipment-manager.tsx',{'@/lib/phase2-actions':{shipmentAction:async()=>{throw Error('Conexión de prueba interrumpida')}}});
 let view;await act(async()=>{view=create(React.createElement(ShipmentManager,{orders:[{id:'a',order_number:1,buyer:'Cliente A',order_status:'confirmed'}],canViewDni:false}));});
 await act(async()=>{try{await view.root.findByType('form').props.onSubmit(event);}catch{}});
 assert.equal(view.root.findByType('button').props.disabled,false);
 assert.equal(view.root.findByType('result').props.result?.ok,false);await act(async()=>view.unmount());
});

test('UI: una recepción usa una clave estable y un bloqueo inmediato contra doble clic',async()=>{
 const request=deferred();const payloads=[];
 const {PurchaseForm}=load('components/purchase-form.tsx',{'@/lib/actions':{receivePurchaseAction:d=>{payloads.push(d);return request.promise;}}});
 let view;await act(async()=>{view=create(React.createElement(PurchaseForm,{variants:[variant],suppliers:[]}));});
 await act(async()=>view.root.findAllByType('select')[1].props.onChange({target:{value:'v1'}}));
 await act(async()=>view.root.findAllByType('button').find(x=>x.props.children==='Añadir línea').props.onClick());
 await act(async()=>{const form=view.root.findByType('form');void form.props.onSubmit(event);void form.props.onSubmit(event);});
 try{assert.equal(payloads.length,1);assert.match(payloads[0].request_key,/^[0-9a-f-]{36}$/);}
 finally{await act(async()=>request.resolve({ok:true}));await act(async()=>view.unmount());}
});

test('UI: dos lecturas simultáneas no agregan dos unidades cuando queda solo una',async()=>{
 const first=deferred(),second=deferred();let calls=0;
 const {SaleForm}=load('components/sale-form.tsx',{'@/lib/actions':{findSaleVariantAction:()=>++calls===1?first.promise:second.promise}});
 let view;await act(async()=>{view=create(React.createElement(SaleForm,{variants:[],customers:[]}));});
 const scanner=()=>view.root.findAllByType('input').find(x=>x.props['aria-label']==='Escanear código para agregar una unidad');
 for(let i=0;i<2;i++){
  await act(async()=>scanner().props.onChange({target:{value:'TEST'}}));
  await act(async()=>scanner().props.onKeyDown({key:'Enter',preventDefault(){}}));
 }
 await act(async()=>{first.resolve({variant:{...variant,on_hand:1,active:true}});second.resolve({variant:{...variant,on_hand:1,active:true}});});
 const line=view.root.findAllByProps({className:'cart-line'})[0];assert.ok(line.findByType('span').props.children.join('').includes('1 und.'));
 assert.equal(view.root.findByType('result').props.result.ok,false);await act(async()=>view.unmount());
});

test('UI: añadir varias prendas acumula unidades por SKU y conserva el pedido hasta la confirmación', async () => {
 const items = [
  { ...variant, active: true, sku: 'TEST-A', on_hand: 5, reserved: 1, blocked: 1 },
  { ...variant, active: true, id: 'v2', sku: 'TEST-B', on_hand: 1 },
  { ...variant, active: true, id: 'v3', sku: 'TEST-C', on_hand: 4 },
 ];
 const searches = [];
 const orders = [];
 const { SaleForm } = load('components/sale-form.tsx', {
  '@/lib/actions': {
   searchSaleVariantsAction: async term => { searches.push(term); return { variants: items }; },
   createOrderAction: async order => { orders.push(order); return { ok: true }; },
  },
 });
 let view;
 await act(async () => { view = create(React.createElement(SaleForm, { variants: [], customers: [] })); });
 const picker = () => view.root.findByProps({ 'aria-label': 'Añadir prenda' });
 const change = (input, value) => act(async () => input.props.onChange({ target: { value } }));
 const add = () => act(async () => picker().props.onSubmit(event));
 const lines = () => view.root.findAllByProps({ className: 'cart-line' });
 const quantity = () => picker().findByProps({ type: 'number' });
 try {
  await change(picker().findByProps({ type: 'search' }), 'TEST');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  assert.deepEqual(searches, ['TEST']);
  await change(picker().findByType('select'), 'v1');
  await add();
  assert.equal(quantity().props.max, 2);
  await change(quantity(), '2');
  await add();
  assert.equal(quantity().props.disabled, true);
  assert.equal(picker().findByType('button').props.disabled, true);
  assert.equal(lines().length, 1);
  assert.match(lines()[0].findByType('span').props.children.join(''), /3 und\./);

  await change(picker().findByType('select'), 'v2');
  await add();
  await change(picker().findByType('select'), 'v3');
  await add();
  assert.equal(lines().length, 3);
  assert.equal(orders.length, 0);

  await change(view.root.findByProps({ value: 'reserve' }), 'paid');
  await act(async () => view.root.findByProps({ 'aria-label': 'Confirmar pedido' }).props.onSubmit(event));
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].lines.map(({ variant_id, quantity }) => [variant_id, quantity]), [['v1', 3], ['v2', 1], ['v3', 1]]);
  assert.equal(lines().length, 0);
 } finally {
  await act(async () => view.unmount());
 }
});
