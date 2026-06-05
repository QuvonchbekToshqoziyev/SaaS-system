import express from 'express';
import cors from 'cors';
import './env';
import { logger } from './logger';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import authRoutes from './routes/auth';
import inviteRoutes from './routes/invites';
import ticketRoutes from './routes/tickets';
import paymentRoutes from './routes/payments';
import reportRoutes from './routes/reports';
import transactionRoutes from './routes/transactions';
import flightRoutes from './routes/flights';
import firmRoutes from './routes/firms';
import logsRoutes from './routes/logs';
import currencyRateRoutes from './routes/currency-rates';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
  // Security baseline: never start with an insecure JWT default.
  // Set JWT_SECRET in the runtime environment (local .env or production env vars).
  logger.fatal('FATAL: JWT_SECRET is required');
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

process.on('warning', (warning) => {
  logger.warn({ warning }, 'Process warning');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

app.use(requestLogger);

const allowedOrigins = new Set<string>();
const rawAllowed = [
  process.env.CORS_ORIGINS,
  process.env.PUBLIC_WEB_ORIGIN,
  process.env.APP_ORIGIN,
]
  .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
  .join(',');

for (const value of rawAllowed.split(',')) {
  const trimmed = value.trim();
  if (trimmed) allowedOrigins.add(trimmed.replace(/\/$/, ''));
}

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allowedOrigins.has(normalized)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use('/auth', authRoutes);
app.use('/invites', inviteRoutes);
app.use('/tickets', ticketRoutes);
app.use('/payments', paymentRoutes);
app.use('/reports', reportRoutes);
app.use('/transactions', transactionRoutes);
app.use('/flights', flightRoutes);
app.use('/firms', firmRoutes);
app.use('/logs', logsRoutes);
app.use('/currency-rates', currencyRateRoutes);

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Server running');
});
