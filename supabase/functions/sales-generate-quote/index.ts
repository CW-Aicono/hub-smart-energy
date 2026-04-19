import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { getCorsHeaders } from "../_shared/cors.ts";

interface ModuleSelection {
  module_code: string;
  preis_monatlich: number;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { project_id, modules, notes } = await req.json() as {
      project_id: string;
      modules: ModuleSelection[];
      notes?: string;
    };
    if (!project_id || !Array.isArray(modules)) {
      return new Response(JSON.stringify({ error: "project_id + modules required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load project + hierarchy
    const { data: project, error: pErr } = await supabase
      .from("sales_projects")
      .select("*")
      .eq("id", project_id)
      .maybeSingle();
    if (pErr || !project) throw new Error("Projekt nicht gefunden");

    const { data: dists } = await supabase
      .from("sales_distributions")
      .select("id, name, typ, standort")
      .eq("project_id", project_id)
      .order("created_at");

    const distIds = (dists ?? []).map((d) => d.id);
    const { data: points } = distIds.length
      ? await supabase
          .from("sales_measurement_points")
          .select("id, distribution_id, bezeichnung, energieart, phasen, strombereich_a, anwendungsfall, bestand")
          .in("distribution_id", distIds)
      : { data: [] };

    const pointIds = (points ?? []).map((p) => p.id);
    const { data: recs } = pointIds.length
      ? await supabase
          .from("sales_recommended_devices")
          .select("id, measurement_point_id, device_catalog_id, menge, ist_alternativ, source, begruendung")
          .in("measurement_point_id", pointIds)
          .eq("ist_alternativ", false)
      : { data: [] };

    const deviceIds = Array.from(new Set((recs ?? []).map((r) => r.device_catalog_id)));
    const { data: devices } = deviceIds.length
      ? await supabase
          .from("device_catalog")
          .select("id, hersteller, modell, vk_preis, installations_pauschale")
          .in("id", deviceIds)
      : { data: [] };
    const devMap = new Map((devices ?? []).map((d) => [d.id, d]));

    // Sums
    let geraeteSumme = 0;
    let installationSumme = 0;
    const rows: Array<{ name: string; menge: number; ek: number; inst: number }> = [];
    for (const r of recs ?? []) {
      const d = devMap.get(r.device_catalog_id);
      if (!d) continue;
      const lineGeraete = Number(d.vk_preis) * r.menge;
      const lineInst = Number(d.installations_pauschale) * r.menge;
      geraeteSumme += lineGeraete;
      installationSumme += lineInst;
      rows.push({
        name: `${d.hersteller} ${d.modell}`,
        menge: r.menge,
        ek: Number(d.vk_preis),
        inst: Number(d.installations_pauschale),
      });
    }
    const modulSumme = modules.reduce((s, m) => s + Number(m.preis_monatlich), 0);
    const totalEinmalig = geraeteSumme + installationSumme;

    // Next version
    const { data: existing } = await supabase
      .from("sales_quotes")
      .select("version")
      .eq("project_id", project_id)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (existing?.[0]?.version ?? 0) + 1;

    // PDF
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18);
    doc.text("AICONO Smart Energy – Angebot", 14, y);
    y += 8;
    doc.setFontSize(10);
    doc.text(`Version ${nextVersion} · ${new Date().toLocaleDateString("de-DE")}`, 14, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Kunde", 14, y); y += 6;
    doc.setFontSize(10);
    doc.text(project.kunde_name, 14, y); y += 5;
    if (project.kontakt_name) { doc.text(project.kontakt_name, 14, y); y += 5; }
    if (project.adresse) {
      project.adresse.split("\n").forEach((line: string) => { doc.text(line, 14, y); y += 5; });
    }
    y += 5;

    // Hardware table
    doc.setFontSize(12);
    doc.text("Messgeräte (einmalig)", 14, y); y += 6;
    doc.setFontSize(9);
    doc.text("Gerät", 14, y);
    doc.text("Menge", 110, y);
    doc.text("Stück", 130, y);
    doc.text("Inst.", 155, y);
    doc.text("Summe", 180, y);
    y += 2; doc.line(14, y, 196, y); y += 5;
    for (const r of rows) {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.text(r.name.substring(0, 50), 14, y);
      doc.text(String(r.menge), 110, y);
      doc.text(`${r.ek.toFixed(2)} €`, 130, y);
      doc.text(`${r.inst.toFixed(2)} €`, 155, y);
      doc.text(`${((r.ek + r.inst) * r.menge).toFixed(2)} €`, 180, y);
      y += 5;
    }
    y += 3; doc.line(14, y, 196, y); y += 6;
    doc.setFontSize(10);
    doc.text(`Geräte gesamt: ${geraeteSumme.toFixed(2)} €`, 130, y); y += 5;
    doc.text(`Installation gesamt: ${installationSumme.toFixed(2)} €`, 130, y); y += 5;
    doc.setFontSize(11);
    doc.text(`Einmalig gesamt: ${totalEinmalig.toFixed(2)} €`, 130, y); y += 10;

    // Modules
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text("Software-Module (monatlich)", 14, y); y += 6;
    doc.setFontSize(9);
    doc.text("Modul", 14, y);
    doc.text("Preis/Monat", 160, y);
    y += 2; doc.line(14, y, 196, y); y += 5;
    for (const m of modules) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(m.module_code, 14, y);
      doc.text(`${Number(m.preis_monatlich).toFixed(2)} €`, 160, y);
      y += 5;
    }
    y += 3; doc.line(14, y, 196, y); y += 6;
    doc.setFontSize(11);
    doc.text(`Module gesamt: ${modulSumme.toFixed(2)} € / Monat`, 130, y); y += 10;

    if (notes) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.text("Hinweise:", 14, y); y += 5;
      const lines = doc.splitTextToSize(notes, 180);
      doc.text(lines, 14, y);
    }

    const pdfBytes = doc.output("arraybuffer");
    const path = `${project_id}/v${nextVersion}_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("sales-quotes")
      .upload(path, new Uint8Array(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw upErr;

    // Insert quote + modules
    const { data: quote, error: qErr } = await supabase
      .from("sales_quotes")
      .insert({
        project_id,
        version: nextVersion,
        geraete_summe: geraeteSumme,
        installation_summe: installationSumme,
        total_einmalig: totalEinmalig,
        modul_summe_monatlich: modulSumme,
        pdf_storage_path: path,
      })
      .select("id, version")
      .single();
    if (qErr) throw qErr;

    if (modules.length > 0) {
      await supabase.from("sales_quote_modules").insert(
        modules.map((m) => ({
          quote_id: quote.id,
          module_code: m.module_code,
          preis_monatlich: m.preis_monatlich,
        })),
      );
    }

    return new Response(JSON.stringify({
      quote_id: quote.id,
      version: quote.version,
      pdf_path: path,
      totals: { geraeteSumme, installationSumme, totalEinmalig, modulSumme },
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[sales-generate-quote]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
