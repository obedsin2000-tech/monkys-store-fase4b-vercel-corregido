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
