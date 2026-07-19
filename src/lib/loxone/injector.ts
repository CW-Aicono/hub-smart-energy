/**
 * AICONO Loxone-Baustein-Injektor
 * -------------------------------------------------------------
 * Vervielfältigt bereits in einer .Loxone-XML-Datei vorhandene
 * `AICO_<Type>__<Instance>__<Param>`-Bausteine, ohne den Rest
 * der Datei zu verändern (String-Splicing, keine DOM-Serialisierung
 * der Ziel-Datei).
 *
 * Strategie:
 *  1. Ziel-Datei per DOMParser lesen (nur um Blöcke zu finden).
 *  2. Für jeden Baustein-Typ die Referenz-Instanz (kleinste
 *     vorhandene Nummer) und alle zugehörigen `<C>`-Elemente
 *     einsammeln (Match per Title-Präfix `AICO_<Type>__<N>__`).
 *  3. UUID-Universum der Referenz-Instanz aufbauen
 *     (U + Co.U + IName?, plus Ref/RefL/In.Input die *innerhalb*
 *     des Universums bleiben).
 *  4. Für jede neue Instanz: UUID-Remap erzeugen, jedes Element
 *     zu String serialisieren, alle alten UUIDs → neue UUIDs
 *     ersetzen, alle `__<oldN>__` → `__<newN>__` in Titles/INames
 *     ersetzen. Neuen String direkt hinter das Original-Element
 *     in die Ziel-Datei splicen (String-Insert, keine Byte-Änderung
 *     an anderen Stellen).
 *  5. Validieren: XML wohlgeformt, alle UUIDs in Datei eindeutig,
 *     alle Ursprungs-Bytes unverändert vorhanden.
 */

export interface TemplateBlock {
  type: string;          // "GridProtect"
  referenceInstance: number; // z. B. 1
  existingInstances: number[]; // z. B. [1, 2]
  elementCount: number;  // Anzahl <C> die zur Referenz-Instanz gehören
}

export interface InjectionWish {
  type: string;
  count: number; // Anzahl neuer Instanzen (0 = skip)
}

export interface InjectionStep {
  type: string;
  newInstance: number;
  elementsInserted: number;
}

export interface InjectionResult {
  xml: string;
  report: string;
  steps: InjectionStep[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const AICO_TITLE_RE = /^AICO_([A-Za-z0-9]+)__(\d+)__(.+)$/;

// ---------- Utilities ----------

/** Erzeugt eine 16-Byte-UUID im Loxone-Format `xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxxxxxx`. */
export function generateLoxoneUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 32)}`;
}

function parseXml(xml: string): Document {
  // BOM entfernen, damit DOMParser keine Warnung produziert
  const clean = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  const doc = new DOMParser().parseFromString(clean, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("XML-Parserfehler: " + err.textContent?.slice(0, 200));
  return doc;
}

function serializeElement(el: Element): string {
  return new XMLSerializer().serializeToString(el);
}

/** Alle Element-Attribute + Co-Kinder liefern die UUIDs, die zu diesem Element gehören. */
function collectOwnUuids(el: Element): Set<string> {
  const s = new Set<string>();
  const u = el.getAttribute("U");
  if (u) s.add(u);
  el.querySelectorAll("Co[U]").forEach((c) => {
    const cu = c.getAttribute("U");
    if (cu) s.add(cu);
  });
  return s;
}

// ---------- Scan ----------

export function scanTarget(xml: string): TemplateBlock[] {
  const doc = parseXml(xml);
  // Alle <C> mit Title, die AICO_-Pattern matchen
  const cElements = Array.from(doc.getElementsByTagName("C"));
  const byType = new Map<string, Map<number, Element[]>>();
  for (const el of cElements) {
    const title = el.getAttribute("Title") ?? "";
    const m = AICO_TITLE_RE.exec(title);
    if (!m) continue;
    const type = m[1];
    const inst = Number(m[2]);
    if (!byType.has(type)) byType.set(type, new Map());
    const perInst = byType.get(type)!;
    if (!perInst.has(inst)) perInst.set(inst, []);
    perInst.get(inst)!.push(el);
  }
  const blocks: TemplateBlock[] = [];
  for (const [type, perInst] of byType) {
    const instances = Array.from(perInst.keys()).sort((a, b) => a - b);
    const ref = instances[0];
    blocks.push({
      type,
      referenceInstance: ref,
      existingInstances: instances,
      elementCount: perInst.get(ref)!.length,
    });
  }
  return blocks.sort((a, b) => a.type.localeCompare(b.type));
}

// ---------- Injektion ----------

interface CloneContext {
  originalString: string; // Element-Serialisierung (Original)
  newString: string;      // Nach UUID- & Instanz-Remap
  parentEndMarker: string; // wird nach dieser Position in der Zieldatei eingefügt
}

function nextAvailableInstance(existing: number[], used: number[]): number {
  const all = new Set([...existing, ...used]);
  let n = 1;
  while (all.has(n)) n++;
  return n;
}

/** Reine Textersetzung: `AICO_<Type>__<old>__` → `AICO_<Type>__<new>__`. */
function retagInstance(text: string, type: string, oldN: number, newN: number): string {
  const re = new RegExp(`AICO_${type}__${oldN}__`, "g");
  return text.replace(re, `AICO_${type}__${newN}__`);
}

/** Ersetzt alle Vorkommen bekannter UUIDs (case-insensitive matching hex) durch neue. */
function remapUuids(text: string, remap: Map<string, string>): string {
  if (remap.size === 0) return text;
  // Alphabetisch sortieren, damit ähnliche Präfixe nicht kollidieren
  const keys = Array.from(remap.keys()).sort((a, b) => b.length - a.length);
  // Escape regex special chars – aber UUIDs enthalten nur [0-9a-f-]
  const re = new RegExp(keys.join("|"), "g");
  return text.replace(re, (m) => remap.get(m) ?? m);
}

export function planInjection(targetXml: string, wishes: InjectionWish[]): {
  steps: Array<{ type: string; newInstances: number[]; elementsPerInstance: number }>;
  errors: string[];
} {
  const blocks = scanTarget(targetXml);
  const byType = new Map(blocks.map((b) => [b.type, b]));
  const steps: Array<{ type: string; newInstances: number[]; elementsPerInstance: number }> = [];
  const errors: string[] = [];
  for (const wish of wishes) {
    if (!wish.count) continue;
    const block = byType.get(wish.type);
    if (!block) {
      errors.push(`Baustein-Typ „${wish.type}" ist in der Ziel-Datei nicht vorhanden — bitte erst die Referenz-Instanz __1__ manuell aus dem Master-Projekt übernehmen.`);
      continue;
    }
    const used: number[] = [];
    const newInstances: number[] = [];
    for (let i = 0; i < wish.count; i++) {
      const n = nextAvailableInstance(block.existingInstances, used);
      newInstances.push(n);
      used.push(n);
    }
    steps.push({ type: wish.type, newInstances, elementsPerInstance: block.elementCount });
  }
  return { steps, errors };
}

