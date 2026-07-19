/**
 * AICONO Master-Stub-Generator
 * -----------------------------------------------------------------
 * Ergänzt eine bestehende .Loxone-Master-Datei um Interface-Stubs
 * für alle AICO_-Baustein-Typen, die noch nicht enthalten sind.
 *
 * Prinzip:
 *  - Verwendet die aktuell vorhandene Referenz-Instanz (üblicherweise
 *    AICO_GridProtect__1__*) als Vorlage: kopiert dessen `<C>`-Elemente
 *    einmal je Analog-Parameter und einmal je Digital-Parameter des
 *    neuen Bausteins, mit frischen UUIDs und neuem Titel/IName.
 *  - Fügt die geklonten Blöcke direkt hinter das letzte Referenz-
 *    Element der Vorlage in die XML ein (String-Splicing, wie im
 *    Injektor). Bestehende Bytes bleiben unverändert.
 *  - Erkennt Analog vs. Digital ausschließlich über den Katalog
 *    (`snippetsCatalog.ts`), NICHT über XML-Heuristik.
 *
 * Grenze (bewusst):
 *  - Erzeugt NUR Virtual-Input-/Output-Interfaces (Werte-Austausch
 *    AICONO ↔ Miniserver). Programmlogik, Verdrahtung, Formeln etc.
 *    muss danach in Loxone Config nachgerüstet werden.
 */

import {
  scanTarget,
  generateLoxoneUuid,
  verifyOriginalPreserved,
  validate,
  type ValidationResult,
} from "./injector";
import { ALL_SNIPPETS, type LoxoneSnippet, type SnippetParameter } from "./snippetsCatalog";

const AICO_TITLE_RE = /^AICO_([A-Za-z0-9]+)__(\d+)__(.+)$/;

export interface StubGenerationResult {
  xml: string;
  report: string;
  addedTypes: Array<{ type: string; params: number }>;
  skippedTypes: Array<{ type: string; reason: string }>;
  templateUsed: string;
  validation: ValidationResult;
  bytesPreserved: boolean;
}

interface RefTemplate {
  analog?: RefElement;
  digital?: RefElement;
  insertionPoint: number; // Index in original XML nach dem letzten Ref-Element
}

interface RefElement {
  original: string;    // Exakter Original-String im XML
  endInXml: number;    // Index direkt hinter dem Ende dieses Elements
}

/** Findet Ende eines <C ...>...</C>-Blocks ab openIdx (Position des `<`). */
function findElementEnd(xml: string, openIdx: number): number {
  // Prüfen, ob self-closing
  const firstGt = xml.indexOf(">", openIdx);
  if (firstGt === -1) throw new Error("Ungültiges <C-Tag.");
  if (xml[firstGt - 1] === "/") return firstGt + 1;

  // Balanced </C> suchen
  let depth = 1;
  let i = firstGt + 1;
  while (i < xml.length && depth > 0) {
    const nextOpen = xml.indexOf("<C ", i);
    const nextClose = xml.indexOf("</C>", i);
    if (nextClose === -1) throw new Error("Kein passendes </C> gefunden.");
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const gt = xml.indexOf(">", nextOpen);
      if (gt === -1) throw new Error("Ungültiges <C-Tag.");
      if (xml[gt - 1] !== "/") depth++;
      i = gt + 1;
    } else {
      depth--;
      i = nextClose + 4;
    }
  }
  return i;
}

