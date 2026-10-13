-- Dirk Markus als Partner-Admin der AICONO Partner GmbH (idempotent, per E-Mail/Name aufgelöst)
INSERT INTO public.partner_members (partner_id, user_id, partner_role)
SELECT p.id, u.id, 'partner_admin'::public.partner_member_role
FROM public.partners p
JOIN auth.users u ON lower(u.email) = 'd.markus@bright-networks.de'
WHERE p.name = 'AICONO Partner GmbH'
ON CONFLICT (user_id) DO UPDATE
  SET partner_id = EXCLUDED.partner_id,
      partner_role = 'partner_admin',
      updated_at = now()
  WHERE public.partner_members.partner_id = EXCLUDED.partner_id
     OR public.partner_members.partner_role <> 'partner_admin';