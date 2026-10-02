ALTER TABLE public.charge_points
ADD COLUMN IF NOT EXISTS rfid_read_mode TEXT NOT NULL DEFAULT 'raw'
CHECK (rfid_read_mode IN ('raw','byte_reversed','nibble_swap','byte_reversed_nibble_swap'));