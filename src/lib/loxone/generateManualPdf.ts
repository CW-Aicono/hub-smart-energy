/**
 * PDF-Generator für AICONO Loxone-Baustein-Bedienungsanleitungen.
 * Rein clientseitig via jsPDF, keine Edge-Function nötig.
 */
import { jsPDF } from "jspdf";
import { SNIPPET_BY_KEY } from "./snippetsCatalog";

export interface ManualDoc {
  template_key: string;
  title: string;
  purpose_md: string;
  wiring_md: string;
  test_md: string;
  version: number;
  updated_at: string;
}

const MARGIN = 15;
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const CONTENT_W = PAGE_W - 2 * MARGIN;

/**
 * jsPDF/Helvetica (WinAnsi) kann keine Emojis oder Zeichen außerhalb von Latin-1 rendern.
 * Wir ersetzen bekannte Emojis durch Klartext und strippen den Rest, damit keine
 * kaputten Byte-Sequenzen ("&2&.& &A&u&f& ...") im PDF landen.
 */
const EMOJI_REPLACEMENTS: Array<[RegExp, string]> = [
  [/🧩/g, "[Puzzle-Icon]"],
  [/📄/g, "[PDF-Icon]"],
  [/🔄/g, "[Neu-Scannen-Icon]"],
  [/✅/g, "[OK]"],
  [/❌/g, "[Fehler]"],
  [/⚠️?/g, "[Achtung]"],
  [/→/g, "->"],
  [/←/g, "<-"],
  [/–/g, "-"],
  [/—/g, "-"],
  [/„|"/g, '"'],
  [/'|'/g, "'"],
];

function sanitizeForPdf(text: string): string {
  let out = text || "";
  for (const [re, rep] of EMOJI_REPLACEMENTS) out = out.replace(re, rep);
  // Alles außerhalb Latin-1 (WinAnsi) durch "?" ersetzen, damit jsPDF nicht scrambled.
  out = out.replace(/[^\x00-\xFF]/g, "?");
  return out;
}

function renderSection(
  doc: jsPDF,
  title: string,
  bodyMd: string,
  cursor: { y: number },
) {
  ensureSpace(doc, cursor, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 40, 90);
  doc.text(sanitizeForPdf(title), MARGIN, cursor.y);
  cursor.y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(30, 30, 30);
  const text = sanitizeForPdf((bodyMd || "—").trim());
  const lines = doc.splitTextToSize(text, CONTENT_W);
  for (const line of lines) {
    ensureSpace(doc, cursor, 6);
    doc.text(line, MARGIN, cursor.y);
    cursor.y += 5;
  }
  cursor.y += 4;
}

function ensureSpace(doc: jsPDF, cursor: { y: number }, needed: number) {
  if (cursor.y + needed > PAGE_H - 20) {
    doc.addPage();
    cursor.y = MARGIN + 5;
  }
}

function renderParameterTable(doc: jsPDF, templateKey: string, cursor: { y: number }) {
  const snippet = SNIPPET_BY_KEY[templateKey];
  if (!snippet || snippet.parameters.length === 0) return;

  ensureSpace(doc, cursor, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 40, 90);
  doc.text("Parameter", MARGIN, cursor.y);
  cursor.y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  const colX = [MARGIN, MARGIN + 55, MARGIN + 75];
  doc.text("Name", colX[0], cursor.y);
  doc.text("Typ", colX[1], cursor.y);
  doc.text("Beschreibung", colX[2], cursor.y);
  cursor.y += 2;
  doc.setDrawColor(200);
  doc.line(MARGIN, cursor.y, MARGIN + CONTENT_W, cursor.y);
  cursor.y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  for (const p of snippet.parameters) {
    const descLines = doc.splitTextToSize(sanitizeForPdf(p.description || ""), CONTENT_W - 75);
    const rowH = Math.max(5, descLines.length * 4.5);
    ensureSpace(doc, cursor, rowH + 2);
    doc.text(sanitizeForPdf(p.name), colX[0], cursor.y);
    doc.text(sanitizeForPdf(p.type), colX[1], cursor.y);
    doc.text(descLines, colX[2], cursor.y);
    cursor.y += rowH + 1;
  }
  cursor.y += 4;
}

export function generateManualPdf(manual: ManualDoc): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Header-Band
  doc.setFillColor(20, 40, 90);
  doc.rect(0, 0, PAGE_W, 22, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AICONO EMS", MARGIN, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Loxone-Baustein Bedienungsanleitung", MARGIN, 16);

  const cursor = { y: 34 };
  doc.setTextColor(20, 40, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(sanitizeForPdf(manual.title), MARGIN, cursor.y);
  cursor.y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(110);
  doc.text(
    `${manual.template_key} · v${manual.version} · Stand ${new Date(manual.updated_at).toLocaleDateString("de-DE")}`,
    MARGIN,
    cursor.y,
  );
  cursor.y += 9;

  renderSection(doc, "Zweck des Bausteins", manual.purpose_md, cursor);
  renderParameterTable(doc, manual.template_key, cursor);
  renderSection(doc, "Einrichtung im Miniserver (Verdrahtung)", manual.wiring_md, cursor);
  renderSection(doc, "Test & Inbetriebnahme", manual.test_md, cursor);

  // Footer auf jeder Seite
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `${manual.template_key} · v${manual.version} · Seite ${i}/${pages}`,
      MARGIN,
      PAGE_H - 8,
    );
    doc.text("AICONO EMS · https://aicono.org", PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }
  return doc;
}

