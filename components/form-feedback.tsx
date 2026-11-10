'use client';
import {useId,useState} from 'react';
type Control=HTMLInputElement|HTMLSelectElement;
function validation(control:Control,label:string){
 if(control.validity.valid)return '';
 if(control.validity.valueMissing)return `Completa ${label.toLowerCase()}.`;
 if(control instanceof HTMLInputElement){
  if(control.validity.tooShort)return `Escribe al menos ${control.minLength} caracteres.`;
  if(control.validity.rangeOverflow)return `Usa un importe de hasta ${control.max}.`;
  if(control.validity.rangeUnderflow)return `El mínimo permitido es ${control.min}.`;
  if(control.validity.stepMismatch)return 'Usa el formato indicado, con un máximo de dos decimales para importes.';
 }
 return `Revisa ${label.toLowerCase()} y vuelve a intentar.`;
}
export function useFieldFeedback(){
 const prefix=useId();const [errors,setErrors]=useState<Record<string,string>>({});
 function props(name:string,label:string,hintId?:string){return {
  id:`${prefix}-${name}`,name,'aria-invalid':Boolean(errors[name]),'aria-describedby':[errors[name]?`${prefix}-${name}-error`:null,hintId].filter(Boolean).join(' ')||undefined,
  onInvalid:(event:React.FormEvent<Control>)=>{const message=validation(event.currentTarget,label);setErrors(previous=>({...previous,[name]:message}));},
  onBlur:(event:React.FocusEvent<Control>)=>{const control=event.currentTarget;if(control.value||errors[name]){const message=validation(control,label);setErrors(previous=>({...previous,[name]:message}));}},
  onInput:(event:React.FormEvent<Control>)=>{if(errors[name]){const message=validation(event.currentTarget,label);setErrors(previous=>({...previous,[name]:message}));}}
 };}
 function message(name:string){return errors[name]?<span id={`${prefix}-${name}-error`} className="field-error">{errors[name]}</span>:null;}
 return {props,message,reset:()=>setErrors({})};
}
