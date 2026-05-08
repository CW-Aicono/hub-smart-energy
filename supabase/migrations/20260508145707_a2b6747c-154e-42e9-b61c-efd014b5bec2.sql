-- Allow access to distribution-scoped recommendations (measurement_point_id IS NULL, distribution_id set)
CREATE POLICY "Access via distribution->project"
ON public.sales_recommended_devices
FOR ALL
USING (
  distribution_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sales_distributions d
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE d.id = sales_recommended_devices.distribution_id
      AND (p.partner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
  )
)
WITH CHECK (
  distribution_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sales_distributions d
    JOIN public.sales_projects p ON p.id = d.project_id
    WHERE d.id = sales_recommended_devices.distribution_id
      AND (p.partner_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role))
  )
);