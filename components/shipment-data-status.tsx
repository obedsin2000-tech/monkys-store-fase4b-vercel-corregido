type RecipientData = {
  recipient_name?: string | null;
  phone?: string | null;
  province?: string | null;
  agency_address?: string | null;
  carrier?: string | null;
};

const requiredRecipientFields = [
  ['recipient_name', 'nombre', 2],
  ['phone', 'teléfono', 6],
  ['province', 'provincia', 2],
  ['agency_address', 'dirección de la agencia', 4],
] as const;

export function missingRecipientFields(data: RecipientData) {
  const missing = requiredRecipientFields
    .filter(([field, , minimum]) => (data[field]?.trim().length ?? 0) < minimum)
    .map<string>(([, label]) => label);
  if (data.carrier !== 'shalom' && data.carrier !== 'otro') missing.push('agencia');
  return missing;
}

export function recipientDataLabel(data: RecipientData | null | undefined) {
  if (!data) return 'Sin datos guardados';
  return missingRecipientFields(data).length > 0 ? 'Datos incompletos' : 'Datos completos';
}

export function ShipmentDataStatus({ data, edited = false }: { data: RecipientData | null | undefined; edited?: boolean }) {
  const tone = edited ? 'amber' : !data ? 'slate' : missingRecipientFields(data).length > 0 ? 'amber' : 'green';
  return <span className={`pill ${tone}`}>{edited ? 'Cambios sin guardar' : recipientDataLabel(data)}</span>;
}
