import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * Sicherer Mini-Evaluator für Mengen-Formeln.
 * Erlaubt: Zahlen, +, -, *, /, (, ), ceil(), floor(), round(), max(), min(),
 * Variable: source.menge
 * Kein eval(), kein Function-Constructor.
 */
function evalQuantity(formula: string, sourceMenge: number): number {
  const expr = formula.trim();
  if (!/^[\d\s+\-*/().,a-zA-Z_]+$/.test(expr)) return 1;

  // Tokenize
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let n = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) { n += expr[i++]; }
      tokens.push(n);
    } else if (/[a-zA-Z_]/.test(c)) {
      let id = "";
      while (i < expr.length && /[a-zA-Z_.]/.test(expr[i])) { id += expr[i++]; }
      tokens.push(id);
    } else if ("+-*/(),".includes(c)) {
      tokens.push(c);
      i++;
    } else {
      return 1;
    }
  }

  // Recursive descent parser
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (t?: string) => {
    if (t && tokens[pos] !== t) throw new Error("expected " + t);
    return tokens[pos++];
  };

  const fns: Record<string, (...a: number[]) => number> = {
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    max: Math.max,
    min: Math.min,
  };

  function parseExpr(): number { return parseAddSub(); }
  function parseAddSub(): number {
    let v = parseMulDiv();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const r = parseMulDiv();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function parseMulDiv(): number {
    let v = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const r = parseUnary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function parseUnary(): number {
    if (peek() === "-") { eat(); return -parseUnary(); }
    if (peek() === "+") { eat(); return parseUnary(); }
    return parseAtom();
  }
  function parseAtom(): number {
    const t = peek();
    if (t === "(") {
      eat("(");
      const v = parseExpr();
      eat(")");
      return v;
    }
    if (/^[0-9.]+$/.test(t)) {
      eat();
      return parseFloat(t);
    }
    // Identifier or function or var
    eat();
    if (peek() === "(") {
      eat("(");
      const args: number[] = [];
      if (peek() !== ")") {
        args.push(parseExpr());
        while (peek() === ",") { eat(","); args.push(parseExpr()); }
      }
      eat(")");
      const fn = fns[t];
      if (!fn) return 1;
      return fn(...args);
    }
    if (t === "source.menge") return sourceMenge;
    return 1;
  }

  try {
    const result = parseExpr();
    if (!isFinite(result) || result < 0) return 1;
    return Math.max(1, Math.round(result));
  } catch {
    return 1;
  }
}

interface SuggestionItem {
  device_catalog_id: string;
  hersteller: string;
  modell: string;
  vk_preis: number;
  installations_pauschale: number;
  geraete_klasse: string;
  bild_url: string | null;
  beschreibung: string | null;
  menge: number;
  source_recommendation_id: string;
  source_device_name: string;
  notiz: string | null;
  prio: number;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { project_id, measurement_point_id } = await req.json() as {
      project_id?: string;
      measurement_point_id?: string;
    };
    if (!project_id && !measurement_point_id) {
      return new Response(JSON.stringify({ error: "project_id or measurement_point_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Resolve scope -> measurement_point_ids
    let pointIds: string[] = [];
    if (measurement_point_id) {
      pointIds = [measurement_point_id];
    } else {
      const { data: dists } = await supabase
        .from("sales_distributions").select("id").eq("project_id", project_id!);
      const distIds = (dists ?? []).map((d) => d.id);
      if (distIds.length === 0) {
        return new Response(JSON.stringify({ required: [], recommended: [] }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const { data: pts } = await supabase
        .from("sales_measurement_points").select("id").in("distribution_id", distIds);
      pointIds = (pts ?? []).map((p) => p.id);
    }
    if (pointIds.length === 0) {
      return new Response(JSON.stringify({ required: [], recommended: [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Aktuelle Hauptgerät-Empfehlungen (parent IS NULL) UND bereits verknüpftes Zubehör
    const { data: allRecs } = await supabase
      .from("sales_recommended_devices")
      .select("id, device_catalog_id, menge, parent_recommendation_id, ist_alternativ")
      .in("measurement_point_id", pointIds)
      .eq("ist_alternativ", false);

    const recs = allRecs ?? [];
    const mainRecs = recs.filter((r) => !r.parent_recommendation_id);
    const childDeviceIds = new Set(
      recs.filter((r) => r.parent_recommendation_id).map((r) => r.device_catalog_id),
    );

    if (mainRecs.length === 0) {
      return new Response(JSON.stringify({ required: [], recommended: [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const mainDeviceIds = Array.from(new Set(mainRecs.map((r) => r.device_catalog_id)));

    // Compatibility-Regeln + Quell-Geräte-Namen laden
    const [compatRes, sourceCatRes] = await Promise.all([
      supabase
        .from("device_compatibility")
        .select("source_device_id, target_device_id, relation_type, auto_quantity_formula, prio, notiz")
        .in("source_device_id", mainDeviceIds),
      supabase
        .from("device_catalog")
        .select("id, hersteller, modell")
        .in("id", mainDeviceIds),
    ]);

    const compats = compatRes.data ?? [];
    const sourceMap = new Map((sourceCatRes.data ?? []).map((d) => [d.id, d]));

    if (compats.length === 0) {
      return new Response(JSON.stringify({ required: [], recommended: [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Ziel-Geräte laden
    const targetIds = Array.from(new Set(compats.map((c) => c.target_device_id)));
    const { data: targets } = await supabase
      .from("device_catalog")
      .select("id, hersteller, modell, vk_preis, installations_pauschale, geraete_klasse, bild_url, beschreibung, is_active")
      .in("id", targetIds)
      .eq("is_active", true);
    const targetMap = new Map((targets ?? []).map((t) => [t.id, t]));

    const required: SuggestionItem[] = [];
    const recommended: SuggestionItem[] = [];

    for (const rec of mainRecs) {
      const relevantCompats = compats.filter((c) => c.source_device_id === rec.device_catalog_id);
      for (const c of relevantCompats) {
        const target = targetMap.get(c.target_device_id);
        if (!target) continue;
        const sourceDev = sourceMap.get(rec.device_catalog_id);
        const item: SuggestionItem = {
          device_catalog_id: target.id,
          hersteller: target.hersteller,
          modell: target.modell,
          vk_preis: Number(target.vk_preis),
          installations_pauschale: Number(target.installations_pauschale),
          geraete_klasse: target.geraete_klasse,
          bild_url: target.bild_url,
          beschreibung: target.beschreibung,
          menge: evalQuantity(c.auto_quantity_formula, rec.menge ?? 1),
          source_recommendation_id: rec.id,
          source_device_name: sourceDev ? `${sourceDev.hersteller} ${sourceDev.modell}` : "",
          notiz: c.notiz,
          prio: c.prio,
        };
        if (c.relation_type === "requires") required.push(item);
        else if (c.relation_type === "recommends") {
          // Bereits als Kind oder Hauptgerät vorhanden? → ausblenden
          if (!childDeviceIds.has(target.id) && !mainDeviceIds.includes(target.id)) {
            recommended.push(item);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        required: required.sort((a, b) => a.prio - b.prio),
        recommended: recommended.sort((a, b) => a.prio - b.prio),
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[sales-suggest-accessories]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
