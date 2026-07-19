UPDATE public.loxone_template_registry
SET parameters = '[
  {"name":"EnableProtection","type":"Digital","description":"Schutz aktivieren (1=Ein, 0=Aus)"},
  {"name":"GridLimitKW","type":"Analog","unit":"kW","min":0,"max":1000,"description":"Netzanschluss-Limit in kW"},
  {"name":"ReactionMs","type":"Analog","unit":"ms","min":0,"max":60000,"description":"Reaktionszeit in Millisekunden"}
]'::jsonb,
    version = '1.1.0',
    updated_at = now()
WHERE template_key = 'AICO_GridProtect';