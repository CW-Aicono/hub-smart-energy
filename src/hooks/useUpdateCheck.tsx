import { useState, useEffect, useCallback, useRef } from "react";

interface UpdateCheckState {
  updateAvailable: boolean;
  checking: boolean;
  dismissed: boolean;
  checkForUpdate: () => void;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

export function useUpdateCheck(): UpdateCheckState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const userAppliedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      if (userAppliedRef.current) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    setChecking(true);
    setDismissed(false);

    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      setTimeout(() => setChecking(false), 1500);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        setTimeout(() => {
          if (registration.waiting) {
            waitingWorkerRef.current = registration.waiting;
            setUpdateAvailable(true);
          }
          setChecking(false);
        }, 2000);
      } else {
        setChecking(false);
      }
    } catch {
      setChecking(false);
    }
  }, []);

  const applyUpdate = useCallback(() => {
    userAppliedRef.current = true;
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
      // If controllerchange doesn't fire within 2s, force reload
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      // No waiting worker ref — clear caches and force reload
      const doReload = () => window.location.reload();
      if (typeof caches !== "undefined") {
        caches.keys().then((names) => {
          Promise.all(names.map((name) => caches.delete(name))).then(doReload);
        }).catch(doReload);
      } else {
        doReload();
      }
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    updateAvailable,
    checking,
    dismissed,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
