-- Hilfsfunktion: RFID-Tag gemäß rfid_read_mode der Wallbox normalisieren.
-- Spiegelt die Logik von supabase/functions/_shared/rfidNormalize.ts.
CREATE OR REPLACE FUNCTION public.normalize_rfid_tag(_raw text, _mode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  bytes text[];
  reversed text[];
  i int;
  b text;
  out text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  cleaned := upper(regexp_replace(_raw, '[\s:.\-]', '', 'g'));
  -- nicht-hex oder ungerade Länge -> unverändert (z.B. App-Tags)
  IF cleaned = '' OR length(cleaned) % 2 <> 0 OR cleaned !~ '^[0-9A-F]+$' THEN
    RETURN _raw;
  END IF;
  IF _mode IS NULL OR _mode = 'raw' THEN
    RETURN cleaned;
  END IF;

  bytes := ARRAY[]::text[];
  FOR i IN 0 .. (length(cleaned) / 2) - 1 LOOP
    bytes := bytes || substring(cleaned FROM (i * 2) + 1 FOR 2);
  END LOOP;

  IF _mode IN ('byte_reversed', 'byte_reversed_nibble_swap') THEN
    reversed := ARRAY[]::text[];
    FOR i IN REVERSE array_length(bytes, 1) .. 1 LOOP
      reversed := reversed || bytes[i];
    END LOOP;
    bytes := reversed;
  END IF;

  IF _mode IN ('nibble_swap', 'byte_reversed_nibble_swap') THEN
    FOR i IN 1 .. array_length(bytes, 1) LOOP
      b := bytes[i];
      bytes[i] := substring(b FROM 2 FOR 1) || substring(b FROM 1 FOR 1);
    END LOOP;
  END IF;

  out := array_to_string(bytes, '');
  RETURN out;
END;
$$;

-- Einmaliger Backfill: bestehende charging_sessions auf normalisierte Tags umstellen,
-- sofern die zugehoerige Wallbox einen nicht-trivialen rfid_read_mode hat.
UPDATE public.charging_sessions cs
SET id_tag = public.normalize_rfid_tag(cs.id_tag, cp.rfid_read_mode)
FROM public.charge_points cp
WHERE cs.charge_point_id = cp.id
  AND cs.id_tag IS NOT NULL
  AND cp.rfid_read_mode IS NOT NULL
  AND cp.rfid_read_mode <> 'raw'
  AND cs.id_tag <> public.normalize_rfid_tag(cs.id_tag, cp.rfid_read_mode);