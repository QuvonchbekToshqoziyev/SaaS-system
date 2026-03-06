import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { WinstonModule } from 'nest-winston';
import { join } from 'path';

const logsDir = join(process.cwd(), 'logs');

// ─── Shared format ──────────────────────────────────────────
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, context, stack }) => {
    const ctx = context ? `[${context}]` : '';
    const stackTrace = stack ? `\n${stack}` : '';
    return `${timestamp} ${level.toUpperCase().padEnd(7)} ${ctx} ${message}${stackTrace}`;
  }),
);

// ─── Daily rotate: all logs ─────────────────────────────────
const allLogsTransport = new winston.transports.DailyRotateFile({
  dirname: logsDir,
  filename: 'app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d', // keep 30 days of logs
  zippedArchive: true, // compress old logs
  format: logFormat,
});

// ─── Daily rotate: errors only ──────────────────────────────
const errorLogsTransport = new winston.transports.DailyRotateFile({
  dirname: logsDir,
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '60d', // keep errors for 60 days
  zippedArchive: true,
  level: 'error',
  format: logFormat,
});

// ─── Console transport (coloured, for dev) ──────────────────
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, context }) => {
      const ctx = context ? `[${context}]` : '';
      return `${timestamp} ${level} ${ctx} ${message}`;
    }),
  ),
});

// ─── Create NestJS-compatible logger ────────────────────────
export const winstonLoggerConfig = WinstonModule.createLogger({
  transports: [consoleTransport, allLogsTransport, errorLogsTransport],
  // Also catch unhandled exceptions / rejections and log them
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: logsDir,
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '60d',
      zippedArchive: true,
      format: logFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: logsDir,
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '60d',
      zippedArchive: true,
      format: logFormat,
    }),
  ],
});
