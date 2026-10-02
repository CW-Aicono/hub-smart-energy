
ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS customer_class text,
  ADD COLUMN IF NOT EXISTS employees integer,
  ADD COLUMN IF NOT EXISTS annual_revenue_eur numeric,
  ADD COLUMN IF NOT EXISTS annual_balance_eur numeric,
  ADD COLUMN IF NOT EXISTS rest_supplier_name text,
  ADD COLUMN IF NOT EXISTS rest_supplier_contract_no text,
  ADD COLUMN IF NOT EXISTS rest_supplier_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS imsys_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS imsys_requested_at date,
  ADD COLUMN IF NOT EXISTS imsys_installed_at date,
  ADD COLUMN IF NOT EXISTS metering_type text,
  ADD COLUMN IF NOT EXISTS pre_contract_info_sent_at timestamptz;

ALTER TABLE public.community_assets
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS not_commercial boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS operator_legal_form text,
  ADD COLUMN IF NOT EXISTS renewable_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewable_proof_url text,
  ADD COLUMN IF NOT EXISTS imsys_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS imsys_requested_at date;

ALTER TABLE public.energy_communities
  ADD COLUMN IF NOT EXISTS balancing_zone text,
  ADD COLUMN IF NOT EXISTS grid_operator text,
  ADD COLUMN IF NOT EXISTS pilot_acknowledged_at timestamptz;

ALTER TABLE public.community_contract_templates
  ADD COLUMN IF NOT EXISTS template_kind text NOT NULL DEFAULT 'nutzung';
