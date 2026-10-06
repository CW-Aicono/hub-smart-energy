import JSZip from "jszip";
import { jsPDF } from "jspdf";
import {
  ALL_SNIPPETS,
  SNIPPET_BY_KEY,
  SNIPPET_GROUPS,
  type LoxoneSnippet,
  type SnippetGroup,
} from "./snippetsCatalog";

function buildQuickGuidePdf(group: SnippetGroup): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 60;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  const addLine = (text: string, size = 10, bold = false, gap = 14) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageWidth - 2 * marginX);
    for (const l of lines) {
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 60;
      }
      doc.text(l, marginX, y);
      y += gap;
    }
  };

  addLine(`AICONO EMS – Loxone Snippets ${group.label}`, 18, true, 26);
  addLine("Kurzanleitung zur Einrichtung", 12, false, 20);
  addLine(
    "Diese Kurzanleitung beschreibt die Einbindung der AICONO-Loxone-Bausteine dieser Gruppe. Nach dem Einspielen erkennt die Cloud die Bausteine automatisch (Discovery) und pusht Regelaenderungen bei Bedarf direkt an den Miniserver.",
    10, false, 14,
  );
  y += 8;
  addLine("Voraussetzungen", 13, true, 18);
  addLine("• Miniserver Firmware ≥ 12.0", 10);
  addLine("• AICONO EMS – Loxone-Integration in der Location aktiv & verbunden", 10);
  addLine("• Loxone Config in aktueller Version", 10);
  y += 8;
  addLine("Import in Loxone Config", 13, true, 18);
  addLine("1. XML-Snippet öffnen und die Baustein-Vorlage in die Programmierung übernehmen.", 10);
  addLine("2. Virtuelle Eingänge exakt wie im Snippet benennen – Discovery matcht auf das Präfix AICO_<TemplateKey>__<Instance>__.", 10);
  addLine("3. Ausgänge mit der jeweiligen Hardware verdrahten.", 10);
  addLine("4. Miniserver speichern & übertragen.", 10);
  addLine("5. In AICONO EMS: Standort -> Karte „Loxone-Templates“ -> Neu scannen. Die Templates erscheinen anschließend mit Instanz-ID und Version.", 10);
  addLine("6. Regel im Automation-Editor anlegen und als Ausführungsort „Loxone lokal“ oder „Hybrid“ auswählen.", 10);

  y += 12;
  addLine("Enthaltene Bausteine", 13, true, 18);
  for (const s of group.snippets) {
    addLine(`${s.title}  (${s.templateKey})`, 11, true, 16);
    addLine(s.description, 9, false, 12);
    for (const p of s.parameters) {
      addLine(`   • ${p.name} [${p.type}] – ${p.description}`, 9, false, 11);
    }
    y += 6;
  }

  addLine("Support", 13, true, 18);
  addLine("Bei Fragen: support@aicono.org – bitte Location-ID und Template-Key angeben.", 10);

  const ab = doc.output("arraybuffer");
  return new Uint8Array(ab);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadGroupPackage(groupKey: string) {
  const group = SNIPPET_GROUPS.find((g) => g.key === groupKey);
  if (!group) return false;
  const zip = new JSZip();
  const folderName = group.zipName.replace(/\.zip$/i, "");
  const folder = zip.folder(folderName)!;
  for (const s of group.snippets) {
    folder.file(s.filename, s.xml);
  }
  folder.file("Kurzanleitung.pdf", buildQuickGuidePdf(group));
  folder.file(
    "README.txt",
    `AICONO EMS – Loxone Snippets ${group.label}\n` +
      `Enthält ${group.snippets.length} XML-Vorlagen und eine PDF-Kurzanleitung.\n` +
      "Namenskonvention: AICO_<TemplateKey>__<Instance>__<Parameter> – nicht ändern.\n",
  );
  const blob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(blob, group.zipName);
  return true;
}

/** Gruppe A – bleibt aus Kompatibilitätsgründen als eigener Helper. */
export async function downloadEvGroupAPackage() {
  return downloadGroupPackage("A");
}

/** Alle Gruppen gebündelt (Super-Admin Rollout). */
export async function downloadAllSnippetsPackage() {
  const zip = new JSZip();
  for (const group of SNIPPET_GROUPS) {
    const folder = zip.folder(group.zipName.replace(/\.zip$/i, ""))!;
    for (const s of group.snippets) {
      folder.file(s.filename, s.xml);
    }
    folder.file("Kurzanleitung.pdf", buildQuickGuidePdf(group));
  }
  zip.file(
    "README.txt",
    "AICONO EMS – Loxone-Snippet-Bibliothek (Gruppen A–F)\n" +
      `Enthält ${ALL_SNIPPETS.length} XML-Vorlagen + 6 Kurzanleitungen (PDF).\n` +
      "Namenskonvention: AICO_<TemplateKey>__<Instance>__<Parameter> – nicht ändern.\n",
  );
  const blob = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(blob, "AICONO_Loxone_Snippets_ALL.zip");
  return true;
}

export function downloadSingleSnippet(templateKey: string) {
  const s: LoxoneSnippet | undefined = SNIPPET_BY_KEY[templateKey];
  if (!s) return false;
  const blob = new Blob([s.xml], { type: "application/xml" });
  triggerBlobDownload(blob, s.filename);
  return true;
}
