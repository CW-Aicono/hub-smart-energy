/**
 * describeError() – übersetzt technische Fehler in verständliche,
 * mehrsprachige Meldungen. Bewusst ohne React-Abhängigkeit, damit die
 * Funktion auch in Hooks, Query-Callbacks und Utilities nutzbar ist.
 */
import { getT } from "@/i18n/getT";

export type ErrorKind =
  | "network"
  | "timeout"
  | "unavailable"
  | "session"
  | "permission"
  | "notFound"
  | "unknown";

export interface DescribedError {
  kind: ErrorKind;
  title: string;
  description: string;
  /** Kurzcode für Support-Anfragen, z. B. "NET-01" */
  code: string;
  /** true = erneuter Versuch sinnvoll */
  retryable: boolean;
  /** Original-Text (nur für Logging / Dev) */
  raw: string;
}

const CODES: Record<ErrorKind, string> = {
  network: "NET-01",
  timeout: "NET-02",
  unavailable: "SRV-01",
  session: "AUTH-01",
  permission: "AUTH-02",
  notFound: "REQ-04",
  unknown: "ERR-00",
};

const RETRYABLE: Record<ErrorKind, boolean> = {
  network: true,
  timeout: true,
  unavailable: true,
  session: false,
  permission: false,
  notFound: false,
  unknown: true,
};

function toSignal(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    return [e.name, e.message, e.error, e.code, e.status, e.details, e.hint]
      .filter((v) => v !== undefined && v !== null)
      .map(String)
      .join(" ");
  }
  return String(error);
}

export function classifyError(error: unknown): ErrorKind {
  const s = toSignal(error);
  if (!s) return "unknown";

  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";

  if (/failed to fetch|networkerror|network request failed|load failed|err_(internet|network|connection)|fetch failed|typeerror: fetch/i.test(s))
    return "network";
  if (/\b408\b|\b504\b|timeout|timed out|IDLE_TIMEOUT|abort(ed)?error|deadline exceeded|57014/i.test(s))
    return "timeout";
  if (/\b50[23]\b|BOOT_ERROR|SUPABASE_EDGE_RUNTIME_ERROR|temporarily unavailable|service unavailable|too many connections|connection refused/i.test(s))
    return "unavailable";
  if (/\b401\b|jwt expired|invalid (jwt|token)|refresh_token|not authenticated|session (expired|missing)/i.test(s))
    return "session";
  if (/\b403\b|permission denied|row-level security|violates row-level|not authorized|insufficient privilege|42501/i.test(s))
    return "permission";
  if (/\b404\b|not found|PGRST116/i.test(s)) return "notFound";

  return "unknown";
}

export function describeError(error: unknown): DescribedError {
  const t = getT();
  const kind = classifyError(error);
  return {
    kind,
    title: t(`error.${kind}.title`),
    description: t(`error.${kind}.desc`),
    code: CODES[kind],
    retryable: RETRYABLE[kind],
    raw: toSignal(error),
  };
}

/** Kurzform für Toasts: nur ein Satz. */
export function errorToastMessage(error: unknown): { title: string; description: string } {
  const d = describeError(error);
  return { title: d.title, description: `${d.description} (${d.code})` };
}
