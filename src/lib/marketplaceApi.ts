const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const FN = `${SUPABASE_URL}/functions/v1/community-marketplace-public`;

const headers = {
  "Content-Type": "application/json",
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

export interface PublicListingRow {
  slug: string;
  title: string;
  short_description: string | null;
  hero_image_url: string | null;
  region_plz: string | null;
  region_city: string | null;
  price_ct_kwh: number;
  feed_in_ct_kwh: number;
  max_members: number | null;
  current_members: number;
  total_capacity_kw: number;
  created_at: string;
}

export interface PublicListingDetail extends PublicListingRow {
  community_id: string;
  long_description: string | null;
  contact_email: string | null;
}

export async function fetchPublicListings(plz?: string): Promise<PublicListingRow[]> {
  const url = new URL(`${FN}/listings`);
  if (plz) url.searchParams.set("plz", plz);
  const r = await fetch(url.toString(), { headers });
  if (!r.ok) throw new Error(`Marktplatz konnte nicht geladen werden (${r.status})`);
  const body = await r.json();
  return body.listings ?? [];
}

export async function fetchPublicListingDetail(slug: string): Promise<PublicListingDetail> {
  const r = await fetch(`${FN}/listings/${encodeURIComponent(slug)}`, { headers });
  if (r.status === 404) throw new Error("Angebot nicht gefunden");
  if (!r.ok) throw new Error(`Fehler ${r.status}`);
  const body = await r.json();
  if (!body.listing) throw new Error("Angebot nicht gefunden");
  return body.listing;
}


export async function submitJoinRequest(payload: {
  slug: string;
  name: string;
  email: string;
  phone?: string;
  message?: string;
}): Promise<void> {
  const r = await fetch(`${FN}/join-request`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `Fehler ${r.status}`);
  }
}
