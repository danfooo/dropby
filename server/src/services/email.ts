import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const FROM = process.env.EMAIL_FROM || "dropby <hi@dropby.cc>";
const APP_URL = () => process.env.APP_URL || "http://localhost:5173";

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL] ${html.replace(/<[^>]+>/g, " ")}`);
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

const verificationCopy: Record<string, {
  subject: string;
  greeting: (name: string) => string;
  body: string;
  linkText: string;
  expiry: string;
}> = {
  de: {
    subject: 'Willkommen bei dropby — bitte bestätige deine E-Mail',
    greeting: name => `Hey ${name},`,
    body: 'Schön, dass du dabei bist! Nur noch ein Schritt — klick unten, um deine E-Mail zu bestätigen:',
    linkText: 'E-Mail bestätigen',
    expiry: 'Dieser Link läuft in 24 Stunden ab.',
  },
  es: {
    subject: 'Bienvenido a dropby — por favor verifica tu correo',
    greeting: name => `Hola ${name},`,
    body: '¡Qué bueno que te unes! Solo un paso más — haz clic abajo para verificar tu correo:',
    linkText: 'Verificar mi correo',
    expiry: 'Este enlace expirará en 24 horas.',
  },
  fr: {
    subject: 'Bienvenue sur dropby — merci de vérifier ton e-mail',
    greeting: name => `Salut ${name},`,
    body: "Vraiment content·e que tu nous rejoignes ! Une dernière étape — clique ci-dessous pour vérifier ton e-mail :",
    linkText: 'Vérifier mon e-mail',
    expiry: 'Ce lien expirera dans 24 heures.',
  },
};

const defaultVerificationCopy = {
  subject: 'Welcome to dropby — please verify your email',
  greeting: (name: string) => `Hey ${name},`,
  body: "Really happy you're joining! Just one step left — click below to verify your email and you're in:",
  linkText: 'Verify my email',
  expiry: 'This link will expire in 24 hours.',
};

export async function sendVerificationEmail(
  to: string,
  displayName: string,
  token: string,
  locale?: string,
  redirectUrl?: string
) {
  const lang = locale?.split('-')[0] ?? 'en';
  const copy = verificationCopy[lang] ?? defaultVerificationCopy;
  const params = new URLSearchParams({ token });
  if (redirectUrl) params.set('redirect', redirectUrl);
  const link = `${APP_URL()}/verify-email?${params}`;
  await send(to, copy.subject, `
    <p>${copy.greeting(displayName)}</p>
    <p>${copy.body}</p>
    <p><a href="${link}">${copy.linkText}</a></p>
    <p>${copy.expiry}</p>
  `);
}

export async function sendInviteEmail(
  to: string,
  fromName: string,
  inviteUrl: string
) {
  await send(
    to,
    `${fromName} invited you to dropby`,
    `
    <p>${fromName} wants to connect with you on dropby.</p>
    <p><a href="${inviteUrl}">Accept invite</a></p>
  `
  );
}

export async function sendInviteSMS(
  to: string,
  fromName: string,
  inviteUrl: string
) {
  console.log(`[SMS] Invite from ${fromName} to ${to}: ${inviteUrl}`);
}

const resetCopy: Record<string, {
  subject: string;
  greeting: (name: string) => string;
  body: string;
  linkText: string;
  expiry: string;
}> = {
  de: {
    subject: 'dropby — Passwort zurücksetzen',
    greeting: name => `Hey ${name},`,
    body: 'Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Klick unten, um ein neues zu setzen:',
    linkText: 'Passwort zurücksetzen',
    expiry: 'Dieser Link läuft in 1 Stunde ab.',
  },
  es: {
    subject: 'dropby — Restablece tu contraseña',
    greeting: name => `Hola ${name},`,
    body: 'Recibimos una solicitud para restablecer tu contraseña. Haz clic abajo para crear una nueva:',
    linkText: 'Restablecer contraseña',
    expiry: 'Este enlace expirará en 1 hora.',
  },
  fr: {
    subject: 'dropby — Réinitialise ton mot de passe',
    greeting: name => `Salut ${name},`,
    body: 'Nous avons reçu une demande de réinitialisation de ton mot de passe. Clique ci-dessous pour en créer un nouveau :',
    linkText: 'Réinitialiser mon mot de passe',
    expiry: 'Ce lien expirera dans 1 heure.',
  },
};

const defaultResetCopy = {
  subject: 'dropby — Reset your password',
  greeting: (name: string) => `Hey ${name},`,
  body: "We received a request to reset your password. Click below to set a new one:",
  linkText: 'Reset my password',
  expiry: 'This link will expire in 1 hour.',
};

export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  token: string,
  locale?: string
) {
  const lang = locale?.split('-')[0] ?? 'en';
  const copy = resetCopy[lang] ?? defaultResetCopy;
  const link = `${APP_URL()}/reset-password?token=${token}`;
  await send(to, copy.subject, `
    <p>${copy.greeting(displayName)}</p>
    <p>${copy.body}</p>
    <p><a href="${link}">${copy.linkText}</a></p>
    <p>${copy.expiry}</p>
  `);
}

export async function sendWelcomeMessage(contact: string, downloadUrl: string) {
  const isPhone = /^\+?[\d\s\-()]+$/.test(contact) && !contact.includes("@");
  if (isPhone) {
    console.log(`[SMS] Welcome to dropby! Download the app: ${downloadUrl}`);
  } else {
    await send(
      contact,
      "Welcome to dropby",
      `
      <p>You're on dropby! Download the app:</p>
      <p><a href="${downloadUrl}">${downloadUrl}</a></p>
    `
    );
  }
}
