import { log } from "./logger";
import { logOcppFramesBatch, type OcppLogBatchEntry } from "./backendApi";

// ---------------------------------------------------------------------------
// Schreiblast-Optimierung für ocpp_message_log:
//   1) Request + Response werden zu EINER Zeile zusammengeführt (Pairing per message_id).
//   2) Einträge werden im Speicher gepuffert und alle 2 s ODER bei 50 Einträgen
//      in einem einzigen Bulk-Insert an die Edge-Function übergeben.
//   3) Bei Timeout (30 s ohne Response) wird der Request alleine geflusht – kein Info-Verlust.
//
// Backward-Compat: legacy `logOcppMessage()` bleibt erhalten und nutzt intern den Puffer.
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 50;
const PAIR_TIMEOUT_MS = 30_000;

interface PendingPair {
  entry: OcppLogBatchEntry;
  timer: ReturnType<typeof setTimeout>;
}

// key = `${chargePointId}::${messageId}`
const pendingPairs = new Map<string, PendingPair>();
let buffer: OcppLogBatchEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushBuffer();
  }, FLUSH_INTERVAL_MS);
  // damit Node-Prozess am Ende sauber beenden kann
  if (typeof (flushTimer as { unref?: () => void }).unref === "function") {
    (flushTimer as { unref: () => void }).unref();
  }
}

function pushBuffered(entry: OcppLogBatchEntry) {
  buffer.push(entry);
  if (buffer.length >= FLUSH_BATCH_SIZE) {
    void flushBuffer();
  } else {
    startFlushTimer();
  }
}

export async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const toSend = buffer;
  buffer = [];
  try {
    await logOcppFramesBatch(toSend);
  } catch (error) {
    log.warn("ocpp_message_log batch insert failed", {
      error: (error as Error).message,
      count: toSend.length,
    });
  }
}

function tryParseMessageId(raw: string): { messageId: string | null; kind: 2 | 3 | 4 | null } {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && (arr[0] === 2 || arr[0] === 3 || arr[0] === 4) && typeof arr[1] === "string") {
      return { messageId: arr[1], kind: arr[0] };
    }
  } catch {
    // ignore
  }
  return { messageId: null, kind: null };
}

function pairKey(chargePointId: string, messageId: string): string {
  return `${chargePointId}::${messageId}`;
}

/**
 * Neuer empfohlener Pfad: jeder OCPP-Frame wird hier gemeldet. Requests werden
 * kurz zurückgehalten, bis die Response eintrifft, dann gemeinsam als 1 Zeile
 * gepuffert. Bei Timeout flusht der Request alleine.
 */
export function recordOcppFrame(
  chargePointId: string,
  direction: "incoming" | "outgoing",
  raw: string,
): void {
  const { messageId, kind } = tryParseMessageId(raw);
  const now = new Date().toISOString();

  // CALLERROR / CALLRESULT = Antworten
  if (kind === 3 || kind === 4) {
    if (messageId) {
      const key = pairKey(chargePointId, messageId);
      const pending = pendingPairs.get(key);
      if (pending) {
        clearTimeout(pending.timer);
        pendingPairs.delete(key);
        pending.entry.responseRaw = raw;
        pending.entry.responseAt = now;
        pushBuffered(pending.entry);
        return;
      }
    }
    // Antwort ohne bekannten Request -> als eigene Zeile loggen (selten, aber nicht verlieren)
    pushBuffered({ chargePointId, direction, raw, createdAt: now });
    return;
  }

  // CALL (kind === 2) oder unparsebar -> Request
  const entry: OcppLogBatchEntry = { chargePointId, direction, raw, createdAt: now };
  if (kind === 2 && messageId) {
    const key = pairKey(chargePointId, messageId);
    // falls bereits ein älterer Eintrag mit gleicher messageId hängt: vorher flushen
    const existing = pendingPairs.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      pendingPairs.delete(key);
      pushBuffered(existing.entry);
    }
    const timer = setTimeout(() => {
      const stillPending = pendingPairs.get(key);
      if (stillPending) {
        pendingPairs.delete(key);
        pushBuffered(stillPending.entry);
      }
    }, PAIR_TIMEOUT_MS);
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      (timer as { unref: () => void }).unref();
    }
    pendingPairs.set(key, { entry, timer });
    startFlushTimer();
    return;
  }

  // Fallback: unparsebar -> direkt puffern
  pushBuffered(entry);
}

/**
 * Legacy-API für bestehende Aufrufer. Leitet auf recordOcppFrame() um, damit
 * Pairing + Batching automatisch greifen. Bleibt async, um die Aufrufsignatur
 * (await logOcppMessage(...)) unverändert zu halten.
 */
export async function logOcppMessage(
  chargePointId: string,
  direction: "incoming" | "outgoing",
  raw: string,
): Promise<void> {
  try {
    recordOcppFrame(chargePointId, direction, raw);
  } catch (error) {
    log.warn("ocpp_message_log buffer failed", { error: (error as Error).message, chargePointId });
  }
}

/**
 * Graceful Shutdown: vom Prozess-Exit-Handler aufrufen, damit gepufferte
 * Einträge nicht verloren gehen.
 */
export async function drainOcppLogBuffer(): Promise<void> {
  // alle noch ausstehenden Pairs als Request-only flushen
  for (const [key, pending] of pendingPairs) {
    clearTimeout(pending.timer);
    pendingPairs.delete(key);
    buffer.push(pending.entry);
  }
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}