export function executeInjection(targetXml: string, wishes: InjectionWish[]): InjectionResult {
  const doc = parseXml(targetXml);
  const blocks = scanTarget(targetXml);
  const byType = new Map(blocks.map((b) => [b.type, b]));

  // Wir arbeiten auf einem mutierbaren String. Splicing erfolgt anhand
  // eindeutiger Substrings des Original-Elements.
  let workingXml = targetXml;
  const steps: InjectionStep[] = [];

  for (const wish of wishes) {
    if (!wish.count) continue;
    const block = byType.get(wish.type);
    if (!block) throw new Error(`Baustein „${wish.type}" nicht in Ziel-Datei gefunden.`);

    // Referenz-Instanz-Elemente aus Ziel-Datei holen
    const refElements: Element[] = [];
    const allC = Array.from(doc.getElementsByTagName("C"));
    for (const el of allC) {
      const title = el.getAttribute("Title") ?? "";
      const m = AICO_TITLE_RE.exec(title);
      if (m && m[1] === wish.type && Number(m[2]) === block.referenceInstance) {
        refElements.push(el);
      }
    }
    if (refElements.length === 0) throw new Error(`Referenz-Instanz __${block.referenceInstance}__ von ${wish.type} nicht gefunden.`);

    // UUID-Universum: alle UUIDs, die zu Referenz-Elementen (inkl. deren Co-Kinder) gehören
    const universe = new Set<string>();
    for (const el of refElements) {
      for (const u of collectOwnUuids(el)) universe.add(u);
    }

    const usedInstances: number[] = [];
    for (let i = 0; i < wish.count; i++) {
      const newN = nextAvailableInstance(block.existingInstances, usedInstances);
      usedInstances.push(newN);

      // UUID-Remap für diese Instanz
      const remap = new Map<string, string>();
      for (const u of universe) remap.set(u, generateLoxoneUuid());

      let inserted = 0;
      for (const el of refElements) {
        const original = serializeElement(el);
        let cloned = original;
        cloned = remapUuids(cloned, remap);
        cloned = retagInstance(cloned, wish.type, block.referenceInstance, newN);

        // Splice: neuen Block direkt hinter das Original in workingXml einfügen.
        const idx = workingXml.indexOf(original);
        if (idx === -1) {
          // Serializer-Whitespace kann von Original abweichen – Fallback:
          // Anhand des U-Attributs eine minimale Marker-Suche machen.
          const uid = el.getAttribute("U");
          const marker = uid ? `U="${uid}"` : null;
          if (!marker) throw new Error("Element ohne UUID kann nicht sicher gespliced werden.");
          const mIdx = workingXml.indexOf(marker);
          if (mIdx === -1) throw new Error(`Referenz-Element mit ${marker} nicht in Ziel-Datei gefunden.`);
          // Ende des <C ...>...</C>-Blocks finden (self-closing oder balanced)
          const endIdx = findElementEnd(workingXml, mIdx);
          workingXml = workingXml.slice(0, endIdx) + "\n" + cloned + workingXml.slice(endIdx);
        } else {
          const endIdx = idx + original.length;
          workingXml = workingXml.slice(0, endIdx) + "\n" + cloned + workingXml.slice(endIdx);
        }
        inserted += 1 + cloned.split(/<C\s/).length - 1; // ungefähre Objektzahl
      }
      steps.push({ type: wish.type, newInstance: newN, elementsInserted: inserted });
      block.existingInstances.push(newN);
    }
  }

  const report = buildReport(steps);
  return { xml: workingXml, report, steps };
}

