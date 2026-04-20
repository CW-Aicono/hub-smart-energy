import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootEl = document.getElementById("root");

function renderError(title: string, message: string) {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;text-align:center;padding:24px;">
      <div style="font-size:20px;font-weight:600;margin-bottom:12px;">${title}</div>
      <div style="font-size:14px;opacity:0.8;max-width:480px;line-height:1.5;">${message}</div>
      <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;background:#38bdf8;color:#0f172a;border:none;border-radius:8px;font-weight:600;cursor:pointer;">Seite neu laden</button>
    </div>`;
}

try {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    renderError(
      "Konfigurationsfehler",
      "Die Anwendung konnte nicht gestartet werden, weil Backend-Konfigurationswerte fehlen. Bitte kontaktieren Sie den Support.",
    );
  } else if (!rootEl) {
    throw new Error("Root element #root not found");
  } else {
    createRoot(rootEl).render(<App />);
  }
} catch (err) {
  console.error("[main] Fatal boot error:", err);
  renderError(
    "Anwendung konnte nicht gestartet werden",
    "Ein unerwarteter Fehler ist beim Starten aufgetreten. Bitte laden Sie die Seite neu. Falls das Problem bestehen bleibt, kontaktieren Sie den Support.",
  );
}
