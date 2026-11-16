import DOMPurify from "dompurify";

/** Sanitizes HTML (AI texts, stored report content) before rendering or printing; keeps SVG charts. */
export function sanitizeHtml(html: string | null | undefined): string {
  return DOMPurify.sanitize(String(html ?? ""), {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
  });
}

/** Escapes a value for safe interpolation into HTML strings. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
