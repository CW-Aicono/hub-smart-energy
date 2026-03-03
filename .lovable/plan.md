

## Problem

Nach Logout nimmt der "Anmelden"-Button die grüne Akzentfarbe an (aus dem Dark-Mode-Theme), statt im Corporate-Dunkelblau zu bleiben.

## Lösung

In `src/pages/Auth.tsx` den Login-Button mit einem festen Inline-Style versehen, analog zum bereits fixierten Branding-Panel:

**Auth.tsx** – Beide Submit-Buttons (Login + Passwort-vergessen) erhalten:
```tsx
style={{ backgroundColor: 'hsl(220, 60%, 20%)' }}
className="w-full text-white hover:opacity-90"
```

Damit wird der Button unabhängig vom aktiven Farbschema immer dunkelblau dargestellt – konsistent mit dem Branding-Panel links.

