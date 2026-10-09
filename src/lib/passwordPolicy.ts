/** Gemeinsame Passwortregeln für Festlegen, Zurücksetzen und Ändern. */
export const PASSWORD_MIN_LENGTH = 8;

export function validatePassword(password: string, confirm: string, current?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "Das Passwort muss mindestens 8 Zeichen lang sein.";
  if (!/[A-Za-zÄÖÜäöüß]/.test(password) || !/\d/.test(password))
    return "Das Passwort muss mindestens einen Buchstaben und eine Ziffer enthalten.";
  if (current !== undefined && password === current) return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
  if (password !== confirm) return "Die Passwörter stimmen nicht überein.";
  return null;
}

/** Übersetzt Fehler des Anmeldedienstes in verständliche deutsche Meldungen. */
export function passwordErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (code === "weak_password" || /pwned|leak|weak|known to be/i.test(msg))
    return "Dieses Passwort ist aus bekannten Datenlecks bekannt oder zu schwach. Bitte wählen Sie ein anderes.";
  if (code === "same_password" || /different from the old/i.test(msg))
    return "Das neue Passwort muss sich vom bisherigen unterscheiden.";
  if (/invalid login credentials/i.test(msg)) return "Das aktuelle Passwort ist nicht korrekt.";
  return msg || "Das Passwort konnte nicht gespeichert werden.";
}
