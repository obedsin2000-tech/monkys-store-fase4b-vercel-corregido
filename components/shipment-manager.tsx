'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldFeedback } from '@/components/form-feedback';
import { shipmentAction, shipmentStatusAction } from '@/lib/phase2-actions';
import { ResultMessage, Status } from '@/components/ui';
import { ShipmentDataStatus, missingRecipientFields, recipientDataLabel } from '@/components/shipment-data-status';
import { WhatsAppLink } from '@/components/whatsapp-link';
import type { ActionResult } from '@/lib/types';

export type ShippingItem = {
  id: string;
  order_number: number;
  buyer: string;
  order_status: string;
  shipping?: {
    recipient_name: string; phone: string; dni: string | null; department: string | null;
    province: string; district: string | null; carrier: string; agency_address: string;
    tracking_code: string | null; status: string;
  } | null;
};

function recipientForm(item: ShippingItem | undefined, canViewDni: boolean, shipping = item?.shipping) {
  return {
    recipient_name: shipping?.recipient_name || item?.buyer || '',
    phone: shipping?.phone || '',
    dni: canViewDni ? shipping?.dni || '' : '',
    department: shipping?.department || '',
    province: shipping?.province || '',
    district: shipping?.district || '',
    carrier: shipping?.carrier || 'shalom',
    agency_address: shipping?.agency_address || '',
  };
}

