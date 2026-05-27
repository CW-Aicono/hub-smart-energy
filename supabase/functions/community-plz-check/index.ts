import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Vereinfachtes PLZ → VNB Mapping (3-stelliger PLZ-Präfix).
// Open-Data Auszug der größten dt. Verteilnetzbetreiber.
// Hinweis: Liste ist unvollständig — bei Bedarf ergänzen.
const PLZ_VNB_MAP: Record<string, { vnb: string; region: string }> = {
  // Niedersachsen / Westfalen
  "490": { vnb: "Westnetz GmbH", region: "Osnabrück/Münsterland" },
  "491": { vnb: "Westnetz GmbH", region: "Osnabrück" },
  "492": { vnb: "Westnetz GmbH", region: "Lingen" },
  "495": { vnb: "EWE Netz GmbH", region: "Cloppenburg" },
  "260": { vnb: "EWE Netz GmbH", region: "Oldenburg" },
  "261": { vnb: "EWE Netz GmbH", region: "Wilhelmshaven" },
  "263": { vnb: "EWE Netz GmbH", region: "Leer" },
  "275": { vnb: "EWE Netz GmbH", region: "Bremerhaven" },
  // Berlin / Brandenburg
  "100": { vnb: "Stromnetz Berlin GmbH", region: "Berlin-Mitte" },
  "101": { vnb: "Stromnetz Berlin GmbH", region: "Berlin" },
  "120": { vnb: "Stromnetz Berlin GmbH", region: "Berlin" },
  "144": { vnb: "E.DIS Netz GmbH", region: "Brandenburg" },
  // Hamburg
  "200": { vnb: "Stromnetz Hamburg GmbH", region: "Hamburg-Mitte" },
  "201": { vnb: "Stromnetz Hamburg GmbH", region: "Hamburg" },
  "220": { vnb: "Stromnetz Hamburg GmbH", region: "Hamburg" },
  // NRW (Rheinland)
  "400": { vnb: "Westnetz GmbH", region: "Düsseldorf" },
  "405": { vnb: "Netze Duisburg GmbH", region: "Duisburg" },
  "440": { vnb: "Westnetz GmbH", region: "Dortmund" },
  "450": { vnb: "Westnetz GmbH", region: "Essen" },
  "509": { vnb: "Rheinische NETZGesellschaft", region: "Köln" },
  "508": { vnb: "Rheinische NETZGesellschaft", region: "Köln" },
  // Hessen
  "603": { vnb: "Süwag Netz GmbH", region: "Frankfurt" },
  "604": { vnb: "Süwag Netz GmbH", region: "Frankfurt" },
  // Baden-Württemberg
  "700": { vnb: "Netze BW GmbH", region: "Stuttgart" },
  "701": { vnb: "Netze BW GmbH", region: "Stuttgart" },
  "703": { vnb: "Netze BW GmbH", region: "Stuttgart" },
  "760": { vnb: "Netze BW GmbH", region: "Karlsruhe" },
  "780": { vnb: "Netze BW GmbH", region: "Freiburg" },
  // Bayern
  "800": { vnb: "Stadtwerke München", region: "München" },
  "803": { vnb: "Stadtwerke München", region: "München" },
  "857": { vnb: "Bayernwerk Netz GmbH", region: "Oberbayern" },
  "904": { vnb: "Bayernwerk Netz GmbH", region: "Nürnberg" },
  // Sachsen
  "010": { vnb: "MITNETZ STROM mbH", region: "Dresden" },
  "012": { vnb: "MITNETZ STROM mbH", region: "Dresden" },
  "041": { vnb: "Stadtwerke Leipzig Netz", region: "Leipzig" },
  // Thüringen
  "070": { vnb: "TEN Thüringer Energienetze", region: "Jena" },
  // Sachsen-Anhalt
  "061": { vnb: "Avacon Netz GmbH", region: "Halle" },
  "390": { vnb: "Avacon Netz GmbH", region: "Magdeburg" },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const plzRaw = String(body?.plz ?? '').trim();
    if (!/^\d{5}$/.test(plzRaw)) {
      return new Response(
        JSON.stringify({ error: 'PLZ muss aus genau 5 Ziffern bestehen' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prefix = plzRaw.slice(0, 3);
    const hit = PLZ_VNB_MAP[prefix];

    return new Response(
      JSON.stringify({
        plz: plzRaw,
        vnb: hit?.vnb ?? null,
        region: hit?.region ?? null,
        fallback: !hit,
        hint: hit ? null : 'Kein VNB im Open-Data-Mapping gefunden — bitte manuell ergänzen.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
