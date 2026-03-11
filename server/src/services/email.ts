// Email service — stubs console output until a delivery provider is integrated

export function sendVerificationEmail(to: string, displayName: string, token: string) {
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${appUrl}/api/auth/verify-email/${token}`;
  console.log(`[EMAIL] Verification email to ${to}`);
  console.log(`[EMAIL] Hi ${displayName}, verify your email: ${link}`);
}

export function sendInviteEmail(to: string, fromName: string, inviteUrl: string) {
  console.log(`[EMAIL] Invite from ${fromName} to ${to}`);
  console.log(`[EMAIL] Join Drop By: ${inviteUrl}`);
}

export function sendInviteSMS(to: string, fromName: string, inviteUrl: string) {
  console.log(`[SMS] Invite from ${fromName} to ${to}: ${inviteUrl}`);
}

export function sendWelcomeMessage(contact: string, downloadUrl: string) {
  const isPhone = /^\+?[\d\s\-()]+$/.test(contact) && !contact.includes('@');
  if (isPhone) {
    console.log(`[SMS] Welcome to Drop By! Download the app: ${downloadUrl}`);
  } else {
    console.log(`[EMAIL] Welcome to Drop By! to: ${contact}`);
    console.log(`[EMAIL] Download the app: ${downloadUrl}`);
  }
}
