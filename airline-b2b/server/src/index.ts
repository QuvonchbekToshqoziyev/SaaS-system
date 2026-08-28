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
import searchRoutes from './routes/search';
import kassaRoutes from './routes/kassa';
import tourPackageRoutes from './routes/tour-packages';
import employeeRoutes from './routes/employees';
import siteContentRoutes from './routes/site-content';
import chatRoutes from './routes/chat';
import serviceRoutes from './routes/services';
import auditLogRoutes from './routes/audit-log';
import airlineRoutes from './routes/airlines';
import notificationRoutes from './routes/notifications';
import inventoryRoutes from './routes/inventory';
import accountRoutes from './routes/accounts';
import expenseCategoryRoutes from './routes/expense-categories';
import expenseBudgetRoutes from './routes/expense-budgets';
import telegramRoutes from './routes/telegram';
import { startTelegramBot } from './services/telegram.service';
import { isLoginEmailConfigured } from './services/login-verification.service';
import { featureUsageMiddleware, flushFeatureUsage, startFeatureUsageFlush } from './services/feature-usage.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
  // Security baseline: never start with an insecure JWT default.
  // Set JWT_SECRET in the runtime environment (local .env or production env vars).
  logger.fatal('FATAL: JWT_SECRET is required');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !String(process.env.CHAT_ENCRYPTION_KEY || '').trim()) {
  logger.fatal('FATAL: CHAT_ENCRYPTION_KEY is required in production');
  process.exit(1);
}
if (process.env.LOGIN_EMAIL_REQUIRED === '1' && !isLoginEmailConfigured()) {
  logger.fatal('FATAL: SMTP_HOST and SMTP_FROM are required for login email verification');
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
  allowedOrigins.add('http://b2b.booking.ado-finance.com:8080');
  allowedOrigins.add('http://b2b.booking.ado-finance.com:3000');
  allowedOrigins.add('http://b2b.booking.ado-finance.com');
  allowedOrigins.add('http://127.0.0.1:8080');
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-ADO-CSRF'],
    credentials: true,
    maxAge: 600,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(featureUsageMiddleware);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
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
app.use('/search', searchRoutes);
app.use('/kassa', kassaRoutes);
app.use('/tour-packages', tourPackageRoutes);
app.use('/employees', employeeRoutes);
app.use('/site-content', siteContentRoutes);
app.use('/chat', chatRoutes);
app.use('/services', serviceRoutes);
app.use('/accounts', accountRoutes);
app.use('/expense-categories', expenseCategoryRoutes);
app.use('/expense-budgets', expenseBudgetRoutes);
app.use('/audit-log', auditLogRoutes);
app.use('/airlines', airlineRoutes);
app.use('/notifications', notificationRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/telegram', telegramRoutes);

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, 'Server running');
  startFeatureUsageFlush();
  startTelegramBot();
});

process.on('SIGTERM', () => {
  void flushFeatureUsage().finally(() => process.exit(0));
});
