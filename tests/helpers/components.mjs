import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url);
export function load(relative,mocks={}){
 const source=fs.readFileSync(process.env.ERP_TEST_SOURCE_ROOT?new URL(relative,pathToFileURL(process.env.ERP_TEST_SOURCE_ROOT+'/')):new URL('../../'+relative,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const React=require('react');
 const defaults={
  'next/navigation':{useRouter:()=>({refresh(){},push(){}})},
  'next/link':{__esModule:true,default:props=>React.createElement('a',props)},
  '@/components/ui':{ResultMessage:props=>React.createElement('result',props),Status:props=>React.createElement('status',props),PageTitle:props=>React.createElement('h1',null,props.title),Empty:props=>React.createElement('p',null,props.text)},
  '@/components/whatsapp-link':{WhatsAppLink:props=>React.createElement('whatsapp',props)},
  '@/lib/types':{money:n=>`S/ ${n}`,available:v=>v.on_hand-v.reserved-v.blocked,dateTime:v=>String(v)}
 };
 new Function('require','module','exports',compiled)(id=>{if(id in mocks)return mocks[id];if(id in defaults)return defaults[id];if(id.startsWith('@/')){const file=['.tsx','.ts'].map(ext=>id.slice(2)+ext).find(relative=>fs.existsSync(new URL('../../'+relative,import.meta.url)));if(file)return load(file,mocks);}return require(id);},module,module.exports);
 return module.exports;
}
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
export function nodes(element,predicate){
 if(!element||typeof element!=='object')return [];
 if(Array.isArray(element))return element.flatMap(item=>nodes(item,predicate));
 return [...(predicate(element)?[element]:[]),...nodes(element.props?.children,predicate)];
}
