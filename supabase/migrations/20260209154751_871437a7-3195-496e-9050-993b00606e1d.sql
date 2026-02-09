
-- Add widget_size column to dashboard_widgets for resizable tiles
ALTER TABLE public.dashboard_widgets 
ADD COLUMN widget_size TEXT NOT NULL DEFAULT 'medium';

-- Valid sizes: small, medium, large, full
