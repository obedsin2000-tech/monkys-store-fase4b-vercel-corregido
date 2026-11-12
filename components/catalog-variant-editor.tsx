'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ResultMessage } from '@/components/ui';
import { updateVariantIdentityAction } from '@/lib/actions';
import type { ActionResult, Variant } from '@/lib/types';

type EditableVariant = Pick<Variant, 'id' | 'sku' | 'size' | 'color'>;

export function CatalogVariantEditor({ name, variant }: { name: string; variant: EditableVariant }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="link-btn catalog-variant-edit"
        aria-haspopup="dialog"
        aria-label={`Editar variante ${variant.sku}`}
        onClick={() => setOpen(true)}
      >
        Editar variante
      </button>
      {open && (
        <VariantDialog name={name} variant={variant} onClose={saved => {
          setOpen(false);
          trigger.current?.focus();
          if (saved) router.refresh();
        }} />
      )}
    </>
  );
}

function VariantDialog({ name, variant, onClose }: {
  name: string;
  variant: EditableVariant;
  onClose: (saved: boolean) => void;
}) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [expected] = useState(() => ({ sku: variant.sku, size: variant.size, color: variant.color }));
  const [draft, setDraft] = useState(expected);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const saved = result?.ok === true;
  const edited = draft.sku.trim() !== expected.sku || draft.size.trim() !== expected.size || draft.color.trim() !== expected.color;

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  useEffect(() => {
    if (saved) closeButton.current?.focus();
  }, [saved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || saved || !edited) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      setResult(await updateVariantIdentityAction({ variant_id: variant.id, ...draft, expected }));
    } catch {
      setResult({ ok: false, error: 'No se pudo confirmar el cambio. Intenta nuevamente.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="catalog-dialog variant-edit-dialog"
      aria-labelledby={title}
      onClose={() => onClose(saved)}
      onCancel={event => { if (pending.current) event.preventDefault(); }}
    >
      <div className="catalog-dialog-body">
        <div className="catalog-dialog-heading">
          <div>
            <h2 id={title}>Editar variante</h2>
            <p className="small muted">{name}</p>
          </div>
        </div>
        <form className="form-stack" onSubmit={submit} aria-busy={busy}>
          {saved ? <ResultMessage result={result} /> : (
            <>
              <label>
                SKU
                <input value={draft.sku} required minLength={2} maxLength={60} disabled={busy} spellCheck={false}
                  onChange={event => setDraft({ ...draft, sku: event.target.value })} />
              </label>
              <div className="grid two">
                <label>
                  Talla
                  <input value={draft.size} required maxLength={30} disabled={busy}
                    onChange={event => setDraft({ ...draft, size: event.target.value })} />
                </label>
                <label>
                  Color
                  <input value={draft.color} required maxLength={40} disabled={busy}
                    onChange={event => setDraft({ ...draft, color: event.target.value })} />
                </label>
              </div>
              <ResultMessage result={result} />
            </>
          )}
          <div className="action-row">
            {!saved && <button className="btn primary" type="submit" disabled={busy || !edited}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>}
            <button ref={closeButton} className="btn outline" type="button" disabled={busy} onClick={() => dialog.current?.close()}>
              {saved ? 'Cerrar' : 'Cancelar'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
