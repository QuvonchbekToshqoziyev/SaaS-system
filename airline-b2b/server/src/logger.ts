import './env';
import pino from 'pino';

const level =
  process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'cookie',
      'password',
      'currentPassword',
      'newPassword',
      'token',
    ],
    remove: true,
  },
});

export function getLogSafePath(urlOrPath: string): string {
  return String(urlOrPath || '').split('?')[0] || '/';
}
