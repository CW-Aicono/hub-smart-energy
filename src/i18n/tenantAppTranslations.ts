export type TenantLang = "de" | "en" | "es" | "nl";

type TenantTranslations = Record<string, Record<TenantLang, string>>;

const t: TenantTranslations = {
  "auth.login": { de: "Anmelden", en: "Sign in", es: "Iniciar sesión", nl: "Inloggen" },
  "auth.register": { de: "Registrieren", en: "Register", es: "Registrarse", nl: "Registreren" },
  "auth.create_account": { de: "Konto erstellen", en: "Create account", es: "Crear cuenta", nl: "Account aanmaken" },
  "auth.reset_password": { de: "Passwort zurücksetzen", en: "Reset password", es: "Restablecer contraseña", nl: "Wachtwoord resetten" },
  "auth.email": { de: "E-Mail", en: "Email", es: "Correo electrónico", nl: "E-mail" },
  "auth.password": { de: "Passwort", en: "Password", es: "Contraseña", nl: "Wachtwoord" },
  "auth.name": { de: "Name", en: "Name", es: "Nombre", nl: "Naam" },
  "auth.name_placeholder": { de: "Max Mustermann", en: "John Doe", es: "Juan Pérez", nl: "Jan Modaal" },
  "auth.send_link": { de: "Link senden", en: "Send link", es: "Enviar enlace", nl: "Link verzenden" },
  "auth.back_to_login": { de: "Zurück zum Login", en: "Back to login", es: "Volver al inicio de sesión", nl: "Terug naar inloggen" },
  "auth.forgot_password": { de: "Passwort vergessen?", en: "Forgot password?", es: "¿Olvidó su contraseña?", nl: "Wachtwoord vergeten?" },
  "auth.no_account": { de: "Noch kein Konto?", en: "No account yet?", es: "¿Aún no tienes cuenta?", nl: "Nog geen account?" },
  "auth.already_registered": { de: "Bereits registriert?", en: "Already registered?", es: "¿Ya está registrado?", nl: "Al geregistreerd?" },
  "auth.invalid_credentials": { de: "Ungültige Zugangsdaten", en: "Invalid credentials", es: "Credenciales inválidas", nl: "Ongeldige inloggegevens" },
  "auth.password_min": { de: "Passwort muss mindestens 6 Zeichen haben", en: "Password must be at least 6 characters", es: "La contraseña debe tener al menos 6 caracteres", nl: "Wachtwoord moet minimaal 6 tekens bevatten" },
  "auth.email_exists": { de: "E-Mail bereits registriert", en: "Email already registered", es: "Correo electrónico ya registrado", nl: "E-mailadres is al geregistreerd" },
  "auth.register_success": { de: "Registrierung erfolgreich! Bitte E-Mail bestätigen.", en: "Registration successful! Please confirm your email.", es: "¡Registro exitoso! Por favor, confirme su correo electrónico.", nl: "Registratie succesvol! Bevestig alstublieft uw e-mailadres." },
  "auth.enter_email": { de: "Bitte E-Mail eingeben", en: "Please enter your email", es: "Por favor, introduzca su correo electrónico", nl: "Voer e-mailadres in" },
  "auth.send_error": { de: "Fehler beim Senden", en: "Error sending", es: "Error al enviar", nl: "Fout bij verzenden" },
  "auth.reset_sent": { de: "Rücksetz-Link gesendet!", en: "Reset link sent!", es: "¡Enlace de restablecimiento enviado!", nl: "Resetlink verzonden!" },
  "auth.logout": { de: "Abmelden", en: "Sign out", es: "Cerrar sesión", nl: "Uitloggen" },
  "dash.welcome": { de: "Willkommen,", en: "Welcome,", es: "Bienvenido,", nl: "Welkom," },
  "dash.avg_month": { de: "Ø Monat", en: "Ø Month", es: "Ø Mes", nl: "Ø Maand" },
  "dash.total": { de: "Gesamt", en: "Total", es: "Total", nl: "Totaal" },
  "dash.estimated": { de: "Geschätzt", en: "Estimated", es: "Estimado", nl: "Geschat" },
  "dash.by_energy_type": { de: "Verbrauch nach Energieträger", en: "Consumption by energy type", es: "Consumo por tipo de energía", nl: "Verbruik per energietype" },
  "dash.latest_invoice": { de: "Letzte Abrechnung", en: "Latest invoice", es: "Última factura", nl: "Laatste factuur" },
  "dash.local_pv": { de: "Lokal (PV)", en: "Local (PV)", es: "Local (FV)", nl: "Lokaal (PV)" },
  "dash.grid": { de: "Netz", en: "Grid", es: "Red", nl: "Net" },
  "dash.amount": { de: "Betrag", en: "Amount", es: "Monto", nl: "Bedrag" },
  "dash.consumption_chart": { de: "Verbrauchsverlauf", en: "Consumption history", es: "Historial de consumo", nl: "Verbruiksgeschiedenis" },
  "dash.no_data": { de: "Noch keine Verbrauchsdaten verfügbar", en: "No consumption data available yet", es: "Aún no hay datos de consumo disponibles", nl: "Nog geen verbruiksgegevens beschikbaar" },
  "inv.title": { de: "Abrechnungen", en: "Invoices", es: "Facturas", nl: "Facturen" },
  "inv.none": { de: "Noch keine Abrechnungen vorhanden", en: "No invoices yet", es: "Aún no hay facturas disponibles", nl: "Nog geen facturen beschikbaar" },
  "inv.paid": { de: "Bezahlt", en: "Paid", es: "Pagado", nl: "Betaald" },
  "inv.open": { de: "Offen", en: "Open", es: "Abierto", nl: "Open" },
  "inv.draft": { de: "Entwurf", en: "Draft", es: "Borrador", nl: "Concept" },
  "inv.base_fee": { de: "Grundgebühr:", en: "Base fee:", es: "Tarifa base:", nl: "Basistarief:" },
  "meter.no_meter": { de: "Kein Zähler zugeordnet", en: "No meter assigned", es: "No hay contador asignado", nl: "Geen meter toegewezen" },
  "meter.contact_landlord": { de: "Bitte wenden Sie sich an Ihren Vermieter.", en: "Please contact your landlord.", es: "Por favor, póngase en contacto con su arrendador.", nl: "Neem contact op met uw verhuurder." },
  "meter.reading": { de: "Zählerstand", en: "Meter reading", es: "Lectura del contador", nl: "Meterstand" },
  "meter.monthly": { de: "Monatliche Verbräuche", en: "Monthly consumption", es: "Consumos mensuales", nl: "Maandelijks verbruik" },
  "meter.no_data": { de: "Noch keine Verbrauchsdaten verfügbar", en: "No consumption data available yet", es: "Aún no hay datos de consumo disponibles", nl: "Nog geen verbruiksgegevens beschikbaar" },
  "meter.reading_label": { de: "Zählerstand:", en: "Meter reading:", es: "Lectura del contador:", nl: "Meterstand:" },
  "tariff.title": { de: "Meine Tarife", en: "My tariffs", es: "Mis tarifas", nl: "Mijn tarieven" },
  "tariff.add": { de: "Tarif anlegen", en: "Add tariff", es: "Añadir tarifa", nl: "Tarief toevoegen" },
  "tariff.mieterstrom_info": { de: "Ihr Vermieter hat einen Mieterstrom-Tarif für Sie hinterlegt.", en: "Your landlord has set up a tenant electricity tariff for you.", es: "Su arrendador ha depositado una tarifa de electricidad para inquilinos para usted.", nl: "Uw verhuurder heeft een Mieterstrom-tarief voor u ingesteld." },
  "tariff.none_needed": { de: "Keine selbstverwalteten Tarife nötig", en: "No self-managed tariffs needed", es: "No se necesitan tarifas autogestionadas", nl: "Geen zelfbeheerde tarieven nodig" },
  "tariff.landlord_manages": { de: "Ihr Vermieter verwaltet alle Tarife für Sie.", en: "Your landlord manages all tariffs for you.", es: "Su arrendador gestiona todas las tarifas por usted.", nl: "Uw verhuurder beheert alle tarieven voor u." },
  "tariff.edit": { de: "Tarif bearbeiten", en: "Edit tariff", es: "Editar tarifa", nl: "Tarief bewerken" },
  "tariff.new": { de: "Neuer Tarif", en: "New tariff", es: "Nueva tarifa", nl: "Nieuw tarief" },
  "tariff.energy_type": { de: "Energieart", en: "Energy type", es: "Tipo de energía", nl: "Energietype" },
  "tariff.provider": { de: "Anbieter (optional)", en: "Provider (optional)", es: "Proveedor (opcional)", nl: "Aanbieder (optioneel)" },
  "tariff.provider_placeholder": { de: "z.B. Stadtwerke...", en: "e.g. Utility company...", es: "p. ej. Stadtwerke...", nl: "bijv. Stadtwerke..." },
  "tariff.price_per": { de: "Preis pro", en: "Price per", es: "Precio por", nl: "Prijs per" },
  "tariff.base_fee_monthly": { de: "Grundgebühr/Monat (€)", en: "Base fee/month (€)", es: "Tarifa base/mes (€)", nl: "Basistarief/maand (€)" },
  "tariff.valid_from": { de: "Gültig ab", en: "Valid from", es: "Válido desde", nl: "Geldig vanaf" },
  "tariff.valid_until": { de: "Gültig bis (optional)", en: "Valid until (optional)", es: "Válido hasta (opcional)", nl: "Geldig tot (optioneel)" },
  "tariff.save": { de: "Speichern", en: "Save", es: "Guardar", nl: "Opslaan" },
  "tariff.create": { de: "Anlegen", en: "Create", es: "Crear", nl: "Aanmaken" },
  "tariff.cancel": { de: "Abbrechen", en: "Cancel", es: "Cancelar", nl: "Annuleren" },
  "tariff.save_error": { de: "Fehler beim Speichern", en: "Error saving", es: "Error al guardar", nl: "Fout bij opslaan" },
  "tariff.updated": { de: "Tarif aktualisiert", en: "Tariff updated", es: "Tarifa actualizada", nl: "Tarief bijgewerkt" },
  "tariff.saved": { de: "Tarif gespeichert", en: "Tariff saved", es: "Tarifa guardada", nl: "Tarief opgeslagen" },
  "tariff.delete_error": { de: "Fehler beim Löschen", en: "Error deleting", es: "Error al eliminar", nl: "Fout bij verwijderen" },
  "tariff.deleted": { de: "Tarif gelöscht", en: "Tariff deleted", es: "Tarifa eliminada", nl: "Tarief verwijderd" },
  "tariff.from": { de: "ab", en: "from", es: "desde", nl: "vanaf" },
  "tariff.until": { de: "bis", en: "until", es: "hasta", nl: "tot" },
  "notlinked.title": { de: "Kein Mietverhältnis gefunden", en: "No tenancy found", es: "No se encontró ningún contrato de alquiler", nl: "Geen huurovereenkomst gevonden" },
  "notlinked.message": { de: "wurde kein aktives Mietverhältnis gefunden. Bitte wenden Sie sich an Ihren Vermieter, damit Ihr Konto verknüpft wird.", en: "no active tenancy was found. Please contact your landlord to link your account.", es: "no se encontró ningún contrato de alquiler activo. Póngase en contacto con su arrendador para vincular su cuenta.", nl: "geen actieve huurovereenkomst gevonden. Neem contact op met uw verhuurder om uw account te koppelen." },
  "loading.data": { de: "Daten werden geladen…", en: "Loading data…", es: "Cargando datos…", nl: "Gegevens worden geladen…" },
  "nav.overview": { de: "Übersicht", en: "Overview", es: "Resumen", nl: "Overzicht" },
  "nav.meters": { de: "Zähler", en: "Meters", es: "Contadores", nl: "Meters" },
  "nav.tariffs": { de: "Tarife", en: "Tariffs", es: "Tarifas", nl: "Tarieven" },
  "nav.invoices": { de: "Rechnungen", en: "Invoices", es: "Facturas", nl: "Facturen" },
  "menu.language": { de: "Sprache", en: "Language", es: "Idioma", nl: "Taal" },
  "menu.theme": { de: "Design", en: "Theme", es: "Tema", nl: "Thema" },
  "menu.light": { de: "Hell", en: "Light", es: "Claro", nl: "Licht" },
  "menu.dark": { de: "Dunkel", en: "Dark", es: "Oscuro", nl: "Donker" },
  "menu.system": { de: "System", en: "System", es: "Sistema", nl: "Systeem" },
  "energy.strom": { de: "Strom", en: "Electricity", es: "Electricidad", nl: "Stroom" },
  "energy.gas": { de: "Gas", en: "Gas", es: "Gas", nl: "Gas" },
  "energy.waerme": { de: "Wärme", en: "Heat", es: "Calor", nl: "Warmte" },
  "energy.wasser": { de: "Wasser", en: "Water", es: "Agua", nl: "Water" },
  app_name: { de: "Mein Strom", en: "My Energy", es: "Mi Electricidad", nl: "Mijn Stroom" },
};

export const tenantTranslations = t;

export function createTenantT(lang: TenantLang) {
  return (key: string): string => {
    const entry = t[key];
    if (!entry) return key;
    return entry[lang] || entry.de || key;
  };
}

export function fmtEnergyTypeLocalized(type: string, lang: TenantLang): string {
  const key = `energy.${type}`;
  const entry = t[key];
  if (entry) return entry[lang] || entry.de || type.charAt(0).toUpperCase() + type.slice(1);
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getDateLocale(lang: TenantLang) {
  switch (lang) {
    case "en": return undefined; // date-fns default is English
    case "es": return "es";
    case "nl": return "nl";
    default: return "de";
  }
}
