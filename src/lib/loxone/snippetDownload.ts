import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { EV_GROUP_A_SNIPPETS } from "./snippetsEvGroupA";

function buildQuickGuidePdf(): Uint8Array {
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

  addLine("AICONO EMS – Loxone Snippets Gruppe A (E-Mobilität)", 18, true, 26);
  addLine("Kurzanleitung zur Einrichtung", 12, false, 20);
  addLine(
    'Diese Kurzanleitung beschreibt die Einbindung der vier AICONO-Loxone-Bausteine der Gruppe E-Mobilitaet. Nach dem Einspielen erkennt die Cloud die Bausteine automatisch (Discovery) und pusht Regelaenderungen bei Bedarf direkt an den Miniserver.',
    10, false, 14,
  );
  y += 8;
  addLine("Voraussetzungen", 13, true, 18);
  addLine("• Miniserver Firmware ≥ 12.0", 10);
  addLine("• AICONO EMS – Loxone-Integration in der Location aktiv & verbunden", 10);
  addLine("• Loxone Config in aktueller Version", 10);
  addLine("• Wallbox(en) über Modbus TCP am Miniserver oder über AICONO-Gateway erreichbar", 10);
  y += 8;
  addLine("Import in Loxone Config", 13, true, 18);
  addLine("1. XML-Snippet öffnen und die Baustein-Vorlage in die Programmierung übernehmen.", 10);
  addLine("2. Virtuelle Eingänge exakt wie im Snippet benennen – Discovery matcht auf das Präfix AICO_<TemplateKey>__<Instance>__.", 10);
  addLine("3. Ausgänge mit der jeweiligen Hardware verdrahten (Modbus-Bridge, Relais, Wallbox).", 10);
  addLine("4. Miniserver speichern & übertragen.", 10);
  addLine('5. In AICONO EMS: Standort -> Karte Loxone-Templates -> Neu scannen. Die Templates erscheinen anschliessend mit Instanz-ID und Version.', 10);
  addLine('6. Regel im Automation-Editor anlegen und als Ausfuehrungsort Loxone lokal oder Hybrid auswaehlen.', 10);

  y += 12;
  addLine("Enthaltene Bausteine", 13, true, 18);
  for (const s of EV_GROUP_A_SNIPPETS) {
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

export async function downloadEvGroupAPackage() {
  const zip = new JSZip();
  const folder = zip.folder("AICONO_EV_GroupA")!;
  for (const s of EV_GROUP_A_SNIPPETS) {
    folder.file(s.filename, s.xml);
  }
  folder.file("Kurzanleitung.pdf", buildQuickGuidePdf());
  folder.file(
    "README.txt",
    "AICONO EMS – Loxone Snippets Gruppe A (E-Mobilität)\n" +
      "Enthält 4 XML-Vorlagen und eine PDF-Kurzanleitung.\n" +
      "Namenskonvention: AICO_<TemplateKey>__<Instance>__<Parameter> – nicht ändern.\n",
  );
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "AICONO_Loxone_EV_GroupA.zip";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSingleSnippet(templateKey: string) {
  const s = EV_GROUP_A_SNIPPETS.find((x) => x.templateKey === templateKey);
  if (!s) return false;
  const blob = new Blob([s.xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = s.filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
