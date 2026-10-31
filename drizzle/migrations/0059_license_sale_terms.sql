ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS term_months integer;
ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.license_sales.term_months IS 'Vertragslaufzeit in Monaten ab starts_on; NULL = unbefristet';
COMMENT ON COLUMN public.license_sales.auto_renew IS 'true: Mindestlaufzeit, danach weiter bis Kündigung; false: endet am Laufzeitende';

CREATE OR REPLACE FUNCTION public.license_term_end(p_start date, p_months integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN p_months IS NULL THEN NULL ELSE (p_start + make_interval(months => p_months))::date - 1 END $$;

-- Laufzeit festlegen/ändern (AICONO kaufmännisch oder abrechnender Partner)
CREATE OR REPLACE FUNCTION public.set_license_sale_term(p_sale uuid, p_term_months integer, p_auto_renew boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE s license_sales; v_end date; today date := (now() AT TIME ZONE 'Europe/Berlin')::date; BEGIN
  SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
  IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(s.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_term_months IS NOT NULL AND (p_term_months < 1 OR p_term_months > 240) THEN RAISE EXCEPTION 'Laufzeit 1 bis 240 Monate'; END IF;
  IF s.ended_on IS NOT NULL AND s.ended_on < today THEN RAISE EXCEPTION 'Vertrag ist bereits beendet'; END IF;
  v_end := license_term_end(s.starts_on, p_term_months);
  IF NOT p_auto_renew AND v_end IS NOT NULL AND v_end < today THEN RAISE EXCEPTION 'Laufzeitende liegt in der Vergangenheit'; END IF;
  UPDATE license_sales SET term_months=p_term_months, auto_renew=coalesce(p_auto_renew,true),
    ended_on = CASE WHEN NOT coalesce(p_auto_renew,true) AND v_end IS NOT NULL THEN v_end ELSE NULL END
  WHERE id=p_sale;
  -- abgelaufener Takt neu ansetzen, falls ein befristeter Vertrag wieder geöffnet wurde
  UPDATE license_sales SET next_period = coalesce(next_period, (SELECT max(period_end)+1 FROM license_billing_events WHERE sale_id=p_sale))
  WHERE id=p_sale AND cadence<>'once';
END $$;
GRANT EXECUTE ON FUNCTION public.set_license_sale_term(uuid, integer, boolean) TO authenticated;

-- Kündigung: frühestens zum Ende der Mindestlaufzeit
CREATE OR REPLACE FUNCTION public.end_license_sale(p_sale uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE s license_sales; v_end date; BEGIN
  SELECT * INTO s FROM license_sales WHERE id=p_sale FOR UPDATE;
  IF NOT FOUND OR NOT (can_portal_write(auth.uid(),'commercial') OR can_manage_partner_billing(s.partner_id)) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  v_end := license_period_end((now() AT TIME ZONE 'Europe/Berlin')::date, s.cadence);
  v_end := greatest(v_end, coalesce(license_term_end(s.starts_on, s.term_months), v_end));
  UPDATE license_sales SET ended_on=v_end, auto_renew=false,
    next_period = CASE WHEN next_period IS NOT NULL AND next_period <= v_end THEN next_period ELSE NULL END
  WHERE id=p_sale;
END $$;

-- Befristete Verträge bis zum Enddatum weiter abrechnen
CREATE OR REPLACE FUNCTION public.generate_due_license_invoices()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE s license_sales; n integer:=0; k integer; today date:=(now() AT TIME ZONE 'Europe/Berlin')::date; BEGIN
  UPDATE license_sales SET next_period=NULL WHERE ended_on IS NOT NULL AND next_period > ended_on;
  FOR s IN SELECT * FROM license_sales WHERE next_period<=today AND (ended_on IS NULL OR next_period<=ended_on) ORDER BY next_period LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    k:=0;
    WHILE s.next_period<=today AND (s.ended_on IS NULL OR s.next_period<=s.ended_on) AND k<24 LOOP
      PERFORM bill_license_sale(s.id,s.next_period,false); n:=n+1; k:=k+1;
      SELECT * INTO s FROM license_sales WHERE id=s.id; EXIT WHEN s.next_period IS NULL;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;