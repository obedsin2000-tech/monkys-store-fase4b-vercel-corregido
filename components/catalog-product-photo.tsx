'use client';

import { ImageOff, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ReferencePhotoInput } from '@/components/reference-photo-input';
import { ResultMessage } from '@/components/ui';
import { removeProductPhotoAction, saveProductPhotoAction } from '@/lib/product-photo-actions';
import { productPhotoFileError, productPhotoUrl } from '@/lib/product-photo';
import type { ActionResult } from '@/lib/types';

type ProductPhoto = {
  productId: string;
  name: string;
  photoId: string | null;
};
type DialogMode = 'view' | 'manage';

function MissingPhoto() {
  return <span className="catalog-photo-placeholder"><ImageOff size={16} aria-hidden="true" /><span>Sin foto</span></span>;
}

export function CatalogProductPhoto({
  productId,
  name,
  photoId,
  sku,
  canManage,
}: ProductPhoto & { sku: string; canManage: boolean }) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DialogMode | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const thumbnail = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = thumbnail.current;
    // Una respuesta 404 puede llegar antes de que React hidrate la tabla.
    if (photoId && image?.complete && image.naturalWidth === 0) setFailedId(photoId);
  }, [photoId]);

  function open(next: DialogMode, button: HTMLButtonElement) {
    opener.current = button;
    setMode(next);
  }

  return (
    <div className="catalog-product-identity">
      {photoId && failedId !== photoId ? (
        <button
          type="button"
          className="catalog-photo-thumb"
          aria-label={`Ampliar foto de ${name} · ${sku}`}
          onClick={event => open('view', event.currentTarget)}
        >
          <img
            key={photoId}
            ref={thumbnail}
            src={productPhotoUrl(productId, photoId, 'miniatura')}
            width={48}
            height={48}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedId(photoId)}
          />
        </button>
      ) : <MissingPhoto />}
      <div className="catalog-product-label">
        <strong>{name}</strong>
        <small className="mono">{sku}</small>
        {canManage && (
          <button
            type="button"
            className="link-btn catalog-photo-manage"
            aria-label={`Gestionar foto de ${name} · ${sku}`}
            onClick={event => open('manage', event.currentTarget)}
          >
            Gestionar foto
          </button>
        )}
      </div>
      {mode && (
        <ProductPhotoDialog
          productId={productId}
          name={name}
          photoId={photoId}
          mode={mode}
          onClose={() => {
            setMode(null);
            opener.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function ProductPhotoDialog({
  productId,
  name,
  photoId,
  mode,
  onClose,
}: ProductPhoto & { mode: DialogMode; onClose: () => void }) {
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || productPhotoFileError(file)) return;
    const data = new FormData();
    data.set('foto', file);
    await submit(() => saveProductPhotoAction(productId, photoId, data));
  }

  async function submit(action: () => Promise<ActionResult>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await action();
      setResult(next);
      if (next.ok) {
        setFile(null);
        setConfirmRemove(false);
      }
    } catch {
      setResult({ ok: false, error: 'No se pudo completar el cambio. Revisa la foto actual y vuelve a intentar.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const image = photoId && failedId !== photoId ? (
    <img
      key={photoId}
      src={productPhotoUrl(productId, photoId, mode === 'view' ? 'ampliada' : 'miniatura')}
      alt={`Foto de referencia de ${name}`}
      decoding="async"
      onError={() => setFailedId(photoId)}
    />
  ) : <MissingPhoto />;

  return (
    <dialog
      ref={dialog}
      className="product-photo-dialog"
      aria-labelledby={title}
      onClose={onClose}
      onCancel={event => { if (pending.current) event.preventDefault(); }}
    >
      <div className="product-photo-dialog-body" aria-busy={busy}>
        <div className="product-photo-dialog-heading">
          <div>
            <p className="small muted">Foto de referencia</p>
            <h2 id={title}>{name}</h2>
          </div>
          <button
            type="button"
            className="btn outline product-photo-close"
            aria-label="Cerrar foto"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {mode === 'view' ? (
          <div className="product-photo-enlarged">{image}</div>
        ) : (
          <>
            <div className="product-photo-current">{image}<span className="small muted">La referencia se comparte entre todas las variantes.</span></div>
            <form className="form-stack" onSubmit={save}>
              <ReferencePhotoInput file={file} onChange={setFile} disabled={busy} />
              <div className="action-row">
                <button type="submit" className="btn primary" disabled={busy || !file || Boolean(productPhotoFileError(file))}>
                  {busy ? 'Guardando…' : 'Guardar foto'}
                </button>
                {photoId && !confirmRemove && (
                  <button type="button" className="btn danger" disabled={busy} onClick={() => setConfirmRemove(true)}>
                    Quitar foto
                  </button>
                )}
              </div>
              {confirmRemove && photoId && (
                <div className="product-photo-remove">
                  <p>Se quitará la foto de todas las tallas y colores de esta prenda.</p>
                  <div className="action-row">
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() => submit(() => removeProductPhotoAction(productId, photoId))}
                    >
                      Confirmar retiro
                    </button>
                    <button type="button" className="btn outline" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </form>
            <ResultMessage result={result} />
          </>
        )}
      </div>
    </dialog>
  );
}
