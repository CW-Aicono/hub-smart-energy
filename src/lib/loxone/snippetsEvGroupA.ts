// Backwards-compat re-export: the full catalog now lives in snippetsCatalog.ts.
export type { LoxoneSnippet, SnippetParameter } from "./snippetsCatalog";
import { SNIPPET_GROUPS } from "./snippetsCatalog";

export const EV_GROUP_A_SNIPPETS = SNIPPET_GROUPS.find((g) => g.key === "A")!.snippets;
