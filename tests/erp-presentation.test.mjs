import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {load} from './helpers/components.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

test('Presentación: estados y canales mantienen texto en español además del color',async()=>{
 const {Status}=load('components/ui.tsx');
 for(const [value,label] of [['partial','Con adelanto'],['dispatched','Despachado'],['tiktok','TikTok Live'],['efectivo','Efectivo']]){
  let view;await act(async()=>{view=create(React.createElement(Status,{value}));});assert.equal(view.root.findByType('span').props.children,label);await act(async()=>view.unmount());
 }
});

test('Presentación: errores se anuncian como alerta y éxito como estado',async()=>{
 const {ResultMessage}=load('components/ui.tsx');
 for(const [result,role] of [[{ok:false,error:'No se pudo guardar'},'alert'],[{ok:true,message:'Datos guardados'},'status']]){
  let view;await act(async()=>{view=create(React.createElement(ResultMessage,{result}));});assert.equal(view.root.findByProps({role}).props['aria-atomic'],'true');await act(async()=>view.unmount());
 }
});

test('Presentación: el vacío conserva título y explicación sin simular un fallo',async()=>{
 const {Empty}=load('components/ui.tsx');let view;await act(async()=>{view=create(React.createElement(Empty,{title:'Sin coincidencias',text:'Prueba otro código.'}));});
 assert.equal(view.root.findByType('strong').props.children,'Sin coincidencias');assert.equal(view.root.findByType('p').props.children,'Prueba otro código.');assert.equal(view.root.findAllByProps({role:'alert'}).length,0);await act(async()=>view.unmount());
});

test('Presentación: los cambios de destinatario sin guardar se distinguen antes de despachar',async()=>{
 const {ShipmentManager}=load('components/shipment-manager.tsx',{'@/lib/phase2-actions':{}});
 const shipping={recipient_name:'Destinatario de prueba',phone:'900000000',dni:null,department:null,province:'Huancayo',district:null,carrier:'shalom',agency_address:'Agencia de prueba',tracking_code:null,status:'pending'};
 let view;await act(async()=>{view=create(React.createElement(ShipmentManager,{orders:[{id:'test-order',order_number:1,buyer:'Comprador de prueba',order_status:'confirmed',shipping}],canViewDni:false}));});
 const dispatch=()=>view.root.findAllByType('button').find(b=>b.props.children==='Marcar despachado');assert.equal(dispatch().props.disabled,false);
 await act(async()=>view.root.findByProps({name:'recipient_name'}).props.onChange({target:{value:'Otro destinatario'}}));assert.equal(dispatch().props.disabled,true);
 assert.ok(view.root.findAllByProps({className:'pill amber'}).some(p=>p.props.children==='Cambios sin guardar'));
 await act(async()=>view.root.findByProps({name:'recipient_name'}).props.onChange({target:{value:shipping.recipient_name}}));assert.equal(dispatch().props.disabled,false);await act(async()=>view.unmount());
});

test('Presentación: la carga tiene anuncio accesible y esqueletos ocultos al lector',async()=>{
 const Loading=load('app/(sistema)/loading.tsx').default;let view;await act(async()=>{view=create(React.createElement(Loading));});
 assert.equal(view.root.findByProps({role:'status'}).props['aria-label'],'Cargando la pantalla');assert.ok(view.root.findAllByProps({'aria-hidden':'true'}).length>0);await act(async()=>view.unmount());
});

test('Presentación: varios errores nativos conservan su mensaje al terminar el evento React',async()=>{
 const {ShipmentManager}=load('components/shipment-manager.tsx',{'@/lib/phase2-actions':{}});let view;
 await act(async()=>{view=create(React.createElement(ShipmentManager,{orders:[{id:'test',order_number:1,buyer:'Cliente de prueba',order_status:'confirmed'}],canViewDni:false}));});
 await act(async()=>{for(const name of ['phone','province']){const event={currentTarget:{validity:{valid:false,valueMissing:true}}};view.root.findByProps({name}).props.onInvalid(event);event.currentTarget=null;}});
 const messages=view.root.findAllByProps({className:'field-error'}).map(n=>n.props.children);assert.ok(messages.includes('Completa el teléfono.'));assert.ok(messages.includes('Completa la provincia.'));await act(async()=>view.unmount());
});
