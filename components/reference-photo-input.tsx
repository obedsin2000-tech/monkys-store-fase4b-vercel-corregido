'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PRODUCT_PHOTO_ACCEPT, PRODUCT_PHOTO_HINT, productPhotoFileError } from '@/lib/product-photo';

export function ReferencePhotoInput({
  file,
  onChange,
  optional = false,
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fileError = file ? productPhotoFileError(file) : null;

  useEffect(() => {
    if (!file) {
      if (input.current) input.current.value = '';
      setPreview(null);
      return;
    }
    if (productPhotoFileError(file)) return;

    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const url = preview?.file === file ? preview?.url : undefined;
  const error = fileError || (url && failedUrl === url ? 'No se pudo abrir la vista previa. Selecciona otra imagen.' : null);

  return (
    <div className="reference-photo-input">
      <label htmlFor={id}>Foto de referencia</label>
      <input
        ref={input}
        id={id}
        name="foto"
        type="file"
        accept={PRODUCT_PHOTO_ACCEPT}
        disabled={disabled}
        aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        aria-invalid={Boolean(error)}
        onChange={event => onChange(event.target.files?.[0] ?? null)}
      />
      <p className="field-hint" id={`${id}-hint`}>{optional && 'Opcional. '}{PRODUCT_PHOTO_HINT}</p>
      {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}
      {file && (
        <div className="reference-photo-preview">
          {url && !error && (
            <img src={url} alt="Vista previa de la foto seleccionada" onError={() => setFailedUrl(url)} />
          )}
          <div>
            <p className="small muted">{file.name}</p>
            <button type="button" className="link-btn" disabled={disabled} onClick={() => onChange(null)}>
              Quitar selección
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