/** Findet das Ende des `<C ...>...</C>`-Blocks, der `startTag` enthält. */
function findElementEnd(xml: string, insideIdx: number): number {
  // Rückwärts das <C suchen
  const openIdx = xml.lastIndexOf("<C ", insideIdx);
  if (openIdx === -1) throw new Error("Öffnendes <C nicht gefunden.");
  // Prüfen, ob self-closing
  const firstGt = xml.indexOf(">", openIdx);
  if (firstGt === -1) throw new Error("Ungültiges <C-Tag.");
  if (xml[firstGt - 1] === "/") return firstGt + 1;
  // Balanced </C> suchen
  let depth = 1;
  let i = firstGt + 1;
  while (i < xml.length && depth > 0) {
    const nextOpen = xml.indexOf("<C ", i);
    const nextSelf = xml.indexOf("<C/>", i);
    const nextClose = xml.indexOf("</C>", i);
    if (nextClose === -1) throw new Error("Kein passendes </C> gefunden.");
    const candidates = [nextOpen, nextClose].filter((x) => x !== -1);
    const next = Math.min(...candidates);
    if (next === nextClose) {
      depth--;
      i = nextClose + 4;
    } else {
      // öffnendes <C ...>; prüfen ob self-closing
      const gt = xml.indexOf(">", nextOpen);
      if (gt === -1) throw new Error("Ungültiges <C-Tag.");
      if (xml[gt - 1] !== "/") depth++;
      i = gt + 1;
    }
  }
  return i;
}

function buildReport(steps: InjectionStep[]): string {
  const lines = ["AICONO Loxone-Injektor — Validierungs-Report", "=".repeat(48), ""];
  if (steps.length === 0) {
    lines.push("Keine Änderungen (keine Instanzen angefordert).");
  } else {
    for (const s of steps) {
      lines.push(`+ ${s.type}: Instanz ${s.newInstance} hinzugefügt (${s.elementsInserted} Objekte)`);
    }
  }
  lines.push("");
  lines.push(`Zeitstempel: ${new Date().toISOString()}`);
  return lines.join("\n");
}

// ---------- Validierung ----------

export function validate(xml: string): ValidationResult {
  const errors: string[] = [];
  try {
    parseXml(xml);
  } catch (e: any) {
    errors.push(e.message);
    return { ok: false, errors };
  }
  // UUID-Eindeutigkeit prüfen (nur U="..." Attribute)
  const uuidRe = /\bU="([0-9a-fA-F-]{20,40})"/g;
  const seen = new Set<string>();
  const dupes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = uuidRe.exec(xml))) {
    const u = m[1];
    if (seen.has(u)) dupes.add(u);
    seen.add(u);
  }
  if (dupes.size > 0) {
    errors.push(`UUID-Kollision: ${dupes.size} doppelte UUIDs (${Array.from(dupes).slice(0, 3).join(", ")}${dupes.size > 3 ? "…" : ""})`);
  }
  return { ok: errors.length === 0, errors };
}

/** Prüft, dass sämtliche Bytes der Original-Datei in der neuen Datei
 *  weiterhin (in Reihenfolge) enthalten sind — d. h. nichts wurde
 *  gelöscht oder überschrieben, es wurde nur eingefügt.
 */
export function verifyOriginalPreserved(original: string, extended: string): boolean {
  if (extended.length < original.length) return false;
  let i = 0;
  let j = 0;
  while (i < original.length && j < extended.length) {
    if (original[i] === extended[j]) i++;
    j++;
  }
  return i === original.length;
}
