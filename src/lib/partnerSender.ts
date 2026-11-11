/** Keep separately maintained billing bank details unless master data supplies a replacement. */
export function mergePartnerSender(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const sender = { ...current, ...incoming };
  for (const key of ["bank_name", "iban", "bic"]) {
    if (!incoming[key]) sender[key] = current[key] ?? "";
  }
  return sender;
}