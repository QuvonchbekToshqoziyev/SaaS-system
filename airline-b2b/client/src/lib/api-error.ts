import type { AxiosError } from 'axios';

export type ApiErrorResponse = {
  error?: string;
  code?: string;
  statusCode?: number;
  message?: string;
  severity?: 'info' | 'warning' | 'error' | 'fatal';
  details?: unknown;
  errorId?: string;
  retryable?: boolean;
};

export function getApiError(error: unknown): ApiErrorResponse | undefined {
  return (error as AxiosError<ApiErrorResponse>)?.response?.data;
}

export function getApiErrorMessage(error: unknown, fallback?: string): string {
  const body = getApiError(error);
  return body?.message || body?.error || fallback || 'Unexpected error';
}

export function getApiErrorCode(error: unknown): string | undefined {
  return getApiError(error)?.code;
}

export function formatApiError(error: unknown, fallback?: string): string {
  const body = getApiError(error);
  const message = body?.message || body?.error || fallback || 'Unexpected error';
  return body?.code ? `${message} (${body.code})` : message;
}
