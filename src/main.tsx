import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { probeMark, probeEnvOnce } from "./lib/perfProbe"; // PERF-PROBE
import { registerAppServiceWorker } from "./lib/pwaRegister";

probeMark("boot"); // PERF-PROBE
probeEnvOnce();    // PERF-PROBE

createRoot(document.getElementById("root")!).render(<App />);

probeMark("root-render-called"); // PERF-PROBE

// Guarded SW registration – no-op inside Lovable preview / dev.
registerAppServiceWorker();
