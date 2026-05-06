// Shared HTML email templates for AICONO auth emails.
// Inline-styled, white body background, AICONO blue header (HSL 220 60% 20% ≈ #14315C).

const PRIMARY = "#14315C";
const PRIMARY_FG = "#ffffff";
const TEXT = "#1f2937";
const MUTED = "#6b7280";
const BG = "#ffffff";
const SURFACE = "#f5f7fa";
const BORDER = "#e5e7eb";
const LOGO_URL = "https://staging.aicono.org/aicono-logo.png";
const APP_URL = "https://staging.aicono.org";

type Locale = "de" | "en" | "es" | "nl";

interface BaseStrings {
  preview: string;
  heading: string;
  greeting: (name?: string) => string;
  intro: string;
  cta: string;
  fallback: string;
  ignore: string;
  signature: string;
  footer: string;
}

const STRINGS: Record<string, Record<Locale, BaseStrings>> = {
  password_reset: {
    de: {
      preview: "Passwort zurücksetzen für Ihr AICONO-Konto",
      heading: "Passwort zurücksetzen",
      greeting: (n) => (n ? `Hallo ${n},` : "Hallo,"),
      intro:
        "wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Klicken Sie auf den folgenden Button, um ein neues Passwort festzulegen. Der Link ist 60 Minuten gültig.",
      cta: "Neues Passwort festlegen",
      fallback: "Falls der Button nicht funktioniert, kopieren Sie bitte folgenden Link in Ihren Browser:",
      ignore:
        "Wenn Sie kein neues Passwort angefordert haben, können Sie diese E-Mail ignorieren – Ihr Passwort bleibt unverändert.",
      signature: "Ihr AICONO-Team",
      footer: "Diese E-Mail wurde automatisch versendet.",
    },
    en: {
      preview: "Reset your AICONO password",
      heading: "Reset password",
      greeting: (n) => (n ? `Hi ${n},` : "Hi,"),
      intro:
        "We received a request to reset your password. Click the button below to set a new one. The link is valid for 60 minutes.",
      cta: "Set new password",
      fallback: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't request this, you can safely ignore this email – your password won't change.",
      signature: "Your AICONO team",
      footer: "This is an automated message.",
    },
    es: {
      preview: "Restablecer tu contraseña de AICONO",
      heading: "Restablecer contraseña",
      greeting: (n) => (n ? `Hola ${n},` : "Hola,"),
      intro:
        "Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva. El enlace es válido durante 60 minutos.",
      cta: "Crear nueva contraseña",
      fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      ignore: "Si no solicitaste este cambio, puedes ignorar este correo – tu contraseña no cambiará.",
      signature: "Tu equipo de AICONO",
      footer: "Mensaje generado automáticamente.",
    },
    nl: {
      preview: "Wachtwoord resetten voor je AICONO-account",
      heading: "Wachtwoord resetten",
      greeting: (n) => (n ? `Hallo ${n},` : "Hallo,"),
      intro:
        "We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen. Klik op de knop om een nieuw wachtwoord te kiezen. De link is 60 minuten geldig.",
      cta: "Nieuw wachtwoord instellen",
      fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
      ignore: "Heb je dit niet aangevraagd? Negeer deze e-mail – je wachtwoord verandert niet.",
      signature: "Je AICONO-team",
      footer: "Deze e-mail is automatisch verzonden.",
    },
  },
  signup_confirm: {
    de: {
      preview: "Bestätigen Sie Ihre E-Mail-Adresse für AICONO",
      heading: "E-Mail-Adresse bestätigen",
      greeting: (n) => (n ? `Willkommen ${n},` : "Willkommen,"),
      intro:
        "vielen Dank für Ihre Registrierung. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihren Zugang zu aktivieren.",
      cta: "E-Mail-Adresse bestätigen",
      fallback: "Falls der Button nicht funktioniert, kopieren Sie bitte folgenden Link in Ihren Browser:",
      ignore: "Wenn Sie sich nicht registriert haben, können Sie diese E-Mail ignorieren.",
      signature: "Ihr AICONO-Team",
      footer: "Diese E-Mail wurde automatisch versendet.",
    },
    en: {
      preview: "Confirm your email for AICONO",
      heading: "Confirm your email",
      greeting: (n) => (n ? `Welcome ${n},` : "Welcome,"),
      intro: "Thanks for signing up. Please confirm your email address to activate your account.",
      cta: "Confirm email",
      fallback: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't sign up, you can ignore this email.",
      signature: "Your AICONO team",
      footer: "This is an automated message.",
    },
    es: {
      preview: "Confirma tu correo para AICONO",
      heading: "Confirma tu correo",
      greeting: (n) => (n ? `Bienvenido/a ${n},` : "Bienvenido/a,"),
      intro: "Gracias por registrarte. Confirma tu correo para activar tu cuenta.",
      cta: "Confirmar correo",
      fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      ignore: "Si no te registraste, puedes ignorar este correo.",
      signature: "Tu equipo de AICONO",
      footer: "Mensaje generado automáticamente.",
    },
    nl: {
      preview: "Bevestig je e-mailadres voor AICONO",
      heading: "E-mailadres bevestigen",
      greeting: (n) => (n ? `Welkom ${n},` : "Welkom,"),
      intro: "Bedankt voor je registratie. Bevestig je e-mailadres om je account te activeren.",
      cta: "E-mailadres bevestigen",
      fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
      ignore: "Heb je je niet geregistreerd? Negeer deze e-mail.",
      signature: "Je AICONO-team",
      footer: "Deze e-mail is automatisch verzonden.",
    },
  },
  email_change: {
    de: {
      preview: "Bestätigen Sie Ihre neue E-Mail-Adresse",
      heading: "Neue E-Mail-Adresse bestätigen",
      greeting: () => "Hallo,",
      intro: "Sie haben eine Änderung Ihrer E-Mail-Adresse bei AICONO angefordert. Bitte bestätigen Sie diese.",
      cta: "Neue E-Mail bestätigen",
      fallback: "Falls der Button nicht funktioniert, kopieren Sie bitte folgenden Link in Ihren Browser:",
      ignore: "Wenn Sie diese Änderung nicht angefordert haben, ignorieren Sie diese E-Mail.",
      signature: "Ihr AICONO-Team",
      footer: "Diese E-Mail wurde automatisch versendet.",
    },
    en: {
      preview: "Confirm your new email address",
      heading: "Confirm new email address",
      greeting: () => "Hi,",
      intro: "You requested to change your AICONO email address. Please confirm.",
      cta: "Confirm new email",
      fallback: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't request this change, please ignore this email.",
      signature: "Your AICONO team",
      footer: "This is an automated message.",
    },
    es: {
      preview: "Confirma tu nuevo correo",
      heading: "Confirmar nuevo correo",
      greeting: () => "Hola,",
      intro: "Has solicitado cambiar tu correo en AICONO. Confírmalo a continuación.",
      cta: "Confirmar nuevo correo",
      fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      ignore: "Si no solicitaste este cambio, ignora este correo.",
      signature: "Tu equipo de AICONO",
      footer: "Mensaje generado automáticamente.",
    },
    nl: {
      preview: "Bevestig je nieuwe e-mailadres",
      heading: "Nieuw e-mailadres bevestigen",
      greeting: () => "Hallo,",
      intro: "Je hebt een wijziging van je AICONO e-mailadres aangevraagd. Bevestig dit hieronder.",
      cta: "Nieuw e-mailadres bevestigen",
      fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
      ignore: "Heb je dit niet aangevraagd? Negeer deze e-mail.",
      signature: "Je AICONO-team",
      footer: "Deze e-mail is automatisch verzonden.",
    },
  },
  magic_link: {
    de: {
      preview: "Ihr Login-Link für AICONO",
      heading: "Login-Link",
      greeting: () => "Hallo,",
      intro: "klicken Sie auf den Button, um sich anzumelden. Der Link ist 15 Minuten gültig.",
      cta: "Jetzt anmelden",
      fallback: "Falls der Button nicht funktioniert, kopieren Sie bitte folgenden Link in Ihren Browser:",
      ignore: "Wenn Sie keinen Login angefordert haben, ignorieren Sie diese E-Mail.",
      signature: "Ihr AICONO-Team",
      footer: "Diese E-Mail wurde automatisch versendet.",
    },
    en: {
      preview: "Your AICONO login link",
      heading: "Login link",
      greeting: () => "Hi,",
      intro: "Click the button to sign in. The link is valid for 15 minutes.",
      cta: "Sign in",
      fallback: "If the button doesn't work, copy this link into your browser:",
      ignore: "If you didn't request this login, please ignore this email.",
      signature: "Your AICONO team",
      footer: "This is an automated message.",
    },
    es: {
      preview: "Tu enlace de acceso a AICONO",
      heading: "Enlace de acceso",
      greeting: () => "Hola,",
      intro: "Haz clic en el botón para iniciar sesión. El enlace es válido durante 15 minutos.",
      cta: "Iniciar sesión",
      fallback: "Si el botón no funciona, copia este enlace en tu navegador:",
      ignore: "Si no solicitaste este acceso, ignora este correo.",
      signature: "Tu equipo de AICONO",
      footer: "Mensaje generado automáticamente.",
    },
    nl: {
      preview: "Je AICONO inloglink",
      heading: "Inloglink",
      greeting: () => "Hallo,",
      intro: "Klik op de knop om in te loggen. De link is 15 minuten geldig.",
      cta: "Nu inloggen",
      fallback: "Werkt de knop niet? Kopieer deze link in je browser:",
      ignore: "Heb je dit niet aangevraagd? Negeer deze e-mail.",
      signature: "Je AICONO-team",
      footer: "Deze e-mail is automatisch verzonden.",
    },
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type AuthEmailType = "password_reset" | "signup_confirm" | "email_change" | "magic_link";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderAuthEmail(
  type: AuthEmailType,
  url: string,
  opts: { recipientName?: string; locale?: Locale } = {},
): RenderedEmail {
  const locale: Locale = opts.locale ?? "de";
  const t = STRINGS[type][locale] ?? STRINGS[type].de;
  const safeUrl = escapeHtml(url);
  const safeName = opts.recipientName ? escapeHtml(opts.recipientName) : undefined;

  const subjectMap: Record<AuthEmailType, string> = {
    password_reset: t.heading,
    signup_confirm: t.heading,
    email_change: t.heading,
    magic_link: t.heading,
  };
  const subject = `AICONO – ${subjectMap[type]}`;

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:Arial,Helvetica,sans-serif;color:${TEXT};">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(t.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${BG};border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
        <tr>
          <td style="background:${PRIMARY};padding:28px 32px;text-align:center;">
            <img src="${LOGO_URL}" alt="AICONO" height="40" style="display:inline-block;height:40px;width:auto;filter:brightness(0) invert(1);">
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${TEXT};">${escapeHtml(t.heading)}</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(t.greeting(safeName))}</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${TEXT};">${escapeHtml(t.intro)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr><td style="border-radius:9999px;background:${PRIMARY};">
                <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${PRIMARY_FG};text-decoration:none;border-radius:9999px;">${escapeHtml(t.cta)}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:${MUTED};">${escapeHtml(t.fallback)}</p>
            <p style="margin:0 0 24px;font-size:12px;color:${MUTED};word-break:break-all;"><a href="${safeUrl}" style="color:${PRIMARY};">${safeUrl}</a></p>
            <hr style="border:none;border-top:1px solid ${BORDER};margin:24px 0;">
            <p style="margin:0 0 12px;font-size:13px;color:${MUTED};">${escapeHtml(t.ignore)}</p>
            <p style="margin:0;font-size:14px;color:${TEXT};">${escapeHtml(t.signature)}</p>
          </td>
        </tr>
        <tr>
          <td style="background:${SURFACE};padding:20px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:12px;color:${MUTED};">${escapeHtml(t.footer)}</p>
            <p style="margin:0;font-size:12px;color:${MUTED};">
              <a href="${APP_URL}" style="color:${PRIMARY};text-decoration:none;">aicono.org</a>
              &nbsp;·&nbsp;
              <a href="${APP_URL}/datenschutz" style="color:${MUTED};text-decoration:underline;">Datenschutz</a>
              &nbsp;·&nbsp;
              <a href="${APP_URL}/impressum" style="color:${MUTED};text-decoration:underline;">Impressum</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${t.heading}

${t.greeting(opts.recipientName)}

${t.intro}

${t.cta}: ${url}

${t.ignore}

${t.signature}
${APP_URL}`;

  return { subject, html, text };
}
