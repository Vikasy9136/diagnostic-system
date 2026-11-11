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
import { optionalAuth } from './middleware/auth';
import { errorHandler, AppError } from './middleware/errorHandler';
import { forwardToCloudApiIfLocalMock } from './middleware/cloudProxy';

export function createApp(): Application {
  const app = express();

  // Security & Utility Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.corsOrigin.includes(origin) || config.corsOrigin.includes('*')) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in local development
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  // 404 Not Found Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

