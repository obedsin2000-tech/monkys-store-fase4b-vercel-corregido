'use client';
import {Printer} from 'lucide-react';
export function PrintReport(){return <button type="button" className="btn outline" onClick={()=>window.print()}><Printer size={15}/> Imprimir / PDF</button>}
