import { detectOcppEnvironment } from "./ocppEnvironment";

/** true auf staging.aicono.org, Lovable-Vorschau und localhost; false auf dem Live-System. */
export function isStagingEnvironment(hostname?: string): boolean {
  return detectOcppEnvironment(hostname) === "test";
}
