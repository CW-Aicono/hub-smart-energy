import { useState, useEffect, useCallback } from "react";

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
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    // Check if there's already a waiting worker
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
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
      // No active service worker – nothing to update
      setTimeout(() => setChecking(false), 1500);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        // Give it a moment to detect the update
        setTimeout(() => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
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
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      // Fallback: hard reload
      window.location.reload();
    }
  }, [waitingWorker]);

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
