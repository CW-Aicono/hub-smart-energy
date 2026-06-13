
UPDATE public.board_themes
SET colors_light = '{"background":"35 35% 96%","card":"40 40% 99%","foreground":"15 25% 18%","muted":"20 12% 42%","accent":"352 70% 42%","success":"152 50% 40%","border":"30 18% 86%"}'::jsonb,
    colors_dark  = '{"background":"15 18% 10%","card":"15 15% 14%","foreground":"35 25% 92%","muted":"30 12% 65%","accent":"352 75% 55%","success":"152 50% 48%","border":"15 12% 22%"}'::jsonb
WHERE is_system = true AND name = 'Editorial';

UPDATE public.board_themes
SET colors_light = '{"background":"215 25% 96%","card":"0 0% 100%","foreground":"215 35% 14%","muted":"215 15% 40%","accent":"43 78% 48%","success":"152 60% 38%","border":"215 20% 86%"}'::jsonb,
    colors_dark  = '{"background":"215 40% 8%","card":"215 32% 12%","foreground":"43 25% 92%","muted":"215 15% 65%","accent":"43 82% 58%","success":"152 60% 48%","border":"215 28% 20%"}'::jsonb
WHERE is_system = true AND name = 'Boardroom';
