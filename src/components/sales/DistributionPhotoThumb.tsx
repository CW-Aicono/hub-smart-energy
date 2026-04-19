import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function DistributionPhotoThumb({ path }: { path: string | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("sales-photos")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || !url) return null;
  return (
    <img
      src={url}
      alt="Verteilung Foto"
      className="h-10 w-10 rounded object-cover border shrink-0"
    />
  );
}