export function downloadManualPdf(manual: ManualDoc) {
  const doc = generateManualPdf(manual);
  doc.save(`AICONO_${manual.template_key}_v${manual.version}.pdf`);
}

/** Erzeugt v1-Skelett aus dem Katalog für einen Template-Key. */
export function buildManualSkeleton(templateKey: string): Omit<ManualDoc, "updated_at"> {
  const snippet = SNIPPET_BY_KEY[templateKey];
  const title = snippet?.title ?? templateKey;
  const purpose = snippet?.description
    ? `${snippet.description}\n\nDieser Baustein tauscht Werte zwischen AICONO EMS und dem Loxone Miniserver aus. Alle Parameter sind unten aufgeführt.`
    : "Zweck des Bausteins wird hier beschrieben.";
  const wiring = [
    "1. Loxone Config öffnen und mit dem Miniserver verbinden.",
    "2. Die virtuellen Ein-/Ausgänge dieses Bausteins liegen bereits im Master-Projekt und beginnen alle mit dem Präfix",
    `   ${templateKey}__1__...`,
    "3. Verbinde die virtuellen Eingänge mit deiner bestehenden Loxone-Logik (z. B. Statistik, Analog-Merker, Formeln).",
    "4. Namen der virtuellen Ein-/Ausgänge NICHT ändern — sonst schlägt Discovery + Push aus der Cloud fehl.",
    "5. Änderungen in den Miniserver speichern (F5).",
    "",
    "(Diese Anleitung ist ein Skelett. Bitte im Super-Admin die konkrete Verdrahtung ergänzen.)",
  ].join("\n");
  const test = [
    "1. In AICONO EMS eine Automation mit diesem Template anlegen und speichern.",
    "2. Auf der Miniserver-Kachel das Puzzle-Icon (Symbol Puzzleteil) klicken -> der Baustein muss als 'erkannt' erscheinen.",
    "3. In Loxone Config im Live-Modus prüfen, ob die gesendeten Werte an den Eingängen ankommen.",
    "4. Ausgangs-Werte (falls vorhanden) sollten in AICONO wieder sichtbar werden.",
    "",
    "(Diese Anleitung ist ein Skelett. Bitte im Super-Admin die konkreten Test-Schritte ergänzen.)",
  ].join("\n");
  return {
    template_key: templateKey,
    title,
    purpose_md: purpose,
    wiring_md: wiring,
    test_md: test,
    version: 1,
  };
}
