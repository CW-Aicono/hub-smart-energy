ALTER TABLE public.legal_pages DROP CONSTRAINT IF EXISTS legal_pages_updated_by_fkey;
ALTER TABLE public.legal_pages ADD CONSTRAINT legal_pages_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;