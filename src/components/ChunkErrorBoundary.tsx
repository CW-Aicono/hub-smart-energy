import React from "react";

interface State {
  hasError: boolean;
}

const isChunkLoadError = (error: Error) =>
  error.name === "ChunkLoadError" ||
  error.message.includes("Failed to fetch dynamically imported module") ||
  error.message.includes("Importing a module script failed") ||
  error.message.includes("error loading dynamically imported module");

const RELOAD_KEY = "aicono_chunk_reload_at";

/** Lädt höchstens einmal pro 30 s neu – verhindert Endlosschleifen. */
export function reloadOnceForNewVersion(): boolean {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 30_000) return false;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForNewVersion()) event.preventDefault();
  });
}

export class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) {
      // Neues Deployment: alte Chunk-URL existiert nicht mehr → einmaliger Reload
      // holt die aktuelle index.html mit den neuen Chunk-Hashes.
      reloadOnceForNewVersion();
      return { hasError: true };
    }
    throw error; // Andere Fehler nach oben weitergeben
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }
    return this.props.children;
  }
}
