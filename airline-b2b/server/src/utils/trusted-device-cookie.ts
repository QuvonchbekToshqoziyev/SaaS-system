import type { Response } from 'express';

export const TRUSTED_DEVICE_COOKIE_NAME = 'ado_trusted_device';
const DEFAULT_TRUST_DAYS = 30;

function cookieValue(cookieHeader: string | undefined, name: string) {
  const prefix = `${name}=`;
  const value = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function trustedDeviceMaxAgeMs() {
  const configured = Number(process.env.TRUSTED_DEVICE_DAYS || DEFAULT_TRUST_DAYS);
  const days = Number.isFinite(configured) ? Math.min(90, Math.max(1, Math.floor(configured))) : DEFAULT_TRUST_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

export function readTrustedDeviceCookie(cookieHeader: string | undefined) {
  return cookieValue(cookieHeader, TRUSTED_DEVICE_COOKIE_NAME);
}

export function setTrustedDeviceCookie(res: Response, value: string) {
  res.cookie(TRUSTED_DEVICE_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: trustedDeviceMaxAgeMs(),
  });
}

export function clearTrustedDeviceCookie(res: Response) {
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}
