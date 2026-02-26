export type TenantLang = "de" | "en" | "pl" | "fr";

type TenantTranslations = Record<string, Record<TenantLang, string>>;

const t: TenantTranslations = {
  // App name
  app_name: { de: "Mein Strom", en: "My Energy", pl: "Moja Energia", fr: "Mon Énergie" },

  // Auth
  "auth.login": { de: "Anmelden", en: "Sign in", pl: "Zaloguj się", fr: "Se connecter" },
  "auth.register": { de: "Registrieren", en: "Register", pl: "Zarejestruj się", fr: "S'inscrire" },
  "auth.create_account": { de: "Konto erstellen", en: "Create account", pl: "Utwórz konto", fr: "Créer un compte" },
  "auth.reset_password": { de: "Passwort zurücksetzen", en: "Reset password", pl: "Zresetuj hasło", fr: "Réinitialiser le mot de passe" },
  "auth.email": { de: "E-Mail", en: "Email", pl: "E-mail", fr: "E-mail" },
  "auth.password": { de: "Passwort", en: "Password", pl: "Hasło", fr: "Mot de passe" },
  "auth.name": { de: "Name", en: "Name", pl: "Imię", fr: "Nom" },
  "auth.name_placeholder": { de: "Max Mustermann", en: "John Doe", pl: "Jan Kowalski", fr: "Jean Dupont" },
  "auth.send_link": { de: "Link senden", en: "Send link", pl: "Wyślij link", fr: "Envoyer le lien" },
  "auth.back_to_login": { de: "Zurück zum Login", en: "Back to login", pl: "Powrót do logowania", fr: "Retour à la connexion" },
  "auth.forgot_password": { de: "Passwort vergessen?", en: "Forgot password?", pl: "Zapomniałeś hasła?", fr: "Mot de passe oublié ?" },
  "auth.no_account": { de: "Noch kein Konto?", en: "No account yet?", pl: "Nie masz konta?", fr: "Pas encore de compte ?" },
  "auth.already_registered": { de: "Bereits registriert?", en: "Already registered?", pl: "Już zarejestrowany?", fr: "Déjà inscrit ?" },
  "auth.invalid_credentials": { de: "Ungültige Zugangsdaten", en: "Invalid credentials", pl: "Nieprawidłowe dane logowania", fr: "Identifiants invalides" },
  "auth.password_min": { de: "Passwort muss mindestens 6 Zeichen haben", en: "Password must be at least 6 characters", pl: "Hasło musi mieć co najmniej 6 znaków", fr: "Le mot de passe doit contenir au moins 6 caractères" },
  "auth.email_exists": { de: "E-Mail bereits registriert", en: "Email already registered", pl: "E-mail już zarejestrowany", fr: "E-mail déjà enregistré" },
  "auth.register_success": { de: "Registrierung erfolgreich! Bitte E-Mail bestätigen.", en: "Registration successful! Please confirm your email.", pl: "Rejestracja udana! Potwierdź swój e-mail.", fr: "Inscription réussie ! Veuillez confirmer votre e-mail." },
  "auth.enter_email": { de: "Bitte E-Mail eingeben", en: "Please enter your email", pl: "Proszę podać e-mail", fr: "Veuillez entrer votre e-mail" },
  "auth.send_error": { de: "Fehler beim Senden", en: "Error sending", pl: "Błąd wysyłania", fr: "Erreur d'envoi" },
  "auth.reset_sent": { de: "Rücksetz-Link gesendet!", en: "Reset link sent!", pl: "Link resetujący wysłany!", fr: "Lien de réinitialisation envoyé !" },
  "auth.logout": { de: "Abmelden", en: "Sign out", pl: "Wyloguj", fr: "Se déconnecter" },

  // Dashboard
  "dash.welcome": { de: "Willkommen,", en: "Welcome,", pl: "Witaj,", fr: "Bienvenue," },
  "dash.avg_month": { de: "Ø Monat", en: "Ø Month", pl: "Ø Miesiąc", fr: "Ø Mois" },
  "dash.total": { de: "Gesamt", en: "Total", pl: "Łącznie", fr: "Total" },
  "dash.estimated": { de: "Geschätzt", en: "Estimated", pl: "Szacowane", fr: "Estimé" },
  "dash.by_energy_type": { de: "Verbrauch nach Energieträger", en: "Consumption by energy type", pl: "Zużycie wg rodzaju energii", fr: "Consommation par type d'énergie" },
  "dash.latest_invoice": { de: "Letzte Abrechnung", en: "Latest invoice", pl: "Ostatni rachunek", fr: "Dernière facture" },
  "dash.local_pv": { de: "Lokal (PV)", en: "Local (PV)", pl: "Lokalny (PV)", fr: "Local (PV)" },
  "dash.grid": { de: "Netz", en: "Grid", pl: "Sieć", fr: "Réseau" },
  "dash.amount": { de: "Betrag", en: "Amount", pl: "Kwota", fr: "Montant" },
  "dash.consumption_chart": { de: "Verbrauchsverlauf", en: "Consumption history", pl: "Historia zużycia", fr: "Historique de consommation" },
  "dash.no_data": { de: "Noch keine Verbrauchsdaten verfügbar", en: "No consumption data available yet", pl: "Brak danych o zużyciu", fr: "Aucune donnée de consommation disponible" },

  // Invoices
  "inv.title": { de: "Abrechnungen", en: "Invoices", pl: "Rachunki", fr: "Factures" },
  "inv.none": { de: "Noch keine Abrechnungen vorhanden", en: "No invoices yet", pl: "Brak rachunków", fr: "Aucune facture" },
  "inv.paid": { de: "Bezahlt", en: "Paid", pl: "Opłacony", fr: "Payé" },
  "inv.open": { de: "Offen", en: "Open", pl: "Otwarty", fr: "Ouvert" },
  "inv.draft": { de: "Entwurf", en: "Draft", pl: "Szkic", fr: "Brouillon" },
  "inv.base_fee": { de: "Grundgebühr:", en: "Base fee:", pl: "Opłata stała:", fr: "Frais de base :" },

  // Meter
  "meter.no_meter": { de: "Kein Zähler zugeordnet", en: "No meter assigned", pl: "Brak przypisanego licznika", fr: "Aucun compteur attribué" },
  "meter.contact_landlord": { de: "Bitte wenden Sie sich an Ihren Vermieter.", en: "Please contact your landlord.", pl: "Skontaktuj się z wynajmującym.", fr: "Veuillez contacter votre propriétaire." },
  "meter.reading": { de: "Zählerstand", en: "Meter reading", pl: "Stan licznika", fr: "Relevé du compteur" },
  "meter.monthly": { de: "Monatliche Verbräuche", en: "Monthly consumption", pl: "Miesięczne zużycie", fr: "Consommation mensuelle" },
  "meter.no_data": { de: "Noch keine Verbrauchsdaten verfügbar", en: "No consumption data available yet", pl: "Brak danych o zużyciu", fr: "Aucune donnée de consommation disponible" },
  "meter.reading_label": { de: "Zählerstand:", en: "Meter reading:", pl: "Stan licznika:", fr: "Relevé :" },

  // Tariffs
  "tariff.title": { de: "Meine Tarife", en: "My tariffs", pl: "Moje taryfy", fr: "Mes tarifs" },
  "tariff.add": { de: "Tarif anlegen", en: "Add tariff", pl: "Dodaj taryfę", fr: "Ajouter un tarif" },
  "tariff.mieterstrom_info": { de: "Ihr Vermieter hat einen Mieterstrom-Tarif für Sie hinterlegt.", en: "Your landlord has set up a tenant electricity tariff for you.", pl: "Twój wynajmujący ustawił dla Ciebie taryfę.", fr: "Votre propriétaire a configuré un tarif pour vous." },
  "tariff.none_needed": { de: "Keine selbstverwalteten Tarife nötig", en: "No self-managed tariffs needed", pl: "Nie wymagane własne taryfy", fr: "Aucun tarif autogéré nécessaire" },
  "tariff.landlord_manages": { de: "Ihr Vermieter verwaltet alle Tarife für Sie.", en: "Your landlord manages all tariffs for you.", pl: "Twój wynajmujący zarządza taryfami.", fr: "Votre propriétaire gère tous les tarifs." },
  "tariff.edit": { de: "Tarif bearbeiten", en: "Edit tariff", pl: "Edytuj taryfę", fr: "Modifier le tarif" },
  "tariff.new": { de: "Neuer Tarif", en: "New tariff", pl: "Nowa taryfa", fr: "Nouveau tarif" },
  "tariff.energy_type": { de: "Energieart", en: "Energy type", pl: "Rodzaj energii", fr: "Type d'énergie" },
  "tariff.provider": { de: "Anbieter (optional)", en: "Provider (optional)", pl: "Dostawca (opcjonalnie)", fr: "Fournisseur (optionnel)" },
  "tariff.provider_placeholder": { de: "z.B. Stadtwerke...", en: "e.g. Utility company...", pl: "np. Zakład energetyczny...", fr: "ex. Fournisseur d'énergie..." },
  "tariff.price_per": { de: "Preis pro", en: "Price per", pl: "Cena za", fr: "Prix par" },
  "tariff.base_fee_monthly": { de: "Grundgebühr/Monat (€)", en: "Base fee/month (€)", pl: "Opłata stała/miesiąc (€)", fr: "Frais de base/mois (€)" },
  "tariff.valid_from": { de: "Gültig ab", en: "Valid from", pl: "Ważny od", fr: "Valide à partir du" },
  "tariff.valid_until": { de: "Gültig bis (optional)", en: "Valid until (optional)", pl: "Ważny do (opcjonalnie)", fr: "Valide jusqu'au (optionnel)" },
  "tariff.save": { de: "Speichern", en: "Save", pl: "Zapisz", fr: "Enregistrer" },
  "tariff.create": { de: "Anlegen", en: "Create", pl: "Utwórz", fr: "Créer" },
  "tariff.cancel": { de: "Abbrechen", en: "Cancel", pl: "Anuluj", fr: "Annuler" },
  "tariff.save_error": { de: "Fehler beim Speichern", en: "Error saving", pl: "Błąd zapisu", fr: "Erreur d'enregistrement" },
  "tariff.updated": { de: "Tarif aktualisiert", en: "Tariff updated", pl: "Taryfa zaktualizowana", fr: "Tarif mis à jour" },
  "tariff.saved": { de: "Tarif gespeichert", en: "Tariff saved", pl: "Taryfa zapisana", fr: "Tarif enregistré" },
  "tariff.delete_error": { de: "Fehler beim Löschen", en: "Error deleting", pl: "Błąd usuwania", fr: "Erreur de suppression" },
  "tariff.deleted": { de: "Tarif gelöscht", en: "Tariff deleted", pl: "Taryfa usunięta", fr: "Tarif supprimé" },
  "tariff.from": { de: "ab", en: "from", pl: "od", fr: "à partir du" },
  "tariff.until": { de: "bis", en: "until", pl: "do", fr: "jusqu'au" },

  // Not linked
  "notlinked.title": { de: "Kein Mietverhältnis gefunden", en: "No tenancy found", pl: "Nie znaleziono najmu", fr: "Aucun bail trouvé" },
  "notlinked.message": { de: "wurde kein aktives Mietverhältnis gefunden. Bitte wenden Sie sich an Ihren Vermieter, damit Ihr Konto verknüpft wird.", en: "no active tenancy was found. Please contact your landlord to link your account.", pl: "nie znaleziono aktywnego najmu. Skontaktuj się z wynajmującym, aby powiązać konto.", fr: "aucun bail actif n'a été trouvé. Veuillez contacter votre propriétaire pour lier votre compte." },

  // Loading
  "loading.data": { de: "Daten werden geladen…", en: "Loading data…", pl: "Ładowanie danych…", fr: "Chargement des données…" },

  // Bottom nav
  "nav.overview": { de: "Übersicht", en: "Overview", pl: "Przegląd", fr: "Aperçu" },
  "nav.meters": { de: "Zähler", en: "Meters", pl: "Liczniki", fr: "Compteurs" },
  "nav.tariffs": { de: "Tarife", en: "Tariffs", pl: "Taryfy", fr: "Tarifs" },
  "nav.invoices": { de: "Rechnungen", en: "Invoices", pl: "Rachunki", fr: "Factures" },

  // User menu
  "menu.language": { de: "Sprache", en: "Language", pl: "Język", fr: "Langue" },
  "menu.theme": { de: "Design", en: "Theme", pl: "Motyw", fr: "Thème" },
  "menu.light": { de: "Hell", en: "Light", pl: "Jasny", fr: "Clair" },
  "menu.dark": { de: "Dunkel", en: "Dark", pl: "Ciemny", fr: "Sombre" },
  "menu.system": { de: "System", en: "System", pl: "System", fr: "Système" },

  // Energy type labels
  "energy.strom": { de: "Strom", en: "Electricity", pl: "Prąd", fr: "Électricité" },
  "energy.gas": { de: "Gas", en: "Gas", pl: "Gaz", fr: "Gaz" },
  "energy.waerme": { de: "Wärme", en: "Heat", pl: "Ciepło", fr: "Chaleur" },
  "energy.wasser": { de: "Wasser", en: "Water", pl: "Woda", fr: "Eau" },
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
    case "pl": return "pl";
    case "fr": return "fr";
    default: return "de";
  }
}