export function ShipmentManager({ orders, canViewDni, focused = false }: { orders: ShippingItem[]; canViewDni: boolean; focused?: boolean }) {
  const router = useRouter();
  const first = orders.length === 1 ? orders[0] : undefined;
  const inFlight = useRef(false);
  const requestedFocus = useRef<'recipient' | 'edit' | 'preparation' | null>(null);
  const recipientInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const preparationTitle = useRef<HTMLHeadingElement>(null);
  const feedback = useFieldFeedback();
  const dniHint = useId();
  const [id, setId] = useState(first?.id || '');
  const item = orders.find(order => order.id === id);
  const [savedDraft, setSavedDraft] = useState<ShippingItem['shipping']>(null);
  const shipping = savedDraft || item?.shipping;
  const [form, setForm] = useState(() => recipientForm(first, canViewDni));
  const [editing, setEditing] = useState(() => !first?.shipping || missingRecipientFields(first.shipping).length > 0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(first?.shipping?.tracking_code || '');
  const locked = shipping?.status === 'dispatched' || shipping?.status === 'delivered';
  const missing = shipping ? missingRecipientFields(shipping) : [];
  const edited = editing && Boolean(shipping) && Object.entries(form).some(([key, value]) =>
    String(value || '') !== String(shipping?.[key as keyof NonNullable<ShippingItem['shipping']>] || ''));
  const firstStep = !shipping || editing || missing.length > 0;

  useEffect(() => {
    if (editing && requestedFocus.current === 'recipient') recipientInput.current?.focus();
    if (!editing && requestedFocus.current === 'edit') editButton.current?.focus();
    if (!editing && requestedFocus.current === 'preparation') preparationTitle.current?.focus();
    requestedFocus.current = null;
  }, [editing]);

  function select(value: string) {
    if (inFlight.current) return;
    const order = orders.find(candidate => candidate.id === value);
    feedback.reset();
    setId(value);
    setSavedDraft(null);
    setResult(null);
    setForm(recipientForm(order, canViewDni));
    setTracking(order?.shipping?.tracking_code || '');
    setEditing(!order?.shipping || missingRecipientFields(order.shipping).length > 0);
  }

  function editRecipient() {
    setForm(recipientForm(item, canViewDni, shipping));
    feedback.reset();
    setResult(null);
    requestedFocus.current = 'recipient';
    setEditing(true);
  }

  function cancelEditing() {
    setForm(recipientForm(item, canViewDni, shipping));
    feedback.reset();
    setResult(null);
    requestedFocus.current = 'edit';
    setEditing(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !item) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await shipmentAction({ ...form, order: id });
      setResult(next);
      if (next.ok) {
        setSavedDraft({
          ...form,
          dni: canViewDni ? form.dni || null : null,
          department: form.department || null,
          district: form.district || null,
          tracking_code: shipping?.tracking_code || null,
          status: shipping?.status || 'pending',
        });
        requestedFocus.current = 'preparation';
        setEditing(false);
        router.refresh();
      }
    } catch {
      setResult({ ok: false, error: 'No se pudo confirmar el guardado. Revisa la conexión y vuelve a intentar.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function changeStatus(status: 'preparing' | 'dispatched' | 'delivered') {
    if (inFlight.current || !item) return;
    if (status === 'dispatched' && !confirm('¿Confirmas que el paquete fue entregado a la agencia de transporte?')) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await shipmentStatusAction({ order: id, status, tracking });
      setResult(next);
      if (next.ok && shipping) {
        setSavedDraft({ ...shipping, status, tracking_code: status === 'dispatched' ? tracking.trim() || null : shipping.tracking_code });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, error: 'No se pudo confirmar el cambio. Actualiza el estado antes de reintentar.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      {(!focused || orders.length !== 1) && <div className="operation-picker">
        <label>Pedido pendiente<select disabled={busy} value={id} onChange={event => select(event.target.value)}>
          <option value="">Seleccionar pedido</option>
          {orders.map(order => <option value={order.id} key={order.id}>#{order.order_number} · {order.buyer} · {recipientDataLabel(order.id === id ? shipping : order.shipping)}</option>)}
        </select></label>
        {!item && <p className="field-hint">Elige un pedido para revisar los datos del destinatario y preparar el paquete.</p>}
      </div>}
      {item && <>
        <div className="shipment-heading">
          <div><strong>Pedido #{item.order_number}</strong><p>{item.buyer}</p></div>
          <div className="shipping-indicators">
            <div><small>Datos del destinatario</small><ShipmentDataStatus data={shipping} edited={edited} /></div>
            <div><small>Estado del despacho</small>{shipping ? <Status value={shipping.status} /> : <span className="pill slate">Sin envío registrado</span>}</div>
          </div>
        </div>
        {missing.length > 0 && <p className="alert warn">Revisa estos datos del envío guardado: {missing.join(', ')}.</p>}
        <ol className="workflow-steps" aria-label="Pasos del envío">
          <li className={firstStep ? 'current' : 'complete'} aria-current={firstStep ? 'step' : undefined}><b aria-hidden="true">{firstStep ? '1' : '✓'}</b>Datos del envío</li>
          <li className={firstStep ? '' : 'current'} aria-current={firstStep ? undefined : 'step'}><b aria-hidden="true">2</b>Preparación y despacho</li>
        </ol>
        {editing && !locked ? (
          <form className="form-stack" onSubmit={save} aria-busy={busy}>
            <p className="required-note">* Campos obligatorios</p>
            <fieldset disabled={busy} className="form-section operation-form-section">
              <legend>Destinatario</legend>
              <div className={canViewDni ? 'grid recipient-fields' : 'grid two'}>
                <label>Nombre del destinatario *<input {...feedback.props('recipient_name', 'el nombre del destinatario')} ref={recipientInput} required minLength={2} maxLength={120} autoComplete="shipping name" value={form.recipient_name} onChange={event => setForm({ ...form, recipient_name: event.target.value })} />{feedback.message('recipient_name')}</label>
                <label>Teléfono *<input {...feedback.props('phone', 'el teléfono')} type="tel" inputMode="tel" autoComplete="shipping tel" required minLength={6} maxLength={30} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />{feedback.message('phone')}</label>
                {canViewDni && <label>DNI (opcional)<input {...feedback.props('dni', 'el DNI', dniHint)} inputMode="numeric" maxLength={15} value={form.dni} onChange={event => setForm({ ...form, dni: event.target.value })} /><span className="field-hint" id={dniHint}>Solo si lo requiere la agencia.</span>{feedback.message('dni')}</label>}
              </div>
            </fieldset>
            <fieldset disabled={busy} className="form-section operation-form-section">
              <legend>Destino y agencia</legend>
              <div className="grid three">
                <label>Departamento<input {...feedback.props('department', 'el departamento')} maxLength={100} value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} />{feedback.message('department')}</label>
                <label>Provincia *<input {...feedback.props('province', 'la provincia')} required minLength={2} maxLength={100} value={form.province} onChange={event => setForm({ ...form, province: event.target.value })} />{feedback.message('province')}</label>
                <label>Distrito<input {...feedback.props('district', 'el distrito')} maxLength={100} value={form.district} onChange={event => setForm({ ...form, district: event.target.value })} />{feedback.message('district')}</label>
              </div>
              <div className="grid two">
                <label>Agencia *<select value={form.carrier} onChange={event => setForm({ ...form, carrier: event.target.value })}><option value="shalom">Shalom</option><option value="otro">Otra agencia</option></select></label>
                <label>Dirección de la agencia *<input {...feedback.props('agency_address', 'la dirección de la agencia')} required minLength={4} maxLength={250} value={form.agency_address} onChange={event => setForm({ ...form, agency_address: event.target.value })} placeholder="Agencia y sede de destino" />{feedback.message('agency_address')}</label>
              </div>
              <div className="form-footer">
                <span className="muted small">{shipping ? 'Guarda para usar los datos actualizados.' : 'El guardado habilita el Paso 2.'}</span>
                <div className="action-row">
                  {shipping && <button type="button" className="btn outline" disabled={busy} onClick={cancelEditing}>Cancelar edición</button>}
                  <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : shipping ? 'Actualizar datos de envío' : 'Guardar datos y continuar'}</button>
                </div>
              </div>
            </fieldset>
          </form>
        ) : shipping && (
          <div className="shipment-saved-data">
            <div><strong>{shipping.recipient_name || 'Destinatario pendiente'}</strong><p className="muted small">{[shipping.phone, shipping.province, shipping.agency_address].filter(Boolean).join(' · ')}</p></div>
            {!locked && <button ref={editButton} type="button" className="btn outline compact" disabled={busy} onClick={editRecipient}>Editar datos de envío</button>}
          </div>
        )}
        <ResultMessage result={result} />
        {shipping && <section className="shipping-next" aria-labelledby="preparacion-titulo">
          <h3 id="preparacion-titulo" ref={preparationTitle} tabIndex={-1}>Paso 2 de 2 · Preparación y despacho</h3>
          {edited && <p className="field-hint">Guarda los cambios del destinatario antes de continuar.</p>}
          <div className="grid two">
            <label>Código de guía / seguimiento<input disabled={busy || edited} value={tracking} onChange={event => setTracking(event.target.value)} maxLength={120} placeholder="Opcional" /></label>
            <div className="action-row">
              {shipping.status === 'pending' && <button type="button" disabled={busy || edited} className="btn outline" onClick={() => changeStatus('preparing')}>Marcar en preparación</button>}
              {(shipping.status === 'pending' || shipping.status === 'preparing') && <button type="button" disabled={busy || edited || item.order_status !== 'confirmed'} className="btn primary" onClick={() => changeStatus('dispatched')}>Marcar despachado</button>}
              {shipping.status === 'dispatched' && <button type="button" disabled={busy} className="btn primary" onClick={() => changeStatus('delivered')}>Marcar entregado</button>}
            </div>
          </div>
          {item.order_status !== 'confirmed' && <p className="field-hint">Confirma el pago del pedido antes de marcarlo como despachado.</p>}
          <div className="action-row">
            {shipping.status === 'dispatched' && <WhatsAppLink phone={shipping.phone} label="Avisar despacho por WhatsApp" message={`Hola ${shipping.recipient_name}, tu pedido #${item.order_number} de Monky's Store ya fue entregado a ${shipping.carrier === 'shalom' ? 'Shalom' : 'la agencia de transporte'} en ${shipping.agency_address}, ${shipping.province}. ${tracking.trim() || shipping.tracking_code ? `Tu número de guía es ${tracking.trim() || shipping.tracking_code}. ` : ''}Gracias por tu compra.`} />}
            <a className="btn outline compact" href={`/envios/rotulos?ids=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Ver rótulo</a>
          </div>
        </section>}
      </>}
    </div>
  );
}
