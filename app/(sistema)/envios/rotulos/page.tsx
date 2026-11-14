import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {PrintLabels} from '@/components/print-labels';
import {PageTitle,Empty} from '@/components/ui';
import {OperationLoadError} from '@/components/operation-ui';

export default async function Rotulos({ searchParams }: { searchParams: Promise<{ ids?: string | string[]; dni?: string | string[] }> }) {
 const { supabase, role } = await requireUser();
 const params = await searchParams;
 const raw = typeof params.ids === 'string' ? params.ids : '';
 const withoutDni = params.dni === '0';
 const includeDni = role === 'admin' && !withoutDni;
 const ids = [...new Set(raw.split(',').filter(id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))].slice(0, 30);
 const retryHref = `/envios/rotulos?${new URLSearchParams({ ids: ids.join(','), ...(withoutDni ? { dni: '0' } : {}) })}`;
 const back = <Link className="btn outline" href="/envios">Volver a Envíos</Link>;
 if (!ids.length) return <><PageTitle title="Rótulos de envío" description="Revisa la etiqueta del paquete antes de imprimir."/><section className="card"><Empty title="Selecciona un paquete" text="Abre el rótulo del pedido desde Envíos o imprime los rótulos pendientes.">{back}</Empty></section></>;

 const { data: shipments, error } = await supabase.from('shipments')
  .select('order_id,recipient_name,phone,province,department,district,carrier,agency_address,tracking_code')
  .in('order_id', ids);
 if (error) return <><PageTitle title="Rótulos de envío" description="Vista previa de los paquetes seleccionados.">{back}</PageTitle><OperationLoadError title="No se pudieron cargar los rótulos" href={retryHref}/></>;
 if (!shipments?.length) return <><PageTitle title="Rótulos de envío" description="Vista previa de los paquetes seleccionados."/><section className="card"><Empty title="Sin rótulos para esta selección" text="El paquete debe tener datos de envío guardados para que aparezca aquí.">{back}</Empty></section></>;

 const dniByOrder = new Map<string, string | null>();
 if (includeDni) {
  const { data: dniRows, error: dniError } = await supabase.rpc('admin_get_shipment_dni', {
   p_orders: shipments.map(shipment => shipment.order_id),
  });
  for (const { order_id, dni } of (dniRows ?? []) as { order_id: string; dni: string | null }[]) {
   dniByOrder.set(order_id, dni);
  }
  if (dniError || shipments.some(shipment => !dniByOrder.has(shipment.order_id))) {
   return <><PageTitle title="Rótulos de envío" description="Vista previa con datos autorizados.">{back}</PageTitle><OperationLoadError title="No se pudieron cargar los DNI autorizados" href={retryHref}/></>;
  }
 }

 return <PrintLabels items={shipments.map(shipment => ({ ...shipment, dni: dniByOrder.get(shipment.order_id)?.trim() || null }))}/>;
}