/** Sucht ein <C ...>-Element mit passendem Title und liefert Original-String + Endindex. */
function findElementByTitle(xml: string, title: string): RefElement | null {
  // Escape Title für Regex
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<C\\s[^>]*\\bTitle="${escaped}"`, "g");
  const m = re.exec(xml);
  if (!m) return null;
  const openIdx = m.index;
  const endIdx = findElementEnd(xml, openIdx);
  return { original: xml.slice(openIdx, endIdx), endInXml: endIdx };
}

/** Erzeugt ein zufälliges UUID-Universum aus dem Element-String (U="..." Attribute). */
function collectUuids(elementXml: string): Set<string> {
  const set = new Set<string>();
  const re = /\bU="([0-9a-fA-F-]{20,40})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(elementXml))) set.add(m[1]);
  return set;
}

/** Ersetzt alle UUIDs gemäß Map (längste zuerst). */
function remapUuids(text: string, remap: Map<string, string>): string {
  if (remap.size === 0) return text;
  const keys = Array.from(remap.keys()).sort((a, b) => b.length - a.length);
  const re = new RegExp(keys.join("|"), "g");
  return text.replace(re, (m) => remap.get(m) ?? m);
}

/** Ersetzt Title="..." und IName="..." Werte im geklonten Element. */
function retagTitleAndIName(elementXml: string, newTitle: string): string {
  let out = elementXml;
  out = out.replace(/\bTitle="[^"]*"/, `Title="${newTitle}"`);
  out = out.replace(/\bIName="[^"]*"/g, `IName="${newTitle}"`);
  return out;
}

function pickTemplateFrom(
  xml: string,
  templateType: string,
  templateSnippet: LoxoneSnippet,
): RefTemplate {
  let analog: RefElement | undefined;
  let digital: RefElement | undefined;
  let lastEnd = -1;

  for (const p of templateSnippet.parameters) {
    const title = `AICO_${templateType}__1__${p.name}`;
    const found = findElementByTitle(xml, title);
    if (!found) continue;
    if (p.type === "Analog" && !analog) analog = found;
    if (p.type === "Digital" && !digital) digital = found;
    if (found.endInXml > lastEnd) lastEnd = found.endInXml;
  }
  if (lastEnd === -1) {
    throw new Error(`Keine Referenz-Elemente für Vorlage AICO_${templateType} in der Master-Datei gefunden.`);
  }
  return { analog, digital, insertionPoint: lastEnd };
}

/** Baut den Klon-String für einen einzelnen Parameter. */
function cloneOneParam(
  templateEl: RefElement,
  newTitle: string,
): string {
  const uuids = collectUuids(templateEl.original);
  const remap = new Map<string, string>();
  for (const u of uuids) remap.set(u, generateLoxoneUuid());
  let cloned = remapUuids(templateEl.original, remap);
  cloned = retagTitleAndIName(cloned, newTitle);
  return cloned;
}

export function generateMissingStubs(masterXml: string): StubGenerationResult {
  const blocks = scanTarget(masterXml);
  const existingTypes = new Set(blocks.map((b) => b.type));

  if (existingTypes.size === 0) {
    throw new Error("In der Master-Datei ist noch kein einziger AICO_-Baustein vorhanden. Bitte zuerst mindestens einen Referenz-Baustein (z. B. AICO_GridProtect) manuell einspielen.");
  }

  // Vorlagen-Typ wählen: bevorzugt einen, der sowohl Analog als auch Digital-Parameter hat.
  const candidates = blocks
    .map((b) => ALL_SNIPPETS.find((s) => s.templateKey === `AICO_${b.type}`))
    .filter((s): s is LoxoneSnippet => Boolean(s))
    .map((s) => ({
      snippet: s,
      hasAnalog: s.parameters.some((p) => p.type === "Analog"),
      hasDigital: s.parameters.some((p) => p.type === "Digital"),
    }))
    .sort((a, b) => Number(b.hasAnalog && b.hasDigital) - Number(a.hasAnalog && a.hasDigital));

  if (candidates.length === 0) {
    throw new Error("Kein bekannter AICO_-Baustein aus dem Katalog in der Master-Datei gefunden.");
  }
  const templateSnippet = candidates[0].snippet;
  const templateType = templateSnippet.templateKey.replace(/^AICO_/, "");
  const template = pickTemplateFrom(masterXml, templateType, templateSnippet);

  // Sammle alle fehlenden Snippets
  const missing = ALL_SNIPPETS.filter((s) => {
    const t = s.templateKey.replace(/^AICO_/, "");
    return !existingTypes.has(t);
  });

  const addedTypes: Array<{ type: string; params: number }> = [];
  const skippedTypes: Array<{ type: string; reason: string }> = [];
  const insertParts: string[] = [];

  for (const snippet of missing) {
    const typeShort = snippet.templateKey.replace(/^AICO_/, "");
    try {
      const clonedParams: string[] = [];
      for (const p of snippet.parameters) {
        const source = p.type === "Analog" ? template.analog : template.digital;
        if (!source) {
          // Fallback: nimm was da ist (Loxone akzeptiert VI generisch)
          const fallback = template.analog ?? template.digital;
          if (!fallback) throw new Error("Weder Analog- noch Digital-Referenzelement verfügbar.");
          clonedParams.push(cloneOneParam(fallback, `AICO_${typeShort}__1__${p.name}`));
        } else {
          clonedParams.push(cloneOneParam(source, `AICO_${typeShort}__1__${p.name}`));
        }
      }
      insertParts.push("\n" + clonedParams.join("\n"));
      addedTypes.push({ type: typeShort, params: snippet.parameters.length });
    } catch (e: any) {
      skippedTypes.push({ type: typeShort, reason: e.message });
    }
  }

  // Alle Klone hinter das letzte Vorlagen-Element einfügen
  const insertBlob = insertParts.join("");
  const newXml =
    masterXml.slice(0, template.insertionPoint) +
    insertBlob +
    masterXml.slice(template.insertionPoint);

  const validation = validate(newXml);
  const bytesPreserved = verifyOriginalPreserved(masterXml, newXml);

  const report = buildReport({
    templateType,
    addedTypes,
    skippedTypes,
    validation,
    bytesPreserved,
  });

  return {
    xml: newXml,
    report,
    addedTypes,
    skippedTypes,
    templateUsed: templateType,
    validation,
    bytesPreserved,
  };
}

function buildReport(args: {
  templateType: string;
  addedTypes: Array<{ type: string; params: number }>;
  skippedTypes: Array<{ type: string; reason: string }>;
  validation: ValidationResult;
  bytesPreserved: boolean;
}): string {
  const lines = [
    "AICONO Master-Stub-Generator — Report",
    "=".repeat(48),
    "",
    `Verwendete Vorlage: AICO_${args.templateType}`,
    `Original-Bytes erhalten: ${args.bytesPreserved ? "JA" : "NEIN"}`,
    `Validierung: ${args.validation.ok ? "OK" : "FEHLER"}`,
  ];
  if (!args.validation.ok) {
    for (const e of args.validation.errors) lines.push(`  ! ${e}`);
  }
  lines.push("", `Hinzugefügte Bausteine (${args.addedTypes.length}):`);
  for (const a of args.addedTypes) {
    lines.push(`  + AICO_${a.type} — Instanz 1 (${a.params} Parameter)`);
  }
  if (args.skippedTypes.length > 0) {
    lines.push("", `Übersprungen (${args.skippedTypes.length}):`);
    for (const s of args.skippedTypes) {
      lines.push(`  - ${s.type}: ${s.reason}`);
    }
  }
  lines.push("", `Zeitstempel: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("HINWEIS: Diese Bausteine enthalten nur die Virtual-Input-/Output-");
  lines.push("Schnittstellen für den Werte-Austausch AICONO ↔ Miniserver.");
  lines.push("Die eigentliche Loxone-Programmlogik (Verdrahtung, Formeln, Timer)");
  lines.push("muss danach in Loxone Config nachgerüstet werden.");
  return lines.join("\n");
}
