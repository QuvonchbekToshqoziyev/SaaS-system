import { logger } from '../logger';

const nodemailer = require('nodemailer') as {
  createTransport(options: Record<string, unknown>): {
    sendMail(message: Record<string, unknown>): Promise<unknown>;
  };
};

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isLoginEmailConfigured() {
  return Boolean(String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_FROM || '').trim());
}

function smtpTransport() {
  if (transporter) return transporter;
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '');
  if (!host || !String(process.env.SMTP_FROM || '').trim()) throw new Error('Login email delivery is not configured');
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
    ...(user ? { auth: { user, pass } } : {}),
  });
  return transporter;
}

export async function sendLoginVerificationEmail(email: string, code: string) {
  await smtpTransport().sendMail({
    from: String(process.env.SMTP_FROM || '').trim(),
    to: email,
    subject: 'ADO SYSTEM sign-in verification code',
    text: `Your ADO SYSTEM sign-in verification code is ${code}. It expires in 10 minutes. If you did not try to sign in, change your password and contact your administrator.`,
    html: `<p>Your ADO SYSTEM sign-in verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not try to sign in, change your password and contact your administrator.</p>`,
  });
}

export function warnLoginDeliveryFailure(channel: 'email' | 'telegram', err: unknown) {
  logger.warn({ err, channel }, 'Login verification delivery failed');
}
