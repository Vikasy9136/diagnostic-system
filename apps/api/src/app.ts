import dns from 'node:dns';

try {
  // Prefer IPv4 DNS resolution first to avoid Windows EDNS lookup timeouts on smtp.gmail.com
  dns.setDefaultResultOrder?.('ipv4first');
} catch {
  // Supported on Node.js 17+
}

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { healthRouter } from './routes/health.routes';
import { ordersRouter } from './routes/orders.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { authRouter } from './routes/auth.routes';
import { usersRouter } from './routes/users.routes';
import {
  handleCreateOrderRoute,
  handleVerifyPaymentRoute,
  paymentsRouter,
} from './routes/payments.routes';
import { orgRouter } from './routes/org.routes';
import { financeRouter } from './routes/finance.routes';
import { opsRouter } from './routes/ops.routes';
import { marketingRouter } from './routes/marketing.routes';
import { techRouter } from './routes/tech.routes';
import { labsRouter } from './routes/labs.routes';
import { mapsRouter } from './routes/maps.routes';
import { inventoryRouter } from './routes/inventory.routes';
import { phleboPayoutsRouter } from './routes/phleboPayouts.routes';
import { walletRouter } from './routes/wallet.routes';
import { brandingRouter } from './routes/branding.routes';
import { optionalAuth } from './middleware/auth';
import { AuthenticatedRequest } from './middleware/rbac';
import { errorHandler, AppError } from './middleware/errorHandler';
import { forwardToCloudApiIfLocalMock } from './middleware/cloudProxy';

const PRODUCTION_CORS_ORIGINS = [
  'https://labsetu-diagnostics.web.app',
  'https://labsetu-diagnostics.firebaseapp.com',
];

export function createApp(): Application {
  const app = express();

  // Security & Utility Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, server-to-server webhooks, curl)
        if (!origin) return callback(null, true);
        if (config.corsOrigin.includes('*')) {
          return callback(null, true);
        }
        const allowedOrigins = new Set([...config.corsOrigin, ...PRODUCTION_CORS_ORIGINS]);
        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        if (config.env !== 'production') {
          return callback(null, true);
        }
        return callback(new AppError('Origin not permitted by CORS policy', 403, 'CORS_FORBIDDEN'));
      },
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as AuthenticatedRequest).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // API Routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api', forwardToCloudApiIfLocalMock);
  app.post('/api/create-order', optionalAuth, handleCreateOrderRoute);
  app.post('/api/verify-payment', optionalAuth, handleVerifyPaymentRoute);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/finance', financeRouter);
  app.use('/api/v1/ops', opsRouter);
  app.use('/api/v1/marketing', marketingRouter);
  app.use('/api/v1/tech', techRouter);
  app.use('/api/v1/labs', labsRouter);
  app.use('/api/v1/maps', mapsRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/phlebo-payouts', phleboPayoutsRouter);
  app.use('/api/v1/wallet', walletRouter);
  app.use('/api', walletRouter);
  app.use('/api/v1/branding', brandingRouter);

  // 404 Not Found Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

