export const ERROR_CODES = {
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  AUTH_PASSWORD_INVALID: 'AUTH_PASSWORD_INVALID',
  CONFIG_MISSING: 'CONFIG_MISSING',

  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',

  FIRM_NOT_FOUND: 'FIRM_NOT_FOUND',
  FIRM_ACCESS_DENIED: 'FIRM_ACCESS_DENIED',
  FIRM_ACCOUNT_MISSING: 'FIRM_ACCOUNT_MISSING',

  FLIGHT_NOT_FOUND: 'FLIGHT_NOT_FOUND',
  FLIGHT_CANCELLED: 'FLIGHT_CANCELLED',
  FLIGHT_CREATE_FAILED: 'FLIGHT_CREATE_FAILED',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  TICKET_INVALID_STATE: 'TICKET_INVALID_STATE',
  TICKET_INVENTORY_SHORTAGE: 'TICKET_INVENTORY_SHORTAGE',

  KASSA_NOT_OPEN: 'KASSA_NOT_OPEN',
  KASSA_ALREADY_OPEN: 'KASSA_ALREADY_OPEN',
  KASSA_ALREADY_CLOSED: 'KASSA_ALREADY_CLOSED',
  KASSA_DESK_REQUIRED: 'KASSA_DESK_REQUIRED',
  KASSA_DESK_NOT_FOUND: 'KASSA_DESK_NOT_FOUND',
  KASSA_PERMISSION_DENIED: 'KASSA_PERMISSION_DENIED',

  PAYMENT_INVALID: 'PAYMENT_INVALID',
  PAYMENT_CARD_NOT_FOUND: 'PAYMENT_CARD_NOT_FOUND',
  PAYMENT_CARD_INACTIVE: 'PAYMENT_CARD_INACTIVE',
  TRANSACTION_INVALID: 'TRANSACTION_INVALID',
  REPORT_SCOPE_INVALID: 'REPORT_SCOPE_INVALID',
  REPORT_BUILD_FAILED: 'REPORT_BUILD_FAILED',

  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export type ErrorCatalogEntry = {
  code: ErrorCode;
  statusCode: number;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  retryable?: boolean;
};

export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  [ERROR_CODES.AUTH_TOKEN_MISSING]: { code: ERROR_CODES.AUTH_TOKEN_MISSING, statusCode: 401, message: 'Authentication token is required', severity: 'warning' },
  [ERROR_CODES.AUTH_TOKEN_INVALID]: { code: ERROR_CODES.AUTH_TOKEN_INVALID, statusCode: 401, message: 'Authentication token is invalid or expired', severity: 'warning' },
  [ERROR_CODES.AUTH_FORBIDDEN]: { code: ERROR_CODES.AUTH_FORBIDDEN, statusCode: 403, message: 'You do not have permission to perform this action', severity: 'warning' },
  [ERROR_CODES.AUTH_PASSWORD_INVALID]: { code: ERROR_CODES.AUTH_PASSWORD_INVALID, statusCode: 401, message: 'Invalid credentials', severity: 'warning' },
  [ERROR_CODES.CONFIG_MISSING]: { code: ERROR_CODES.CONFIG_MISSING, statusCode: 500, message: 'Server configuration is incomplete', severity: 'fatal' },

  [ERROR_CODES.VALIDATION_FAILED]: { code: ERROR_CODES.VALIDATION_FAILED, statusCode: 400, message: 'Validation failed', severity: 'warning' },
  [ERROR_CODES.BAD_REQUEST]: { code: ERROR_CODES.BAD_REQUEST, statusCode: 400, message: 'Bad request', severity: 'warning' },
  [ERROR_CODES.NOT_FOUND]: { code: ERROR_CODES.NOT_FOUND, statusCode: 404, message: 'Record not found', severity: 'warning' },
  [ERROR_CODES.CONFLICT]: { code: ERROR_CODES.CONFLICT, statusCode: 409, message: 'Request conflicts with current state', severity: 'warning' },

  [ERROR_CODES.FIRM_NOT_FOUND]: { code: ERROR_CODES.FIRM_NOT_FOUND, statusCode: 404, message: 'Firm not found', severity: 'warning' },
  [ERROR_CODES.FIRM_ACCESS_DENIED]: { code: ERROR_CODES.FIRM_ACCESS_DENIED, statusCode: 403, message: 'Firm is not accessible for this user', severity: 'warning' },
  [ERROR_CODES.FIRM_ACCOUNT_MISSING]: { code: ERROR_CODES.FIRM_ACCOUNT_MISSING, statusCode: 400, message: 'Firm account is missing firmId', severity: 'warning' },

  [ERROR_CODES.FLIGHT_NOT_FOUND]: { code: ERROR_CODES.FLIGHT_NOT_FOUND, statusCode: 404, message: 'Flight not found', severity: 'warning' },
  [ERROR_CODES.FLIGHT_CANCELLED]: { code: ERROR_CODES.FLIGHT_CANCELLED, statusCode: 409, message: 'Flight is cancelled', severity: 'warning' },
  [ERROR_CODES.FLIGHT_CREATE_FAILED]: { code: ERROR_CODES.FLIGHT_CREATE_FAILED, statusCode: 500, message: 'Failed to create flight', severity: 'error' },
  [ERROR_CODES.TICKET_NOT_FOUND]: { code: ERROR_CODES.TICKET_NOT_FOUND, statusCode: 404, message: 'Ticket not found', severity: 'warning' },
  [ERROR_CODES.TICKET_INVALID_STATE]: { code: ERROR_CODES.TICKET_INVALID_STATE, statusCode: 409, message: 'Ticket state does not allow this operation', severity: 'warning' },
  [ERROR_CODES.TICKET_INVENTORY_SHORTAGE]: { code: ERROR_CODES.TICKET_INVENTORY_SHORTAGE, statusCode: 409, message: 'Not enough available tickets', severity: 'warning' },

  [ERROR_CODES.KASSA_NOT_OPEN]: { code: ERROR_CODES.KASSA_NOT_OPEN, statusCode: 409, message: 'Kassa is not open for this date', severity: 'warning' },
  [ERROR_CODES.KASSA_ALREADY_OPEN]: { code: ERROR_CODES.KASSA_ALREADY_OPEN, statusCode: 409, message: 'Kassa is already open for this date', severity: 'warning' },
  [ERROR_CODES.KASSA_ALREADY_CLOSED]: { code: ERROR_CODES.KASSA_ALREADY_CLOSED, statusCode: 409, message: 'Kassa is already closed for this date', severity: 'warning' },
  [ERROR_CODES.KASSA_DESK_REQUIRED]: { code: ERROR_CODES.KASSA_DESK_REQUIRED, statusCode: 400, message: 'Kassa desk is required', severity: 'warning' },
  [ERROR_CODES.KASSA_DESK_NOT_FOUND]: { code: ERROR_CODES.KASSA_DESK_NOT_FOUND, statusCode: 404, message: 'Kassa desk not found', severity: 'warning' },
  [ERROR_CODES.KASSA_PERMISSION_DENIED]: { code: ERROR_CODES.KASSA_PERMISSION_DENIED, statusCode: 403, message: 'Only permitted kassa users can operate kassa', severity: 'warning' },

  [ERROR_CODES.PAYMENT_INVALID]: { code: ERROR_CODES.PAYMENT_INVALID, statusCode: 400, message: 'Payment is invalid', severity: 'warning' },
  [ERROR_CODES.PAYMENT_CARD_NOT_FOUND]: { code: ERROR_CODES.PAYMENT_CARD_NOT_FOUND, statusCode: 404, message: 'Payment card not found', severity: 'warning' },
  [ERROR_CODES.PAYMENT_CARD_INACTIVE]: { code: ERROR_CODES.PAYMENT_CARD_INACTIVE, statusCode: 409, message: 'Payment card is not active', severity: 'warning' },
  [ERROR_CODES.TRANSACTION_INVALID]: { code: ERROR_CODES.TRANSACTION_INVALID, statusCode: 400, message: 'Transaction is invalid', severity: 'warning' },
  [ERROR_CODES.REPORT_SCOPE_INVALID]: { code: ERROR_CODES.REPORT_SCOPE_INVALID, statusCode: 403, message: 'Report scope is not accessible', severity: 'warning' },
  [ERROR_CODES.REPORT_BUILD_FAILED]: { code: ERROR_CODES.REPORT_BUILD_FAILED, statusCode: 500, message: 'Failed to build report', severity: 'error', retryable: true },

  [ERROR_CODES.DATABASE_ERROR]: { code: ERROR_CODES.DATABASE_ERROR, statusCode: 500, message: 'Database operation failed', severity: 'error', retryable: true },
  [ERROR_CODES.INTERNAL_ERROR]: { code: ERROR_CODES.INTERNAL_ERROR, statusCode: 500, message: 'Internal server error', severity: 'error', retryable: true },
};
