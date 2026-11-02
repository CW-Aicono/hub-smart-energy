CREATE OR REPLACE FUNCTION public.license_period_amount(p_price numeric, p_quantity integer, p_start date, p_end date, p_cadence text)
 RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
-- Halbmonatsraster: 1.–15. und 16.–Monatsende; jede angebrochene Hälfte = halber Monatspreis
DECLARE m date; z date; s int; e int; h int; v numeric:=0;
BEGIN
 IF p_cadence='once' THEN RETURN round(p_price*p_quantity,2); END IF;
 m:=date_trunc('month',p_start)::date;
 WHILE m<=p_end LOOP
  z:=(m+interval '1 month - 1 day')::date;
  s:=extract(day from greatest(m,p_start))::int; e:=extract(day from least(z,p_end))::int;
  h:=(CASE WHEN s<=15 THEN 1 ELSE 0 END)+(CASE WHEN e>=16 THEN 1 ELSE 0 END);
  v:=v+p_price*p_quantity*h/2.0;
  m:=(m+interval '1 month')::date;
 END LOOP;
 RETURN round(v,2);
END $function$;

ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS customer_discount_pct numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.license_sales ADD COLUMN IF NOT EXISTS list_sale_price numeric;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='license_sales_customer_discount_pct_range') THEN
  ALTER TABLE public.license_sales ADD CONSTRAINT license_sales_customer_discount_pct_range CHECK (customer_discount_pct >= 0 AND customer_discount_pct <= 100);
 END IF;
END $$;
COMMENT ON COLUMN public.license_sales.customer_discount_pct IS 'Partner discount in percent on the end-customer sale price (VK); purchase_price (EK) is unaffected';
COMMENT ON COLUMN public.license_sales.list_sale_price IS 'Recommended end-customer price (VK) before partner discount';

ALTER TABLE public.tenants ALTER COLUMN is_kommune SET DEFAULT false;