import type { Plugin } from "vite";

const CSP_META_REGEX =
  /\s*<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi;

export function stripCspMetaPlugin(): Plugin {
  return {
    name: "strip-csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (process.env.STRIP_CSP_META !== "1") return html;
        return html.replace(CSP_META_REGEX, "");
      },
    },
  };
}
