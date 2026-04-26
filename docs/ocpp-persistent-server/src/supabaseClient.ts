// Direkter Datenbankzugriff ist in Lovable Cloud nicht möglich, weil der interne
// Service-Schlüssel nicht angezeigt wird. Der persistente Hetzner-Server nutzt
// stattdessen src/backendApi.ts und ruft eine begrenzte Backend-Funktion auf.
export const supabase = null as never;
