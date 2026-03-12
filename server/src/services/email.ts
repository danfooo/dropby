import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const FROM = process.env.EMAIL_FROM || "Drop By <noreply@drop-by.app>";
const APP_URL = () => process.env.APP_URL || "http://localhost:5173";

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL] ${html.replace(/<[^>]+>/g, " ")}`);
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendVerificationEmail(
  to: string,
  displayName: string,
  token: string
) {
  const link = `${APP_URL()}/api/auth/verify-email/${token}`;
  await send(
    to,
    "Welcome to Drop By — please verify your email",
    `
    <p>Hey ${displayName},</p>
    <p>Really happy you're joining! Just one step left — click below to verify your email and you're in:</p>
    <p><a href="${link}">Verify my email</a></p>
    <p>This link will expire in 24 hours.</p>
  `
  );
}

export async function sendInviteEmail(
  to: string,
  fromName: string,
  inviteUrl: string
) {
  await send(
    to,
    `${fromName} invited you to Drop By`,
    `
    <p>${fromName} wants to connect with you on Drop By.</p>
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

export async function sendWelcomeMessage(contact: string, downloadUrl: string) {
  const isPhone = /^\+?[\d\s\-()]+$/.test(contact) && !contact.includes("@");
  if (isPhone) {
    console.log(`[SMS] Welcome to Drop By! Download the app: ${downloadUrl}`);
  } else {
    await send(
      contact,
      "Welcome to Drop By",
      `
      <p>You're on Drop By! Download the app:</p>
      <p><a href="${downloadUrl}">${downloadUrl}</a></p>
    `
    );
  }
}
